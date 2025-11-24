import { deleteMainEventFromAllMembers } from './multiUserSyncService';
import { prisma } from '../lib/prisma';

export interface CreateEventCalendarData {
  name: string;
  ics_url: string;
  owner_id: string;
  child_id: string;
  color?: string;
}

export interface UpdateEventCalendarData {
  name?: string;
  ics_url?: string;
  color?: string;
  sync_enabled?: boolean;
}

// Get all event calendars for a user
export const getUserEventCalendars = async (userId: string) => {
  return prisma.eventCalendar.findMany({
    where: {
      members: {
        some: {
          user_id: userId,
          status: 'accepted',
        },
      },
    },
    include: {
      child: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar_url: true,
        },
      },
      members: {
        // Include all members (accepted and pending) for display
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
      _count: {
        select: {
          members: {
            where: {
              status: 'pending',
            },
          },
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};

// Get single event calendar
export const getEventCalendarById = async (calendarId: string, userId: string) => {
  return prisma.eventCalendar.findFirst({
    where: {
      id: calendarId,
      members: {
        some: {
          user_id: userId,
          status: 'accepted',
        },
      },
    },
    include: {
      child: true,
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
        },
      },
    },
  });
};

// Create event calendar
export const createEventCalendar = async (data: CreateEventCalendarData) => {
  // Get owner's email for membership
  const owner = await prisma.user.findUnique({
    where: { id: data.owner_id },
    select: { email: true },
  });

  if (!owner) {
    throw new Error('Owner not found');
  }

  return prisma.eventCalendar.create({
    data: {
      name: data.name,
      ics_url: data.ics_url,
      color: data.color || '#3B82F6',
      owner_id: data.owner_id,
      child_id: data.child_id,
      sync_enabled: true,
      members: {
        create: {
          user_id: data.owner_id,
          invited_email: owner.email,
          invitation_token: `owner-${data.owner_id}-${Date.now()}`, // Auto-generated token for owner
          status: 'accepted',
          invited_by_user_id: data.owner_id,
          responded_at: new Date(),
        },
      },
    },
    include: {
      child: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
};

// Update event calendar
export const updateEventCalendar = async (
  calendarId: string,
  userId: string,
  data: UpdateEventCalendarData,
) => {
  // Verify user is owner
  const calendar = await prisma.eventCalendar.findFirst({
    where: {
      id: calendarId,
      owner_id: userId,
    },
  });

  if (!calendar) {
    throw new Error('Calendar not found or user is not the owner');
  }

  return prisma.eventCalendar.update({
    where: { id: calendarId },
    data,
    include: {
      child: true,
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
};

// Delete event calendar
export const deleteEventCalendar = async (calendarId: string, userId: string) => {
  // Verify user is owner
  const calendar = await prisma.eventCalendar.findFirst({
    where: {
      id: calendarId,
      owner_id: userId,
    },
  });

  if (!calendar) {
    throw new Error('Calendar not found or user is not the owner');
  }

  console.log(`[deleteEventCalendar] Deleting calendar ${calendarId} and cleaning up Google Calendar events`);

  // Get all events for this calendar
  const events = await prisma.event.findMany({
    where: { event_calendar_id: calendarId },
    select: { id: true, title: true },
  });

  console.log(`[deleteEventCalendar] Found ${events.length} events to clean up`);

  // Delete all events from all members' Google Calendars using the tracking system
  for (const event of events) {
    try {
      await deleteMainEventFromAllMembers(event.id);
      console.log(`[deleteEventCalendar] Deleted event "${event.title}" from all users' Google Calendars`);
    } catch (error: any) {
      console.error(`[deleteEventCalendar] Failed to delete event "${event.title}":`, error.message);
    }
  }

  // Delete the calendar (cascade will delete events, memberships, etc.)
  const result = await prisma.eventCalendar.delete({
    where: { id: calendarId },
  });

  console.log(`[deleteEventCalendar] Calendar ${calendarId} deleted successfully`);

  return result;
};
