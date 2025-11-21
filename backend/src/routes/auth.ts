import express, { Request, Response } from 'express';
import { google } from 'googleapis';
import { generateToken } from '../utils/jwt';
import { findOrCreateUser, GoogleUserProfile } from '../services/userService';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Initialize Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow
 */
router.get('/google', (req: Request, res: Response) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });

  res.json({ url: authUrl });
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      return res.status(400).json({ error: 'No refresh token received' });
    }

    // Get user profile
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });

    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.email || !profile.name) {
      return res.status(400).json({ error: 'Failed to get user profile' });
    }

    // Get calendar ID (primary calendar)
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { data: calendarList } = await calendar.calendarList.list();
    const primaryCalendar = calendarList.items?.find((cal) => cal.primary);

    if (!primaryCalendar?.id) {
      return res.status(400).json({ error: 'Failed to access calendar' });
    }

    // Create or update user
    const user = await findOrCreateUser(
      {
        id: profile.id || '',
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      } as GoogleUserProfile,
      tokens.refresh_token,
      primaryCalendar.id,
    );

    // Generate JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=Authentication failed`);
  }
});

/**
 * GET /api/auth/me
 * Get current user info (protected route)
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { findUserById } = await import('../services/userService');
    const user = await findUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't send sensitive data
    const { google_refresh_token_enc, ...safeUser } = user;

    res.json(safeUser);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client should remove token)
 */
router.post('/logout', authenticateToken, (req: Request, res: Response) => {
  // In a JWT system, logout is handled client-side by removing the token
  // Could add token blacklist here if needed
  res.json({ message: 'Logged out successfully' });
});

export default router;
