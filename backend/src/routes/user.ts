import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  updateUser,
  deleteUser,
  updateUserAddress,
  updateUserComfortBuffer,
  updateUserRetention,
} from '../services/userService';
import { handleRetentionToggleChange } from '../services/multiUserSyncService';

const router = express.Router();

/**
 * PATCH /api/users/me
 * Update user profile (name, email, avatar)
 */
router.patch('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, avatar_url } = req.body;

    const updatedUser = await updateUser(userId, {
      name,
      avatar_url,
    });

    // Don't send sensitive data
    const { google_refresh_token_enc, ...safeUser } = updatedUser;

    res.json(safeUser);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/me
 * Delete user account
 */
router.delete('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await deleteUser(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

/**
 * PATCH /api/users/me/settings/address
 * Update home address
 */
router.patch('/me/settings/address', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { address, latitude, longitude } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const updatedUser = await updateUserAddress(userId, address, latitude, longitude);

    const { google_refresh_token_enc, ...safeUser } = updatedUser;

    res.json(safeUser);
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

/**
 * PATCH /api/users/me/settings/comfort-buffer
 * Update comfort buffer (minutes)
 */
router.patch('/me/settings/comfort-buffer', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { comfort_buffer_minutes } = req.body;

    if (comfort_buffer_minutes === undefined || comfort_buffer_minutes < 0 || comfort_buffer_minutes > 60) {
      return res.status(400).json({ error: 'Comfort buffer must be between 0 and 60 minutes' });
    }

    const updatedUser = await updateUserComfortBuffer(userId, comfort_buffer_minutes);

    const { google_refresh_token_enc, ...safeUser } = updatedUser;

    res.json(safeUser);
  } catch (error) {
    console.error('Update comfort buffer error:', error);
    res.status(500).json({ error: 'Failed to update comfort buffer' });
  }
});

/**
 * PATCH /api/users/me/settings/retention
 * Update supplemental event retention setting
 * Retroactively syncs/unsyncs all supplemental events
 */
router.patch('/me/settings/retention', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { keep_supplemental_events } = req.body;

    if (typeof keep_supplemental_events !== 'boolean') {
      return res.status(400).json({ error: 'keep_supplemental_events must be a boolean' });
    }

    // Update the user's retention setting
    const updatedUser = await updateUserRetention(userId, keep_supplemental_events);

    // Trigger retroactive sync/unsync of all supplemental events
    // Run this in the background so it doesn't block the response
    handleRetentionToggleChange(userId, keep_supplemental_events).catch((error) => {
      console.error(`Failed to handle retention toggle change for user ${userId}:`, error);
    });

    const { google_refresh_token_enc, ...safeUser } = updatedUser;

    res.json(safeUser);
  } catch (error) {
    console.error('Update retention error:', error);
    res.status(500).json({ error: 'Failed to update retention setting' });
  }
});

/**
 * PATCH /api/users/me/settings/google-calendar-sync
 * Toggle Google Calendar sync on/off
 */
router.patch('/me/settings/google-calendar-sync', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    // Import prisma
    const { prisma } = await import('../lib/prisma');

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { google_calendar_sync_enabled: enabled },
    });

    const { google_refresh_token_enc, ...safeUser } = updatedUser;

    res.json(safeUser);
  } catch (error) {
    console.error('Update Google Calendar sync error:', error);
    res.status(500).json({ error: 'Failed to update Google Calendar sync setting' });
  }
});

export default router;
