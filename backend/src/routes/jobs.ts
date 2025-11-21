import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { icsSyncQueue } from '../config/queue';
import { triggerCalendarSync, triggerAllCalendarsSync } from '../jobs/scheduler';

const router = express.Router();

/**
 * Get job queue stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      icsSyncQueue.getWaitingCount(),
      icsSyncQueue.getActiveCount(),
      icsSyncQueue.getCompletedCount(),
      icsSyncQueue.getFailedCount(),
      icsSyncQueue.getDelayedCount(),
    ]);

    res.json({
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get recent jobs
 */
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const [completedJobs, failedJobs, activeJobs] = await Promise.all([
      icsSyncQueue.getCompleted(0, limit),
      icsSyncQueue.getFailed(0, limit),
      icsSyncQueue.getActive(0, limit),
    ]);

    const jobs = [
      ...activeJobs.map((job) => ({
        id: job.id,
        data: job.data,
        status: 'active',
        timestamp: job.timestamp,
        processedOn: job.processedOn,
      })),
      ...completedJobs.map((job) => ({
        id: job.id,
        data: job.data,
        status: 'completed',
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        returnvalue: job.returnvalue,
      })),
      ...failedJobs.map((job) => ({
        id: job.id,
        data: job.data,
        status: 'failed',
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      })),
    ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    res.json(jobs.slice(0, limit));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manually trigger sync for a specific calendar
 */
router.post('/sync/calendar/:calendarId', authenticateToken, async (req, res) => {
  try {
    const { calendarId } = req.params;

    const job = await triggerCalendarSync(calendarId);

    res.json({
      message: 'Sync job queued',
      jobId: job.id,
      calendarId,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manually trigger sync for all calendars
 */
router.post('/sync/all', authenticateToken, async (req, res) => {
  try {
    const job = await triggerAllCalendarsSync();

    res.json({
      message: 'Sync job queued for all calendars',
      jobId: job.id,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get details of a specific job
 */
router.get('/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await icsSyncQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();

    res.json({
      id: job.id,
      data: job.data,
      status: state,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attemptsMade: job.attemptsMade,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
