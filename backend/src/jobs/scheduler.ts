import cron from 'node-cron';
import { icsSyncQueue } from '../config/queue';

/**
 * Initialize periodic calendar sync jobs
 */
export const initializeScheduler = () => {
  // Schedule calendar sync every 15 minutes
  // Cron pattern: */15 * * * * = every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ Scheduled sync triggered at', new Date().toISOString());

    try {
      // Add sync-all job to queue
      await icsSyncQueue.add(
        { type: 'all' },
        {
          attempts: 3, // Retry up to 3 times on failure
          backoff: {
            type: 'exponential',
            delay: 60000, // Start with 1 minute delay
          },
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 200, // Keep last 200 failed jobs
        }
      );

      console.log('✅ Sync job added to queue');
    } catch (error) {
      console.error('❌ Failed to add sync job to queue:', error);
    }
  });

  console.log('📅 Scheduler initialized: Calendar sync every 15 minutes');

  // Also add an immediate sync job on startup
  icsSyncQueue.add(
    { type: 'all' },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  ).then(() => {
    console.log('🚀 Initial sync job added to queue');
  }).catch((error) => {
    console.error('❌ Failed to add initial sync job:', error);
  });
};

/**
 * Manually trigger a sync for a specific calendar
 */
export const triggerCalendarSync = async (calendarId: string) => {
  return icsSyncQueue.add(
    { type: 'single', calendarId },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
};

/**
 * Manually trigger a sync for all calendars
 */
export const triggerAllCalendarsSync = async () => {
  return icsSyncQueue.add(
    { type: 'all' },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
};
