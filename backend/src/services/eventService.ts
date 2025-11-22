import { PrismaClient } from '@prisma/client';
import { handleEventReassignment } from './supplementalEventService';
import { syncMainEventToGoogleCalendar, deleteMainEventFromGoogleCalendar } from './mainEventGoogleCalendarSync';
import { syncMainEventToAllMembers, deleteMainEventFromAllMembers } from './multiUserSyncService';

const prisma = new PrismaClient();

/**
 * Get all events for calendars the user has access to
 */
export const getUserEvents = async (userId: string, filters?: {
  calendarId?: string;
  startDate?: Date;
  endDate?: Date;
  unassignedOnly?: boolean;
  assignedToMe?: boolean;
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
  } else if (filters?.assignedToMe) {
    where.assigned_to_user_id = userId;
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

  // Filter supplemental events based on visibility rules:
  // 1. If event is assigned to current user: always show supplemental events
  // 2. If user has keep_supplemental_events enabled: show all supplemental events
  // 3. Otherwise: don't show supplemental events
  console.log(`[getUserEvents] Found ${events.length} events for user ${userId}`);
  console.log(`[getUserEvents] keep_supplemental_events: ${keepSupplementalEvents}`);

  const result = events.map((event) => {
    const shouldShowSupplementalEvents =
      event.assigned_to_user_id === userId || keepSupplementalEvents;

    console.log(`[getUserEvents] Event "${event.title}": assigned_to=${event.assigned_to_user_id}, ` +
      `supplemental_count=${event.supplemental_events.length}, ` +
      `will_show_supplemental=${shouldShowSupplementalEvents}`);

    return {
      ...event,
      supplemental_events: shouldShowSupplementalEvents ? event.supplemental_events : [],
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
 * Assign an event to a user
 */
export const assignEvent = async (
  eventId: string,
  userId: string,
  assignToUserId: string | null
) => {
  // Verify user has access to this event
  const event = await getEventById(eventId, userId);
  if (!event) {
    throw new Error('Event not found or access denied');
  }

  // Get previous assignment for Google Calendar cleanup
  const previousAssignedUserId = event.assigned_to_user_id;

  // Update assignment
  const updatedEvent = await prisma.event.update({
    where: { id: eventId },
    data: {
      assigned_to_user_id: assignToUserId,
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
    // Sync to all calendar members
    await syncMainEventToAllMembers(eventId);
  } catch (error) {
    console.error('Failed to sync main event to all calendar members:', error);
    // Don't throw - Google Calendar sync is optional
  }

  // Handle supplemental events (drive-to and drive-home)
  // This runs asynchronously and won't fail the assignment if it errors
  try {
    await handleEventReassignment(eventId, previousAssignedUserId, assignToUserId);
  } catch (error) {
    console.error('Failed to create supplemental events:', error);
    // Don't throw - supplemental events are optional and shouldn't fail the assignment
    // Common reasons: user has no home address, event has no location, Maps API errors
  }

  return updatedEvent;
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

    // Parse arrival time to get the buffer
    const arrivalInfo = parseArrivalTime(
      event.description,
      event.start_time,
      assignedUser.comfort_buffer_minutes
    );

    // Estimate drive time (use a conservative estimate of 30 minutes for conflict checking)
    // In reality, supplemental events will calculate actual drive time with Google Maps
    const estimatedDriveMinutes = 30;

    // Effective start time: arrival time minus estimated drive time
    effectiveStartTime = new Date(
      arrivalInfo.arrivalTime.getTime() - estimatedDriveMinutes * 60000
    );

    // Effective end time: event end time plus estimated return drive time
    effectiveEndTime = new Date(
      event.end_time.getTime() + estimatedDriveMinutes * 60000
    );
  }

  // Find all main events assigned to the target user that overlap with the effective time window
  const eventConflicts = await prisma.event.findMany({
    where: {
      id: { not: eventId }, // Exclude the event itself
      assigned_to_user_id: assignToUserId,
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
  const supplementalConflicts = await prisma.supplementalEvent.findMany({
    where: {
      parent_event: {
        assigned_to_user_id: assignToUserId,
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
