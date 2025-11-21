import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient, isGoogleCalendarSyncEnabled } from '../utils/googleCalendarClient';

const prisma = new PrismaClient();

/**
 * Sync a main event to Google Calendar
 * @param eventId - The event ID
 * @param userId - The user who owns the Google Calendar
 * @returns The Google Calendar event ID
 */
export async function syncMainEventToGoogleCalendar(
  eventId: string,
  userId: string
): Promise<string | null> {
  // Check if user has Google Calendar sync enabled
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) {
    console.log(`Google Calendar sync not enabled for user ${userId}`);
    return null;
  }

  try {
    // Fetch the event with all details
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        event_calendar: {
          include: {
            child: true,
          },
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Get user's Google Calendar ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { google_calendar_id: true },
    });

    const calendarId = user?.google_calendar_id || 'primary';

    // Get Google Calendar client
    const calendar = await getGoogleCalendarClient(userId);

    // Format event for Google Calendar
    const eventBody: any = {
      summary: event.title,
      description: `${event.description || ''}\n\nChild: ${event.event_calendar.child.name}\nCalendar: ${event.event_calendar.name}`,
      location: event.location || undefined,
      colorId: '9', // Blue color for main events
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 }, // Reminder 30 minutes before event
        ],
      },
    };

    // Handle all-day events vs timed events
    if (event.is_all_day) {
      // All-day events use date format (YYYY-MM-DD)
      eventBody.start = {
        date: event.start_time.toISOString().split('T')[0],
      };
      eventBody.end = {
        date: event.end_time.toISOString().split('T')[0],
      };
    } else {
      // Timed events use dateTime format
      eventBody.start = {
        dateTime: event.start_time.toISOString(),
        timeZone: 'America/Los_Angeles', // TODO: Make timezone dynamic
      };
      eventBody.end = {
        dateTime: event.end_time.toISOString(),
        timeZone: 'America/Los_Angeles',
      };
    }

    // Check if event already has a Google Calendar ID (update vs create)
    if (event.google_event_id) {
      // Update existing event
      const response = await calendar.events.update({
        calendarId,
        eventId: event.google_event_id,
        requestBody: eventBody,
      });

      console.log(`Updated main event ${eventId} in Google Calendar: ${event.google_event_id}`);
      return event.google_event_id;
    } else {
      // Create new event
      const response = await calendar.events.insert({
        calendarId,
        requestBody: eventBody,
      });

      const googleEventId = response.data.id;

      if (!googleEventId) {
        throw new Error('Failed to get Google Calendar event ID');
      }

      // Update event with Google Calendar event ID
      await prisma.event.update({
        where: { id: eventId },
        data: {
          google_event_id: googleEventId,
        },
      });

      console.log(`Synced main event ${eventId} to Google Calendar: ${googleEventId}`);
      return googleEventId;
    }
  } catch (error) {
    console.error('Failed to sync main event to Google Calendar:', error);
    // Don't throw - main event sync is optional and shouldn't fail the assignment
    return null;
  }
}

/**
 * Delete a main event from Google Calendar
 * @param eventId - The event ID
 * @param userId - The user who owns the Google Calendar
 */
export async function deleteMainEventFromGoogleCalendar(
  eventId: string,
  userId: string
): Promise<void> {
  // Check if user has Google Calendar sync enabled
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) {
    return;
  }

  try {
    // Fetch the event
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { google_event_id: true },
    });

    if (!event || !event.google_event_id) {
      // Nothing to delete from Google Calendar
      return;
    }

    // Get user's Google Calendar ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { google_calendar_id: true },
    });

    const calendarId = user?.google_calendar_id || 'primary';

    // Get Google Calendar client
    const calendar = await getGoogleCalendarClient(userId);

    // Delete event from Google Calendar
    await calendar.events.delete({
      calendarId,
      eventId: event.google_event_id,
    });

    // Clear the google_event_id from database
    await prisma.event.update({
      where: { id: eventId },
      data: {
        google_event_id: null,
      },
    });

    console.log(`Deleted main event ${eventId} from Google Calendar`);
  } catch (error) {
    console.error('Failed to delete main event from Google Calendar:', error);
    // Don't throw - this is a cleanup operation
  }
}
