# Google Calendar API Integration
## Koordi

**Purpose:** Complete specification for Google Calendar API integration
**API Version:** Google Calendar API v3
**Use Cases:** Sync assigned events to user's personal Google Calendar, bidirectional sync with Watch API

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
│ User assigns event to themselves                            │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Background Job:       │
     │ Google Calendar Sync  │
     └───────────┬───────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Create Event in       │
     │ User's Google Calendar│
     └───────────┬───────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Store google_event_id │
     │ in Database           │
     └───────────┬───────────┘
                 │
                 ▼
     ┌───────────────────────┐
     │ Create Supplemental   │
     │ Events (Drive Times)  │
     └───────────────────────┘
```

### Sync Behavior

| Action | Google Calendar Sync |
|--------|---------------------|
| **Event assigned to user** | Create event + supplemental events in user's calendar |
| **Event reassigned to another user** | Delete from previous user's calendar, create in new user's calendar |
| **Event unassigned** | Delete from user's calendar |
| **Event time/location updated** | Update event in user's calendar |
| **Event deleted** | Delete from user's calendar |

---

## AUTHENTICATION

### OAuth 2.0 Scopes

The Google Calendar API requires the following OAuth scope:

```
https://www.googleapis.com/auth/calendar
```

This scope grants full access to user's calendar (read/write). It is requested during initial OAuth flow (see [AUTHENTICATION.md](./AUTHENTICATION.md)).

### API Client Setup

```typescript
// src/lib/google-calendar-client.ts
import { google } from 'googleapis';
import { decrypt } from '../utils/encryption';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getGoogleCalendarClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      google_refresh_token_enc: true,
      google_calendar_sync_enabled: true,
    },
  });

  if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
    throw new Error('Google Calendar sync not enabled for user');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const refreshToken = decrypt(user.google_refresh_token_enc);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: 'v3', auth: oauth2Client });
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

### Create Event

**Purpose:** Add assigned event to user's Google Calendar.

**API Endpoint:**
```
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
```

**Request Body:**
```json
{
  "summary": "Soccer Practice",
  "description": "Child: Emma\nLocation: Lincoln Field",
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
// src/services/google-calendar-sync-service.ts
import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient } from '../lib/google-calendar-client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export async function createGoogleCalendarEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      event_calendar: { include: { child: true } },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const calendar = await getGoogleCalendarClient(userId);

  const googleEvent = await calendar.events.insert({
    calendarId: user.google_calendar_id || 'primary',
    requestBody: {
      summary: event.title,
      description: `${event.description || ''}\n\nChild: ${event.event_calendar.child.name}\nCalendar: ${event.event_calendar.name}`,
      location: event.location || undefined,
      start: event.is_all_day
        ? { date: event.start_time.toISOString().split('T')[0] }
        : {
            dateTime: event.start_time.toISOString(),
            timeZone: 'America/Los_Angeles', // TODO: Make timezone dynamic
          },
      end: event.is_all_day
        ? { date: event.end_time.toISOString().split('T')[0] }
        : {
            dateTime: event.end_time.toISOString(),
            timeZone: 'America/Los_Angeles',
          },
      colorId: mapCalendarColorToGoogle(event.event_calendar.color),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 60 },
        ],
      },
    },
  });

  // Store Google event ID
  await prisma.event.update({
    where: { id: eventId },
    data: { google_event_id: googleEvent.data.id },
  });

  logger.info('Created event in Google Calendar', {
    eventId,
    googleEventId: googleEvent.data.id,
    userId,
  });

  return googleEvent.data.id;
}

// Color mapping (Koordi hex color → Google Calendar color ID)
function mapCalendarColorToGoogle(hexColor: string): string {
  const colorMap: Record<string, string> = {
    '#FF5733': '11', // Red
    '#3B82F6': '9',  // Blue
    '#10B981': '10', // Green
    '#F59E0B': '5',  // Yellow/Orange
    '#8B5CF6': '3',  // Purple
    '#EC4899': '4',  // Pink
  };

  return colorMap[hexColor] || '9'; // Default to blue
}
```

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

### Update Event

**Purpose:** Update event details when ICS feed changes or event is modified.

**API Endpoint:**
```
PATCH https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
```

**Implementation:**
```typescript
export async function updateGoogleCalendarEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      event_calendar: { include: { child: true } },
    },
  });

  if (!event || !event.google_event_id) {
    throw new Error('Event not found or not synced to Google Calendar');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const calendar = await getGoogleCalendarClient(userId);

  await calendar.events.patch({
    calendarId: user.google_calendar_id || 'primary',
    eventId: event.google_event_id,
    requestBody: {
      summary: event.title,
      description: `${event.description || ''}\n\nChild: ${event.event_calendar.child.name}`,
      location: event.location || undefined,
      start: event.is_all_day
        ? { date: event.start_time.toISOString().split('T')[0] }
        : {
            dateTime: event.start_time.toISOString(),
            timeZone: 'America/Los_Angeles',
          },
      end: event.is_all_day
        ? { date: event.end_time.toISOString().split('T')[0] }
        : {
            dateTime: event.end_time.toISOString(),
            timeZone: 'America/Los_Angeles',
          },
    },
  });

  logger.info('Updated event in Google Calendar', {
    eventId,
    googleEventId: event.google_event_id,
    userId,
  });
}
```

### Delete Event

**Purpose:** Remove event from Google Calendar when unassigned or deleted.

**API Endpoint:**
```
DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
```

**Implementation:**
```typescript
export async function deleteGoogleCalendarEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { google_event_id: true },
  });

  if (!event || !event.google_event_id) {
    logger.warn('Event not found or not synced to Google Calendar', { eventId });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const calendar = await getGoogleCalendarClient(userId);

  try {
    await calendar.events.delete({
      calendarId: user.google_calendar_id || 'primary',
      eventId: event.google_event_id,
    });

    logger.info('Deleted event from Google Calendar', {
      eventId,
      googleEventId: event.google_event_id,
      userId,
    });
  } catch (error) {
    if (error.code === 404) {
      logger.warn('Event already deleted from Google Calendar', { eventId });
    } else {
      throw error;
    }
  }
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

### One-Way Sync (MVP)

**Direction:** Koordi → Google Calendar

**Trigger:** Event assignment changes

**Flow:**
1. User assigns event to themselves
2. Background job creates event in Google Calendar
3. Store `google_event_id` in database
4. Future updates/deletes use this ID

**Advantages:**
- Simpler implementation
- No conflict resolution needed
- Clear source of truth (ICS feed)

### Bidirectional Sync (Future Enhancement)

**Direction:** Koordi ↔ Google Calendar

**Challenges:**
- Conflict resolution (ICS feed update vs. Google Calendar edit)
- Watch API management (expiration, renewal)
- Sync loop prevention
- Handling deletions

**Recommended Approach:**
- ICS feed is always the source of truth for event existence
- Google Calendar edits only update time/location/notes
- If event is modified in Google Calendar AND ICS feed updates, ICS feed wins

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
- [ ] Google Calendar API enabled in Google Cloud Console
- [ ] OAuth scope `https://www.googleapis.com/auth/calendar` requested
- [ ] Refresh tokens stored encrypted in database
- [ ] API client helper functions created

### Event Operations
- [ ] Create event implementation
- [ ] Update event implementation
- [ ] Delete event implementation
- [ ] Supplemental events (drive times) synced
- [ ] Color mapping from Koordi to Google Calendar
- [ ] Timezone handling (dynamic based on user location)

### Error Handling
- [ ] 401 (token expired) → Disable sync, notify user
- [ ] 403 (permissions) → Log error
- [ ] 404 (not found) → Log warning, continue
- [ ] 429 (quota exceeded) → Exponential backoff
- [ ] 500+ (server error) → Retry with backoff

### Sync Strategy
- [ ] One-way sync (Koordi → Google Calendar)
- [ ] Triggered by event assignment changes
- [ ] Background job implementation (see BACKGROUND_JOBS.md)
- [ ] Idempotent operations (safe to retry)

### Quota Management
- [ ] Exponential backoff for rate limits
- [ ] API call monitoring with Prometheus
- [ ] Conditional updates (only if event changed)
- [ ] Usage alerts configured

### Testing
- [ ] Unit tests for all CRUD operations
- [ ] Mock googleapis library
- [ ] Error scenario tests
- [ ] Integration tests with real Google account (manual)

### Future Enhancements (Post-MVP)
- [ ] Watch API for bidirectional sync
- [ ] Conflict resolution for bidirectional sync
- [ ] User-selectable calendar (not just primary)
- [ ] Batch operations for bulk sync
- [ ] Custom event colors per calendar

---

**Next Steps:** Proceed to [ICS_PARSING_SPECIFICATION.md](./ICS_PARSING_SPECIFICATION.md) for ICS feed parsing details.
