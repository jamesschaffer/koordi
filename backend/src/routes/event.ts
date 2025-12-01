import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as eventService from '../services/eventService';
import { SocketEvent, emitToCalendar } from '../config/socket';
import { deleteSupplementalEventsByType } from '../services/supplementalEventService';
import { deleteSupplementalEventsForParent } from '../services/googleCalendarSyncService';
import { ConcurrentModificationError } from '../errors/ConcurrentModificationError';
import { parseDateInTimezone, DEFAULT_TIMEZONE } from '../utils/dateUtils';
import { prisma } from '../lib/prisma';

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
 * - exclude_past: Exclude events that have already ended (end_time < now)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;
    console.log(`[GET /api/events] Request from user: ${userEmail} (${userId})`);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch user's timezone for date parsing
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const userTimezone = user?.timezone || DEFAULT_TIMEZONE;

    const filters: any = {};

    if (req.query.calendar_id) {
      filters.calendarId = req.query.calendar_id as string;
    }

    // Parse dates in user's timezone so "2025-11-27" means Nov 27 in their timezone
    if (req.query.start_date) {
      const dateStr = req.query.start_date as string;
      filters.startDate = parseDateInTimezone(dateStr, userTimezone, false); // Start of day
      console.log(`[GET /api/events] start_date ${dateStr} parsed as ${filters.startDate.toISOString()} (timezone: ${userTimezone})`);
    }

    if (req.query.end_date) {
      const dateStr = req.query.end_date as string;
      filters.endDate = parseDateInTimezone(dateStr, userTimezone, true); // End of day (23:59:59.999)
      console.log(`[GET /api/events] end_date ${dateStr} parsed as ${filters.endDate.toISOString()} (timezone: ${userTimezone})`);
    }

    if (req.query.unassigned === 'true') {
      filters.unassignedOnly = true;
    }

    if (req.query.assigned_to_me === 'true') {
      filters.assignedToMe = true;
    }

    if (req.query.exclude_past === 'true') {
      filters.excludePast = true;
    }

    console.log(`[GET /api/events] Filters:`, JSON.stringify(filters));

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
 * Assign or unassign an event with optimistic locking
 * Body: {
 *   assigned_to_user_id: string | null,
 *   expected_version?: number,  // Optional version for race condition protection
 *   skip?: boolean  // Optional flag to mark as "Not Attending"
 * }
 */
router.patch('/:id/assign', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { assigned_to_user_id, expected_version, skip } = req.body;

    const event = await eventService.assignEvent(
      req.params.id,
      userId,
      assigned_to_user_id,
      expected_version, // Pass version for optimistic locking
      skip // Pass skip flag for "Not Attending"
    );

    // Broadcast assignment change to all calendar members via WebSocket
    const io = req.app.get('io');
    if (io) {
      const socketEvent = event.assigned_to_user_id
        ? SocketEvent.EVENT_ASSIGNED
        : SocketEvent.EVENT_UNASSIGNED;

      emitToCalendar(io, event.event_calendar_id, socketEvent, {
        event_id: event.id,
        event_title: event.title,
        assigned_to_user_id: event.assigned_to_user_id,
        is_skipped: event.is_skipped,
        start_time: event.start_time,
        end_time: event.end_time,
        event_calendar_id: event.event_calendar_id,
      });
    }

    res.json(event);
  } catch (error: any) {
    console.error('Assign event error:', error);

    // Handle concurrent modification (optimistic locking failure)
    if (error instanceof ConcurrentModificationError) {
      return res.status(409).json({  // HTTP 409 Conflict
        error: 'Event was modified by another user',
        code: 'CONCURRENT_MODIFICATION',
        details: {
          expected_version: error.expectedVersion,
          actual_version: error.actualVersion,
          current_state: error.currentState,
        },
        message: 'The event has been updated since you last viewed it. Please refresh and try again.',
      });
    }

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

/**
 * POST /api/events/resolve-conflict
 * Resolve a conflict between two events
 * Body: {
 *   event1_id: string,
 *   event2_id: string,
 *   reason: 'same_location' | 'other',
 *   assigned_user_id: string
 * }
 */
router.post('/resolve-conflict', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { event1_id, event2_id, reason, assigned_user_id } = req.body;

    if (!event1_id || !event2_id || !reason || !assigned_user_id) {
      return res.status(400).json({ error: 'event1_id, event2_id, reason, and assigned_user_id are required' });
    }

    // Verify user has access to both events
    const event1 = await eventService.getEventById(event1_id, userId);
    const event2 = await eventService.getEventById(event2_id, userId);

    if (!event1 || !event2) {
      return res.status(404).json({ error: 'One or both events not found' });
    }

    if (reason === 'same_location') {
      // Delete return (drive-home) for event1 and departure (drive-to) for event2
      // This allows them to stay at the same location between events

      // Delete from Google Calendar FIRST (needs to query database for google_event_id)
      try {
        await deleteSupplementalEventsForParent(event1_id, undefined, ['return']);
        await deleteSupplementalEventsForParent(event2_id, undefined, ['departure']);
      } catch (error) {
        console.error('Failed to delete from Google Calendar:', error);
        // Continue with database deletion even if Google Calendar fails
      }

      // Then delete from database
      await deleteSupplementalEventsByType(event1_id, ['return']);
      await deleteSupplementalEventsByType(event2_id, ['departure']);

      console.log(`Resolved same-location conflict between events ${event1_id} and ${event2_id}`);
    }
    // Future: handle 'other' reason types

    // Broadcast conflict resolution to all calendar members via WebSocket
    const io = req.app.get('io');
    if (io) {
      // Emit to both calendars in case events are from different calendars
      emitToCalendar(io, event1.event_calendar_id, SocketEvent.CONFLICT_RESOLVED, {
        event1_id,
        event2_id,
        reason,
      });

      if (event2.event_calendar_id !== event1.event_calendar_id) {
        emitToCalendar(io, event2.event_calendar_id, SocketEvent.CONFLICT_RESOLVED, {
          event1_id,
          event2_id,
          reason,
        });
      }
    }

    res.json({ success: true, message: 'Conflict resolved' });
  } catch (error: any) {
    console.error('Resolve conflict error:', error);
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

export default router;
