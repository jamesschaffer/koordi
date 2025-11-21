import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient, isGoogleCalendarSyncEnabled } from '../utils/googleCalendarClient';

const prisma = new PrismaClient();

/**
 * Sync a supplemental event to Google Calendar
 * @param supplementalEventId - The supplemental event ID
 * @param userId - The user who owns the Google Calendar
 * @returns The Google Calendar event ID
 */
export async function syncSupplementalEventToGoogleCalendar(
  supplementalEventId: string,
  userId: string
): Promise<string | null> {
  // Check if user has Google Calendar sync enabled
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) {
    console.log(`Google Calendar sync not enabled for user ${userId}`);
    return null;
  }

  try {
    // Fetch the supplemental event with parent event details
    const supplementalEvent = await prisma.supplementalEvent.findUnique({
      where: { id: supplementalEventId },
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
    });

    if (!supplementalEvent) {
      throw new Error('Supplemental event not found');
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
    let eventBody: any = {
      summary: supplementalEvent.title,
      start: {
        dateTime: supplementalEvent.start_time.toISOString(),
        timeZone: 'America/Los_Angeles', // TODO: Make timezone dynamic based on event location
      },
      end: {
        dateTime: supplementalEvent.end_time.toISOString(),
        timeZone: 'America/Los_Angeles',
      },
      transparency: 'opaque', // Show as busy
    };

    // Customize based on event type
    if (supplementalEvent.type === 'buffer') {
      // Buffer event (early arrival time)
      const bufferMinutes = Math.round(
        (supplementalEvent.end_time.getTime() - supplementalEvent.start_time.getTime()) / 60000
      );
      eventBody.description = `Early arrival buffer for: ${supplementalEvent.parent_event.title}\nChild: ${supplementalEvent.parent_event.event_calendar.child.name}\n\nBuffer time: ${bufferMinutes} minutes\nLocation: ${supplementalEvent.origin_address}`;
      eventBody.location = supplementalEvent.origin_address;
      eventBody.colorId = '5'; // Yellow color for buffer/waiting time
      eventBody.reminders = {
        useDefault: false,
        overrides: [],
      };
    } else {
      // Drive time events (departure/return)
      eventBody.description = `Drive time for: ${supplementalEvent.parent_event.title}\nChild: ${supplementalEvent.parent_event.event_calendar.child.name}\n\nOrigin: ${supplementalEvent.origin_address}\nDestination: ${supplementalEvent.destination_address}\nEstimated drive time: ${supplementalEvent.drive_time_minutes} minutes`;
      eventBody.location = supplementalEvent.type === 'departure'
        ? `From: ${supplementalEvent.origin_address} → ${supplementalEvent.destination_address}`
        : `From: ${supplementalEvent.origin_address} → ${supplementalEvent.destination_address}`;
      eventBody.colorId = '8'; // Gray color for drive time events
      eventBody.reminders = {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 15 }, // Reminder 15 minutes before departure
        ],
      };
    }

    // Create event in Google Calendar
    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
    });

    const googleEventId = response.data.id;

    if (!googleEventId) {
      throw new Error('Failed to get Google Calendar event ID');
    }

    // Update supplemental event with Google Calendar event ID
    await prisma.supplementalEvent.update({
      where: { id: supplementalEventId },
      data: {
        google_event_id: googleEventId,
      },
    });

    console.log(`Synced supplemental event ${supplementalEventId} to Google Calendar: ${googleEventId}`);
    return googleEventId;
  } catch (error) {
    console.error('Failed to sync supplemental event to Google Calendar:', error);
    // Don't throw - supplemental event sync is optional
    return null;
  }
}

/**
 * Delete a supplemental event from Google Calendar
 * @param supplementalEventId - The supplemental event ID
 * @param userId - The user who owns the Google Calendar
 */
export async function deleteSupplementalEventFromGoogleCalendar(
  supplementalEventId: string,
  userId: string
): Promise<void> {
  // Check if user has Google Calendar sync enabled
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) {
    return;
  }

  try {
    // Fetch the supplemental event
    const supplementalEvent = await prisma.supplementalEvent.findUnique({
      where: { id: supplementalEventId },
      select: { google_event_id: true },
    });

    if (!supplementalEvent || !supplementalEvent.google_event_id) {
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
      eventId: supplementalEvent.google_event_id,
    });

    console.log(`Deleted supplemental event ${supplementalEventId} from Google Calendar`);
  } catch (error) {
    console.error('Failed to delete supplemental event from Google Calendar:', error);
    // Don't throw - this is a cleanup operation
  }
}

/**
 * Sync multiple supplemental events to Google Calendar
 * @param supplementalEventIds - Array of supplemental event IDs
 * @param userId - The user who owns the Google Calendar
 */
export async function syncMultipleSupplementalEvents(
  supplementalEventIds: string[],
  userId: string
): Promise<void> {
  for (const eventId of supplementalEventIds) {
    await syncSupplementalEventToGoogleCalendar(eventId, userId);
  }
}

/**
 * Delete multiple supplemental events from Google Calendar
 * Used when an event is reassigned or unassigned
 * @param parentEventId - The parent event ID
 * @param userId - The user who owns the Google Calendar
 */
export async function deleteSupplementalEventsForParent(
  parentEventId: string,
  userId: string
): Promise<void> {
  const supplementalEvents = await prisma.supplementalEvent.findMany({
    where: { parent_event_id: parentEventId },
    select: { id: true },
  });

  for (const event of supplementalEvents) {
    await deleteSupplementalEventFromGoogleCalendar(event.id, userId);
  }
}
