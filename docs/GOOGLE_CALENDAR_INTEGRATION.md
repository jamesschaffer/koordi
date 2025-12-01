# Google Calendar API Integration
## Koordi

**Purpose:** Complete specification for Google Calendar API integration
**API Version:** Google Calendar API v3
**Use Cases:** Sync events to all calendar members' personal Google Calendars (one-way sync)

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Calendar Operations](#calendar-operations)
4. [Event CRUD Operations](#event-crud-operations)
5. [Watch API (Push Notifications)](#watch-api-push-notifications)
6. [Sync Strategy](#sync-strategy)
7. [Error Handling](#error-handling)
8. [Quota Management](#quota-management)
9. [Testing](#testing)

---

## OVERVIEW

### Google Calendar Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│ ICS Sync runs (every 5 minutes)                             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ For each event:       │
     │ Sync to ALL members   │
     └───────────┬───────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Create/Update event   │
     │ in each member's      │
     │ Google Calendar       │
     └───────────┬───────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Store google_event_id │
     │ in UserGoogleEventSync│
     │ (per-user tracking)   │
     └───────────┬───────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Sync Supplemental     │
     │ Events (Drive Times)  │
     │ to assigned user +    │
     │ opt-in members        │
     └───────────────────────┘
```

### Sync Behavior

| Action | Google Calendar Sync |
|--------|---------------------|
| **ICS sync runs** | Create/update main events in ALL calendar members' Google Calendars |
| **Event assigned to user** | Update title to "[Name] handling - [Title]", create supplemental events for assignee |
| **Event reassigned** | Update title, delete supplemental events from previous assignee, create for new assignee |
| **Event unassigned** | Update title to "❓ Unassigned - [Title]", delete supplemental events |
| **Event marked "Not Attending"** | Update title to "🚫 Not Attending - [Title]", delete supplemental events |
| **ICS feed event updated** | Update events in all members' calendars who have sync enabled |
| **Event deleted from ICS** | Delete from all members' calendars via `UserGoogleEventSync` tracking |
| **Member joins calendar** | Sync all existing events to their Google Calendar (on next ICS sync) |
| **Member removed** | Delete all synced events from their Google Calendar |
| **User enables `keep_supplemental_events`** | Sync supplemental events from events assigned to OTHER users |
| **User disables `keep_supplemental_events`** | Delete supplemental events from events assigned to OTHER users |

### Multi-User Sync Model

Events are synced independently to each user's Google Calendar via the `UserGoogleEventSync` junction table:

```
┌───────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│      Event        │─────│  UserGoogleEventSync │─────│      User       │
│   (Koordi DB)     │  M  │                      │  M  │ (Google Cal ID) │
│                   │─────│  - google_event_id   │─────│                 │
└───────────────────┘     │  - sync_type         │     └─────────────────┘
                          └──────────────────────┘

Each event can have multiple UserGoogleEventSync records,
one for each user who has it synced to their calendar.
```

---

## AUTHENTICATION

### OAuth 2.0 Scopes

The Google Calendar API requires the following OAuth scopes:

```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
```

These scopes grant full access to user's calendars and events (read/write). They are requested during initial OAuth flow with `prompt: 'consent'` to ensure refresh tokens are always returned. See [AUTHENTICATION.md](./AUTHENTICATION.md).

### API Client Setup

```typescript
// src/utils/googleCalendarClient.ts
import { google } from 'googleapis';
import { decrypt, isEncryptionConfigured } from './encryption';
import { prisma } from '../lib/prisma';
import {
  AuthenticationError,
  ConfigurationError,
  NotFoundError,
  getErrorMessage,
} from './errors';

/**
 * Get an authenticated Google Calendar client for a user
 * @throws {ConfigurationError} If encryption or OAuth is not configured
 * @throws {NotFoundError} If user is not found
 * @throws {AuthenticationError} If user doesn't have valid Google credentials
 */
export async function getGoogleCalendarClient(userId: string) {
  // Check encryption configuration
  if (!isEncryptionConfigured()) {
    throw new ConfigurationError(
      'Encryption is not properly configured. Cannot decrypt Google tokens.',
      { userId }
    );
  }

  // Validate OAuth configuration
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new ConfigurationError(
      'Google OAuth credentials not configured',
      {
        hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      }
    );
  }

  // Fetch user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      google_refresh_token_enc: true,
      google_calendar_sync_enabled: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  if (!user.google_calendar_sync_enabled) {
    throw new AuthenticationError(
      'Google Calendar sync is not enabled for this user',
      { userId }
    );
  }

  if (!user.google_refresh_token_enc) {
    throw new AuthenticationError(
      'User has not connected their Google Calendar account',
      { userId }
    );
  }

  // Decrypt and authenticate
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const refreshToken = decrypt(user.google_refresh_token_enc);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Check if Google Calendar sync is enabled for a user
 */
export async function isGoogleCalendarSyncEnabled(userId: string): Promise<boolean> {
  if (!isEncryptionConfigured()) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      google_calendar_sync_enabled: true,
      google_refresh_token_enc: true,
    },
  });

  return Boolean(
    user &&
      user.google_calendar_sync_enabled &&
      user.google_refresh_token_enc
  );
}
```

---

## CALENDAR OPERATIONS

### List User's Calendars

**Purpose:** Optionally allow user to choose which calendar to sync to (default: primary).

**API Endpoint:**
```
GET https://www.googleapis.com/calendar/v3/users/me/calendarList
```

**Implementation:**
```typescript
export async function listUserCalendars(userId: string) {
  const calendar = await getGoogleCalendarClient(userId);

  const response = await calendar.calendarList.list();

  return response.data.items?.map((cal) => ({
    id: cal.id,
    summary: cal.summary,
    primary: cal.primary || false,
    backgroundColor: cal.backgroundColor,
  }));
}
```

**Response Example:**
```json
{
  "items": [
    {
      "id": "primary",
      "summary": "john@example.com",
      "primary": true,
      "backgroundColor": "#9fe1e7"
    },
    {
      "id": "family123@group.calendar.google.com",
      "summary": "Family Calendar",
      "primary": false,
      "backgroundColor": "#f09300"
    }
  ]
}
```

---

## EVENT CRUD OPERATIONS

### Create/Update Main Event

**Purpose:** Sync main events to all calendar members' Google Calendars.

**API Endpoint:**
```
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events (create)
PUT https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId} (update)
```

**Dynamic Title Formats:**
- Assigned: `[FirstName] handling - [Event Title]` (e.g., "John handling - Soccer Practice")
- Unassigned: `❓ Unassigned - [Event Title]`
- Not Attending: `🚫 Not Attending - [Event Title]`

**Request Body:**
```json
{
  "summary": "John handling - Soccer Practice",
  "description": "John is handling this event\nUpdate event assignment in Koordie: https://app.koordie.com\n\nOriginal description...\n\nChild: Emma\nCalendar: Soccer Schedule",
  "location": "Lincoln Field, San Francisco, CA",
  "start": {
    "dateTime": "2024-03-20T16:00:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "end": {
    "dateTime": "2024-03-20T17:30:00-07:00",
    "timeZone": "America/Los_Angeles"
  },
  "colorId": "9",
  "reminders": {
    "useDefault": false,
    "overrides": [
      { "method": "popup", "minutes": 30 }
    ]
  }
}
```

**Implementation:**
```typescript
// src/services/mainEventGoogleCalendarSync.ts
import { getGoogleCalendarClient, isGoogleCalendarSyncEnabled } from '../utils/googleCalendarClient';
import { prisma } from '../lib/prisma';
import { NotFoundError, ExternalAPIError, getErrorMessage } from '../utils/errors';

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
 * Handles both CREATE and UPDATE with stale record detection
 */
export async function syncMainEventToGoogleCalendar(
  eventId: string,
  userId: string,
  context?: SyncContext
): Promise<string | null> {
  // Use context data if provided, otherwise fetch (backward compatibility)
  let event = context?.event;
  let user = context?.user;
  let existingSync = context?.existingSync;

  if (!event) {
    event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        event_calendar: { include: { child: true } },
      },
    });
    if (!event) throw new NotFoundError('Event', eventId);
  }

  if (!user) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        google_calendar_id: true,
        google_calendar_sync_enabled: true,
        google_refresh_token_enc: true,
      },
    });
    if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
      return null;
    }
  }

  const calendarId = user?.google_calendar_id || 'primary';
  const calendar = await getGoogleCalendarClient(userId);

  // Format event for Google Calendar
  const eventBody: any = {
    summary: event.title,
    description: `${event.description || ''}\n\nChild: ${event.event_calendar.child.name}\nCalendar: ${event.event_calendar.name}`,
    location: event.location || undefined,
    colorId: '9', // Blue color for main events
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
  };

  // Handle all-day events vs timed events
  if (event.is_all_day) {
    eventBody.start = { date: event.start_time.toISOString().split('T')[0] };
    eventBody.end = { date: event.end_time.toISOString().split('T')[0] };
  } else {
    eventBody.start = {
      dateTime: event.start_time.toISOString(),
      timeZone: 'America/Los_Angeles',
    };
    eventBody.end = {
      dateTime: event.end_time.toISOString(),
      timeZone: 'America/Los_Angeles',
    };
  }

  // Check if THIS USER already has this event synced
  if (!existingSync) {
    existingSync = await prisma.userGoogleEventSync.findUnique({
      where: { user_id_event_id: { user_id: userId, event_id: eventId } },
    });
  }

  if (existingSync && existingSync.google_event_id) {
    // CRITICAL: Verify the Google Calendar event still exists before updating
    try {
      await calendar.events.get({
        calendarId,
        eventId: existingSync.google_event_id,
      });

      // Event exists, update it
      await calendar.events.update({
        calendarId,
        eventId: existingSync.google_event_id,
        requestBody: eventBody,
      });
      return existingSync.google_event_id;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        // Stale sync record - delete it and create new event
        await prisma.userGoogleEventSync.delete({ where: { id: existingSync.id } });
        existingSync = null;
      } else {
        throw error;
      }
    }
  }

  // CREATE new event
  if (!existingSync) {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
    });
    return response.data.id!;
  }

  return null;
}
```

**Color Codes Used:**
- Main events: `colorId: '9'` (Blue)
- Buffer events: `colorId: '5'` (Yellow)
- Drive time events: `colorId: '8'` (Gray)

**Response:**
```json
{
  "id": "abc123def456",
  "status": "confirmed",
  "htmlLink": "https://www.google.com/calendar/event?eid=...",
  "summary": "Soccer Practice",
  ...
}
```

### Multi-User Sync Service

**Purpose:** Coordinate syncing events to ALL calendar members.

**Implementation:**
```typescript
// src/services/multiUserSyncService.ts
import { syncMainEventToGoogleCalendar, deleteMainEventFromGoogleCalendar } from './mainEventGoogleCalendarSync';
import { prisma } from '../lib/prisma';

/**
 * Sync a main event to all calendar members
 * Tracks each sync in the UserGoogleEventSync table
 * Optimized to batch-fetch all user data to eliminate N+1 queries
 */
export async function syncMainEventToAllMembers(eventId: string): Promise<void> {
  // Fetch event with calendar info and all members (single query)
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      event_calendar: {
        include: {
          child: true,
          members: {
            where: { status: 'accepted' },
            select: {
              user_id: true,
              user: {
                select: {
                  id: true,
                  google_calendar_sync_enabled: true,
                  google_refresh_token_enc: true,
                  google_calendar_id: true,
                },
              },
            },
          },
          owner: {
            select: {
              id: true,
              google_calendar_sync_enabled: true,
              google_refresh_token_enc: true,
              google_calendar_id: true,
            },
          },
        },
      },
    },
  });

  if (!event) return;

  // Build member list (owner + accepted members)
  const userMap = new Map<string, any>();
  const memberIds: string[] = [];

  event.event_calendar.members.forEach((m) => {
    if (m.user && m.user_id) {
      userMap.set(m.user.id, m.user);
      memberIds.push(m.user.id);
    }
  });

  const owner = event.event_calendar.owner;
  if (owner && !memberIds.includes(owner.id)) {
    userMap.set(owner.id, owner);
    memberIds.push(owner.id);
  }

  // Batch-fetch existing sync records
  const existingSyncs = await prisma.userGoogleEventSync.findMany({
    where: { event_id: eventId, sync_type: 'main', user_id: { in: memberIds } },
  });
  const existingSyncMap = new Map(existingSyncs.map((s) => [s.user_id, s]));

  // Sync to each member in parallel
  await Promise.all(
    memberIds.map(async (userId) => {
      const user = userMap.get(userId);
      if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
        return; // Skip users without sync enabled
      }

      const googleEventId = await syncMainEventToGoogleCalendar(
        eventId,
        userId,
        { event, user, existingSync: existingSyncMap.get(userId) }
      );

      if (googleEventId) {
        await prisma.userGoogleEventSync.upsert({
          where: { user_id_event_id: { user_id: userId, event_id: eventId } },
          create: { user_id: userId, event_id: eventId, google_event_id: googleEventId, sync_type: 'main' },
          update: { google_event_id: googleEventId },
        });
      }
    })
  );
}
```

### Delete Event

**Purpose:** Remove event from a user's Google Calendar when unassigned or event is deleted.

**API Endpoint:**
```
DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
```

**Implementation:**
```typescript
// src/services/mainEventGoogleCalendarSync.ts
export async function deleteMainEventFromGoogleCalendar(
  eventId: string,
  userId: string
): Promise<void> {
  const syncEnabled = await isGoogleCalendarSyncEnabled(userId);
  if (!syncEnabled) return;

  // Look up the user's specific sync record (NOT the event's google_event_id)
  const existingSync = await prisma.userGoogleEventSync.findUnique({
    where: {
      user_id_event_id: { user_id: userId, event_id: eventId },
    },
  });

  if (!existingSync || !existingSync.google_event_id) {
    // This user doesn't have this event synced
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { google_calendar_id: true },
  });

  const calendarId = user?.google_calendar_id || 'primary';
  const calendar = await getGoogleCalendarClient(userId);

  await calendar.events.delete({
    calendarId,
    eventId: existingSync.google_event_id,
  });
}

/**
 * Delete a main event from ALL calendar members' Google Calendars
 */
export async function deleteMainEventFromAllMembers(eventId: string): Promise<void> {
  const syncs = await prisma.userGoogleEventSync.findMany({
    where: { event_id: eventId, sync_type: 'main' },
  });

  await Promise.all(
    syncs.map(async (sync) => {
      await deleteMainEventFromGoogleCalendar(eventId, sync.user_id);
      await prisma.userGoogleEventSync.delete({ where: { id: sync.id } });
    })
  );
}
```

---

## WATCH API (PUSH NOTIFICATIONS)

### Purpose

The Watch API allows receiving push notifications when events change in a Google Calendar. This enables **bidirectional sync** (detecting when user modifies events directly in Google Calendar).

**Note:** This is an advanced feature and may be implemented in Phase 2. Basic one-way sync (Koordi → Google Calendar) is sufficient for MVP.

### Setting Up a Watch

**API Endpoint:**
```
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/watch
```

**Request Body:**
```json
{
  "id": "unique-channel-id",
  "type": "web_hook",
  "address": "https://api.koordi.app/webhooks/google-calendar",
  "token": "optional-verification-token",
  "expiration": 1609459200000
}
```

**Implementation:**
```typescript
export async function setupCalendarWatch(userId: string, calendarId: string) {
  const calendar = await getGoogleCalendarClient(userId);

  const channelId = `${userId}-${calendarId}-${Date.now()}`;
  const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now

  const response = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: `${process.env.API_URL}/webhooks/google-calendar`,
      token: generateWebhookToken(userId), // HMAC signature
      expiration: expiration.toString(),
    },
  });

  // Store watch info in database
  await prisma.eventCalendar.update({
    where: { id: calendarId },
    data: {
      google_calendar_watch_token: channelId,
      google_calendar_watch_expiry: new Date(expiration),
    },
  });

  logger.info('Set up Google Calendar watch', {
    userId,
    calendarId,
    channelId,
    expiresAt: new Date(expiration),
  });

  return response.data;
}
```

### Handling Webhook Notifications

```typescript
// src/routes/webhooks.ts
import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

router.post('/google-calendar', async (req, res) => {
  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state']; // 'exists', 'sync', 'not_exists'

  // Respond quickly to Google
  res.status(200).send('OK');

  if (resourceState === 'sync') {
    // Initial sync message, ignore
    return;
  }

  if (resourceState === 'exists') {
    // Calendar changed, fetch updated events
    logger.info('Google Calendar changed', { channelId });

    // Queue background job to sync changes
    // TODO: Implement sync logic to detect changes and update our database
  }
});

export default router;
```

**Note:** Full bidirectional sync requires:
1. Fetching updated events from Google Calendar
2. Comparing with our database
3. Resolving conflicts (user modified in Google vs. ICS feed updated)
4. Updating our database

This adds significant complexity and may be deferred to post-MVP.

---

## SYNC STRATEGY

### One-Way Sync (Current Implementation)

**Direction:** Koordi → Google Calendar

**Trigger:** ICS sync job (every 5 minutes) or event operations

**Flow:**
1. ICS sync job fetches and parses ICS feeds
2. For each event, `syncMainEventToAllMembers()` is called
3. Each member with sync enabled gets the event in their Google Calendar
4. `UserGoogleEventSync` records track each user's Google Event ID
5. Supplemental events sync to assigned user + opt-in members

**Key Implementation Details:**
- Main events sync to ALL calendar members (owner + accepted members)
- Supplemental events only sync to assigned user by default
- Other members opt-in to supplemental events via `keep_supplemental_events` toggle
- Stale sync records are detected and cleaned up automatically
- Partial failures don't break the entire sync operation

**Advantages:**
- Simpler implementation
- No conflict resolution needed
- Clear source of truth (ICS feed)
- Multi-user support with independent tracking

### Bidirectional Sync (Not Implemented)

**Direction:** Koordi ↔ Google Calendar

**Status:** Not yet implemented. May be considered for future enhancement.

**Would Require:**
- Watch API setup and management
- Conflict resolution logic (ICS feed vs. Google Calendar edit)
- Sync loop prevention
- Handling deletions from both sources

---

## ERROR HANDLING

### Common Error Scenarios

| Error Code | Status | Meaning | Action |
|------------|--------|---------|--------|
| 401 | Unauthorized | Refresh token expired/revoked | Prompt user to reconnect Google Calendar |
| 403 | Forbidden | Insufficient permissions | Verify OAuth scopes |
| 404 | Not Found | Event already deleted | Log warning, update database |
| 409 | Conflict | Event ID collision | Regenerate ID, retry |
| 429 | Too Many Requests | Quota exceeded | Implement backoff, queue jobs |
| 500 | Server Error | Google API down | Retry with exponential backoff |

### Error Handling Implementation

```typescript
export async function createGoogleCalendarEventWithErrorHandling(eventId: string, userId: string) {
  try {
    return await createGoogleCalendarEvent(eventId, userId);
  } catch (error) {
    if (error.code === 401) {
      // Token expired, disable sync and notify user
      await prisma.user.update({
        where: { id: userId },
        data: { google_calendar_sync_enabled: false },
      });

      logger.error('Google Calendar auth expired', { userId });
      // TODO: Send email to user to reconnect

      throw new Error('Google Calendar authorization expired. Please reconnect.');
    } else if (error.code === 403) {
      logger.error('Google Calendar permission denied', { userId, error });
      throw new Error('Insufficient permissions for Google Calendar.');
    } else if (error.code === 429) {
      logger.warn('Google Calendar quota exceeded', { userId });
      // Retry later via background job
      throw new Error('Google Calendar quota exceeded. Will retry.');
    } else if (error.code >= 500) {
      logger.error('Google Calendar server error', { userId, error });
      throw new Error('Google Calendar temporarily unavailable. Will retry.');
    } else {
      logger.error('Google Calendar sync failed', { userId, eventId, error });
      throw error;
    }
  }
}
```

### Token Refresh Handling

Google access tokens expire after 1 hour. The `googleapis` library automatically refreshes tokens using the refresh token:

```typescript
// Automatic token refresh
oauth2Client.setCredentials({ refresh_token: refreshToken });

// Access token is automatically refreshed on first API call
// If refresh fails (revoked token), 401 error is thrown
```

If refresh token is revoked (user revokes access):
1. Catch 401 error
2. Disable Google Calendar sync for user
3. Notify user to reconnect

---

## QUOTA MANAGEMENT

### Google Calendar API Quotas

**Free Tier:**
- **Queries per day:** 1,000,000
- **Queries per 100 seconds per user:** 50,000

**Typical Usage (100 users, 10 events each, hourly traffic recalc):**
- Event creates: 1,000 events × 2 API calls (main + supplemental) = 2,000/day
- Event updates: 100 updates × 2 API calls = 200/day
- Event deletes: 50 deletes × 2 API calls = 100/day
- **Total:** ~2,500 API calls/day (well within limit)

### Quota Optimization Strategies

1. **Batch Operations:**
   - Use batch requests for bulk operations (up to 1,000 requests per batch)
   - Not currently needed but available

2. **Queue Management:**
   - Spread sync jobs evenly throughout the day
   - Avoid thundering herd (all syncs at once)

3. **Conditional Updates:**
   - Only sync if event actually changed
   - Compare last_modified timestamp

4. **Exponential Backoff:**
   ```typescript
   import { promisify } from 'util';
   const sleep = promisify(setTimeout);

   async function callWithBackoff(fn: () => Promise<any>, maxRetries = 5) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (error.code === 429 && i < maxRetries - 1) {
           const delay = Math.min(1000 * Math.pow(2, i), 32000);
           logger.warn('Rate limited, backing off', { delay });
           await sleep(delay);
         } else {
           throw error;
         }
       }
     }
   }
   ```

### Monitoring Quota Usage

```typescript
// Track API calls with Prometheus
import { Counter } from 'prom-client';

export const googleCalendarApiCallsCounter = new Counter({
  name: 'google_calendar_api_calls_total',
  help: 'Total Google Calendar API calls',
  labelNames: ['operation', 'status'], // operation: create | update | delete
});

// Increment after each call
googleCalendarApiCallsCounter.inc({ operation: 'create', status: 'success' });
```

---

## TESTING

### Unit Tests

```typescript
// tests/services/google-calendar-sync.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createGoogleCalendarEvent } from '../../src/services/google-calendar-sync-service';
import { google } from 'googleapis';

vi.mock('googleapis');

describe('Google Calendar Sync', () => {
  it('should create event in Google Calendar', async () => {
    const mockInsert = vi.fn().mockResolvedValue({
      data: { id: 'google-event-123' },
    });

    vi.mocked(google.calendar).mockReturnValue({
      events: { insert: mockInsert },
    } as any);

    const googleEventId = await createGoogleCalendarEvent('event-123', 'user-456');

    expect(googleEventId).toBe('google-event-123');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          summary: expect.any(String),
        }),
      })
    );
  });

  it('should handle 401 error by disabling sync', async () => {
    vi.mocked(google.calendar).mockReturnValue({
      events: {
        insert: vi.fn().mockRejectedValue({ code: 401 }),
      },
    } as any);

    await expect(
      createGoogleCalendarEventWithErrorHandling('event-123', 'user-456')
    ).rejects.toThrow('authorization expired');

    // Verify user sync disabled
    const user = await prisma.user.findUnique({ where: { id: 'user-456' } });
    expect(user.google_calendar_sync_enabled).toBe(false);
  });
});
```

### Integration Tests (Manual with Real Google Account)

```typescript
// tests/integration/google-calendar.test.ts
describe('Google Calendar Integration', () => {
  it('should create, update, and delete event', async () => {
    // Requires real Google account with test calendar
    const testUserId = process.env.TEST_USER_ID;
    const testEventId = 'test-event-' + Date.now();

    // Create test event in database
    const event = await prisma.event.create({
      data: {
        id: testEventId,
        event_calendar_id: 'test-calendar',
        ics_uid: 'test-uid',
        title: 'Test Event',
        start_time: new Date(),
        end_time: new Date(Date.now() + 60 * 60 * 1000),
        assigned_to_user_id: testUserId,
      },
    });

    // Create in Google Calendar
    const googleEventId = await createGoogleCalendarEvent(testEventId, testUserId);
    expect(googleEventId).toBeDefined();

    // Update
    await updateGoogleCalendarEvent(testEventId, testUserId);

    // Delete
    await deleteGoogleCalendarEvent(testEventId, testUserId);
  });
});
```

---

## SUMMARY CHECKLIST

### Setup
- [x] Google Calendar API enabled in Google Cloud Console
- [x] OAuth scopes `calendar` and `calendar.events` requested
- [x] Refresh tokens stored encrypted in database (AES-256-CBC)
- [x] API client helper functions (`src/utils/googleCalendarClient.ts`)
- [x] Custom error types (ConfigurationError, AuthenticationError, NotFoundError)

### Event Operations
- [x] Create/update main event implementation (`syncMainEventToGoogleCalendar`)
- [x] Delete event implementation (`deleteMainEventFromGoogleCalendar`)
- [x] Multi-user sync (`syncMainEventToAllMembers`)
- [x] Supplemental events (drive times, buffer) synced
- [x] Fixed color codes (Blue=9 for main, Yellow=5 for buffer, Gray=8 for drive)
- [ ] Timezone handling (currently hardcoded to `America/Los_Angeles`)

### Error Handling
- [x] 401 (token expired) → Throws AuthenticationError
- [x] 404 (not found) → Detects stale sync records, cleans up and recreates
- [x] Custom error types with context (ExternalAPIError)
- [ ] 403 (permissions) → Not explicitly handled
- [ ] 429 (quota exceeded) → Not implemented
- [ ] Automatic user notification on token expiry

### Sync Strategy
- [x] One-way sync (Koordi → Google Calendar)
- [x] Triggered by ICS sync job (every 5 minutes)
- [x] Per-user tracking via `UserGoogleEventSync` table
- [x] Stale record detection and cleanup
- [x] Batch-optimized queries to eliminate N+1
- [x] Parallel sync operations with partial failure handling

### Multi-User Features
- [x] Main events sync to ALL calendar members
- [x] Supplemental events sync to assigned user
- [x] Opt-in supplemental events for other members (`keep_supplemental_events`)
- [x] Handle member join/leave (sync/delete events)
- [x] Handle retention toggle change

### Testing
- [ ] Unit tests for all CRUD operations
- [ ] Mock googleapis library
- [ ] Error scenario tests
- [ ] Integration tests with real Google account (manual)

### Not Yet Implemented
- [ ] Watch API for bidirectional sync
- [ ] User-selectable calendar (currently uses `primary`)
- [ ] Dynamic timezone handling
- [ ] Quota management with exponential backoff
- [ ] Prometheus metrics for API call monitoring

---

**Next Steps:** Proceed to [ICS_PARSING_SPECIFICATION.md](./ICS_PARSING_SPECIFICATION.md) for ICS feed parsing details.
