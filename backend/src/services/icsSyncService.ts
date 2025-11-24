import axios from 'axios';
import ical from 'node-ical';
import { syncMainEventToAllMembers } from './multiUserSyncService';
import { prisma } from '../lib/prisma';

interface ParsedEvent {
  ics_uid: string;
  title: string;
  description?: string;
  location?: string;
  start_time: Date;
  end_time: Date;
  is_all_day: boolean;
  last_modified: Date;
}

/**
 * Fetch and parse ICS feed from URL
 */
export const fetchAndParseICS = async (icsUrl: string): Promise<ParsedEvent[]> => {
  try {
    // Fetch ICS data
    const response = await axios.get(icsUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Koordi/1.0',
      },
    });

    // Parse ICS data
    const events = await ical.async.parseICS(response.data);
    const parsedEvents: ParsedEvent[] = [];

    for (const event of Object.values(events)) {
      if (event.type !== 'VEVENT') continue;

      // Extract event data
      const icsUid = event.uid || '';
      const title = event.summary || 'Untitled Event';
      const description = event.description || undefined;
      const location = event.location || undefined;

      // Handle start/end times
      let startTime: Date;
      let endTime: Date;
      let isAllDay = false;

      if (typeof event.start === 'string') {
        startTime = new Date(event.start);
      } else if (event.start instanceof Date) {
        startTime = event.start;
      } else {
        continue; // Skip events without valid start time
      }

      if (typeof event.end === 'string') {
        endTime = new Date(event.end);
      } else if (event.end instanceof Date) {
        endTime = event.end;
      } else {
        // Default to 1 hour duration if no end time
        endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      }

      // Check if all-day event
      if (event.datetype === 'date') {
        isAllDay = true;
      }

      // Get last modified timestamp
      const lastModified = event.lastmodified instanceof Date
        ? event.lastmodified
        : new Date();

      parsedEvents.push({
        ics_uid: icsUid,
        title,
        description,
        location,
        start_time: startTime,
        end_time: endTime,
        is_all_day: isAllDay,
        last_modified: lastModified,
      });
    }

    return parsedEvents;
  } catch (error: any) {
    throw new Error(`Failed to fetch/parse ICS: ${error.message}`);
  }
};

/**
 * Sync a single calendar's events from its ICS feed
 */
export const syncCalendar = async (calendarId: string): Promise<{
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  error?: string;
}> => {
  try {
    // Get calendar
    const calendar = await prisma.eventCalendar.findUnique({
      where: { id: calendarId },
    });

    if (!calendar) {
      throw new Error(`Calendar ${calendarId} not found`);
    }

    if (!calendar.sync_enabled) {
      return {
        success: false,
        eventsAdded: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        error: 'Sync disabled for this calendar',
      };
    }

    // Fetch and parse ICS feed
    const parsedEvents = await fetchAndParseICS(calendar.ics_url);

    // Get existing events for this calendar
    const existingEvents = await prisma.event.findMany({
      where: { event_calendar_id: calendarId },
    });

    const existingEventMap = new Map(
      existingEvents.map((e: any) => [e.ics_uid, e])
    );

    let eventsAdded = 0;
    let eventsUpdated = 0;
    const processedUids = new Set<string>();

    // Process each parsed event
    for (const parsedEvent of parsedEvents) {
      processedUids.add(parsedEvent.ics_uid);
      const existingEvent = existingEventMap.get(parsedEvent.ics_uid);

      if (existingEvent) {
        // Check if event needs updating (compare last_modified)
        const existingLastModified = new Date(existingEvent.last_modified);
        if (parsedEvent.last_modified > existingLastModified) {
          await prisma.event.update({
            where: { id: existingEvent.id },
            data: {
              title: parsedEvent.title,
              description: parsedEvent.description,
              location: parsedEvent.location,
              start_time: parsedEvent.start_time,
              end_time: parsedEvent.end_time,
              is_all_day: parsedEvent.is_all_day,
              last_modified: parsedEvent.last_modified,
            },
          });
          eventsUpdated++;
        }
      } else {
        // Create new event
        await prisma.event.create({
          data: {
            event_calendar_id: calendarId,
            ics_uid: parsedEvent.ics_uid,
            title: parsedEvent.title,
            description: parsedEvent.description,
            location: parsedEvent.location,
            start_time: parsedEvent.start_time,
            end_time: parsedEvent.end_time,
            is_all_day: parsedEvent.is_all_day,
            last_modified: parsedEvent.last_modified,
          },
        });
        eventsAdded++;
      }
    }

    // Delete events that no longer exist in the ICS feed
    const eventsToDelete = existingEvents.filter(
      (e: any) => !processedUids.has(e.ics_uid)
    );

    let eventsDeleted = 0;
    for (const event of eventsToDelete) {
      await prisma.event.delete({
        where: { id: event.id },
      });
      eventsDeleted++;
    }

    // Update calendar sync status
    await prisma.eventCalendar.update({
      where: { id: calendarId },
      data: {
        last_sync_at: new Date(),
        last_sync_status: 'success',
        last_sync_error: null,
      },
    });

    // Sync all events to Google Calendar for all calendar members
    await syncCalendarEventsToMembers(calendarId);

    return {
      success: true,
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
    };
  } catch (error: any) {
    // Update calendar with error status
    await prisma.eventCalendar.update({
      where: { id: calendarId },
      data: {
        last_sync_at: new Date(),
        last_sync_status: 'error',
        last_sync_error: error.message,
      },
    });

    return {
      success: false,
      eventsAdded: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      error: error.message,
    };
  }
};

/**
 * Sync all enabled calendars
 */
export const syncAllCalendars = async (): Promise<{
  totalCalendars: number;
  successCount: number;
  errorCount: number;
  results: Array<{ calendarId: string; success: boolean; error?: string }>;
}> => {
  // Get all calendars with sync enabled
  const calendars = await prisma.eventCalendar.findMany({
    where: { sync_enabled: true },
  });

  let successCount = 0;
  let errorCount = 0;
  const results: Array<{ calendarId: string; success: boolean; error?: string }> = [];

  for (const calendar of calendars) {
    const result = await syncCalendar(calendar.id);

    if (result.success) {
      successCount++;
    } else {
      errorCount++;
    }

    results.push({
      calendarId: calendar.id,
      success: result.success,
      error: result.error,
    });
  }

  return {
    totalCalendars: calendars.length,
    successCount,
    errorCount,
    results,
  };
};

/**
 * Sync all events from a calendar to all members' Google Calendars
 * Used when: new calendar created, ICS sync completes, or new member accepts invitation
 */
export async function syncCalendarEventsToMembers(calendarId: string): Promise<void> {
  console.log(`[syncCalendarEventsToMembers] Starting sync for calendar ${calendarId}`);

  // Get all events for this calendar
  const events = await prisma.event.findMany({
    where: { event_calendar_id: calendarId },
    select: { id: true, title: true },
  });

  console.log(`[syncCalendarEventsToMembers] Found ${events.length} events to sync`);

  // Sync each event to all members using the multiUserSyncService
  // This properly uses the UserGoogleEventSync tracking table
  for (const event of events) {
    try {
      await syncMainEventToAllMembers(event.id);
      console.log(`[syncCalendarEventsToMembers] Synced event "${event.title}" to all members`);
    } catch (error: any) {
      console.error(`[syncCalendarEventsToMembers] Failed to sync event "${event.title}":`, error.message);
    }
  }

  console.log(`[syncCalendarEventsToMembers] Completed sync for calendar ${calendarId}`);
}
