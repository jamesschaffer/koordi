import { apiClient } from './api';

export interface Child {
  id: string;
  name: string;
  date_of_birth?: string;
  photo_url?: string;
}

export interface EventCalendar {
  id: string;
  name: string;
  ics_url: string;
  color: string;
  sync_enabled: boolean;
  last_sync_at?: string;
  last_sync_status?: string;
  child: Child;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  members: Array<{
    user: {
      id: string;
      name: string;
      email: string;
    };
  }>;
}

export interface CreateCalendarData {
  name: string;
  ics_url: string;
  child_id: string;
  color?: string;
}

export interface CreateChildData {
  name: string;
  date_of_birth?: string;
  photo_url?: string;
}

// Calendar APIs
export const getCalendars = (token: string) =>
  apiClient.get<EventCalendar[]>('/calendars', {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getCalendar = (id: string, token: string) =>
  apiClient.get<EventCalendar>(`/calendars/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const createCalendar = (data: CreateCalendarData, token: string) =>
  apiClient.post<EventCalendar>('/calendars', data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateCalendar = (id: string, data: Partial<CreateCalendarData>, token: string) =>
  apiClient.patch<EventCalendar>(`/calendars/${id}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteCalendar = (id: string, token: string) =>
  apiClient.delete(`/calendars/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

// ICS Validation
export interface ICSValidation {
  valid: boolean;
  calendar_name?: string;
  event_count?: number;
  date_range?: {
    start: string;
    end: string;
  };
  error?: string;
}

export const validateICS = (ics_url: string, token: string) =>
  apiClient.post<ICSValidation>('/calendars/validate-ics', { ics_url }, {
    headers: { Authorization: `Bearer ${token}` },
  });

// Children APIs
export const getChildren = (token: string) =>
  apiClient.get<Child[]>('/children', {
    headers: { Authorization: `Bearer ${token}` },
  });

export const createChild = (data: CreateChildData, token: string) =>
  apiClient.post<Child>('/children', data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateChild = (id: string, data: Partial<CreateChildData>, token: string) =>
  apiClient.patch<Child>(`/children/${id}`, data, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const deleteChild = (id: string, token: string) =>
  apiClient.delete(`/children/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
