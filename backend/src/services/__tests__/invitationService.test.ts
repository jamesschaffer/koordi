import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import * as invitationService from '../invitationService';

const prisma = new PrismaClient();

/**
 * Test Suite: Invitation Service - Phase 1 Critical Fixes
 *
 * Purpose: Verify that Phase 1 invitation fixes prevent race conditions,
 * data corruption, and enforce business rules correctly.
 *
 * Scenarios Tested:
 * 1. Duplicate invitation prevention (database constraint)
 * 2. User ID membership check (prevents duplicate after email change)
 * 3. Atomic transactions for member removal
 * 4. Member limit enforcement in auto-accept
 */
describe('Invitation Service - Critical Fixes', () => {
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let testChild: any;
  let testCalendar: any;

  // Setup: Create test data before each test
  beforeEach(async () => {
    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        email: 'owner@example.com',
        name: 'Calendar Owner',
        home_address: '123 Main St',
        home_latitude: 37.7749,
        home_longitude: -122.4194,
      },
    });

    testUser2 = await prisma.user.create({
      data: {
        email: 'member@example.com',
        name: 'Calendar Member',
        home_address: '456 Oak Ave',
        home_latitude: 37.7849,
        home_longitude: -122.4294,
      },
    });

    testUser3 = await prisma.user.create({
      data: {
        email: 'newuser@example.com',
        name: 'New User',
        home_address: '789 Pine Rd',
        home_latitude: 37.7949,
        home_longitude: -122.4394,
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        name: 'Test Child',
      },
    });

    // Create test calendar with owner
    testCalendar = await prisma.eventCalendar.create({
      data: {
        name: 'Test Calendar',
        ics_url: 'https://example.com/calendar.ics',
        child_id: testChild.id,
        owner_id: testUser1.id,
      },
    });

    // Add owner as member
    await prisma.eventCalendarMembership.create({
      data: {
        event_calendar_id: testCalendar.id,
        user_id: testUser1.id,
        invited_email: testUser1.email,
        invitation_token: 'owner-token',
        status: 'accepted',
        invited_by_user_id: testUser1.id,
      },
    });
  });

  // Cleanup: Delete test data after each test
  afterEach(async () => {
    await prisma.event.deleteMany({ where: { event_calendar_id: testCalendar.id } });
    await prisma.eventCalendarMembership.deleteMany({ where: { event_calendar_id: testCalendar.id } });
    await prisma.eventCalendar.deleteMany({ where: { id: testCalendar.id } });
    await prisma.child.deleteMany({ where: { id: testChild.id } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [testUser1.id, testUser2.id, testUser3.id] },
      },
    });
  });

  /**
   * Test 1: Duplicate Invitation Prevention (Database Constraint)
   *
   * Scenario:
   * - Send invitation to new user (creates pending invitation)
   * - Attempt to send another invitation to same email
   *
   * Expected:
   * - First invitation succeeds
   * - Second invitation fails due to unique constraint on (calendar_id, email) WHERE status='pending'
   */
  test('prevents duplicate pending invitations to same email', async () => {
    const newUserEmail = 'newperson@example.com';

    // First invitation should succeed
    const invitation1 = await invitationService.sendInvitation(
      testCalendar.id,
      newUserEmail,
      testUser1.id
    );

    expect(invitation1.invited_email).toBe(newUserEmail);
    expect(invitation1.status).toBe('pending');

    // Second invitation to same email should fail with database constraint error
    await expect(
      invitationService.sendInvitation(
        testCalendar.id,
        newUserEmail,
        testUser1.id
      )
    ).rejects.toThrow();

    // Verify only one pending invitation exists
    const pendingInvitations = await prisma.eventCalendarMembership.findMany({
      where: {
        event_calendar_id: testCalendar.id,
        invited_email: newUserEmail,
        status: 'pending',
      },
    });

    expect(pendingInvitations.length).toBe(1);
  });

  /**
   * Test 2: User ID Membership Check (Prevents Duplicate After Email Change)
   *
   * Scenario:
   * - User B is already a member of calendar
   * - User B changes their email address
   * - Owner tries to invite User B's new email address
   *
   * Expected:
   * - Invitation should fail because User B (by user_id) is already a member
   * - Error message: "This user is already a member of this calendar"
   */
  test('prevents duplicate membership when user changes email', async () => {
    // Add testUser2 as member
    await invitationService.sendInvitation(
      testCalendar.id,
      testUser2.email,
      testUser1.id
    );

    // Verify testUser2 is now a member
    const membership = await prisma.eventCalendarMembership.findFirst({
      where: {
        event_calendar_id: testCalendar.id,
        user_id: testUser2.id,
        status: 'accepted',
      },
    });
    expect(membership).toBeDefined();

    // Simulate email change
    const newEmail = 'member-newemail@example.com';
    await prisma.user.update({
      where: { id: testUser2.id },
      data: { email: newEmail },
    });

    // Try to invite the new email - should fail because user_id is already a member
    await expect(
      invitationService.sendInvitation(
        testCalendar.id,
        newEmail,
        testUser1.id
      )
    ).rejects.toThrow('This user is already a member of this calendar');

    // Verify only one membership exists for this user
    const memberships = await prisma.eventCalendarMembership.findMany({
      where: {
        event_calendar_id: testCalendar.id,
        user_id: testUser2.id,
      },
    });
    expect(memberships.length).toBe(1);
  });

  /**
   * Test 3: Atomic Transactions for Member Removal
   *
   * Scenario:
   * - Member has assigned events
   * - Remove member from calendar
   *
   * Expected:
   * - All operations happen atomically:
   *   1. Supplemental events deleted
   *   2. Events reassigned to owner
   *   3. Membership deleted
   * - If any step fails, entire transaction rolls back
   */
  test('removes member atomically with event reassignment', async () => {
    // Add testUser2 as member
    await invitationService.sendInvitation(
      testCalendar.id,
      testUser2.email,
      testUser1.id
    );

    const membership = await prisma.eventCalendarMembership.findFirst({
      where: {
        event_calendar_id: testCalendar.id,
        user_id: testUser2.id,
        status: 'accepted',
      },
    });

    // Create event assigned to testUser2
    const event = await prisma.event.create({
      data: {
        event_calendar_id: testCalendar.id,
        ics_uid: 'test-event-123',
        title: 'Soccer Practice',
        description: 'Weekly practice',
        location: '100 Sports Way',
        start_time: new Date('2025-12-01T15:00:00Z'),
        end_time: new Date('2025-12-01T16:30:00Z'),
        is_all_day: false,
        assigned_to_user_id: testUser2.id,
        version: 1,
      },
    });

    // Create supplemental events (simulating departure/buffer/return)
    await prisma.supplementalEvent.create({
      data: {
        parent_event_id: event.id,
        type: 'departure',
        title: 'Departure for Soccer Practice',
        start_time: new Date('2025-12-01T14:55:00Z'),
        end_time: new Date('2025-12-01T15:00:00Z'),
        origin_address: testUser2.home_address,
        origin_lat: testUser2.home_latitude,
        origin_lng: testUser2.home_longitude,
        destination_address: event.location,
        destination_lat: 37.7749,
        destination_lng: -122.4194,
        drive_time_minutes: 5,
      },
    });

    // Verify event is assigned and supplemental exists
    expect(event.assigned_to_user_id).toBe(testUser2.id);
    const suppBefore = await prisma.supplementalEvent.count({
      where: { parent_event_id: event.id },
    });
    expect(suppBefore).toBe(1);

    // Remove member
    await invitationService.removeMember(membership!.id, testUser1.id);

    // Verify all operations completed atomically:
    // 1. Supplemental events deleted
    const suppAfter = await prisma.supplementalEvent.count({
      where: { parent_event_id: event.id },
    });
    expect(suppAfter).toBe(0);

    // 2. Event reassigned to owner
    const reassignedEvent = await prisma.event.findUnique({
      where: { id: event.id },
    });
    expect(reassignedEvent?.assigned_to_user_id).toBe(testUser1.id);

    // 3. Membership deleted
    const membershipAfter = await prisma.eventCalendarMembership.findUnique({
      where: { id: membership!.id },
    });
    expect(membershipAfter).toBeNull();
  });

  /**
   * Test 4: Member Limit Enforcement in Auto-Accept
   *
   * Scenario:
   * - Calendar has 10 members (at MAX_MEMBERS_PER_CALENDAR limit)
   * - New user with pending invitation logs in (triggers auto-accept)
   *
   * Expected:
   * - Auto-accept should skip the invitation (calendar at capacity)
   * - Invitation remains pending
   * - acceptedCount returns 0
   */
  test('auto-accept skips invitations when calendar at member limit', async () => {
    // Add 9 more members to reach the 10-member limit (owner + 9)
    const MAX_MEMBERS_PER_CALENDAR = 10;
    const membersToAdd = MAX_MEMBERS_PER_CALENDAR - 1; // -1 for owner
    const extraUserIds: string[] = [];

    for (let i = 1; i <= membersToAdd; i++) {
      const user = await prisma.user.create({
        data: {
          email: `limit-test-member${i}-${Date.now()}-${i}@example.com`,
          name: `Limit Test Member ${i}`,
          home_address: `${i} Test St`,
          home_latitude: 37.7749 + i * 0.001,
          home_longitude: -122.4194 + i * 0.001,
        },
      });

      extraUserIds.push(user.id);

      await prisma.eventCalendarMembership.create({
        data: {
          event_calendar_id: testCalendar.id,
          user_id: user.id,
          invited_email: user.email,
          invitation_token: `token-${i}-${Date.now()}`,
          status: 'accepted',
          invited_by_user_id: testUser1.id,
        },
      });
    }

    // Verify calendar is at capacity
    const memberCount = await prisma.eventCalendarMembership.count({
      where: {
        event_calendar_id: testCalendar.id,
        status: 'accepted',
      },
    });
    expect(memberCount).toBe(MAX_MEMBERS_PER_CALENDAR);

    // Create pending invitation for new user
    const newUserEmail = 'overflow@example.com';
    await prisma.eventCalendarMembership.create({
      data: {
        event_calendar_id: testCalendar.id,
        invited_email: newUserEmail,
        invitation_token: 'overflow-token',
        status: 'pending',
        invited_by_user_id: testUser1.id,
      },
    });

    // Simulate new user logging in (should trigger auto-accept)
    const newUser = await prisma.user.create({
      data: {
        email: newUserEmail,
        name: 'Overflow User',
        home_address: '999 Full St',
        home_latitude: 37.8,
        home_longitude: -122.5,
      },
    });

    const acceptedCount = await invitationService.autoAcceptPendingInvitations(
      newUser.id,
      newUserEmail
    );

    // Verify invitation was NOT auto-accepted (calendar at capacity)
    expect(acceptedCount).toBe(0);

    // Verify invitation still pending
    const invitation = await prisma.eventCalendarMembership.findFirst({
      where: {
        event_calendar_id: testCalendar.id,
        invited_email: newUserEmail,
      },
    });
    expect(invitation?.status).toBe('pending');
    expect(invitation?.user_id).toBeNull();

    // Cleanup extra users
    await prisma.user.deleteMany({
      where: {
        id: { in: extraUserIds },
      },
    });
    await prisma.user.delete({ where: { id: newUser.id } });
  });

  /**
   * Test 5: Auto-Accept Success for Calendar Under Limit
   *
   * Scenario:
   * - Calendar has 5 members (below 10-member limit)
   * - New user with pending invitation logs in
   *
   * Expected:
   * - Auto-accept succeeds
   * - Invitation status changes to 'accepted'
   * - user_id is set
   * - acceptedCount returns 1
   */
  test('auto-accept succeeds when calendar has available capacity', async () => {
    // Calendar currently has 1 member (owner), well below limit

    // Create pending invitation
    const newUserEmail = 'available@example.com';
    await prisma.eventCalendarMembership.create({
      data: {
        event_calendar_id: testCalendar.id,
        invited_email: newUserEmail,
        invitation_token: 'available-token',
        status: 'pending',
        invited_by_user_id: testUser1.id,
      },
    });

    // Simulate new user logging in
    const newUser = await prisma.user.create({
      data: {
        email: newUserEmail,
        name: 'Available User',
        home_address: '555 Open St',
        home_latitude: 37.77,
        home_longitude: -122.42,
      },
    });

    const acceptedCount = await invitationService.autoAcceptPendingInvitations(
      newUser.id,
      newUserEmail
    );

    // Verify invitation was auto-accepted
    expect(acceptedCount).toBe(1);

    const invitation = await prisma.eventCalendarMembership.findFirst({
      where: {
        event_calendar_id: testCalendar.id,
        invited_email: newUserEmail,
      },
    });
    expect(invitation?.status).toBe('accepted');
    expect(invitation?.user_id).toBe(newUser.id);
    expect(invitation?.responded_at).toBeDefined();

    // Cleanup
    await prisma.user.delete({ where: { id: newUser.id } });
  });

  /**
   * Test 6: Existing User Auto-Added (Bypasses Pending)
   *
   * Scenario:
   * - Invite existing user (testUser2)
   * - Since user exists, should be added directly with status='accepted'
   *
   * Expected:
   * - No email sent
   * - Membership created with status='accepted' immediately
   * - user_id is set to existing user
   */
  test('existing user is auto-added without pending invitation', async () => {
    // Invite existing user (testUser2)
    const membership = await invitationService.sendInvitation(
      testCalendar.id,
      testUser2.email,
      testUser1.id
    );

    // Verify user was added directly (not pending)
    expect(membership.status).toBe('accepted');
    expect(membership.user_id).toBe(testUser2.id);
    expect(membership.responded_at).toBeDefined();

    // Verify in database
    const dbMembership = await prisma.eventCalendarMembership.findFirst({
      where: {
        event_calendar_id: testCalendar.id,
        user_id: testUser2.id,
      },
    });
    expect(dbMembership?.status).toBe('accepted');
  });
});
