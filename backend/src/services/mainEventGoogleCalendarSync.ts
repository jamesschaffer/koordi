import { getGoogleCalendarClient, isGoogleCalendarSyncEnabled } from '../utils/googleCalendarClient';
import { prisma } from '../lib/prisma';
import {
  NotFoundError,
  ExternalAPIError,
  getErrorMessage,
  formatErrorForLogging,
} from '../utils/errors';

/**
 * Context for batch-optimized sync operations
 * Passing this context eliminates redundant database queries
 */
export interface SyncContext {
  event?: any; // Event with event_calendar.child included
  user?: any; // User with google_calendar_id, google_calendar_sync_enabled, google_refresh_token_enc
  existingSync?: any; // UserGoogleEventSync record
}

/**
 * Sync a main event to Google Calendar
 * @param eventId - The event ID
 * @param userId - The user who owns the Google Calendar
 * @param context - Optional pre-fetched data to eliminate N+1 queries
 * @returns The Google Calendar event ID
 */
export async function syncMainEventToGoogleCalendar(
  eventId: string,
  userId: string,
  context?: SyncContext
): Promise<string | null> {
  try {
    // Use context data if provided, otherwise fetch (backward compatibility)
    let event = context?.event;
    let user = context?.user;
    let existingSync = context?.existingSync;

    if (!event) {
      // Fetch the event with all details including assigned user
      event = await prisma.event.findUnique({
        where: { id: eventId },
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
            },
          },
        },
      });

      if (!event) {
        throw new NotFoundError('Event', eventId);
      }
    }

    if (!user) {
      // Fetch user data if not provided in context (backward compatibility)
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          google_calendar_id: true,
          google_calendar_sync_enabled: true,
          google_refresh_token_enc: true,
        },
      });

      // Check if sync is enabled
      if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
        console.log(`Google Calendar sync not enabled for user ${userId}`);
        return null;
      }
    }

    const calendarId = user?.google_calendar_id || 'primary';

    // Get Google Calendar client (may throw ConfigurationError or AuthenticationError)
    const calendar = await getGoogleCalendarClient(userId);

    // Build dynamic title based on assignment status
    let eventTitle: string;
    let assignmentLine: string;

    console.log(`[syncMainEventToGoogleCalendar] Building title for event ${eventId}`);
    console.log(`  assigned_to:`, event.assigned_to);

    if (event.assigned_to && event.assigned_to.name) {
      const firstName = event.assigned_to.name.split(' ')[0];
      eventTitle = `${firstName} handling - ${event.title}`;
      assignmentLine = `${firstName} is handling this event`;
    } else {
      eventTitle = `❓ Unassigned - ${event.title}`;
      assignmentLine = `This event is unassigned`;
    }

    console.log(`  Final eventTitle: "${eventTitle}"`);

    // Build description with assignment info and Koordie link
    const koordieLine = `Update event assignment in Koordie: https://app.koordie.com`;
    const originalDescription = event.description || '';
    const eventDescription = `${assignmentLine}\n${koordieLine}\n\n${originalDescription}\n\nChild: ${event.event_calendar.child.name}\nCalendar: ${event.event_calendar.name}`;

    // Format event for Google Calendar
    const eventBody: any = {
      summary: eventTitle,
      description: eventDescription,
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

    // Check if THIS USER already has this event synced (use context if provided)
    if (!existingSync) {
      existingSync = await prisma.userGoogleEventSync.findUnique({
        where: {
          user_id_event_id: {
            user_id: userId,
            event_id: eventId,
          },
        },
      });
    }

    console.log(`[syncMainEventToGoogleCalendar] Event ${eventId}, User ${userId}`);
    console.log(`  Existing sync record:`, existingSync ? {
      id: existingSync.id,
      google_event_id: existingSync.google_event_id,
      sync_type: existingSync.sync_type,
    } : 'NONE');

    if (existingSync && existingSync.google_event_id) {
      // CRITICAL: Verify the Google Calendar event still exists before trying to update
      console.log(`  Attempting to UPDATE existing Google Calendar event: ${existingSync.google_event_id}`);

      try {
        // First, try to GET the event to see if it exists
        try {
          await calendar.events.get({
            calendarId,
            eventId: existingSync.google_event_id,
          });
          console.log(`  ✅ Google Calendar event EXISTS, proceeding with UPDATE`);
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

        // If we still have existingSync, the event exists and we can update it
        if (existingSync) {
          const response = await calendar.events.update({
            calendarId,
            eventId: existingSync.google_event_id,
            requestBody: eventBody,
          });

          console.log(`  ✅ Updated main event ${eventId} in user ${userId}'s Google Calendar: ${existingSync.google_event_id}`);
          return existingSync.google_event_id;
        }
      } catch (error: any) {
        // Handle Google API errors
        const statusCode = error?.response?.status || 500;
        console.error(`  ❌ Failed to update Google Calendar event:`, error.message);
        throw new ExternalAPIError(
          `Failed to update event in Google Calendar: ${getErrorMessage(error)}`,
          'Google Calendar',
          statusCode,
          {
            eventId,
            userId,
            googleEventId: existingSync?.google_event_id,
            operation: 'update',
          }
        );
      }
    }

    // CREATE new event (either no sync record existed, or we deleted a stale one above)
    if (!existingSync) {
      console.log(`  Creating NEW Google Calendar event`);

      // ⭐ IDEMPOTENCY CHECK: Before creating, verify event doesn't already exist
      // This prevents duplicates from race conditions where multiple requests
      // check for existing sync before any have completed
      try {
        console.log(`  Checking for existing Google Calendar event with icsUid=${event.ics_uid}`);
        const existingEvents = await calendar.events.list({
          calendarId,
          privateExtendedProperty: [`icsUid=${event.ics_uid}`],
          maxResults: 1,
        });

        if (existingEvents.data.items && existingEvents.data.items.length > 0) {
          const existingGoogleEvent = existingEvents.data.items[0];
          console.log(`  ⚠️  IDEMPOTENCY: Event already exists in Google Calendar`);
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
      try {
        const response = await calendar.events.insert({
          calendarId,
          requestBody: {
            ...eventBody,
            // Add ICS UID as private extended property for future idempotency checks
            extendedProperties: {
              private: {
                icsUid: event.ics_uid,
              },
            },
          },
        });

        const googleEventId = response.data.id;

        if (!googleEventId) {
          throw new ExternalAPIError(
            'Google Calendar API did not return an event ID',
            'Google Calendar',
            500,
            { eventId, userId, operation: 'insert' }
          );
        }

        console.log(`  ✅ CREATED main event ${eventId} in user ${userId}'s Google Calendar: ${googleEventId}`);
        return googleEventId;
      } catch (error: any) {
        // Re-throw our custom errors
        if (error instanceof ExternalAPIError) {
          throw error;
        }

        // Handle Google API errors
        const statusCode = error?.response?.status || 500;
        throw new ExternalAPIError(
          `Failed to create event in Google Calendar: ${getErrorMessage(error)}`,
          'Google Calendar',
          statusCode,
          {
            eventId,
            userId,
            operation: 'insert',
          }
        );
      }
    }

    // Should never reach here, but TypeScript needs this
    return null;
  } catch (error) {
    // Log the error with context
    console.error('Failed to sync main event to Google Calendar:', formatErrorForLogging(error as Error));

    // Don't throw - main event sync is optional and shouldn't fail the assignment
    // But log detailed information for debugging
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
  console.log(`    [deleteMainEventFromGoogleCalendar] Starting deletion for event ${eventId}, user ${userId}`);

  // Check if user has Google Calendar sync enabled
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) {
    console.log(`    [deleteMainEventFromGoogleCalendar] Google Calendar sync not enabled for user ${userId}, skipping`);
    return;
  }

  try {
    // Check if THIS USER has this event synced
    const existingSync = await prisma.userGoogleEventSync.findUnique({
      where: {
        user_id_event_id: {
          user_id: userId,
          event_id: eventId,
        },
      },
    });

    if (!existingSync || !existingSync.google_event_id) {
      // This user doesn't have this event synced, nothing to delete
      console.log(`    [deleteMainEventFromGoogleCalendar] ⚠️  No sync record found for event ${eventId}, user ${userId}`);
      console.log(`    [deleteMainEventFromGoogleCalendar] This means the event was never synced or already deleted`);
      return;
    }

    console.log(`    [deleteMainEventFromGoogleCalendar] Found sync record with Google Event ID: ${existingSync.google_event_id}`);

    // Get user's Google Calendar ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        google_calendar_id: true,
        email: true,
      },
    });

    const calendarId = user?.google_calendar_id || 'primary';
    console.log(`    [deleteMainEventFromGoogleCalendar] Deleting from calendar: ${calendarId} (user: ${user?.email})`);

    // Get Google Calendar client
    const calendar = await getGoogleCalendarClient(userId);

    // Delete event from Google Calendar
    console.log(`    [deleteMainEventFromGoogleCalendar] Calling Google Calendar API to delete event...`);
    await calendar.events.delete({
      calendarId,
      eventId: existingSync.google_event_id,
    });

    console.log(`    [deleteMainEventFromGoogleCalendar] ✅ Successfully deleted event from Google Calendar API`);
  } catch (error: any) {
    console.error(`    [deleteMainEventFromGoogleCalendar] ❌ ERROR during deletion:`);
    console.error(`    Error message: ${error.message}`);
    console.error(`    Error code: ${error.code}`);
    console.error(`    Full error:`, error);
    // Don't throw - this is a cleanup operation, but we've logged the error
  }
}
