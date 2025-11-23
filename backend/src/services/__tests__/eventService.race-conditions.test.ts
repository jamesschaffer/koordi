import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ConcurrentModificationError } from '../../errors/ConcurrentModificationError';
import * as eventService from '../eventService';

const prisma = new PrismaClient();

/**
 * Test Suite: Event Assignment Race Conditions & Optimistic Locking
 *
 * Purpose: Verify that optimistic locking prevents data loss when multiple users
 * attempt to assign the same event simultaneously.
 *
 * Scenarios Tested:
 * 1. Concurrent assignment attempts (both to unassigned event)
 * 2. Concurrent reassignment attempts (from A to B vs A to C)
 * 3. Version increments on each successful assignment
 * 4. Error messages provide retry guidance
 */
describe('Event Assignment Race Conditions', () => {
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let testChild: any;
  let testCalendar: any;
  let testEvent: any;

  // Setup: Create test data before each test
  beforeEach(async () => {
    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        email: 'testuser1@example.com',
        name: 'Test User 1',
        home_address: '123 Main St',
        home_latitude: 37.7749,
        home_longitude: -122.4194,
      },
    });

    testUser2 = await prisma.user.create({
      data: {
        email: 'testuser2@example.com',
        name: 'Test User 2',
        home_address: '456 Oak Ave',
        home_latitude: 37.7849,
        home_longitude: -122.4294,
      },
    });

    testUser3 = await prisma.user.create({
      data: {
        email: 'testuser3@example.com',
        name: 'Test User 3',
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

    // Create test calendar
    testCalendar = await prisma.eventCalendar.create({
      data: {
        name: 'Test Calendar',
        ics_url: 'https://example.com/calendar.ics',
        child_id: testChild.id,
        owner_id: testUser1.id,
      },
    });

    // Add all users as calendar members
    await prisma.eventCalendarMembership.createMany({
      data: [
        {
          event_calendar_id: testCalendar.id,
          user_id: testUser1.id,
          invited_email: testUser1.email,
          invitation_token: 'token1',
          status: 'accepted',
          invited_by_user_id: testUser1.id,
        },
        {
          event_calendar_id: testCalendar.id,
          user_id: testUser2.id,
          invited_email: testUser2.email,
          invitation_token: 'token2',
          status: 'accepted',
          invited_by_user_id: testUser1.id,
        },
        {
          event_calendar_id: testCalendar.id,
          user_id: testUser3.id,
          invited_email: testUser3.email,
          invitation_token: 'token3',
          status: 'accepted',
          invited_by_user_id: testUser1.id,
        },
      ],
    });

    // Create test event (unassigned, version 1)
    testEvent = await prisma.event.create({
      data: {
        event_calendar_id: testCalendar.id,
        ics_uid: 'test-event-123',
        title: 'Soccer Practice',
        description: 'Weekly soccer practice',
        location: '100 Sports Way, San Francisco, CA',
        start_time: new Date('2025-12-01T15:00:00Z'),
        end_time: new Date('2025-12-01T16:30:00Z'),
        is_all_day: false,
        version: 1, // Initial version
      },
    });
  });

  // Cleanup: Delete test data after each test
  afterEach(async () => {
    // Delete in reverse order of dependencies
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
   * Test 1: Concurrent Assignment to Unassigned Event
   *
   * Scenario:
   * - Event is unassigned (version 1)
   * - User 1 and User 2 both try to assign to themselves simultaneously
   * - Both read version 1 and attempt to assign
   *
   * Expected:
   * - First assignment succeeds, updates version to 2
   * - Second assignment fails with ConcurrentModificationError
   * - Error indicates version mismatch (expected 1, found 2)
   */
  test('concurrent assignment attempts - first wins, second fails gracefully', async () => {
    // Both users read the event at version 1
    const eventForUser1 = await eventService.getEventById(testEvent.id, testUser1.id);
    const eventForUser2 = await eventService.getEventById(testEvent.id, testUser2.id);

    expect(eventForUser1?.version).toBe(1);
    expect(eventForUser2?.version).toBe(1);

    // User 1 assigns to themselves (should succeed)
    const assignedEvent = await eventService.assignEvent(
      testEvent.id,
      testUser1.id,
      testUser1.id,
      1 // expectedVersion
    );

    expect(assignedEvent.assigned_to_user_id).toBe(testUser1.id);
    expect(assignedEvent.version).toBe(2); // Version incremented

    // User 2 tries to assign to themselves with stale version (should fail)
    await expect(
      eventService.assignEvent(
        testEvent.id,
        testUser2.id,
        testUser2.id,
        1 // expectedVersion (stale!)
      )
    ).rejects.toThrow(ConcurrentModificationError);

    // Verify only User 1's assignment persisted
    const finalEvent = await prisma.event.findUnique({ where: { id: testEvent.id } });
    expect(finalEvent?.assigned_to_user_id).toBe(testUser1.id);
    expect(finalEvent?.version).toBe(2);
  });

  /**
   * Test 2: Error Provides Retry Guidance
   *
   * Scenario:
   * - Same as Test 1, but verify error message contains helpful info
   *
   * Expected:
   * - ConcurrentModificationError includes:
   *   - Expected version (1)
   *   - Actual version (2)
   *   - Current state (assigned user info)
   */
  test('assignment provides retry guidance on concurrent modification', async () => {
    // User 1 assigns first (version 1 → 2)
    await eventService.assignEvent(testEvent.id, testUser1.id, testUser1.id, 1);

    // User 2 tries with stale version
    try {
      await eventService.assignEvent(testEvent.id, testUser2.id, testUser2.id, 1);
      expect.fail('Should have thrown ConcurrentModificationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConcurrentModificationError);

      const concurrencyError = error as ConcurrentModificationError;
      expect(concurrencyError.expectedVersion).toBe(1);
      expect(concurrencyError.actualVersion).toBe(2);
      expect(concurrencyError.currentState).toBeDefined();
      expect(concurrencyError.currentState.assigned_to_user_id).toBe(testUser1.id);
      expect(concurrencyError.message).toContain('modified by another user');
    }
  });

  /**
   * Test 3: Concurrent Reassignment (A→B vs A→C)
   *
   * Scenario:
   * - Event is assigned to User 1 (version 2)
   * - Manager tries to reassign to User 2
   * - Simultaneously, another manager tries to reassign to User 3
   *
   * Expected:
   * - First reassignment succeeds (version 2 → 3)
   * - Second reassignment fails with version mismatch
   * - Only winning user's supplemental events created
   */
  test('reassignment from User A to User B - concurrent with A to C', async () => {
    // Initial state: Event assigned to User 1
    await eventService.assignEvent(testEvent.id, testUser1.id, testUser1.id, 1);

    // Verify initial assignment
    let currentEvent = await prisma.event.findUnique({ where: { id: testEvent.id } });
    expect(currentEvent?.assigned_to_user_id).toBe(testUser1.id);
    expect(currentEvent?.version).toBe(2);

    // Both managers read event at version 2
    const eventForManager1 = await eventService.getEventById(testEvent.id, testUser1.id);
    const eventForManager2 = await eventService.getEventById(testEvent.id, testUser1.id);

    expect(eventForManager1?.version).toBe(2);
    expect(eventForManager2?.version).toBe(2);

    // Manager 1 tries to reassign to User 2 (should succeed)
    const reassignedEvent = await eventService.assignEvent(
      testEvent.id,
      testUser1.id,
      testUser2.id,
      2 // expectedVersion
    );

    expect(reassignedEvent.assigned_to_user_id).toBe(testUser2.id);
    expect(reassignedEvent.version).toBe(3);

    // Manager 2 tries to reassign to User 3 with stale version (should fail)
    await expect(
      eventService.assignEvent(
        testEvent.id,
        testUser1.id,
        testUser3.id,
        2 // expectedVersion (stale!)
      )
    ).rejects.toThrow(ConcurrentModificationError);

    // Verify final state: User 2 assignment won
    currentEvent = await prisma.event.findUnique({ where: { id: testEvent.id } });
    expect(currentEvent?.assigned_to_user_id).toBe(testUser2.id);
    expect(currentEvent?.version).toBe(3);
  });

  /**
   * Test 4: Version Increments on Each Successful Assignment
   *
   * Scenario:
   * - Track version through multiple sequential assignments
   *
   * Expected:
   * - version=1: Unassigned
   * - version=2: Assigned to User 1
   * - version=3: Reassigned to User 2
   * - version=4: Unassigned
   */
  test('version increments on each successful assignment', async () => {
    // Initial: version 1, unassigned
    let currentEvent = await prisma.event.findUnique({ where: { id: testEvent.id } });
    expect(currentEvent?.version).toBe(1);
    expect(currentEvent?.assigned_to_user_id).toBeNull();

    // Assign to User 1: version 1 → 2
    await eventService.assignEvent(testEvent.id, testUser1.id, testUser1.id, 1);
    currentEvent = await prisma.event.findUnique({ where: { id: testEvent.id } });
    expect(currentEvent?.version).toBe(2);
    expect(currentEvent?.assigned_to_user_id).toBe(testUser1.id);

    // Reassign to User 2: version 2 → 3
    await eventService.assignEvent(testEvent.id, testUser1.id, testUser2.id, 2);
    currentEvent = await prisma.event.findUnique({ where: { id: testEvent.id } });
    expect(currentEvent?.version).toBe(3);
    expect(currentEvent?.assigned_to_user_id).toBe(testUser2.id);

    // Unassign: version 3 → 4
    await eventService.assignEvent(testEvent.id, testUser1.id, null, 3);
    currentEvent = await prisma.event.findUnique({ where: { id: testEvent.id } });
    expect(currentEvent?.version).toBe(4);
    expect(currentEvent?.assigned_to_user_id).toBeNull();
  });

  /**
   * Test 5: Assignment Without Version (Backward Compatibility)
   *
   * Scenario:
   * - Older clients may not send expected_version parameter
   *
   * Expected:
   * - Assignment should still work (using current version)
   * - No race protection, but doesn't break existing functionality
   */
  test('assignment without expected_version still works', async () => {
    // Call assignEvent without expectedVersion parameter
    const assignedEvent = await eventService.assignEvent(
      testEvent.id,
      testUser1.id,
      testUser1.id
      // Note: No expectedVersion parameter
    );

    expect(assignedEvent.assigned_to_user_id).toBe(testUser1.id);
    expect(assignedEvent.version).toBe(2); // Still increments
  });

  /**
   * Test 6: Pre-check Version Validation (Fail Fast)
   *
   * Scenario:
   * - User provides wrong version before attempting update
   *
   * Expected:
   * - Should fail immediately without attempting database write
   * - Provides current state for retry
   */
  test('pre-check fails fast with wrong version', async () => {
    // Assign to User 1 first (version 1 → 2)
    await eventService.assignEvent(testEvent.id, testUser1.id, testUser1.id, 1);

    // Try to assign with obviously wrong version (e.g., 99)
    try {
      await eventService.assignEvent(testEvent.id, testUser2.id, testUser2.id, 99);
      expect.fail('Should have thrown ConcurrentModificationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConcurrentModificationError);

      const concurrencyError = error as ConcurrentModificationError;
      expect(concurrencyError.expectedVersion).toBe(99);
      expect(concurrencyError.actualVersion).toBe(2);
    }
  });
});
