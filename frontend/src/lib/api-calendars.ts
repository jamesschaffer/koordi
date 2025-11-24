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
    id: string;
    status: 'pending' | 'accepted' | 'declined';
    user: {
      id: string;
      name: string;
      email: string;
    };
  }>;
  _count?: {
    members: number;
  };
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

// Invitation APIs
export interface Membership {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  invited_email: string;
  invited_at: string;
  responded_at?: string;
  invitation_token?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  };
  invited_by: {
    name: string;
    email: string;
  };
  event_calendar?: {
    id: string;
    name: string;
    child: {
      name: string;
    };
    owner: {
      name: string;
      email: string;
      avatar_url?: string;
    };
  };
}

export interface CalendarMembers {
  owner: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
  };
  members: Membership[];
  analytics: {
    total: number;
    accepted: number;
    declined: number;
    pending: number;
    expired: number;
  };
}

export const sendInvitation = (calendarId: string, email: string, token: string) =>
  apiClient.post<Membership>(`/event-calendars/${calendarId}/invitations`, { email }, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getCalendarMembers = (calendarId: string, token: string) =>
  apiClient.get<CalendarMembers>(`/event-calendars/${calendarId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getPendingInvitations = (token: string) =>
  apiClient.get<Membership[]>('/invitations/pending', {
    headers: { Authorization: `Bearer ${token}` },
  });

export const acceptInvitation = (invitationToken: string, token: string) =>
  apiClient.post<Membership>(`/invitations/${invitationToken}/accept`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const declineInvitation = (invitationToken: string, token: string) =>
  apiClient.post<Membership>(`/invitations/${invitationToken}/decline`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const resendInvitation = (invitationId: string, token: string) =>
  apiClient.post<Membership>(`/invitations/${invitationId}/resend`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const cancelInvitation = (invitationId: string, token: string) =>
  apiClient.delete(`/invitations/${invitationId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const removeMember = (membershipId: string, token: string) =>
  apiClient.delete(`/memberships/${membershipId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getFamilyMembers = (token: string) =>
  apiClient.get(`/family-members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
