import { encrypt } from '../utils/encryption';
import { prisma } from '../lib/prisma';

export interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface CreateUserData {
  email: string;
  name: string;
  avatar_url?: string;
  google_refresh_token_enc?: string;
  google_calendar_id?: string;
}

export const findUserByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
  });
};

export const findUserById = async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
  });
};

export const createUser = async (data: CreateUserData) => {
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      avatar_url: data.avatar_url,
      google_refresh_token_enc: data.google_refresh_token_enc ? encrypt(data.google_refresh_token_enc) : undefined,
      google_calendar_id: data.google_calendar_id,
      google_calendar_sync_enabled: true,
    },
  });
};

export const updateUser = async (id: string, data: Partial<CreateUserData>) => {
  return prisma.user.update({
    where: { id },
    data,
  });
};

export const updateUserTokens = async (
  userId: string,
  refreshToken: string,
  calendarId: string,
) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      google_refresh_token_enc: encrypt(refreshToken),
      google_calendar_id: calendarId,
      google_calendar_sync_enabled: true,
    },
  });
};

// Find or create user from Google profile
export const findOrCreateUser = async (
  profile: GoogleUserProfile,
  refreshToken?: string,
  calendarId?: string,
) => {
  let user = await findUserByEmail(profile.email);

  if (user) {
    // For existing users, we need to handle two scenarios:
    // 1. New refresh token provided (first auth or re-auth with consent)
    // 2. No refresh token (returning user with existing token)

    if (refreshToken && calendarId) {
      // Update tokens and ensure sync is enabled
      user = await updateUserTokens(user.id, refreshToken, calendarId);
    } else if (calendarId) {
      // Returning user: No new refresh token, but update calendar ID and ensure sync is enabled
      // This fixes the bug where returning users had google_calendar_sync_enabled = false
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          google_calendar_id: calendarId,
          google_calendar_sync_enabled: true, // Ensure sync is enabled for returning users
        },
      });
    }
  } else {
    // Create new user
    user = await createUser({
      email: profile.email,
      name: profile.name,
      avatar_url: profile.picture,
      google_refresh_token_enc: refreshToken,
      google_calendar_id: calendarId,
    });
  }

  return user;
};

// Delete user account
export const deleteUser = async (userId: string) => {
  // Note: Prisma will handle cascading deletes based on schema
  return prisma.user.delete({
    where: { id: userId },
  });
};

// Update user address
export const updateUserAddress = async (
  userId: string,
  address: string,
  latitude?: number,
  longitude?: number,
) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      home_address: address,
      home_latitude: latitude,
      home_longitude: longitude,
    },
  });
};

// Update comfort buffer
export const updateUserComfortBuffer = async (userId: string, minutes: number) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      comfort_buffer_minutes: minutes,
    },
  });
};

// Update supplemental event retention
export const updateUserRetention = async (userId: string, keepSupplemental: boolean) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      keep_supplemental_events: keepSupplemental,
    },
  });
};
