import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
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
} from '../services/invitationService';
import { SocketEvent, emitToCalendar } from '../config/socket';

const router = express.Router();

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
 */
router.post('/event-calendars/:calendarId/invitations', authenticateToken, async (req: Request, res: Response) => {
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
 * Accept an invitation
 */
router.post('/invitations/:token/accept', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const membership = await acceptInvitation(token, userId);

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
