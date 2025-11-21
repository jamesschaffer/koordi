import ICAL from 'ical.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ICSValidationResult {
  valid: boolean;
  calendarName?: string;
  eventCount?: number;
  dateRange?: {
    earliest: Date;
    latest: Date;
  };
  error?: string;
}

export interface ParsedEvent {
  ics_uid: string;
  title: string;
  description?: string;
  location?: string;
  start_time: Date;
  end_time: Date;
  is_all_day: boolean;
}

/**
 * Fetch ICS feed from URL
 */
export const fetchICSFeed = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Koordi/1.0',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('text/calendar') && !contentType.includes('text/plain')) {
      console.warn(`Unexpected content-type: ${contentType}`);
    }

    return await response.text();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - ICS feed took too long to respond');
    }
    throw new Error(`Failed to fetch ICS feed: ${error.message}`);
  }
};

/**
 * Validate an ICS feed URL
 */
export const validateICSFeed = async (url: string): Promise<ICSValidationResult> => {
  try {
    // Fetch the feed
    const icsData = await fetchICSFeed(url);

    // Parse with ical.js
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);

    // Get calendar name
    const calendarName = String(
      comp.getFirstPropertyValue('x-wr-calname') ||
      comp.getFirstPropertyValue('name') ||
      'Unnamed Calendar'
    );

    // Get all events
    const vevents = comp.getAllSubcomponents('vevent');

    if (vevents.length === 0) {
      return {
        valid: true,
        calendarName,
        eventCount: 0,
        error: 'Calendar contains no events',
      };
    }

    // Find date range
    let earliest: Date | null = null;
    let latest: Date | null = null;

    vevents.forEach((vevent) => {
      const event = new ICAL.Event(vevent);
      const startDate = event.startDate.toJSDate();
      const endDate = event.endDate.toJSDate();

      if (!earliest || startDate < earliest) {
        earliest = startDate;
      }
      if (!latest || endDate > latest) {
        latest = endDate;
      }
    });

    return {
      valid: true,
      calendarName,
      eventCount: vevents.length,
      dateRange: earliest && latest ? { earliest, latest } : undefined,
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || 'Failed to parse ICS feed',
    };
  }
};

/**
 * Parse events from ICS data
 */
export const parseICSEvents = (icsData: string): ParsedEvent[] => {
  const jcalData = ICAL.parse(icsData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  return vevents.map((vevent) => {
    const event = new ICAL.Event(vevent);

    return {
      ics_uid: event.uid,
      title: event.summary || 'Untitled Event',
      description: event.description ? String(event.description) : undefined,
      location: event.location ? String(event.location) : undefined,
      start_time: event.startDate.toJSDate(),
      end_time: event.endDate.toJSDate(),
      is_all_day: event.startDate.isDate, // All-day events don't have time component
    };
  });
};

/**
 * Sync events from ICS feed to database
 */
export const syncEventCalendar = async (calendarId: string): Promise<{
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}> => {
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let deleted = 0;

  try {
    // Get calendar
    const calendar = await prisma.eventCalendar.findUnique({
      where: { id: calendarId },
    });

    if (!calendar) {
      throw new Error('Calendar not found');
    }

    // Fetch and parse ICS feed
    const icsData = await fetchICSFeed(calendar.ics_url);
    const parsedEvents = parseICSEvents(icsData);

    // Get existing events for this calendar
    const existingEvents = await prisma.event.findMany({
      where: { event_calendar_id: calendarId },
    });

    const existingEventsByUID = new Map(
      existingEvents.map((e) => [e.ics_uid, e])
    );

    const parsedEventUIDs = new Set(parsedEvents.map((e) => e.ics_uid));

    // Process each parsed event
    for (const parsedEvent of parsedEvents) {
      try {
        const existing = existingEventsByUID.get(parsedEvent.ics_uid);

        if (existing) {
          // Update existing event
          await prisma.event.update({
            where: { id: existing.id },
            data: {
              title: parsedEvent.title,
              description: parsedEvent.description,
              location: parsedEvent.location,
              start_time: parsedEvent.start_time,
              end_time: parsedEvent.end_time,
              is_all_day: parsedEvent.is_all_day,
              last_modified: new Date(),
            },
          });
          updated++;
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
            },
          });
          created++;
        }
      } catch (error: any) {
        errors.push(`Failed to sync event ${parsedEvent.ics_uid}: ${error.message}`);
      }
    }

    // Delete events that no longer exist in the feed
    for (const existing of existingEvents) {
      if (!parsedEventUIDs.has(existing.ics_uid)) {
        try {
          await prisma.event.delete({
            where: { id: existing.id },
          });
          deleted++;
        } catch (error: any) {
          errors.push(`Failed to delete event ${existing.ics_uid}: ${error.message}`);
        }
      }
    }

    // Update calendar sync status
    await prisma.eventCalendar.update({
      where: { id: calendarId },
      data: {
        last_sync_at: new Date(),
        last_sync_status: errors.length > 0 ? 'error' : 'success',
        last_sync_error: errors.length > 0 ? errors.join('; ') : null,
      },
    });

    return { created, updated, deleted, errors };
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

    throw error;
  }
};
