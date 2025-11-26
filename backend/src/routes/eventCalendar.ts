import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as eventCalendarService from '../services/eventCalendarService';
import * as icsService from '../services/icsService';
import * as icsSyncService from '../services/icsSyncService';

const router = express.Router();

// In-memory lock to prevent concurrent syncs for the same calendar
// Maps calendarId -> Promise (sync in progress)
const syncLocks = new Map<string, Promise<any>>();

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

    // Perform initial sync synchronously to ensure events are available immediately
    // This prevents race conditions where the frontend queries for events before sync completes
    try {
      console.log(`[POST /calendars] Starting initial sync for calendar ${calendar.id}`);

      // Add timeout to prevent request hanging indefinitely
      // 90 seconds allows for large calendars and Google Calendar API batch operations
      const syncPromise = icsSyncService.syncCalendar(calendar.id);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Sync timeout after 90 seconds')), 90000)
      );

      const syncResult = await Promise.race([syncPromise, timeoutPromise]);

      if (!syncResult.success) {
        console.error(`[POST /calendars] Sync failed for calendar ${calendar.id}:`, syncResult.error);
        // Delete the calendar since sync failed
        await eventCalendarService.deleteEventCalendar(calendar.id, userId);
        return res.status(500).json({
          error: 'Failed to sync calendar events',
          details: syncResult.error
        });
      }

      console.log(`[POST /calendars] Successfully synced calendar ${calendar.id}: ${syncResult.eventsAdded} events added`);

      res.status(201).json({
        ...calendar,
        initialSync: {
          eventsAdded: syncResult.eventsAdded,
          eventsUpdated: syncResult.eventsUpdated,
          eventsDeleted: syncResult.eventsDeleted,
        }
      });
    } catch (error: any) {
      console.error(`[POST /calendars] Sync error for calendar ${calendar.id}:`, error);
      // Clean up calendar if sync fails
      try {
        await eventCalendarService.deleteEventCalendar(calendar.id, userId);
      } catch (deleteError) {
        console.error(`[POST /calendars] Failed to delete calendar after sync error:`, deleteError);
      }
      return res.status(500).json({
        error: 'Failed to sync calendar events',
        details: error.message
      });
    }
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

    // Validate that only the owner remains before allowing deletion
    const { prisma } = await import('../lib/prisma');
    const acceptedMemberCount = await prisma.eventCalendarMembership.count({
      where: {
        event_calendar_id: req.params.id,
        status: 'accepted',
      },
    });

    if (acceptedMemberCount > 1) {
      return res.status(400).json({
        error: 'Cannot delete calendar with multiple members',
        details: `This calendar has ${acceptedMemberCount} members. Remove all other members before deleting.`,
        memberCount: acceptedMemberCount,
      });
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
 *
 * Race Condition Prevention:
 * Uses in-memory lock to prevent concurrent sync requests for the same calendar.
 * If a sync is already in progress, returns 409 Conflict.
 */
router.post('/:id/sync', async (req: Request, res: Response) => {
  const calendarId = req.params.id;

  // Check if sync already in progress for this calendar
  if (syncLocks.has(calendarId)) {
    console.log(`[POST /calendars/${calendarId}/sync] Sync already in progress, rejecting concurrent request`);
    return res.status(409).json({
      error: 'Sync already in progress for this calendar',
      message: 'Another sync is currently running. Please wait for it to complete.',
      retryAfter: 5, // Suggest retry after 5 seconds
    });
  }

  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user has access to this calendar (BEFORE creating lock)
    const calendar = await eventCalendarService.getEventCalendarById(calendarId, userId);
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    // Create lock promise and store it
    console.log(`[POST /calendars/${calendarId}/sync] Starting sync, creating lock`);
    const syncPromise = icsSyncService.syncCalendar(calendarId);
    syncLocks.set(calendarId, syncPromise);

    // Execute sync
    const result = await syncPromise;

    console.log(`[POST /calendars/${calendarId}/sync] Sync completed successfully`);
    return res.json({
      message: 'Sync completed',
      created: result.eventsAdded,
      updated: result.eventsUpdated,
      deleted: result.eventsDeleted,
    });
  } catch (error: any) {
    console.error(`[POST /calendars/${calendarId}/sync] Sync error:`, error);
    return res.status(500).json({ error: error.message || 'Failed to sync calendar' });
  } finally {
    // Always clean up lock, even if sync failed
    console.log(`[POST /calendars/${calendarId}/sync] Removing lock`);
    syncLocks.delete(calendarId);
  }
});

export default router;
