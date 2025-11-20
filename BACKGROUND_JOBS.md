# Background Jobs Specification
## Koordi

**Purpose:** Complete specification for all asynchronous background job processing
**Technology:** Bull Queue + Redis
**Job Types:** 5 core job types for syncing, traffic updates, and notifications

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [Bull Queue Architecture](#bull-queue-architecture)
3. [Job Types](#job-types)
4. [ICS Sync Job](#ics-sync-job)
5. [Google Calendar Sync Job](#google-calendar-sync-job)
6. [Traffic Recalculation Job](#traffic-recalculation-job)
7. [Push Notification Job](#push-notification-job)
8. [Google Token Refresh Job](#google-token-refresh-job)
9. [Error Handling & Retries](#error-handling--retries)
10. [Monitoring & Observability](#monitoring--observability)
11. [Testing](#testing)

---

## OVERVIEW

### Background Jobs Purpose

Background jobs handle time-intensive or scheduled operations that shouldn't block HTTP requests:

1. **ICS Sync Job:** Fetch and parse ICS feeds every 4 hours
2. **Google Calendar Sync Job:** Sync assigned events to users' Google Calendars
3. **Traffic Recalculation Job:** Update drive times hourly for upcoming events
4. **Push Notification Job:** Send notifications for upcoming events
5. **Google Token Refresh Job:** Refresh Google access tokens weekly

### Technology Stack

- **Bull:** Robust queue library for Node.js
- **Redis:** Job storage and queue management
- **Cron:** Scheduled job triggers (via Bull's repeat option)

---

## BULL QUEUE ARCHITECTURE

### Queue Structure

```
┌─────────────────────────────────────────────────────────────┐
│                         Redis                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Waiting │  │  Active  │  │Completed │  │  Failed  │   │
│  │  Jobs    │─►│  Jobs    │─►│  Jobs    │  │  Jobs    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
           │               │               │           │
           │               │               │           │
           ▼               ▼               ▼           ▼
    ┌──────────────────────────────────────────────────────┐
    │              Bull Queue Workers                      │
    │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐    │
    │  │Worker 1│  │Worker 2│  │Worker 3│  │Worker 4│    │
    │  └────────┘  └────────┘  └────────┘  └────────┘    │
    └──────────────────────────────────────────────────────┘
```

### Queue Configuration

```typescript
// src/jobs/queues.ts
import Queue from 'bull';
import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Create separate queues for different job types
export const icsSync Queue = new Queue('ics-sync', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500,     // Keep last 500 failed jobs
  },
});

export const googleCalendarSyncQueue = new Queue('google-calendar-sync', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const trafficUpdateQueue = new Queue('traffic-update', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  },
});

export const pushNotificationQueue = new Queue('push-notification', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

export const tokenRefreshQueue = new Queue('token-refresh', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});
```

---

## JOB TYPES

### Job Priority Levels

| Priority | Value | Usage |
|----------|-------|-------|
| **Critical** | 1 | Push notifications for imminent events |
| **High** | 3 | User-triggered syncs, event assignments |
| **Normal** | 5 | Scheduled ICS syncs, traffic updates |
| **Low** | 7 | Token refresh, cleanup tasks |

### Concurrency Limits

| Queue | Concurrency | Reason |
|-------|-------------|--------|
| ICS Sync | 5 | Limit external API calls |
| Google Calendar Sync | 3 | Respect Google API quotas |
| Traffic Update | 10 | High throughput, cached results |
| Push Notification | 20 | Fast, lightweight operations |
| Token Refresh | 2 | Low frequency, avoid rate limits |

---

## ICS SYNC JOB

### Purpose

Periodically fetch and parse ICS feeds to import/update events.

### Schedule

**Frequency:** Every 4 hours per calendar (configurable via `ICS_SYNC_INTERVAL_HOURS`)

### Job Data Schema

```typescript
interface IcsSyncJobData {
  calendar_id: string;
  ics_url: string;
  triggered_by?: 'schedule' | 'user' | 'system';
}
```

### Implementation

```typescript
// src/jobs/ics-sync.ts
import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import ical from 'ical.js';
import axios from 'axios';
import logger from '../utils/logger';
import { getSocketServer } from '../socket';

const prisma = new PrismaClient();

export async function processIcsSyncJob(job: Job<IcsSyncJobData>) {
  const { calendar_id, ics_url } = job.data;

  logger.info('Starting ICS sync', { calendarId: calendar_id, icsUrl: ics_url });

  try {
    // 1. Fetch ICS feed
    const response = await axios.get(ics_url, {
      timeout: 30000, // 30 seconds
      headers: {
        'User-Agent': 'FamilyScheduleApp/1.0',
      },
    });

    const icsData = response.data;

    // 2. Parse ICS data
    const jcalData = ical.parse(icsData);
    const comp = new ical.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    logger.info('Parsed ICS feed', { calendarId: calendar_id, eventCount: vevents.length });

    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    // 3. Get existing events for this calendar
    const existingEvents = await prisma.event.findMany({
      where: { event_calendar_id: calendar_id },
      select: { id: true, ics_uid: true, last_modified: true },
    });

    const existingUids = new Set(existingEvents.map((e) => e.ics_uid));
    const processedUids = new Set<string>();

    // 4. Process each event from ICS feed
    for (const vevent of vevents) {
      const event = new ical.Event(vevent);

      const icsUid = event.uid;
      const title = event.summary || 'Untitled Event';
      const description = event.description || null;
      const location = event.location || null;
      const startTime = event.startDate.toJSDate();
      const endTime = event.endDate.toJSDate();
      const isAllDay = event.startDate.isDate; // No time component
      const lastModified = event.lastModified?.toJSDate() || new Date();

      processedUids.add(icsUid);

      // Check if event exists
      const existing = existingEvents.find((e) => e.ics_uid === icsUid);

      if (existing) {
        // Update if modified
        if (existing.last_modified < lastModified) {
          await prisma.event.update({
            where: { id: existing.id },
            data: {
              title,
              description,
              location,
              start_time: startTime,
              end_time: endTime,
              is_all_day: isAllDay,
              last_modified: lastModified,
            },
          });

          eventsUpdated++;

          // Broadcast update via WebSocket
          const io = getSocketServer();
          io.to(`calendar:${calendar_id}`).emit('event_updated', {
            calendar_id,
            event: { id: existing.id, title, start_time: startTime, end_time: endTime },
            changes: [{ field: 'updated', old_value: null, new_value: null }],
            actor: null,
          });
        }
      } else {
        // Create new event
        const newEvent = await prisma.event.create({
          data: {
            event_calendar_id: calendar_id,
            ics_uid: icsUid,
            title,
            description,
            location,
            start_time: startTime,
            end_time: endTime,
            is_all_day: isAllDay,
            last_modified: lastModified,
          },
        });

        eventsAdded++;

        // Broadcast creation via WebSocket
        const io = getSocketServer();
        io.to(`calendar:${calendar_id}`).emit('event_created', {
          calendar_id,
          event: newEvent,
          actor: null,
        });
      }
    }

    // 5. Delete events no longer in ICS feed
    const deletedUids = [...existingUids].filter((uid) => !processedUids.has(uid));
    if (deletedUids.length > 0) {
      const deletedEvents = await prisma.event.deleteMany({
        where: {
          event_calendar_id: calendar_id,
          ics_uid: { in: deletedUids },
        },
      });

      eventsDeleted = deletedEvents.count;

      // Broadcast deletions
      const io = getSocketServer();
      for (const uid of deletedUids) {
        const eventId = existingEvents.find((e) => e.ics_uid === uid)?.id;
        if (eventId) {
          io.to(`calendar:${calendar_id}`).emit('event_deleted', {
            calendar_id,
            event_id: eventId,
            actor: null,
          });
        }
      }
    }

    // 6. Update calendar sync status
    await prisma.eventCalendar.update({
      where: { id: calendar_id },
      data: {
        last_sync_at: new Date(),
        last_sync_status: 'success',
        last_sync_error: null,
      },
    });

    // 7. Broadcast sync completion
    const io = getSocketServer();
    io.to(`calendar:${calendar_id}`).emit('calendar_synced', {
      calendar_id,
      status: 'success',
      events_added: eventsAdded,
      events_updated: eventsUpdated,
      events_deleted: eventsDeleted,
      synced_at: new Date().toISOString(),
    });

    logger.info('ICS sync completed', {
      calendarId: calendar_id,
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
    });

    return {
      success: true,
      eventsAdded,
      eventsUpdated,
      eventsDeleted,
    };
  } catch (error) {
    logger.error('ICS sync failed', {
      calendarId: calendar_id,
      error: error.message,
      stack: error.stack,
    });

    // Update calendar with error status
    await prisma.eventCalendar.update({
      where: { id: calendar_id },
      data: {
        last_sync_at: new Date(),
        last_sync_status: 'error',
        last_sync_error: error.message,
      },
    });

    // Broadcast sync failure
    const io = getSocketServer();
    io.to(`calendar:${calendar_id}`).emit('calendar_synced', {
      calendar_id,
      status: 'error',
      events_added: 0,
      events_updated: 0,
      events_deleted: 0,
      synced_at: new Date().toISOString(),
      error_message: error.message,
    });

    throw error; // Trigger retry
  }
}

// Register processor
icsSyncQueue.process(5, processIcsSyncJob); // 5 concurrent jobs
```

### Scheduling Recurring Jobs

```typescript
// src/jobs/schedulers/ics-sync-scheduler.ts
import { icsSyncQueue } from '../queues';
import { PrismaClient } from '@prisma/client';
import logger from '../../utils/logger';

const prisma = new PrismaClient();

export async function scheduleIcsSyncs() {
  const calendars = await prisma.eventCalendar.findMany({
    where: { sync_enabled: true },
    select: { id: true, ics_url: true },
  });

  const intervalHours = parseInt(process.env.ICS_SYNC_INTERVAL_HOURS || '4');

  for (const calendar of calendars) {
    await icsSyncQueue.add(
      {
        calendar_id: calendar.id,
        ics_url: calendar.ics_url,
        triggered_by: 'schedule',
      },
      {
        repeat: {
          every: intervalHours * 60 * 60 * 1000, // Convert hours to milliseconds
        },
        jobId: `ics-sync-${calendar.id}`, // Prevent duplicates
      }
    );
  }

  logger.info('Scheduled ICS syncs', { calendarCount: calendars.length, intervalHours });
}
```

---

## GOOGLE CALENDAR SYNC JOB

### Purpose

Sync assigned events to users' Google Calendars (create/update/delete).

### Trigger

**On-demand:** Triggered when event is assigned/reassigned/unassigned

### Job Data Schema

```typescript
interface GoogleCalendarSyncJobData {
  event_id: string;
  user_id: string;
  action: 'create' | 'update' | 'delete';
}
```

### Implementation

```typescript
// src/jobs/google-calendar-sync.ts
import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { decrypt } from '../utils/encryption';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export async function processGoogleCalendarSyncJob(job: Job<GoogleCalendarSyncJobData>) {
  const { event_id, user_id, action } = job.data;

  logger.info('Starting Google Calendar sync', { eventId: event_id, userId: user_id, action });

  try {
    // 1. Get user and verify Google Calendar sync is enabled
    const user = await prisma.user.findUnique({
      where: { id: user_id },
    });

    if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
      logger.info('Google Calendar sync not enabled for user', { userId: user_id });
      return { success: false, reason: 'sync_not_enabled' };
    }

    // 2. Set up Google Calendar API client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const refreshToken = decrypt(user.google_refresh_token_enc);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 3. Get event details
    const event = await prisma.event.findUnique({
      where: { id: event_id },
      include: {
        event_calendar: {
          include: { child: true },
        },
        supplemental_events: true,
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // 4. Perform action
    if (action === 'create') {
      // Create event in Google Calendar
      const googleEvent = await calendar.events.insert({
        calendarId: user.google_calendar_id || 'primary',
        requestBody: {
          summary: event.title,
          description: `${event.description || ''}\n\nChild: ${event.event_calendar.child.name}`,
          location: event.location || undefined,
          start: event.is_all_day
            ? { date: event.start_time.toISOString().split('T')[0] }
            : { dateTime: event.start_time.toISOString() },
          end: event.is_all_day
            ? { date: event.end_time.toISOString().split('T')[0] }
            : { dateTime: event.end_time.toISOString() },
          colorId: event.event_calendar.color,
        },
      });

      // Store Google event ID
      await prisma.event.update({
        where: { id: event_id },
        data: { google_event_id: googleEvent.data.id },
      });

      // Create supplemental events (drive times) if they exist
      for (const suppEvent of event.supplemental_events) {
        const googleSuppEvent = await calendar.events.insert({
          calendarId: user.google_calendar_id || 'primary',
          requestBody: {
            summary: suppEvent.title,
            start: { dateTime: suppEvent.start_time.toISOString() },
            end: { dateTime: suppEvent.end_time.toISOString() },
            description: `Drive time: ${suppEvent.drive_time_minutes} minutes`,
          },
        });

        await prisma.supplementalEvent.update({
          where: { id: suppEvent.id },
          data: { google_event_id: googleSuppEvent.data.id },
        });
      }

      logger.info('Created event in Google Calendar', { eventId: event_id, googleEventId: googleEvent.data.id });
    } else if (action === 'update') {
      // Update event in Google Calendar
      if (!event.google_event_id) {
        throw new Error('No Google event ID to update');
      }

      await calendar.events.update({
        calendarId: user.google_calendar_id || 'primary',
        eventId: event.google_event_id,
        requestBody: {
          summary: event.title,
          description: `${event.description || ''}\n\nChild: ${event.event_calendar.child.name}`,
          location: event.location || undefined,
          start: event.is_all_day
            ? { date: event.start_time.toISOString().split('T')[0] }
            : { dateTime: event.start_time.toISOString() },
          end: event.is_all_day
            ? { date: event.end_time.toISOString().split('T')[0] }
            : { dateTime: event.end_time.toISOString() },
        },
      });

      logger.info('Updated event in Google Calendar', { eventId: event_id, googleEventId: event.google_event_id });
    } else if (action === 'delete') {
      // Delete event from Google Calendar
      if (!event.google_event_id) {
        logger.info('No Google event ID to delete', { eventId: event_id });
        return { success: true };
      }

      await calendar.events.delete({
        calendarId: user.google_calendar_id || 'primary',
        eventId: event.google_event_id,
      });

      // Delete supplemental events
      for (const suppEvent of event.supplemental_events) {
        if (suppEvent.google_event_id) {
          await calendar.events.delete({
            calendarId: user.google_calendar_id || 'primary',
            eventId: suppEvent.google_event_id,
          });
        }
      }

      logger.info('Deleted event from Google Calendar', { eventId: event_id, googleEventId: event.google_event_id });
    }

    return { success: true };
  } catch (error) {
    logger.error('Google Calendar sync failed', {
      eventId: event_id,
      userId: user_id,
      action,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// Register processor
googleCalendarSyncQueue.process(3, processGoogleCalendarSyncJob); // 3 concurrent jobs
```

---

## TRAFFIC RECALCULATION JOB

### Purpose

Update drive time estimates for supplemental events based on current traffic conditions.

### Schedule

**Frequency:** Every 60 minutes (configurable via `TRAFFIC_CHECK_INTERVAL_MINUTES`)
**Scope:** Only events starting within next 48 hours

### Job Data Schema

```typescript
interface TrafficUpdateJobData {
  supplemental_event_id: string;
}
```

### Implementation

```typescript
// src/jobs/traffic-update.ts
import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export async function processTrafficUpdateJob(job: Job<TrafficUpdateJobData>) {
  const { supplemental_event_id } = job.data;

  try {
    const suppEvent = await prisma.supplementalEvent.findUnique({
      where: { id: supplemental_event_id },
      include: {
        parent_event: {
          include: {
            assigned_to: true,
            event_calendar: true,
          },
        },
      },
    });

    if (!suppEvent || !suppEvent.parent_event.assigned_to) {
      return { success: false, reason: 'event_not_found_or_unassigned' };
    }

    // Call Google Distance Matrix API
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/distancematrix/json',
      {
        params: {
          origins: `${suppEvent.origin_lat},${suppEvent.origin_lng}`,
          destinations: `${suppEvent.destination_lat},${suppEvent.destination_lng}`,
          departure_time: Math.floor(suppEvent.start_time.getTime() / 1000), // Unix timestamp
          traffic_model: 'best_guess',
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
      }
    );

    const result = response.data.rows[0].elements[0];
    if (result.status !== 'OK') {
      throw new Error(`Distance Matrix API error: ${result.status}`);
    }

    const newDriveTimeMinutes = Math.ceil(result.duration_in_traffic.value / 60);

    // Update if drive time changed significantly (>5 minutes difference)
    if (Math.abs(newDriveTimeMinutes - suppEvent.drive_time_minutes) >= 5) {
      const user = suppEvent.parent_event.assigned_to;
      const comfortBuffer = user.comfort_buffer_minutes;

      const newStartTime = new Date(
        suppEvent.parent_event.start_time.getTime() -
          (newDriveTimeMinutes + comfortBuffer) * 60 * 1000
      );
      const newEndTime = new Date(newStartTime.getTime() + newDriveTimeMinutes * 60 * 1000);

      await prisma.supplementalEvent.update({
        where: { id: supplemental_event_id },
        data: {
          drive_time_minutes: newDriveTimeMinutes,
          start_time: newStartTime,
          end_time: newEndTime,
          last_traffic_check: new Date(),
        },
      });

      logger.info('Updated drive time', {
        suppEventId: supplemental_event_id,
        oldDriveTime: suppEvent.drive_time_minutes,
        newDriveTime: newDriveTimeMinutes,
      });

      // TODO: Trigger Google Calendar update for this supplemental event
    } else {
      // No significant change, just update last check time
      await prisma.supplementalEvent.update({
        where: { id: supplemental_event_id },
        data: { last_traffic_check: new Date() },
      });
    }

    return { success: true, drive_time_minutes: newDriveTimeMinutes };
  } catch (error) {
    logger.error('Traffic update failed', {
      suppEventId: supplemental_event_id,
      error: error.message,
    });
    throw error;
  }
}

// Register processor
trafficUpdateQueue.process(10, processTrafficUpdateJob); // 10 concurrent jobs
```

### Scheduler

```typescript
// src/jobs/schedulers/traffic-update-scheduler.ts
import { trafficUpdateQueue } from '../queues';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function scheduleTrafficUpdates() {
  const now = new Date();
  const futureWindow = new Date(now.getTime() + 48 * 60 * 60 * 1000); // Next 48 hours

  const supplementalEvents = await prisma.supplementalEvent.findMany({
    where: {
      start_time: {
        gte: now,
        lte: futureWindow,
      },
      parent_event: {
        assigned_to_user_id: { not: null },
      },
    },
    select: { id: true },
  });

  for (const suppEvent of supplementalEvents) {
    await trafficUpdateQueue.add(
      { supplemental_event_id: suppEvent.id },
      { priority: 5 }
    );
  }

  logger.info('Scheduled traffic updates', { count: supplementalEvents.length });
}

// Run every hour
setInterval(scheduleTrafficUpdates, 60 * 60 * 1000);
```

---

## PUSH NOTIFICATION JOB

### Purpose

Send push notifications to users for upcoming events.

### Trigger

**Scheduled:** Based on event start times (e.g., 1 hour before, 30 minutes before)

### Job Data Schema

```typescript
interface PushNotificationJobData {
  user_id: string;
  event_id: string;
  notification_type: 'event_reminder' | 'departure_reminder';
  minutes_before: number;
}
```

### Implementation

```typescript
// src/jobs/push-notification.ts
import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { sendPushNotification } from '../services/push-notification-service';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export async function processPushNotificationJob(job: Job<PushNotificationJobData>) {
  const { user_id, event_id, notification_type, minutes_before } = job.data;

  try {
    const event = await prisma.event.findUnique({
      where: { id: event_id },
      include: {
        event_calendar: { include: { child: true } },
      },
    });

    if (!event) {
      return { success: false, reason: 'event_not_found' };
    }

    let title: string;
    let body: string;

    if (notification_type === 'event_reminder') {
      title = `Upcoming: ${event.title}`;
      body = `${event.event_calendar.child.name}'s event starts in ${minutes_before} minutes at ${event.location}`;
    } else if (notification_type === 'departure_reminder') {
      title = `Time to leave for ${event.title}`;
      body = `Leave now to arrive on time for ${event.event_calendar.child.name}'s event`;
    } else {
      throw new Error(`Unknown notification type: ${notification_type}`);
    }

    await sendPushNotification(user_id, {
      title,
      body,
      data: {
        event_id,
        notification_type,
      },
    });

    logger.info('Sent push notification', { userId: user_id, eventId: event_id, type: notification_type });

    return { success: true };
  } catch (error) {
    logger.error('Push notification failed', {
      userId: user_id,
      eventId: event_id,
      error: error.message,
    });
    throw error;
  }
}

// Register processor
pushNotificationQueue.process(20, processPushNotificationJob); // 20 concurrent jobs
```

---

## GOOGLE TOKEN REFRESH JOB

### Purpose

Refresh Google access tokens to maintain Google Calendar sync functionality.

### Schedule

**Frequency:** Every 7 days (configurable via `GOOGLE_TOKEN_REFRESH_INTERVAL_DAYS`)

### Implementation

See [AUTHENTICATION.md](./AUTHENTICATION.md#google-token-refresh-background-job) for full implementation.

---

## ERROR HANDLING & RETRIES

### Retry Configuration

```typescript
// Queue-specific retry strategies
{
  attempts: 3,               // Maximum retry attempts
  backoff: {
    type: 'exponential',    // Exponential backoff
    delay: 2000,            // Initial delay: 2 seconds
    // Delays: 2s, 4s, 8s
  },
}
```

### Failed Job Handling

```typescript
// src/jobs/failed-job-handler.ts
import { icsSyncQueue, googleCalendarSyncQueue } from './queues';
import logger from '../utils/logger';

icsSyncQueue.on('failed', (job, error) => {
  logger.error('ICS sync job failed', {
    jobId: job.id,
    calendarId: job.data.calendar_id,
    attempts: job.attemptsMade,
    error: error.message,
  });

  // Send alert if all retries exhausted
  if (job.attemptsMade >= job.opts.attempts) {
    // TODO: Send email/Slack alert to admins
    logger.error('ICS sync job exhausted all retries', { jobId: job.id });
  }
});

googleCalendarSyncQueue.on('failed', (job, error) => {
  logger.error('Google Calendar sync job failed', {
    jobId: job.id,
    eventId: job.data.event_id,
    userId: job.data.user_id,
    error: error.message,
  });
});
```

### Stalled Job Detection

```typescript
// Jobs stuck in "active" state are automatically retried
icsSyncQueue.on('stalled', (job) => {
  logger.warn('ICS sync job stalled', { jobId: job.id, calendarId: job.data.calendar_id });
});
```

---

## MONITORING & OBSERVABILITY

### Bull Board (Web UI)

```typescript
// src/server.ts
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(icsSyncQueue),
    new BullAdapter(googleCalendarSyncQueue),
    new BullAdapter(trafficUpdateQueue),
    new BullAdapter(pushNotificationQueue),
    new BullAdapter(tokenRefreshQueue),
  ],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
```

Access at: `http://localhost:3000/admin/queues`

### Metrics Collection

```typescript
// src/jobs/metrics.ts
import { Counter, Gauge } from 'prom-client';

export const jobCompletedCounter = new Counter({
  name: 'jobs_completed_total',
  help: 'Total number of completed jobs',
  labelNames: ['queue', 'status'], // status: success | failed
});

export const jobDurationHistogram = new Histogram({
  name: 'job_duration_seconds',
  help: 'Job processing duration',
  labelNames: ['queue'],
});

export const activeJobsGauge = new Gauge({
  name: 'jobs_active',
  help: 'Number of active jobs',
  labelNames: ['queue'],
});

// Update metrics in job processor
icsSyncQueue.on('completed', (job, result) => {
  jobCompletedCounter.inc({ queue: 'ics-sync', status: 'success' });
  jobDurationHistogram.observe({ queue: 'ics-sync' }, (Date.now() - job.timestamp) / 1000);
});

icsSyncQueue.on('failed', (job, error) => {
  jobCompletedCounter.inc({ queue: 'ics-sync', status: 'failed' });
});
```

---

## TESTING

### Unit Tests

```typescript
// tests/jobs/ics-sync.test.ts
import { describe, it, expect, vi } from 'vitest';
import { processIcsSyncJob } from '../../src/jobs/ics-sync';

describe('ICS Sync Job', () => {
  it('should parse ICS feed and create events', async () => {
    const mockJob = {
      data: {
        calendar_id: 'test-calendar',
        ics_url: 'https://example.com/calendar.ics',
      },
    };

    // Mock axios response
    vi.mock('axios', () => ({
      get: vi.fn().mockResolvedValue({
        data: `BEGIN:VCALENDAR\n...END:VCALENDAR`,
      }),
    }));

    const result = await processIcsSyncJob(mockJob as any);

    expect(result.success).toBe(true);
    expect(result.eventsAdded).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
// tests/jobs/integration/queue.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { icsSyncQueue } from '../../src/jobs/queues';

describe('ICS Sync Queue Integration', () => {
  beforeAll(async () => {
    // Connect to test Redis
  });

  afterAll(async () => {
    await icsSyncQueue.close();
  });

  it('should add job to queue and process successfully', async () => {
    const job = await icsSyncQueue.add({
      calendar_id: 'test-calendar',
      ics_url: 'https://example.com/test.ics',
    });

    expect(job.id).toBeDefined();

    // Wait for job completion
    const result = await job.finished();
    expect(result.success).toBe(true);
  });
});
```

---

## SUMMARY CHECKLIST

### Queue Setup
- [ ] Bull queues configured for all job types
- [ ] Redis connection configured
- [ ] Default job options set (attempts, backoff)
- [ ] Concurrency limits configured per queue
- [ ] Job processors registered

### Job Types Implemented
- [ ] ICS Sync Job (fetch, parse, create/update/delete events)
- [ ] Google Calendar Sync Job (create/update/delete in Google Calendar)
- [ ] Traffic Recalculation Job (update drive times with current traffic)
- [ ] Push Notification Job (send reminders)
- [ ] Google Token Refresh Job (refresh access tokens)

### Scheduling
- [ ] ICS sync scheduled every 4 hours per calendar
- [ ] Traffic updates scheduled hourly for upcoming events
- [ ] Push notifications scheduled based on event times
- [ ] Token refresh scheduled every 7 days

### Error Handling
- [ ] Retry strategies configured (exponential backoff)
- [ ] Failed job handlers implemented
- [ ] Error logging configured
- [ ] Stalled job detection enabled

### Monitoring
- [ ] Bull Board web UI configured
- [ ] Prometheus metrics collected
- [ ] Failed job alerts configured
- [ ] Job duration tracking

### Testing
- [ ] Unit tests for each job processor
- [ ] Integration tests for queue operations
- [ ] Mock external APIs (ICS feeds, Google APIs)

---

**Phase 2 Complete!** Next: [Phase 3 Documents - External Integrations](./GOOGLE_MAPS_INTEGRATION.md)
