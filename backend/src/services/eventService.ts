import { PrismaClient } from '@prisma/client';

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

  return prisma.event.findMany({
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
};

/**
 * Get single event details
 */
export const getEventById = async (eventId: string, userId: string) => {
  return prisma.event.findFirst({
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

  // Update assignment
  return prisma.event.update({
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
};
