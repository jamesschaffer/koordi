import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { google } from 'googleapis';
import { generateToken } from '../utils/jwt';
import { findOrCreateUser, GoogleUserProfile } from '../services/userService';
import { authenticateToken } from '../middleware/auth';
import { autoAcceptPendingInvitations } from '../services/invitationService';

const router = express.Router();

// In-memory store for OAuth state tokens (short-lived, 10 minutes)
// In production with multiple instances, use Redis instead
const oauthStateStore = new Map<string, { timestamp: number }>();

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  const TEN_MINUTES = 10 * 60 * 1000;
  for (const [state, data] of oauthStateStore.entries()) {
    if (now - data.timestamp > TEN_MINUTES) {
      oauthStateStore.delete(state);
    }
  }
}, 5 * 60 * 1000);

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
 *
 * We use prompt='select_account' to let users choose their Google account without
 * forcing the consent screen every time. For first-time users, Google will still
 * show the consent screen and return a refresh token. For returning users who have
 * already authorized, Google will skip consent and we'll use their stored refresh token.
 *
 * SECURITY: Uses state parameter to prevent CSRF attacks on OAuth flow.
 */
router.get('/google', (req: Request, res: Response) => {
  // Generate cryptographically secure state token for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');
  oauthStateStore.set(state, { timestamp: Date.now() });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // Use 'select_account' to let user pick account without forcing consent every time
    // First-time users will still see consent; returning users skip it
    prompt: 'select_account',
    state: state, // CSRF protection
  });

  res.json({ url: authUrl });
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback
 *
 * SECURITY: Validates state parameter to prevent CSRF attacks.
 */
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    // Validate state parameter (CSRF protection)
    if (!state || typeof state !== 'string') {
      console.error('OAuth callback: Missing state parameter');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/auth/error?message=Invalid authentication request`);
    }

    const storedState = oauthStateStore.get(state);
    if (!storedState) {
      console.error('OAuth callback: Invalid or expired state parameter');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/auth/error?message=Authentication session expired. Please try again.`);
    }

    // Remove used state (single-use)
    oauthStateStore.delete(state);

    // Check if state is expired (10 minutes)
    const TEN_MINUTES = 10 * 60 * 1000;
    if (Date.now() - storedState.timestamp > TEN_MINUTES) {
      console.error('OAuth callback: State parameter expired');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/auth/error?message=Authentication session expired. Please try again.`);
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

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
    // First-time users get a refresh token; returning users may not (they use stored token)
    const refreshToken: string | undefined = tokens.refresh_token || undefined;

    const user = await findOrCreateUser(
      {
        id: profile.id || '',
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
      } as GoogleUserProfile,
      refreshToken,
      primaryCalendar.id,
    );

    // Verify returning user has a stored refresh token if none was provided
    if (!refreshToken && !user.google_refresh_token_enc) {
      // Edge case: returning user with no stored token and none provided
      // This shouldn't happen normally, but handle gracefully by prompting re-auth
      console.error(`User ${user.email} has no refresh token stored and none was provided`);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/auth/error?message=Please re-authorize to enable calendar sync.`);
    }

    // Auto-accept any pending invitations for this email
    await autoAcceptPendingInvitations(user.id, user.email);

    // Generate JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
    });

    // Check if user needs to complete profile setup (home address required)
    const needsSetup = !user.home_address || !user.home_latitude || !user.home_longitude;

    // Redirect to frontend with token and setup flag
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const setupParam = needsSetup ? '&needs_setup=true' : '';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}${setupParam}`);
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

    // Don't send sensitive data (only exclude encrypted tokens and coordinates)
    const {
      google_refresh_token_enc,
      home_latitude,
      home_longitude,
      ...safeUser
    } = user;

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
