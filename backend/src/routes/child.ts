import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as childService from '../services/childService';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/children
 * Get all children accessible to the authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const children = await childService.getUserChildren(userId);
    res.json(children);
  } catch (error) {
    console.error('Get children error:', error);
    res.status(500).json({ error: 'Failed to fetch children' });
  }
});

/**
 * GET /api/children/:id
 * Get single child
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const child = await childService.getChildById(req.params.id, userId);

    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }

    res.json(child);
  } catch (error) {
    console.error('Get child error:', error);
    res.status(500).json({ error: 'Failed to fetch child' });
  }
});

/**
 * POST /api/children
 * Create new child
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, date_of_birth, photo_url } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Child name is required' });
    }

    const child = await childService.createChild({
      name,
      date_of_birth: date_of_birth ? new Date(date_of_birth) : undefined,
      photo_url,
    });

    res.status(201).json(child);
  } catch (error) {
    console.error('Create child error:', error);
    res.status(500).json({ error: 'Failed to create child' });
  }
});

/**
 * PATCH /api/children/:id
 * Update child
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, date_of_birth, photo_url } = req.body;

    const child = await childService.updateChild(req.params.id, userId, {
      name,
      date_of_birth: date_of_birth ? new Date(date_of_birth) : undefined,
      photo_url,
    });

    res.json(child);
  } catch (error: any) {
    console.error('Update child error:', error);
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update child' });
  }
});

/**
 * DELETE /api/children/:id
 * Delete child
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await childService.deleteChild(req.params.id, userId);
    res.json({ message: 'Child deleted successfully' });
  } catch (error: any) {
    console.error('Delete child error:', error);
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('existing event calendars')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete child' });
  }
});

export default router;
