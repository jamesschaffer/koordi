import express, { Request, Response } from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth';
import { invitationRateLimiter } from '../middleware/invitationRateLimiter';
import {
  sendInvitation,
  getCalendarMembers,
  acceptInvitation,
  declineInvitation,
  resendInvitation,
  cancelInvitation,
  removeMember,
  getUserPendingInvitations,
  getFamilyMembers,
  sendBulkInvitations,
} from '../services/invitationService';
import { SocketEvent, emitToCalendar } from '../config/socket';
import * as icsSyncService from '../services/icsSyncService';

const router = express.Router();

// Configure multer for CSV file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024, // 1 MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

/**
 * GET /api/family-members
 * Get all family members (users who have ever been part of any of the user's calendars)
 */
router.get('/family-members', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const familyMembers = await getFamilyMembers(userId);

    res.json(familyMembers);
  } catch (error) {
    console.error('Get family members error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get family members' });
  }
});

/**
 * POST /api/event-calendars/:calendarId/invitations
 * Send an invitation to join an Event Calendar
 * Rate limited to 10 invitations per calendar per hour
 */
router.post(
  '/event-calendars/:calendarId/invitations',
  authenticateToken,
  invitationRateLimiter,
  async (req: Request, res: Response) => {
  try {
    const { calendarId } = req.params;
    const { email } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const invitation = await sendInvitation(calendarId, email, userId);

    // CRITICAL: If existing user was added directly (status='accepted'), sync events to their Google Calendar
    if (invitation.status === 'accepted' && invitation.user_id) {
      console.log(`[sendInvitation] Existing user added directly, syncing events to their Google Calendar`);

      // Sync all calendar events to the new member (same as accept endpoint)
      try {
        const syncPromise = icsSyncService.syncCalendarEventsToMembers(calendarId);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Event sync timeout after 90 seconds')), 90000)
        );

        await Promise.race([syncPromise, timeoutPromise]);
        console.log(`[sendInvitation] Successfully synced all events to ${invitation.invited_email}`);
      } catch (syncError) {
        console.error(`[sendInvitation] Failed to sync events to ${invitation.invited_email}:`, syncError);
        // Don't fail the invitation if sync fails - events can be synced later
      }
    }

    // Broadcast WebSocket event
    const io = req.app.get('io');
    if (io) {
      if (invitation.status === 'accepted') {
        // Existing user was added directly - broadcast MEMBER_ADDED
        emitToCalendar(io, calendarId, SocketEvent.MEMBER_ADDED, {
          calendar_id: calendarId,
          user_id: invitation.user_id,
          user_email: invitation.invited_email,
        });
      } else if (invitation.status === 'pending') {
        // Pending invitation created - broadcast INVITATION_RECEIVED
        emitToCalendar(io, calendarId, SocketEvent.INVITATION_RECEIVED, {
          calendar_id: calendarId,
          invited_email: invitation.invited_email,
        });
      }
    }

    res.status(201).json(invitation);
  } catch (error) {
    console.error('Send invitation error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

/**
 * POST /api/event-calendars/:calendarId/invitations/bulk
 * Send bulk invitations from a CSV file
 * CSV format: One email per line (or comma-separated)
 */
router.post(
  '/event-calendars/:calendarId/invitations/bulk',
  authenticateToken,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { calendarId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'CSV file is required' });
      }

      // Parse CSV file
      const csvContent = req.file.buffer.toString('utf-8');
      const lines = csvContent.split(/\r?\n/);
      const emails: string[] = [];

      // Extract emails from CSV (supports both comma-separated and one-per-line)
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Split by comma for comma-separated values
        const parts = trimmedLine.split(',');
        for (const part of parts) {
          const email = part.trim();
          if (email) {
            emails.push(email);
          }
        }
      }

      if (emails.length === 0) {
        return res.status(400).json({ error: 'No email addresses found in CSV file' });
      }

      // Process bulk invitations
      const result = await sendBulkInvitations(calendarId, emails, userId);

      // Broadcast WebSocket events for successful invitations
      const io = req.app.get('io');
      if (io) {
        result.results
          .filter(r => r.success)
          .forEach(() => {
            emitToCalendar(io, calendarId, SocketEvent.INVITATION_RECEIVED, {
              calendar_id: calendarId,
            });
          });
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Bulk invitation error:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to process bulk invitations' });
    }
  }
);

/**
 * GET /api/event-calendars/:calendarId/members
 * Get all members and pending invitations for an Event Calendar
 */
router.get('/event-calendars/:calendarId/members', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { calendarId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const members = await getCalendarMembers(calendarId, userId);

    res.json(members);
  } catch (error) {
    console.error('Get members error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get members' });
  }
});

/**
 * GET /api/invitations/pending
 * Get current user's pending invitations
 */
router.get('/invitations/pending', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invitations = await getUserPendingInvitations(userId);

    res.json(invitations);
  } catch (error) {
    console.error('Get pending invitations error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to get invitations' });
  }
});

/**
 * POST /api/invitations/:token/accept
 * Accept an invitation and sync all calendar events to the new member's Google Calendar
 */
router.post('/invitations/:token/accept', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Accept the invitation (updates membership status to 'accepted')
    const membership = await acceptInvitation(token, userId);

    console.log(`[acceptInvitation] User ${userId} accepted invitation for calendar ${membership.event_calendar.id}`);

    // Sync all existing calendar events to the new member's Google Calendar
    // Use the same timeout pattern as calendar creation (90 seconds)
    const syncPromise = icsSyncService.syncCalendarEventsToMembers(membership.event_calendar.id);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Event sync timeout after 90 seconds')), 90000)
    );

    await Promise.race([syncPromise, timeoutPromise]);

    console.log(`[acceptInvitation] Successfully synced all events to new member ${userId}`);

    res.json(membership);
  } catch (error) {
    console.error('Accept invitation error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

/**
 * POST /api/invitations/:token/decline
 * Decline an invitation
 */
router.post('/invitations/:token/decline', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const membership = await declineInvitation(token, userId);

    res.json(membership);
  } catch (error) {
    console.error('Decline invitation error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

/**
 * POST /api/invitations/:id/resend
 * Resend an invitation email
 */
router.post('/invitations/:id/resend', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invitation = await resendInvitation(id, userId);

    res.json(invitation);
  } catch (error) {
    console.error('Resend invitation error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

/**
 * DELETE /api/invitations/:id
 * Cancel a pending invitation
 */
router.delete('/invitations/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await cancelInvitation(id, userId);

    res.status(204).send();
  } catch (error) {
    console.error('Cancel invitation error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to cancel invitation' });
  }
});

/**
 * DELETE /api/memberships/:id
 * Remove a member from an Event Calendar
 */
router.delete('/memberships/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await removeMember(id, userId);

    // Broadcast member removal to all calendar members via WebSocket
    const io = req.app.get('io');
    if (io && result) {
      emitToCalendar(io, result.calendarId, SocketEvent.MEMBER_REMOVED, {
        calendar_id: result.calendarId,
        user_name: result.userName,
        user_email: result.userEmail,
      });

      // If events were reassigned, broadcast those updates too
      if (result.reassignedEventIds && result.reassignedEventIds.length > 0) {
        // Broadcast event reassignment for each event
        result.reassignedEventIds.forEach((eventId) => {
          emitToCalendar(io, result.calendarId, SocketEvent.EVENT_ASSIGNED, {
            event_id: eventId,
            assigned_to_user_id: result.ownerId,
            event_calendar_id: result.calendarId,
          });
        });
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error('Remove member error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
