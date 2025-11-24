import { apiClient } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  home_address?: string;
  home_latitude?: number;
  home_longitude?: number;
  comfort_buffer_minutes: number;
  keep_supplemental_events: boolean;
  google_calendar_id?: string;
  google_calendar_sync_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const getMe = async (token: string): Promise<User> => {
  return apiClient.get<User>('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateProfile = async (data: { name?: string; avatar_url?: string }, token: string): Promise<User> => {
  return apiClient.patch<User>('/users/me', data, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateAddress = async (
  data: { address: string; latitude?: number; longitude?: number },
  token: string
): Promise<User> => {
  return apiClient.patch<User>('/users/me/settings/address', data, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateComfortBuffer = async (minutes: number, token: string): Promise<User> => {
  return apiClient.patch<User>('/users/me/settings/comfort-buffer', { comfort_buffer_minutes: minutes }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateRetention = async (keepSupplemental: boolean, token: string): Promise<User> => {
  return apiClient.patch<User>('/users/me/settings/retention', { keep_supplemental_events: keepSupplemental }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const updateGoogleCalendarSync = async (enabled: boolean, token: string): Promise<User> => {
  return apiClient.patch<User>('/users/me/settings/google-calendar-sync', { enabled }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const deleteAccount = async (token: string): Promise<void> => {
  return apiClient.delete('/users/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
