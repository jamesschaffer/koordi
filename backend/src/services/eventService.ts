import { handleEventReassignment } from './supplementalEventService';
import { syncMainEventToGoogleCalendar, deleteMainEventFromGoogleCalendar } from './mainEventGoogleCalendarSync';
import { syncMainEventToAllMembers, deleteMainEventFromAllMembers } from './multiUserSyncService';
import { ConcurrentModificationError } from '../errors/ConcurrentModificationError';
import { prisma } from '../lib/prisma';

/**
 * Get all events for calendars the user has access to
 */
export const getUserEvents = async (userId: string, filters?: {
  calendarId?: string;
  startDate?: Date;
  endDate?: Date;
  unassignedOnly?: boolean;
  assignedToMe?: boolean;
  excludePast?: boolean;
  includeCancelled?: boolean;
}) => {
  // Get user's keep_supplemental_events setting
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { keep_supplemental_events: true },
  });

  const keepSupplementalEvents = user?.keep_supplemental_events || false;

  // Build where clause
  const where: any = {
    event_calendar: {
      members: {
        some: {
          user_id: userId,
          status: 'accepted',
        },
      },
    },
  };

  // Apply filters
  if (filters?.calendarId) {
    where.event_calendar_id = filters.calendarId;
  }

  if (filters?.startDate || filters?.endDate) {
    where.AND = [];
    if (filters.startDate) {
      where.AND.push({ start_time: { gte: filters.startDate } });
    }
    if (filters.endDate) {
      where.AND.push({ start_time: { lte: filters.endDate } });
    }
  }

  if (filters?.unassignedOnly) {
    where.assigned_to_user_id = null;
    where.is_skipped = false; // Exclude "Not Attending" events from unassigned filter
  } else if (filters?.assignedToMe) {
    where.assigned_to_user_id = userId;
  }

  // Exclude events that have already ended (end_time < now)
  if (filters?.excludePast) {
    where.end_time = { gte: new Date() };
  }

  // Note: Cancelled events are included by default so users can see the cancellation indicator
  // The includeCancelled filter can be used to explicitly exclude them if needed
  if (filters?.includeCancelled === false) {
    where.is_cancelled = false;
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
      assigned_to: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      },
      supplemental_events: true,
    },
    orderBy: {
      start_time: 'asc',
    },
  });

  // Always return supplemental events for conflict detection
  // The keep_supplemental_events setting is handled in the frontend for display purposes only
  console.log(`[getUserEvents] Found ${events.length} events for user ${userId}`);
  console.log(`[getUserEvents] keep_supplemental_events: ${keepSupplementalEvents}`);

  const result = events.map((event) => {
    console.log(`[getUserEvents] Event "${event.title}": assigned_to=${event.assigned_to_user_id}, ` +
      `supplemental_count=${event.supplemental_events.length}`);

    // Always include supplemental events for conflict detection
    // Frontend will handle visibility based on user preferences
    return {
      ...event,
      supplemental_events: event.supplemental_events,
      keep_supplemental_events: keepSupplementalEvents, // Pass setting to frontend
    };
  });

  console.log(`[getUserEvents] Returning ${result.length} events`);
  return result;
};

/**
 * Get single event details
 */
export const getEventById = async (eventId: string, userId: string) => {
  // Get user's keep_supplemental_events setting
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { keep_supplemental_events: true },
  });

  const keepSupplementalEvents = user?.keep_supplemental_events || false;

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      event_calendar: {
        members: {
          some: {
            user_id: userId,
            status: 'accepted',
          },
        },
      },
    },
    include: {
      event_calendar: {
        include: {
          child: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      assigned_to: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      },
      supplemental_events: {
        orderBy: {
          start_time: 'asc',
        },
      },
    },
  });

  if (!event) {
    return null;
  }

  // Filter supplemental events based on visibility rules:
  // 1. If event is assigned to current user: always show supplemental events
  // 2. If user has keep_supplemental_events enabled: show all supplemental events
  // 3. Otherwise: don't show supplemental events
  const shouldShowSupplementalEvents =
    event.assigned_to_user_id === userId || keepSupplementalEvents;

  return {
    ...event,
    supplemental_events: shouldShowSupplementalEvents ? event.supplemental_events : [],
  };
};

/**
 * Assign an event to a user with optimistic locking
 * @param eventId - The event ID to assign
 * @param userId - The user making the assignment (for access control)
 * @param assignToUserId - The user to assign the event to (null to unassign)
 * @param expectedVersion - Optional version number for optimistic locking (prevents race conditions)
 * @param skip - Optional flag to mark event as "Not Attending" (skipped)
 */
export const assignEvent = async (
  eventId: string,
  userId: string,
  assignToUserId: string | null,
  expectedVersion?: number,
  skip?: boolean
) => {
  // Verify user has access to this event
  const event = await getEventById(eventId, userId);
  if (!event) {
    throw new Error('Event not found or access denied');
  }

  // Check if event is currently syncing - reject assignment to prevent race conditions
  const currentEvent = await prisma.event.findUnique({
    where: { id: eventId },
    select: { sync_in_progress: true },
  });
  if (currentEvent?.sync_in_progress) {
    throw new Error('Event is currently syncing to Google Calendar. Please wait and try again.');
  }

  // Optimistic locking: Pre-check version if provided (fail fast)
  if (expectedVersion !== undefined && event.version !== expectedVersion) {
    throw new ConcurrentModificationError(
      'Event',
      eventId,
      expectedVersion,
      event.version,
      {
        id: event.id,
        title: event.title,
        assigned_to_user_id: event.assigned_to_user_id,
        assigned_to: event.assigned_to,
      }
    );
  }

  // Get previous assignment for Google Calendar cleanup
  const previousAssignedUserId = event.assigned_to_user_id;
  const wasSkipped = event.is_skipped;

  // Use the current version for the atomic update (if expectedVersion not provided)
  const versionForUpdate = expectedVersion !== undefined ? expectedVersion : event.version;

  // Determine the new skip state
  // If skip is explicitly true, mark as skipped and clear assignment
  // If assigning to a user or explicitly setting skip to false, clear skip state
  const newIsSkipped = skip === true;
  const newAssignedUserId = newIsSkipped ? null : assignToUserId;

  // Update assignment with optimistic locking (atomic check-and-set)
  // Also set sync_in_progress to prevent reassignment during Google Calendar sync
  const updatedEvent = await prisma.event.update({
    where: {
      id: eventId,
      version: versionForUpdate, // Atomic: only update if version matches
    },
    data: {
      assigned_to_user_id: newAssignedUserId,
      is_skipped: newIsSkipped,
      sync_in_progress: true, // Prevent reassignment during sync
      version: { increment: 1 }, // Atomic version increment
    },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
      assigned_to: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      },
    },
  });

  // Handle Google Calendar sync for main event
  // Main events are synced to ALL calendar members (not just assigned user)
  try {
    // Sync to all calendar members (title will reflect skip/assignment status)
    await syncMainEventToAllMembers(eventId);
  } catch (error) {
    console.error('Failed to sync main event to all calendar members:', error);
    // Don't throw - Google Calendar sync is optional
  }

  // Handle supplemental events (drive-to and drive-home)
  // If event is being skipped: delete existing supplemental events, don't create new ones
  // If event is being assigned: create new supplemental events
  // If event is being unassigned (not skipped): delete existing supplemental events
  try {
    if (newIsSkipped) {
      // Event is being skipped - delete all supplemental events
      await handleEventReassignment(eventId, previousAssignedUserId, null);
    } else {
      // Normal assignment/unassignment flow
      await handleEventReassignment(eventId, previousAssignedUserId, newAssignedUserId);
    }
  } catch (error) {
    console.error('Failed to handle supplemental events:', error);
    // Don't throw - supplemental events are optional and shouldn't fail the assignment
    // Common reasons: user has no home address, event has no location, Maps API errors
  }

  // Clear sync_in_progress flag now that sync is complete
  const finalEvent = await prisma.event.update({
    where: { id: eventId },
    data: { sync_in_progress: false },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
      assigned_to: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      },
      supplemental_events: true,
    },
  });

  return finalEvent;
};

/**
 * Check for conflicts if assigning an event to a user
 * Returns array of conflicting events (includes both main events and supplemental events)
 */
export const checkEventConflicts = async (
  eventId: string,
  assignToUserId: string,
  userId: string
) => {
  // Get the event we're trying to assign
  const event = await getEventById(eventId, userId);
  if (!event) {
    throw new Error('Event not found or access denied');
  }

  // Get the assigned user to check settings
  const assignedUser = await prisma.user.findUnique({
    where: { id: assignToUserId },
  });

  if (!assignedUser) {
    throw new Error('Assigned user not found');
  }

  // Calculate the full time window including potential supplemental events
  // This simulates what supplemental events would be created
  let effectiveStartTime = event.start_time;
  let effectiveEndTime = event.end_time;

  // If user has home address and event has location, estimate supplemental event windows
  if (assignedUser.home_address && assignedUser.home_latitude && assignedUser.home_longitude && event.location) {
    // Import the arrival time parser
    const { parseArrivalTime } = await import('./arrivalTimeParser');

    // Parse arrival time from description (if specified)
    const arrivalInfo = parseArrivalTime(event.description, event.start_time);

    // Determine target arrival time: either parsed arrival time or event start
    const targetArrivalTime = arrivalInfo ? arrivalInfo.arrivalTime : event.start_time;

    // Estimate drive time + comfort buffer (conservative estimate of 30 minutes for conflict checking)
    // In reality, supplemental events will calculate actual drive time with Google Maps
    const estimatedDriveMinutes = 30 + assignedUser.comfort_buffer_minutes;

    // Effective start time: target arrival time minus estimated drive time (including buffer)
    effectiveStartTime = new Date(
      targetArrivalTime.getTime() - estimatedDriveMinutes * 60000
    );

    // Effective end time: event end time plus estimated return drive time
    effectiveEndTime = new Date(
      event.end_time.getTime() + estimatedDriveMinutes * 60000
    );
  }

  // Find all main events assigned to the target user that overlap with the effective time window
  // Exclude skipped and cancelled events from conflict detection
  const eventConflicts = await prisma.event.findMany({
    where: {
      id: { not: eventId }, // Exclude the event itself
      assigned_to_user_id: assignToUserId,
      is_skipped: false, // Exclude "Not Attending" events
      is_cancelled: false, // Exclude cancelled events
      OR: [
        // Event starts during this window
        {
          AND: [
            { start_time: { gte: effectiveStartTime } },
            { start_time: { lt: effectiveEndTime } },
          ],
        },
        // Event ends during this window
        {
          AND: [
            { end_time: { gt: effectiveStartTime } },
            { end_time: { lte: effectiveEndTime } },
          ],
        },
        // Event completely encompasses this window
        {
          AND: [
            { start_time: { lte: effectiveStartTime } },
            { end_time: { gte: effectiveEndTime } },
          ],
        },
      ],
    },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
    },
    orderBy: {
      start_time: 'asc',
    },
  });

  // Find all supplemental events (drive times) for other events assigned to this user
  // that overlap with the effective time window
  // Exclude supplemental events from skipped or cancelled parent events
  const supplementalConflicts = await prisma.supplementalEvent.findMany({
    where: {
      parent_event: {
        assigned_to_user_id: assignToUserId,
        is_skipped: false, // Exclude "Not Attending" events
        is_cancelled: false, // Exclude cancelled events
      },
      OR: [
        // Supplemental event starts during this window
        {
          AND: [
            { start_time: { gte: effectiveStartTime } },
            { start_time: { lt: effectiveEndTime } },
          ],
        },
        // Supplemental event ends during this window
        {
          AND: [
            { end_time: { gt: effectiveStartTime } },
            { end_time: { lte: effectiveEndTime } },
          ],
        },
        // Supplemental event completely encompasses this window
        {
          AND: [
            { start_time: { lte: effectiveStartTime } },
            { end_time: { gte: effectiveEndTime } },
          ],
        },
      ],
    },
    include: {
      parent_event: {
        include: {
          event_calendar: {
            include: {
              child: true,
            },
          },
        },
      },
    },
    orderBy: {
      start_time: 'asc',
    },
  });

  // Combine conflicts from both sources
  // For supplemental events, we return the parent event (since that's what user sees in the UI)
  const supplementalParentEvents = supplementalConflicts.map((se) => se.parent_event);

  // Merge and deduplicate (in case both main event and supplemental event conflict)
  const allConflicts = [...eventConflicts];
  for (const parentEvent of supplementalParentEvents) {
    if (!allConflicts.find((e) => e.id === parentEvent.id)) {
      allConflicts.push(parentEvent);
    }
  }

  return allConflicts.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
};
