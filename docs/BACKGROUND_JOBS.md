# Background Jobs Specification
## Koordi

**Purpose:** Specification for asynchronous background job processing
**Technology:** Bull Queue + Redis + node-cron
**Job Types:** ICS calendar sync (primary job type)

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [Bull Queue Architecture](#bull-queue-architecture)
3. [ICS Sync Job](#ics-sync-job)
4. [Invitation Cleanup Job](#invitation-cleanup-job)
5. [Error Handling & Retries](#error-handling--retries)
6. [Monitoring & Observability](#monitoring--observability)

---

## OVERVIEW

### Background Jobs Purpose

Background jobs handle time-intensive or scheduled operations that shouldn't block HTTP requests:

1. **ICS Sync Job:** Fetch and parse ICS feeds every 5 minutes (all calendars) or on-demand (single calendar)
2. **Invitation Cleanup Job:** Remove expired invitations daily at 2 AM

**Note:** Google Calendar sync is performed synchronously during ICS sync, not as separate background jobs.

### Technology Stack

- **Bull:** Robust queue library for Node.js
- **Redis:** Job storage and queue management
- **node-cron:** Scheduled job triggers (cron-style scheduling)

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
                           │
                           ▼
              ┌──────────────────────┐
              │   ICS Sync Worker    │
              └──────────────────────┘
```

### Queue Configuration

```typescript
// src/config/queue.ts
import Bull from 'bull';

// Redis connection via URL
const redisConfig = {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
};

// Single queue for ICS calendar sync jobs
export const icsSyncQueue = new Bull('ics-sync', redisConfig);

// Queue event handlers for monitoring
icsSyncQueue.on('error', (error) => {
  console.error('❌ ICS Sync Queue Error:', error);
});

icsSyncQueue.on('waiting', (jobId) => {
  console.log(`⏳ Job ${jobId} is waiting`);
});

icsSyncQueue.on('active', (job) => {
  console.log(`🔄 Job ${job.id} has started processing`);
});

icsSyncQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

icsSyncQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

icsSyncQueue.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} has stalled`);
});
```

---

## ICS SYNC JOB

### Purpose

Fetch and parse ICS feeds to import/update events, then sync to Google Calendar for all members.

### Schedule

**Frequency:** Every 5 minutes (all calendars) via `node-cron`
**On Startup:** Initial sync job runs immediately

### Job Data Schema

```typescript
interface SyncCalendarJobData {
  type: 'single';
  calendarId: string;
}

interface SyncAllCalendarsJobData {
  type: 'all';
}

type IcsSyncJobData = SyncCalendarJobData | SyncAllCalendarsJobData;
```

### Worker Implementation

```typescript
// src/workers/icsSync.worker.ts
import { Job } from 'bull';
import { icsSyncQueue } from '../config/queue';
import { syncCalendar, syncAllCalendars } from '../services/icsSyncService';

icsSyncQueue.process(async (job: Job<IcsSyncJobData>) => {
  console.log(`🔄 Processing ICS sync job ${job.id}`, job.data);

  try {
    if (job.data.type === 'single') {
      // Sync a single calendar
      const result = await syncCalendar(job.data.calendarId);

      if (!result.success) {
        throw new Error(result.error || 'Sync failed');
      }

      return {
        type: 'single',
        calendarId: job.data.calendarId,
        eventsAdded: result.eventsAdded,
        eventsUpdated: result.eventsUpdated,
        eventsDeleted: result.eventsDeleted,
      };
    } else if (job.data.type === 'all') {
      // Sync all calendars
      const result = await syncAllCalendars();

      return {
        type: 'all',
        totalCalendars: result.totalCalendars,
        successCount: result.successCount,
        errorCount: result.errorCount,
        results: result.results,
      };
    } else {
      throw new Error('Invalid job type');
    }
  } catch (error: any) {
    console.error(`❌ ICS sync job ${job.id} failed:`, error);
    throw error; // Re-throw to mark job as failed
  }
});
```

### Scheduler

```typescript
// src/jobs/scheduler.ts
import cron from 'node-cron';
import { icsSyncQueue } from '../config/queue';
import { cleanupExpiredInvitations } from '../services/invitationService';

export const initializeScheduler = () => {
  // Schedule calendar sync every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Scheduled sync triggered at', new Date().toISOString());

    try {
      await icsSyncQueue.add(
        { type: 'all' },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60000, // Start with 1 minute delay
          },
          removeOnComplete: 100,
          removeOnFail: 200,
        }
      );
      console.log('✅ Sync job added to queue');
    } catch (error) {
      console.error('❌ Failed to add sync job to queue:', error);
    }
  });

  console.log('📅 Scheduler initialized: Calendar sync every 5 minutes');

  // Initial sync on startup
  icsSyncQueue.add({ type: 'all' }, { /* retry options */ });
};
```

### Manual Trigger Functions

```typescript
// Trigger sync for a specific calendar
export const triggerCalendarSync = async (calendarId: string) => {
  return icsSyncQueue.add(
    { type: 'single', calendarId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
};

// Trigger sync for all calendars
export const triggerAllCalendarsSync = async () => {
  return icsSyncQueue.add(
    { type: 'all' },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
};
```

---

## INVITATION CLEANUP JOB

### Purpose

Remove expired invitations from the database. Invitations expire after 30 days.

### Schedule

**Frequency:** Daily at 2:00 AM via `node-cron`

### Implementation

```typescript
// In src/jobs/scheduler.ts
cron.schedule('0 2 * * *', async () => {
  console.log('🧹 Scheduled cleanup of expired invitations at', new Date().toISOString());

  try {
    await cleanupExpiredInvitations();
  } catch (error) {
    console.error('❌ Failed to cleanup expired invitations:', error);
  }
});
```

---

## ERROR HANDLING & RETRIES

### Retry Configuration

Jobs are configured with exponential backoff:

```typescript
{
  attempts: 3,               // Maximum retry attempts
  backoff: {
    type: 'exponential',
    delay: 60000,            // Initial delay: 1 minute
    // Delays: 1min, 2min, 4min
  },
  removeOnComplete: 100,     // Keep last 100 completed jobs
  removeOnFail: 200,         // Keep last 200 failed jobs
}
```

### Queue Event Handlers

```typescript
icsSyncQueue.on('error', (error) => {
  console.error('❌ ICS Sync Queue Error:', error);
});

icsSyncQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

icsSyncQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

icsSyncQueue.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} has stalled`);
});
```

---

## MONITORING & OBSERVABILITY

### Console Logging

The current implementation uses console logging for job status:
- `⏳` Job waiting
- `🔄` Job started
- `✅` Job completed
- `❌` Job failed
- `⚠️` Job stalled

### Future Monitoring Improvements

Potential additions for production:
- Bull Board web UI for queue visualization
- Prometheus metrics for job counts and durations
- Alerting for failed jobs via Slack/email

---

## SUMMARY

### Current Implementation
- ✅ Single Bull queue for ICS sync
- ✅ node-cron scheduler for 5-minute sync intervals
- ✅ Invitation cleanup daily at 2 AM
- ✅ Retry with exponential backoff
- ✅ Basic console logging

### Not Yet Implemented
- ❌ Separate Google Calendar sync queue (handled synchronously in ICS sync)
- ❌ Traffic recalculation jobs
- ❌ Push notification jobs
- ❌ Google token refresh jobs
- ❌ Bull Board UI
- ❌ Prometheus metrics

---

**Note:** Google Calendar synchronization is currently performed synchronously within the ICS sync process, not as separate background jobs.
