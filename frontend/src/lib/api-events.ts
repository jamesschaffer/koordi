import { apiClient } from './api';

export interface Event {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  assigned_to_user_id?: string;
  event_calendar: {
    id: string;
    name: string;
    color: string;
    child: {
      id: string;
      name: string;
    };
  };
  assigned_to?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  };
}

export interface SyncResult {
  message: string;
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
}

// Event APIs
export const getEvents = (token: string, params?: {
  calendar_id?: string;
  start_date?: string;
  end_date?: string;
  unassigned?: boolean;
  assigned_to_me?: boolean;
}) => {
  const queryParams = new URLSearchParams();
  if (params?.calendar_id) queryParams.append('calendar_id', params.calendar_id);
  if (params?.start_date) queryParams.append('start_date', params.start_date);
  if (params?.end_date) queryParams.append('end_date', params.end_date);
  if (params?.unassigned) queryParams.append('unassigned', 'true');
  if (params?.assigned_to_me) queryParams.append('assigned_to_me', 'true');

  const query = queryParams.toString();
  return apiClient.get<Event[]>(`/events${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const getEvent = (id: string, token: string) =>
  apiClient.get<Event>(`/events/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const assignEvent = (id: string, assignedToUserId: string | null, token: string) =>
  apiClient.patch<Event>(
    `/events/${id}/assign`,
    { assigned_to_user_id: assignedToUserId },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

export const checkEventConflicts = (eventId: string, assignToUserId: string, token: string) =>
  apiClient.get<{ conflicts: Event[]; hasConflicts: boolean }>(
    `/events/${eventId}/conflicts?assign_to_user_id=${assignToUserId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

export const syncCalendar = (calendarId: string, token: string) =>
  apiClient.post<SyncResult>(
    `/calendars/${calendarId}/sync`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
