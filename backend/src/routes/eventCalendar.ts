import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as eventCalendarService from '../services/eventCalendarService';
import * as icsService from '../services/icsService';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/calendars
 * Get all event calendars for the authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const calendars = await eventCalendarService.getUserEventCalendars(userId);
    res.json(calendars);
  } catch (error) {
    console.error('Get calendars error:', error);
    res.status(500).json({ error: 'Failed to fetch calendars' });
  }
});

/**
 * GET /api/calendars/:id
 * Get single event calendar
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const calendar = await eventCalendarService.getEventCalendarById(req.params.id, userId);

    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    res.json(calendar);
  } catch (error) {
    console.error('Get calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

/**
 * POST /api/calendars
 * Create new event calendar
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, ics_url, child_id, color } = req.body;

    if (!name || !ics_url || !child_id) {
      return res.status(400).json({
        error: 'Missing required fields: name, ics_url, child_id'
      });
    }

    const calendar = await eventCalendarService.createEventCalendar({
      name,
      ics_url,
      child_id,
      owner_id: userId,
      color,
    });

    // Trigger initial sync asynchronously (don't wait for completion)
    // This allows the user to see their calendar immediately while events load in background
    icsService.syncEventCalendar(calendar.id).catch((error) => {
      console.error(`Failed to auto-sync new calendar ${calendar.id}:`, error);
    });

    res.status(201).json(calendar);
  } catch (error) {
    console.error('Create calendar error:', error);
    res.status(500).json({ error: 'Failed to create calendar' });
  }
});

/**
 * PATCH /api/calendars/:id
 * Update event calendar
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, ics_url, color, sync_enabled } = req.body;

    const calendar = await eventCalendarService.updateEventCalendar(
      req.params.id,
      userId,
      { name, ics_url, color, sync_enabled },
    );

    res.json(calendar);
  } catch (error: any) {
    console.error('Update calendar error:', error);
    if (error.message.includes('not found') || error.message.includes('not the owner')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update calendar' });
  }
});

/**
 * DELETE /api/calendars/:id
 * Delete event calendar
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await eventCalendarService.deleteEventCalendar(req.params.id, userId);
    res.json({ message: 'Calendar deleted successfully' });
  } catch (error: any) {
    console.error('Delete calendar error:', error);
    if (error.message.includes('not found') || error.message.includes('not the owner')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete calendar' });
  }
});

/**
 * POST /api/calendars/validate-ics
 * Validate an ICS feed URL
 */
router.post('/validate-ics', async (req: Request, res: Response) => {
  try {
    const { ics_url } = req.body;

    if (!ics_url) {
      return res.status(400).json({ error: 'ics_url is required' });
    }

    const result = await icsService.validateICSFeed(ics_url);
    res.json(result);
  } catch (error: any) {
    console.error('Validate ICS error:', error);
    res.status(500).json({ error: 'Failed to validate ICS feed' });
  }
});

/**
 * POST /api/calendars/:id/sync
 * Manually trigger sync for an event calendar
 */
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user has access to this calendar
    const calendar = await eventCalendarService.getEventCalendarById(req.params.id, userId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const result = await icsService.syncEventCalendar(req.params.id);
    res.json({
      message: 'Sync completed',
      ...result,
    });
  } catch (error: any) {
    console.error('Sync calendar error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync calendar' });
  }
});

export default router;
