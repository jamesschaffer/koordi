import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      google_refresh_token_enc: data.google_refresh_token_enc,
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
      google_refresh_token_enc: refreshToken,
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
    // Update existing user with new tokens if provided
    if (refreshToken && calendarId) {
      user = await updateUserTokens(user.id, refreshToken, calendarId);
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
