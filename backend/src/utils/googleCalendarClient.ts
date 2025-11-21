import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { decrypt } from './encryption';

const prisma = new PrismaClient();

/**
 * Get an authenticated Google Calendar client for a user
 * @param userId - The user ID
 * @returns Google Calendar API client
 */
export async function getGoogleCalendarClient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      google_refresh_token_enc: true,
      google_calendar_sync_enabled: true,
    },
  });

  if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
    throw new Error('Google Calendar sync not enabled for user');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const refreshToken = decrypt(user.google_refresh_token_enc);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Check if Google Calendar sync is enabled for a user
 * @param userId - The user ID
 * @returns Boolean indicating if sync is enabled
 */
export async function isGoogleCalendarSyncEnabled(userId: string): Promise<boolean> {
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
}
