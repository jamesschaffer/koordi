import ICAL from 'ical.js';
import dns from 'dns/promises';
import { URL } from 'url';
import { prisma } from '../lib/prisma';
import { deleteMainEventFromGoogleCalendar } from './mainEventGoogleCalendarSync';
import { deleteSupplementalEventsForParent } from './googleCalendarSyncService';

/**
 * SSRF Protection: Validate that a URL is safe to fetch
 * Blocks internal networks, localhost, and cloud metadata endpoints
 */
async function isUrlSafe(urlString: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    const url = new URL(urlString);

    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }

    // Block common internal/private hostnames
    const hostname = url.hostname.toLowerCase();
    const blockedHostnames = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '[::1]',
    ];

    if (blockedHostnames.includes(hostname)) {
      return { safe: false, reason: 'Localhost addresses are not allowed' };
    }

    // Block internal domain patterns
    const blockedPatterns = [
      /\.local$/i,
      /\.internal$/i,
      /\.localhost$/i,
      /\.localdomain$/i,
      /^metadata\.google\.internal$/i,
    ];

    if (blockedPatterns.some(pattern => pattern.test(hostname))) {
      return { safe: false, reason: 'Internal hostnames are not allowed' };
    }

    // Resolve hostname and check if IP is private/internal
    try {
      const addresses = await dns.resolve4(hostname);

      for (const ip of addresses) {
        if (isPrivateIP(ip)) {
          return { safe: false, reason: 'URL resolves to a private IP address' };
        }
      }
    } catch (dnsError: any) {
      // DNS resolution failed - could be invalid hostname
      if (dnsError.code === 'ENOTFOUND') {
        return { safe: false, reason: 'Hostname could not be resolved' };
      }
      // For other DNS errors, allow the fetch to proceed (it will fail anyway)
    }

    return { safe: true };
  } catch (error) {
    return { safe: false, reason: 'Invalid URL format' };
  }
}

/**
 * Check if an IP address is in a private/internal range
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);

  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Invalid IP, treat as private for safety
  }

  const [a, b, c, d] = parts;

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;

  // 10.0.0.0/8 - Private
  if (a === 10) return true;

  // 172.16.0.0/12 - Private
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 - Private
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 - Link-local / Cloud metadata
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 - Current network
  if (a === 0) return true;

  // 100.64.0.0/10 - Shared address space (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 192.0.0.0/24 - IETF Protocol Assignments
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 - TEST-NET-1
  if (a === 192 && b === 0 && c === 2) return true;

  // 198.51.100.0/24 - TEST-NET-2
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 - TEST-NET-3
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 - Multicast
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 - Reserved
  if (a >= 240) return true;

  return false;
}

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
  is_cancelled: boolean;
}

/**
 * Detect if an event is cancelled
 * Checks both standard iCalendar STATUS:CANCELLED and TeamSnap-style [CANCELED] prefix
 * Returns cleaned title/description with the prefix removed
 */
function detectCancellation(vevent: ICAL.Component): {
  isCancelled: boolean;
  cleanTitle: string;
  cleanDescription: string | undefined;
} {
  const event = new ICAL.Event(vevent);
  const summary = event.summary || '';
  const description = event.description ? String(event.description) : undefined;

  // Check STATUS property (standard iCalendar)
  const status = vevent.getFirstPropertyValue('status');
  if (status && status.toString().toLowerCase() === 'cancelled') {
    return {
      isCancelled: true,
      cleanTitle: summary || 'Untitled Event',
      cleanDescription: description,
    };
  }

  // Check for [CANCELED] or [CANCELLED] prefix (TeamSnap-style)
  // Pattern matches: [CANCELED], [CANCELLED], with optional trailing space
  const cancelledPattern = /^\[CANCELL?ED\]\s*/i;

  if (cancelledPattern.test(summary)) {
    const cleanTitle = summary.replace(cancelledPattern, '').trim() || 'Untitled Event';
    const cleanDescription = description?.replace(cancelledPattern, '').trim() || undefined;

    return {
      isCancelled: true,
      cleanTitle,
      cleanDescription,
    };
  }

  return {
    isCancelled: false,
    cleanTitle: summary || 'Untitled Event',
    cleanDescription: description,
  };
}

/**
 * Fetch ICS feed from URL
 * Includes SSRF protection to prevent fetching from internal/private networks
 */
export const fetchICSFeed = async (url: string): Promise<string> => {
  // SSRF Protection: Validate URL before fetching
  const urlCheck = await isUrlSafe(url);
  if (!urlCheck.safe) {
    throw new Error(`URL not allowed: ${urlCheck.reason}`);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Koordi/1.0',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
      // Prevent following redirects to internal URLs
      redirect: 'follow',
    });

    // After redirect, re-validate the final URL
    if (response.url !== url) {
      const redirectCheck = await isUrlSafe(response.url);
      if (!redirectCheck.safe) {
        throw new Error(`Redirect to disallowed URL: ${redirectCheck.reason}`);
      }
    }

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
    const cancellation = detectCancellation(vevent);

    return {
      ics_uid: event.uid,
      title: cancellation.cleanTitle,
      description: cancellation.cleanDescription,
      location: event.location ? String(event.location) : undefined,
      start_time: event.startDate.toJSDate(),
      end_time: event.endDate.toJSDate(),
      is_all_day: event.startDate.isDate, // All-day events don't have time component
      is_cancelled: cancellation.isCancelled,
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
          // Check if event just became cancelled (was not cancelled, now is cancelled)
          const justBecameCancelled = !existing.is_cancelled && parsedEvent.is_cancelled;

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
              is_cancelled: parsedEvent.is_cancelled,
              last_modified: new Date(),
            },
          });
          updated++;

          // If event just became cancelled, unassign and delete from all users' Google Calendars
          if (justBecameCancelled) {
            console.log(`Event ${existing.id} (${parsedEvent.title}) was cancelled - unassigning and removing from Google Calendars`);

            // Unassign the event (clear assignment)
            await prisma.event.update({
              where: { id: existing.id },
              data: {
                assigned_to_user_id: null,
              },
            });

            // Find all users who have this event synced
            const syncRecords = await prisma.userGoogleEventSync.findMany({
              where: {
                event_id: existing.id,
                sync_type: 'main',
              },
            });

            // Delete main event from each user's Google Calendar
            for (const syncRecord of syncRecords) {
              try {
                await deleteMainEventFromGoogleCalendar(existing.id, syncRecord.user_id);
                // Clean up the sync record after successful deletion
                await prisma.userGoogleEventSync.delete({
                  where: { id: syncRecord.id },
                });
              } catch (error) {
                console.error(`Failed to delete cancelled event from user ${syncRecord.user_id}'s Google Calendar:`, error);
              }
            }

            // Delete supplemental events (drive times) from all users
            await deleteSupplementalEventsForParent(existing.id);
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
              is_cancelled: parsedEvent.is_cancelled,
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
