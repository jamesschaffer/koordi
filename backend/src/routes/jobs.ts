import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { syncCalendar, syncAllCalendars } from '../services/icsSyncService';
import { prisma } from '../lib/prisma';

const router = express.Router();

// Admin emails that can trigger sync-all (set via ADMIN_EMAILS env var, comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

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
 * Requires user email to be in ADMIN_EMAILS environment variable
 */
router.post('/sync/all', authenticateToken, async (req, res) => {
  try {
    // Admin authorization check
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return res.status(403).json({ error: 'Admin access required' });
    }

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
