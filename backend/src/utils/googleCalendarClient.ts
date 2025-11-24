import { google } from 'googleapis';
import { decrypt, isEncryptionConfigured } from './encryption';
import { prisma } from '../lib/prisma';
import {
  AuthenticationError,
  ConfigurationError,
  NotFoundError,
  getErrorMessage,
} from './errors';

/**
 * Get an authenticated Google Calendar client for a user
 * @param userId - The user ID
 * @returns Google Calendar API client
 * @throws {ConfigurationError} If encryption or OAuth is not configured
 * @throws {NotFoundError} If user is not found
 * @throws {AuthenticationError} If user doesn't have valid Google credentials
 */
export async function getGoogleCalendarClient(userId: string) {
  // Check encryption configuration
  if (!isEncryptionConfigured()) {
    throw new ConfigurationError(
      'Encryption is not properly configured. Cannot decrypt Google tokens.',
      { userId }
    );
  }

  // Validate OAuth configuration
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new ConfigurationError(
      'Google OAuth credentials not configured',
      {
        hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      }
    );
  }

  // Fetch user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      google_refresh_token_enc: true,
      google_calendar_sync_enabled: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  if (!user.google_calendar_sync_enabled) {
    throw new AuthenticationError(
      'Google Calendar sync is not enabled for this user',
      { userId }
    );
  }

  if (!user.google_refresh_token_enc) {
    throw new AuthenticationError(
      'User has not connected their Google Calendar account',
      { userId }
    );
  }

  // Decrypt and authenticate
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const refreshToken = decrypt(user.google_refresh_token_enc);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  } catch (error) {
    // Re-throw our custom errors as-is
    if (error instanceof Error && error.name.endsWith('Error')) {
      throw error;
    }

    // Wrap other errors
    throw new AuthenticationError(
      'Failed to create Google Calendar client',
      {
        userId,
        error: getErrorMessage(error),
      }
    );
  }
}

/**
 * Check if Google Calendar sync is enabled for a user
 * @param userId - The user ID
 * @returns Boolean indicating if sync is enabled
 */
export async function isGoogleCalendarSyncEnabled(userId: string): Promise<boolean> {
  // If encryption isn't configured, sync can't work
  if (!isEncryptionConfigured()) {
    return false;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        google_calendar_sync_enabled: true,
        google_refresh_token_enc: true,
      },
    });

    return Boolean(
      user &&
        user.google_calendar_sync_enabled &&
        user.google_refresh_token_enc
    );
  } catch (error) {
    console.error(`Error checking Google Calendar sync status for user ${userId}:`, error);
    return false;
  }
}
