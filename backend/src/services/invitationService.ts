import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { sendInvitationEmail, sendInvitationAcceptedEmail, sendInvitationDeclinedEmail } from './emailService';

const prisma = new PrismaClient();

const MAX_MEMBERS_PER_CALENDAR = 10;

/**
 * Get all family members for a user
 * This includes anyone who has ever been a member of any calendar owned by the user
 * or any calendar the user is a member of (both current and historical)
 * @param userId - User ID
 * @returns List of family members with their calendar associations
 */
export async function getFamilyMembers(userId: string) {
  // Get all calendars owned by or associated with the user
  const userCalendars = await prisma.eventCalendar.findMany({
    where: {
      OR: [
        { owner_id: userId },
        {
          members: {
            some: {
              user_id: userId,
              status: 'accepted',
            },
          },
        },
      ],
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      },
      members: {
        where: {
          user_id: { not: null }, // Only include memberships where user has accepted (has user_id)
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar_url: true,
            },
          },
        },
      },
    },
  });

  // Build a map of unique family members
  const membersMap = new Map<string, any>();

  userCalendars.forEach((calendar) => {
    // Add owner
    if (!membersMap.has(calendar.owner.id)) {
      membersMap.set(calendar.owner.id, {
        id: calendar.owner.id,
        name: calendar.owner.name,
        email: calendar.owner.email,
        avatar_url: calendar.owner.avatar_url,
        calendars: [],
      });
    }
    membersMap.get(calendar.owner.id)!.calendars.push({
      id: calendar.id,
      name: calendar.name,
    });

    // Add all members (both current and historical - anyone with a user_id)
    calendar.members.forEach((membership) => {
      if (membership.user) {
        const memberId = membership.user.id;
        if (!membersMap.has(memberId)) {
          membersMap.set(memberId, {
            id: membership.user.id,
            name: membership.user.name,
            email: membership.user.email,
            avatar_url: membership.user.avatar_url,
            calendars: [],
          });
        }

        // Only add calendar if they're currently a member (status: accepted)
        if (membership.status === 'accepted') {
          const memberCalendars = membersMap.get(memberId)!.calendars;
          if (!memberCalendars.some((c: any) => c.id === calendar.id)) {
            memberCalendars.push({
              id: calendar.id,
              name: calendar.name,
            });
          }
        }
      }
    });
  });

  return Array.from(membersMap.values());
}

/**
 * Generate a secure invitation token
 */
function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Send invitation to join an Event Calendar
 * If the email belongs to an existing user, they're added directly without an email
 * @param calendarId - The Event Calendar ID
 * @param invitedEmail - Email of the person being invited
 * @param invitedByUserId - User ID of person sending invitation
 * @returns Created invitation or membership
 */
export async function sendInvitation(
  calendarId: string,
  invitedEmail: string,
  invitedByUserId: string
) {
  // Verify calendar exists and user is the owner
  const calendar = await prisma.eventCalendar.findUnique({
    where: { id: calendarId },
    include: {
      members: {
        where: { status: 'accepted' },
      },
      child: true,
    },
  });

  if (!calendar) {
    throw new Error('Event Calendar not found');
  }

  if (calendar.owner_id !== invitedByUserId) {
    throw new Error('Only the calendar owner can send invitations');
  }

  // Check member limit
  if (calendar.members.length >= MAX_MEMBERS_PER_CALENDAR) {
    throw new Error(`Maximum ${MAX_MEMBERS_PER_CALENDAR} members per calendar`);
  }

  // Check if already invited or member
  const existingInvitation = await prisma.eventCalendarMembership.findFirst({
    where: {
      event_calendar_id: calendarId,
      invited_email: invitedEmail,
    },
  });

  if (existingInvitation) {
    if (existingInvitation.status === 'pending') {
      throw new Error('This email already has a pending invitation');
    } else if (existingInvitation.status === 'accepted') {
      throw new Error('This email is already a member');
    } else if (existingInvitation.status === 'declined') {
      // Allow re-invitation if previously declined
      // Delete the old declined invitation
      await prisma.eventCalendarMembership.delete({
        where: { id: existingInvitation.id },
      });
    }
  }

  // Check if user already exists with this email (existing family member)
  const existingUser = await prisma.user.findUnique({
    where: { email: invitedEmail },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  // If user exists, check if they're already a member (by user_id, not just invited_email)
  if (existingUser) {
    const existingMembership = await prisma.eventCalendarMembership.findFirst({
      where: {
        event_calendar_id: calendarId,
        user_id: existingUser.id,
        status: 'accepted',
      },
    });

    if (existingMembership) {
      throw new Error('This user is already a member of this calendar');
    }
  }

  // Generate invitation token
  const invitationToken = generateInvitationToken();

  // Get invited_by user info
  const invitedBy = await prisma.user.findUnique({
    where: { id: invitedByUserId },
    select: {
      name: true,
      email: true,
    },
  });

  // If user exists, add them directly without sending email
  if (existingUser) {
    const membership = await prisma.eventCalendarMembership.create({
      data: {
        event_calendar_id: calendarId,
        user_id: existingUser.id,
        invited_email: invitedEmail,
        invitation_token: invitationToken,
        invited_by_user_id: invitedByUserId,
        status: 'accepted',
        responded_at: new Date(),
      },
      include: {
        event_calendar: {
          include: {
            child: true,
          },
        },
        invited_by: {
          select: {
            name: true,
            email: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar_url: true,
          },
        },
      },
    });

    console.log(`Existing user ${existingUser.name} (${existingUser.email}) added directly to calendar ${calendar.name}`);

    return membership;
  }

  // User doesn't exist - create pending invitation and send email
  const invitation = await prisma.eventCalendarMembership.create({
    data: {
      event_calendar_id: calendarId,
      invited_email: invitedEmail,
      invitation_token: invitationToken,
      invited_by_user_id: invitedByUserId,
      status: 'pending',
    },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
      invited_by: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  console.log(`Invitation sent to new user ${invitedEmail} for calendar ${calendar.name}`);

  // Send invitation email (async, don't block on failure)
  if (invitedBy) {
    sendInvitationEmail({
      to: invitedEmail,
      invitedBy: invitedBy.name,
      calendarName: invitation.event_calendar.name,
      childName: invitation.event_calendar.child.name,
      invitationToken: invitationToken,
    }).catch((error) => {
      console.error('Failed to send invitation email:', error);
      // Don't throw - invitation was created successfully, email is secondary
    });
  }

  return invitation;
}

/**
 * Get all members of an Event Calendar
 * @param calendarId - The Event Calendar ID
 * @param userId - User ID making the request (must be owner or member)
 * @returns List of members and pending invitations
 */
export async function getCalendarMembers(calendarId: string, userId: string) {
  // Verify user has access to this calendar
  const calendar = await prisma.eventCalendar.findFirst({
    where: {
      id: calendarId,
      OR: [
        { owner_id: userId },
        {
          members: {
            some: {
              user_id: userId,
              status: 'accepted',
            },
          },
        },
      ],
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar_url: true,
            },
          },
          invited_by: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          invited_at: 'desc',
        },
      },
    },
  });

  if (!calendar) {
    throw new Error('Event Calendar not found or access denied');
  }

  return {
    owner: calendar.owner,
    members: calendar.members,
  };
}

/**
 * Accept an invitation
 * @param invitationToken - The invitation token
 * @param userId - User ID accepting the invitation
 * @returns Updated membership
 */
export async function acceptInvitation(invitationToken: string, userId: string) {
  // Find the invitation
  const invitation = await prisma.eventCalendarMembership.findUnique({
    where: { invitation_token: invitationToken },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
      user: true,
    },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error(`Invitation already ${invitation.status}`);
  }

  // Verify the user's email matches the invited email
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.email !== invitation.invited_email) {
    throw new Error('This invitation was sent to a different email address');
  }

  // Update invitation status
  const updatedInvitation = await prisma.eventCalendarMembership.update({
    where: { id: invitation.id },
    data: {
      user_id: userId,
      status: 'accepted',
      responded_at: new Date(),
    },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
    },
  });

  console.log(`${user.email} accepted invitation to calendar ${invitation.event_calendar.name}`);

  return updatedInvitation;
}

/**
 * Decline an invitation
 * @param invitationToken - The invitation token
 * @param userId - User ID declining the invitation
 * @returns Updated membership
 */
export async function declineInvitation(invitationToken: string, userId: string) {
  // Find the invitation
  const invitation = await prisma.eventCalendarMembership.findUnique({
    where: { invitation_token: invitationToken },
    include: {
      event_calendar: true,
    },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error(`Invitation already ${invitation.status}`);
  }

  // Verify the user's email matches the invited email
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.email !== invitation.invited_email) {
    throw new Error('This invitation was sent to a different email address');
  }

  // Update invitation status
  const updatedInvitation = await prisma.eventCalendarMembership.update({
    where: { id: invitation.id },
    data: {
      status: 'declined',
      responded_at: new Date(),
    },
  });

  console.log(`${user.email} declined invitation to calendar ${invitation.event_calendar.name}`);

  return updatedInvitation;
}

/**
 * Resend an invitation email
 * @param invitationId - The invitation ID
 * @param userId - User ID requesting resend (must be calendar owner)
 * @returns Updated invitation
 */
export async function resendInvitation(invitationId: string, userId: string) {
  // Find the invitation
  const invitation = await prisma.eventCalendarMembership.findUnique({
    where: { id: invitationId },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
      invited_by: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  // Verify user is the calendar owner
  if (invitation.event_calendar.owner_id !== userId) {
    throw new Error('Only the calendar owner can resend invitations');
  }

  if (invitation.status !== 'pending') {
    throw new Error('Can only resend pending invitations');
  }

  // Update the invitation timestamp (so we can track resends)
  const updatedInvitation = await prisma.eventCalendarMembership.update({
    where: { id: invitationId },
    data: {
      invited_at: new Date(), // Update to current time
    },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
      invited_by: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  console.log(`Resent invitation to ${invitation.invited_email} for calendar ${invitation.event_calendar.name}`);

  return updatedInvitation;
}

/**
 * Cancel/delete an invitation
 * @param invitationId - The invitation ID
 * @param userId - User ID requesting cancellation (must be calendar owner)
 */
export async function cancelInvitation(invitationId: string, userId: string) {
  // Find the invitation
  const invitation = await prisma.eventCalendarMembership.findUnique({
    where: { id: invitationId },
    include: {
      event_calendar: true,
    },
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  // Verify user is the calendar owner
  if (invitation.event_calendar.owner_id !== userId) {
    throw new Error('Only the calendar owner can cancel invitations');
  }

  if (invitation.status !== 'pending') {
    throw new Error('Can only cancel pending invitations');
  }

  // Delete the invitation
  await prisma.eventCalendarMembership.delete({
    where: { id: invitationId },
  });

  console.log(`Cancelled invitation to ${invitation.invited_email} for calendar ${invitation.event_calendar.name}`);
}

/**
 * Remove a member from an Event Calendar
 * @param membershipId - The membership ID
 * @param userId - User ID requesting removal (must be calendar owner)
 * @returns Information about the removal for WebSocket broadcasting
 */
export async function removeMember(membershipId: string, userId: string) {
  // Find the membership
  const membership = await prisma.eventCalendarMembership.findUnique({
    where: { id: membershipId },
    include: {
      event_calendar: {
        include: {
          owner: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error('Membership not found');
  }

  // Verify user is the calendar owner
  if (membership.event_calendar.owner_id !== userId) {
    throw new Error('Only the calendar owner can remove members');
  }

  if (membership.status !== 'accepted') {
    throw new Error('Can only remove accepted members');
  }

  let reassignedEventIds: string[] = [];

  // Find all events assigned to this member (before transaction)
  let assignedEvents: { id: string; title: string; }[] = [];
  if (membership.user_id) {
    assignedEvents = await prisma.event.findMany({
      where: {
        event_calendar_id: membership.event_calendar_id,
        assigned_to_user_id: membership.user_id,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (assignedEvents.length > 0) {
      console.log(`Reassigning ${assignedEvents.length} events from ${membership.user?.email} to calendar owner ${membership.event_calendar.owner.name}`);
      reassignedEventIds = assignedEvents.map(e => e.id);
    }
  }

  // Perform all database operations atomically within a transaction
  await prisma.$transaction(async (tx) => {
    // Step 1: Delete supplemental events for reassigned events
    if (reassignedEventIds.length > 0) {
      await tx.supplementalEvent.deleteMany({
        where: {
          parent_event_id: {
            in: reassignedEventIds,
          },
        },
      });
    }

    // Step 2: Reassign events to calendar owner
    if (membership.user_id && reassignedEventIds.length > 0) {
      await tx.event.updateMany({
        where: {
          event_calendar_id: membership.event_calendar_id,
          assigned_to_user_id: membership.user_id,
        },
        data: {
          assigned_to_user_id: membership.event_calendar.owner_id,
        },
      });
    }

    // Step 3: Delete the membership
    await tx.eventCalendarMembership.delete({
      where: { id: membershipId },
    });
  });

  if (reassignedEventIds.length > 0) {
    console.log(`Reassigned events: ${assignedEvents.map(e => e.title).join(', ')}`);
  }

  console.log(`Removed ${membership.user?.email} from calendar ${membership.event_calendar.name}`);

  // Return data for WebSocket broadcasting
  return {
    calendarId: membership.event_calendar_id,
    ownerId: membership.event_calendar.owner_id,
    userName: membership.user?.name || 'Unknown',
    userEmail: membership.user?.email || '',
    reassignedEventIds,
  };
}

/**
 * Get user's pending invitations
 * @param userId - User ID
 * @returns List of pending invitations for this user
 */
export async function getUserPendingInvitations(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const invitations = await prisma.eventCalendarMembership.findMany({
    where: {
      invited_email: user.email,
      status: 'pending',
    },
    include: {
      event_calendar: {
        include: {
          child: true,
          owner: {
            select: {
              name: true,
              email: true,
              avatar_url: true,
            },
          },
        },
      },
      invited_by: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      invited_at: 'desc',
    },
  });

  return invitations;
}

/**
 * Auto-accept pending invitations for a user when they log in
 * @param userId - User ID
 * @param email - User's email address
 * @returns Number of invitations auto-accepted
 */
export async function autoAcceptPendingInvitations(userId: string, email: string) {
  // Find all pending invitations for this email
  const pendingInvitations = await prisma.eventCalendarMembership.findMany({
    where: {
      invited_email: email,
      status: 'pending',
    },
    include: {
      event_calendar: {
        include: {
          child: true,
          members: {
            where: { status: 'accepted' },
          },
        },
      },
    },
  });

  if (pendingInvitations.length === 0) {
    return 0;
  }

  // Accept invitations one by one, checking member limits for each calendar
  let acceptedCount = 0;
  const skippedInvitations: string[] = [];

  for (const invitation of pendingInvitations) {
    const currentMemberCount = invitation.event_calendar.members.length;

    // Check if calendar has reached member limit
    if (currentMemberCount >= MAX_MEMBERS_PER_CALENDAR) {
      console.log(`  ✗ Skipped ${invitation.event_calendar.name}: at capacity (${currentMemberCount}/${MAX_MEMBERS_PER_CALENDAR} members)`);
      skippedInvitations.push(invitation.event_calendar.name);
      continue;
    }

    // Accept the invitation
    await prisma.eventCalendarMembership.update({
      where: { id: invitation.id },
      data: {
        user_id: userId,
        status: 'accepted',
        responded_at: new Date(),
      },
    });

    acceptedCount++;
    console.log(`  ✓ ${invitation.event_calendar.name} (${invitation.event_calendar.child.name})`);
  }

  console.log(`Auto-accepted ${acceptedCount}/${pendingInvitations.length} pending invitation(s) for ${email}`);

  if (skippedInvitations.length > 0) {
    console.log(`  Skipped ${skippedInvitations.length} invitation(s) due to member limits: ${skippedInvitations.join(', ')}`);
  }

  return acceptedCount;
}
