import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as eventService from '../services/eventService';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/events
 * Get all events for the authenticated user
 * Query params:
 * - calendar_id: Filter by calendar
 * - start_date: Filter events starting after this date
 * - end_date: Filter events starting before this date
 * - unassigned: Only show unassigned events
 * - assigned_to_me: Only show events assigned to me
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const filters: any = {};

    if (req.query.calendar_id) {
      filters.calendarId = req.query.calendar_id as string;
    }

    if (req.query.start_date) {
      filters.startDate = new Date(req.query.start_date as string);
    }

    if (req.query.end_date) {
      filters.endDate = new Date(req.query.end_date as string);
    }

    if (req.query.unassigned === 'true') {
      filters.unassignedOnly = true;
    }

    if (req.query.assigned_to_me === 'true') {
      filters.assignedToMe = true;
    }

    const events = await eventService.getUserEvents(userId, filters);
    res.json(events);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/events/:id
 * Get single event details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = await eventService.getEventById(req.params.id, userId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

/**
 * PATCH /api/events/:id/assign
 * Assign or unassign an event
 * Body: { assigned_to_user_id: string | null }
 */
router.patch('/:id/assign', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { assigned_to_user_id } = req.body;

    const event = await eventService.assignEvent(
      req.params.id,
      userId,
      assigned_to_user_id
    );

    res.json(event);
  } catch (error: any) {
    console.error('Assign event error:', error);
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to assign event' });
  }
});

/**
 * GET /api/events/:id/conflicts
 * Check for conflicts if assigning event to a user
 * Query params: assign_to_user_id (required)
 */
router.get('/:id/conflicts', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { assign_to_user_id } = req.query;

    if (!assign_to_user_id || typeof assign_to_user_id !== 'string') {
      return res.status(400).json({ error: 'assign_to_user_id is required' });
    }

    const conflicts = await eventService.checkEventConflicts(
      req.params.id,
      assign_to_user_id,
      userId
    );

    res.json({ conflicts, hasConflicts: conflicts.length > 0 });
  } catch (error: any) {
    console.error('Check conflicts error:', error);
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to check conflicts' });
  }
});

export default router;
