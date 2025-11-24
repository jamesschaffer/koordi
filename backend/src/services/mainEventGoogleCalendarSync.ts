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
      // Fetch the event with all details
      event = await prisma.event.findUnique({
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

    if (existingSync && existingSync.google_event_id) {
      // Update existing event for this user
      try {
        const response = await calendar.events.update({
          calendarId,
          eventId: existingSync.google_event_id,
          requestBody: eventBody,
        });

        console.log(`Updated main event ${eventId} in user ${userId}'s Google Calendar: ${existingSync.google_event_id}`);
        return existingSync.google_event_id;
      } catch (error: any) {
        // Handle Google API errors
        const statusCode = error?.response?.status || 500;
        throw new ExternalAPIError(
          `Failed to update event in Google Calendar: ${getErrorMessage(error)}`,
          'Google Calendar',
          statusCode,
          {
            eventId,
            userId,
            googleEventId: existingSync.google_event_id,
            operation: 'update',
          }
        );
      }
    } else {
      // Create new event for this user
      try {
        const response = await calendar.events.insert({
          calendarId,
          requestBody: eventBody,
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

        console.log(`Synced main event ${eventId} to user ${userId}'s Google Calendar: ${googleEventId}`);
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
  // Check if user has Google Calendar sync enabled
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) {
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
      console.log(`User ${userId} doesn't have main event ${eventId} synced, skipping deletion`);
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
      eventId: existingSync.google_event_id,
    });

    console.log(`Deleted main event ${eventId} from user ${userId}'s Google Calendar`);
  } catch (error) {
    console.error(`Failed to delete main event ${eventId} from user ${userId}'s Google Calendar:`, error);
    // Don't throw - this is a cleanup operation
  }
}
