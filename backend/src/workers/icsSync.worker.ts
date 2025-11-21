import { Job } from 'bull';
import { icsSyncQueue } from '../config/queue';
import { syncCalendar, syncAllCalendars } from '../services/icsSyncService';

// Job data types
interface SyncCalendarJobData {
  type: 'single';
  calendarId: string;
}

interface SyncAllCalendarsJobData {
  type: 'all';
}

type IcsSyncJobData = SyncCalendarJobData | SyncAllCalendarsJobData;

/**
 * Process ICS sync jobs
 */
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

console.log('🔄 ICS Sync Worker started');

export default icsSyncQueue;
