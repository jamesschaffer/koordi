import { getGoogleCalendarClient, isGoogleCalendarSyncEnabled } from '../utils/googleCalendarClient';
import { prisma } from '../lib/prisma';
import {
  NotFoundError,
  ExternalAPIError,
  getErrorMessage,
  formatErrorForLogging,
} from '../utils/errors';

/**
 * Context for batch-optimized supplemental event sync operations
 */
export interface SupplementalSyncContext {
  supplementalEvent?: any; // Supplemental event with parent_event.event_calendar.child included
  user?: any; // User with google_calendar_id, google_calendar_sync_enabled, google_refresh_token_enc
  existingSync?: any; // UserGoogleEventSync record
}

/**
 * Sync a supplemental event to Google Calendar
 * @param supplementalEventId - The supplemental event ID
 * @param userId - The user who owns the Google Calendar
 * @param context - Optional pre-fetched data to eliminate N+1 queries
 * @returns The Google Calendar event ID
 */
export async function syncSupplementalEventToGoogleCalendar(
  supplementalEventId: string,
  userId: string,
  context?: SupplementalSyncContext
): Promise<string | null> {
  try {
    // Use context data if provided, otherwise fetch (backward compatibility)
    let supplementalEvent = context?.supplementalEvent;
    let user = context?.user;
    let existingSync = context?.existingSync;

    if (!supplementalEvent) {
      // Fetch the supplemental event with parent event details
      supplementalEvent = await prisma.supplementalEvent.findUnique({
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
        throw new NotFoundError('SupplementalEvent', supplementalEventId);
      }
    }

    if (!user) {
      // Check if user has Google Calendar sync enabled
      const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
      if (!syncEnabled) {
        console.log(`Google Calendar sync not enabled for user ${userId}`);
        return null;
      }

      // Get user's Google Calendar ID
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: { google_calendar_id: true },
      });
    }

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

    // Check if THIS USER already has this supplemental event synced (use context if provided)
    if (!existingSync) {
      existingSync = await prisma.userGoogleEventSync.findUnique({
        where: {
          user_id_supplemental_event_id: {
            user_id: userId,
            supplemental_event_id: supplementalEventId,
          },
        },
      });
    }

    console.log(`[syncSupplementalEventToGoogleCalendar] Supplemental Event ${supplementalEventId}, User ${userId}`);
    console.log(`  Existing sync record:`, existingSync ? {
      id: existingSync.id,
      google_event_id: existingSync.google_event_id,
      sync_type: existingSync.sync_type,
    } : 'NONE');

    let googleEventId: string | null = null;

    if (existingSync && existingSync.google_event_id) {
      // CRITICAL: Verify the Google Calendar event still exists before trying to update
      console.log(`  Attempting to UPDATE existing Google Calendar event: ${existingSync.google_event_id}`);

      try {
        // First, try to GET the event to see if it exists
        await calendar.events.get({
          calendarId,
          eventId: existingSync.google_event_id,
        });
        console.log(`  ✅ Google Calendar event EXISTS, proceeding with UPDATE`);

        // Update existing event for this user
        const response = await calendar.events.update({
          calendarId,
          eventId: existingSync.google_event_id,
          requestBody: eventBody,
        });

        googleEventId = existingSync.google_event_id;
        console.log(`  ✅ Updated supplemental event ${supplementalEventId} in user ${userId}'s Google Calendar: ${googleEventId}`);
        return googleEventId;
      } catch (getError: any) {
        if (getError?.response?.status === 404) {
          console.warn(`  ⚠️  STALE SYNC RECORD: Google Calendar event ${existingSync.google_event_id} does NOT exist (404)`);
          console.warn(`  This happens when user was removed and re-added`);
          console.warn(`  Deleting stale sync record and will CREATE new event instead`);

          // Delete the stale sync record
          await prisma.userGoogleEventSync.delete({
            where: { id: existingSync.id },
          });

          // Set to null so we fall through to CREATE logic below
          existingSync = null;
        } else {
          throw getError;
        }
      }
    }

    // CREATE new event (either no sync record existed, or we deleted a stale one above)
    if (!existingSync) {
      console.log(`  Creating NEW Google Calendar supplemental event`);

      // ⭐ IDEMPOTENCY CHECK: Before creating, verify event doesn't already exist
      // This prevents duplicates from race conditions where multiple requests
      // check for existing sync before any have completed
      try {
        console.log(`  Checking for existing Google Calendar event with supplementalId=${supplementalEventId}`);
        const existingEvents = await calendar.events.list({
          calendarId,
          privateExtendedProperty: `supplementalId=${supplementalEventId}`,
          maxResults: 1,
        });

        if (existingEvents.data.items && existingEvents.data.items.length > 0) {
          const existingGoogleEvent = existingEvents.data.items[0];
          console.log(`  ⚠️  IDEMPOTENCY: Supplemental event already exists in Google Calendar`);
          console.log(`  Using existing Google Event ID: ${existingGoogleEvent.id}`);
          console.log(`  This likely indicates a race condition was prevented`);
          return existingGoogleEvent.id!;
        }
        console.log(`  No existing event found, proceeding with creation`);
      } catch (listError: any) {
        console.warn(`  Failed to check for existing Google Calendar event:`, listError.message);
        // Continue with creation if check fails - don't block on this safety check
      }

      // Create new event for this user
      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          ...eventBody,
          // Add supplemental event ID as private extended property for future idempotency checks
          extendedProperties: {
            private: {
              supplementalId: supplementalEventId,
            },
          },
        },
      });

      googleEventId = response.data.id!;

      if (!googleEventId) {
        throw new Error('Failed to get Google Calendar event ID');
      }

      // Create UserGoogleEventSync record for this user
      await prisma.userGoogleEventSync.upsert({
        where: {
          user_id_supplemental_event_id: {
            user_id: userId,
            supplemental_event_id: supplementalEventId,
          },
        },
        create: {
          user_id: userId,
          supplemental_event_id: supplementalEventId,
          google_event_id: googleEventId,
          sync_type: 'supplemental',
        },
        update: {
          google_event_id: googleEventId,
        },
      });

      console.log(`  ✅ CREATED supplemental event ${supplementalEventId} in user ${userId}'s Google Calendar: ${googleEventId}`);
      return googleEventId;
    }

    // Should never reach here, but TypeScript needs this
    return null;
  } catch (error) {
    console.error(
      'Failed to sync supplemental event to Google Calendar:',
      formatErrorForLogging(error as Error)
    );
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
  console.log(`    [deleteSupplementalEventFromGoogleCalendar] Starting deletion for supplemental event ${supplementalEventId}, user ${userId}`);

  // Check if user has Google Calendar sync enabled
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) {
    console.log(`    [deleteSupplementalEventFromGoogleCalendar] Google Calendar sync not enabled for user ${userId}, skipping`);
    return;
  }

  try {
    // Check if THIS USER has this supplemental event synced
    const existingSync = await prisma.userGoogleEventSync.findUnique({
      where: {
        user_id_supplemental_event_id: {
          user_id: userId,
          supplemental_event_id: supplementalEventId,
        },
      },
    });

    if (!existingSync || !existingSync.google_event_id) {
      // This user doesn't have this event synced, nothing to delete
      console.log(`    [deleteSupplementalEventFromGoogleCalendar] ⚠️  No sync record found for supplemental event ${supplementalEventId}, user ${userId}`);
      console.log(`    [deleteSupplementalEventFromGoogleCalendar] This means the event was never synced or already deleted`);
      return;
    }

    console.log(`    [deleteSupplementalEventFromGoogleCalendar] Found sync record with Google Event ID: ${existingSync.google_event_id}`);

    // Get user's Google Calendar ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        google_calendar_id: true,
        email: true,
      },
    });

    const calendarId = user?.google_calendar_id || 'primary';
    console.log(`    [deleteSupplementalEventFromGoogleCalendar] Deleting from calendar: ${calendarId} (user: ${user?.email})`);

    // Get Google Calendar client
    const calendar = await getGoogleCalendarClient(userId);

    // Delete event from Google Calendar
    console.log(`    [deleteSupplementalEventFromGoogleCalendar] Calling Google Calendar API to delete event...`);
    await calendar.events.delete({
      calendarId,
      eventId: existingSync.google_event_id,
    });

    console.log(`    [deleteSupplementalEventFromGoogleCalendar] ✅ Successfully deleted event from Google Calendar API`);

    // Clean up the UserGoogleEventSync tracking record
    await prisma.userGoogleEventSync.delete({
      where: {
        user_id_supplemental_event_id: {
          user_id: userId,
          supplemental_event_id: supplementalEventId,
        },
      },
    });

    console.log(`    [deleteSupplementalEventFromGoogleCalendar] ✅ Deleted sync record from database`);
  } catch (error: any) {
    console.error(`    [deleteSupplementalEventFromGoogleCalendar] ❌ ERROR during deletion:`);
    console.error(`    Error message: ${error.message}`);
    console.error(`    Error code: ${error.code}`);
    console.error(`    Full error:`, error);
    // Don't throw - this is a cleanup operation, but we've logged the error
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
 * Delete multiple supplemental events from ALL users' Google Calendars
 * Used when an event is reassigned or unassigned
 * Deletes from all users who have these events synced (assigned user + opt-in members)
 * @param parentEventId - The parent event ID
 * @param types - Optional array of event types to delete. If not provided, deletes all types.
 */
export async function deleteSupplementalEventsForParent(
  parentEventId: string,
  userId?: string,
  types?: Array<'departure' | 'buffer' | 'return'>
): Promise<void> {
  const whereClause: any = { parent_event_id: parentEventId };

  if (types && types.length > 0) {
    whereClause.type = { in: types };
  }

  const supplementalEvents = await prisma.supplementalEvent.findMany({
    where: whereClause,
    select: { id: true },
  });

  // For each supplemental event, find ALL users who have it synced
  for (const event of supplementalEvents) {
    // Find all UserGoogleEventSync records for this supplemental event
    const syncRecords = await prisma.userGoogleEventSync.findMany({
      where: {
        supplemental_event_id: event.id,
        sync_type: 'supplemental',
      },
    });

    console.log(`Deleting supplemental event ${event.id} from ${syncRecords.length} users' Google Calendars`);

    // Delete from each user's Google Calendar
    for (const syncRecord of syncRecords) {
      try {
        await deleteSupplementalEventFromGoogleCalendar(event.id, syncRecord.user_id);
      } catch (error) {
        console.error(`Failed to delete supplemental event ${event.id} from user ${syncRecord.user_id}:`, error);
        // Continue with other deletions even if one fails
      }
    }
  }
}
