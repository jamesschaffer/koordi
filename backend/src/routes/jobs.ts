import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { syncCalendar, syncAllCalendars } from '../services/icsSyncService';

const router = express.Router();

/**
 * Get sync status
 * Note: With on-demand sync (no background jobs), this just returns current status
 */
router.get('/stats', authenticateToken, async (req, res) => {
  res.json({
    mode: 'on-demand',
    message: 'Calendar sync is triggered on app load. No background jobs.',
  });
});

/**
 * Manually trigger sync for a specific calendar
 */
router.post('/sync/calendar/:calendarId', authenticateToken, async (req, res) => {
  try {
    const { calendarId } = req.params;

    const result = await syncCalendar(calendarId);

    res.json({
      message: result.success ? 'Sync completed' : 'Sync failed',
      calendarId,
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manually trigger sync for all calendars (admin only)
 */
router.post('/sync/all', authenticateToken, async (req, res) => {
  try {
    const result = await syncAllCalendars();

    res.json({
      message: 'Sync completed for all calendars',
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
