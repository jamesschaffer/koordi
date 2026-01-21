import axios from 'axios';
import ical from 'node-ical';
import { syncMainEventToAllMembers, deleteMainEventFromAllMembers, deleteSupplementalEventsFromAllMembers } from './multiUserSyncService';
import { prisma } from '../lib/prisma';
import { getStartOfTodayInTimezone, DEFAULT_TIMEZONE } from '../utils/dateUtils';

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
      // 1. Standard ICS: VALUE=DATE (datetype === 'date')
      // 2. TeamSnap TBD pattern: exactly 24-hour duration (midnight-to-midnight in source timezone)
      //    Note: node-ical converts times to UTC, so we can't check for midnight directly.
      //    Instead, we check for exactly 24-hour duration which is the reliable indicator.
      if (event.datetype === 'date') {
        isAllDay = true;
      } else {
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);

        // Exactly 24 hours indicates an all-day/TBD event
        if (durationHours === 24) {
          isAllDay = true;
        }
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
    // Get calendar with owner's timezone
    const calendar = await prisma.eventCalendar.findUnique({
      where: { id: calendarId },
      include: {
        owner: {
          select: { timezone: true },
        },
      },
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

    // Set sync_in_progress flag to prevent deletion during sync
    await prisma.eventCalendar.update({
      where: { id: calendarId },
      data: { sync_in_progress: true },
    });

    // Get owner's timezone for filtering past events
    const ownerTimezone = calendar.owner?.timezone || DEFAULT_TIMEZONE;
    const todayStart = getStartOfTodayInTimezone(ownerTimezone);

    // Fetch and parse ICS feed
    const allParsedEvents = await fetchAndParseICS(calendar.ics_url);

    // Filter to only events starting today or later (in owner's timezone)
    // Past events are excluded to speed up calendar import and reduce clutter
    const parsedEvents = allParsedEvents.filter(event => event.start_time >= todayStart);
    const skippedPastEvents = allParsedEvents.length - parsedEvents.length;

    if (skippedPastEvents > 0) {
      console.log(`[icsSyncService] Skipped ${skippedPastEvents} past events for calendar ${calendarId} (cutoff: ${todayStart.toISOString()} in ${ownerTimezone})`);
    }

    // Get existing events for this calendar
    const existingEvents = await prisma.event.findMany({
      where: { event_calendar_id: calendarId },
    });

    const existingEventMap = new Map(
      existingEvents.map((e: any) => [e.ics_uid, e])
    );

    let eventsAdded = 0;
    let eventsUpdated = 0;

    // Track all UIDs from the ICS feed (including past events) to prevent
    // incorrect deletion of events that still exist but were filtered out
    const allIcsUids = new Set<string>(allParsedEvents.map(e => e.ics_uid));

    // Process each parsed event (only future events)
    for (const parsedEvent of parsedEvents) {
      const existingEvent = existingEventMap.get(parsedEvent.ics_uid);

      if (existingEvent) {
        // Check if event needs updating by comparing actual event data
        // We don't rely solely on last_modified because many ICS providers
        // (including TeamSnap) don't update LASTMODIFIED when event times change
        const dbStartTime = new Date(existingEvent.start_time).getTime();
        const dbEndTime = new Date(existingEvent.end_time).getTime();
        const icsStartTime = parsedEvent.start_time.getTime();
        const icsEndTime = parsedEvent.end_time.getTime();

        const titleChanged = existingEvent.title !== parsedEvent.title;
        const descChanged = (existingEvent.description || null) !== (parsedEvent.description || null);
        const locChanged = (existingEvent.location || null) !== (parsedEvent.location || null);
        const startChanged = dbStartTime !== icsStartTime;
        const endChanged = dbEndTime !== icsEndTime;
        const allDayChanged = existingEvent.is_all_day !== parsedEvent.is_all_day;

        const hasChanges = titleChanged || descChanged || locChanged || startChanged || endChanged || allDayChanged;

        // Debug logging for time comparisons
        if (parsedEvent.title.toLowerCase().includes('practice')) {
          console.log(`[icsSyncService] DEBUG: Comparing "${parsedEvent.title}"`);
          console.log(`  DB start:  ${existingEvent.start_time} (${dbStartTime})`);
          console.log(`  ICS start: ${parsedEvent.start_time} (${icsStartTime})`);
          console.log(`  DB end:    ${existingEvent.end_time} (${dbEndTime})`);
          console.log(`  ICS end:   ${parsedEvent.end_time} (${icsEndTime})`);
          console.log(`  Changes: title=${titleChanged}, desc=${descChanged}, loc=${locChanged}, start=${startChanged}, end=${endChanged}, allDay=${allDayChanged}`);
          console.log(`  hasChanges=${hasChanges}`);
        }

        if (hasChanges) {
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
    // Note: We check against allIcsUids (all events including past) to ensure
    // we only delete events actually removed from the ICS source, not just filtered out
    const eventsToDelete = existingEvents.filter(
      (e: any) => !allIcsUids.has(e.ics_uid)
    );

    let eventsDeleted = 0;
    for (const event of eventsToDelete) {
      console.log(`[icsSyncService] Deleting event "${event.title}" (${event.id}) - no longer in ICS feed`);

      // CRITICAL: Delete from Google Calendar BEFORE deleting from database
      // This ensures the sync records still exist so we know which Google events to delete
      try {
        // Delete supplemental events first (assignments like snacks, etc.)
        await deleteSupplementalEventsFromAllMembers(event.id);
        // Then delete main event from all members' Google Calendars
        await deleteMainEventFromAllMembers(event.id);
        console.log(`[icsSyncService] ✅ Deleted event from Google Calendar for all members`);
      } catch (gcError: any) {
        // Log but don't fail the sync - Google Calendar deletion is best-effort
        console.error(`[icsSyncService] ⚠️ Failed to delete from Google Calendar:`, gcError.message);
      }

      // Now delete from Koordie database (this will cascade delete sync records)
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
        sync_in_progress: false,
      },
    });

    // Only sync to Google Calendar if there were actual changes
    // This dramatically speeds up sync when ICS feed hasn't changed
    if (eventsAdded > 0 || eventsUpdated > 0 || eventsDeleted > 0) {
      console.log(`[icsSyncService] Changes detected (+${eventsAdded} ~${eventsUpdated} -${eventsDeleted}), syncing to Google Calendar...`);
      await syncCalendarEventsToMembers(calendarId);
    } else {
      console.log(`[icsSyncService] No changes detected, skipping Google Calendar sync`);
    }

    return {
      success: true,
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
    };
  } catch (error: any) {
    // Update calendar with error status and clear sync_in_progress flag
    await prisma.eventCalendar.update({
      where: { id: calendarId },
      data: {
        sync_in_progress: false,
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
 * Sync all enabled calendars (system-wide, used for scheduled jobs)
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
 * Sync all calendars that a user has access to (owned or member of)
 * Used for on-login/on-demand sync
 */
export const syncUserCalendars = async (userId: string): Promise<{
  totalCalendars: number;
  successCount: number;
  errorCount: number;
  results: Array<{ calendarId: string; calendarName: string; success: boolean; error?: string }>;
}> => {
  // Get all calendars the user owns or is a member of
  const calendars = await prisma.eventCalendar.findMany({
    where: {
      sync_enabled: true,
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
    select: {
      id: true,
      name: true,
    },
  });

  let successCount = 0;
  let errorCount = 0;
  const results: Array<{ calendarId: string; calendarName: string; success: boolean; error?: string }> = [];

  console.log(`[syncUserCalendars] Syncing ${calendars.length} calendars for user ${userId}`);

  for (const calendar of calendars) {
    const result = await syncCalendar(calendar.id);

    if (result.success) {
      successCount++;
      console.log(`[syncUserCalendars] ✅ Synced "${calendar.name}": +${result.eventsAdded} -${result.eventsDeleted} ~${result.eventsUpdated}`);
    } else {
      errorCount++;
      console.log(`[syncUserCalendars] ❌ Failed to sync "${calendar.name}": ${result.error}`);
    }

    results.push({
      calendarId: calendar.id,
      calendarName: calendar.name,
      success: result.success,
      error: result.error,
    });
  }

  console.log(`[syncUserCalendars] Completed: ${successCount}/${calendars.length} successful`);

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
