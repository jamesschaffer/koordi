import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../contexts/SocketContext';
import { toast } from 'sonner';

// Socket event types (must match backend)
export enum SocketEvent {
  EVENT_ASSIGNED = 'event:assigned',
  EVENT_UNASSIGNED = 'event:unassigned',
  EVENT_CREATED = 'event:created',
  EVENT_UPDATED = 'event:updated',
  EVENT_DELETED = 'event:deleted',
  CALENDAR_SYNCED = 'calendar:synced',
  CALENDAR_SYNC_FAILED = 'calendar:sync_failed',
  MEMBER_ADDED = 'member:added',
  MEMBER_REMOVED = 'member:removed',
  INVITATION_RECEIVED = 'invitation:received',
}

interface EventAssignedPayload {
  event_id: string;
  event_title: string;
  assigned_to_user_id: string;
  start_time: string;
  end_time: string;
  event_calendar_id: string;
}

interface CalendarSyncedPayload {
  calendar_id: string;
  calendar_name: string;
  events_created: number;
  events_updated: number;
  events_deleted: number;
}

interface MemberAddedPayload {
  calendar_id: string;
  user_email: string;
  user_name: string;
}

export function useSocketEvents() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected) {
      return;
    }

    console.log('📡 Setting up WebSocket event listeners');

    // Event Assignment
    socket.on(SocketEvent.EVENT_ASSIGNED, (data: EventAssignedPayload) => {
      console.log('📌 Event assigned:', data);

      // Invalidate events queries to refetch
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', data.event_id] });

      // Show toast notification
      toast.success(`Event assigned: ${data.event_title}`, {
        description: `Event has been assigned`,
        duration: 4000,
      });
    });

    // Event Unassignment
    socket.on(SocketEvent.EVENT_UNASSIGNED, (data: EventAssignedPayload) => {
      console.log('📌 Event unassigned:', data);

      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', data.event_id] });

      toast.info(`Event unassigned: ${data.event_title}`, {
        description: `Event is now unassigned`,
        duration: 4000,
      });
    });

    // Event Created (from ICS sync)
    socket.on(SocketEvent.EVENT_CREATED, (data: any) => {
      console.log('✨ New event created:', data);

      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({
        queryKey: ['calendar', data.event_calendar_id],
      });

      toast.info('New event synced', {
        description: data.event_title,
        duration: 3000,
      });
    });

    // Event Updated
    socket.on(SocketEvent.EVENT_UPDATED, (data: any) => {
      console.log('📝 Event updated:', data);

      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', data.event_id] });

      toast.info('Event updated', {
        description: data.event_title,
        duration: 3000,
      });
    });

    // Event Deleted
    socket.on(SocketEvent.EVENT_DELETED, (data: any) => {
      console.log('🗑️ Event deleted:', data);

      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.removeQueries({ queryKey: ['event', data.event_id] });

      toast.info('Event deleted', {
        description: data.event_title,
        duration: 3000,
      });
    });

    // Calendar Synced
    socket.on(SocketEvent.CALENDAR_SYNCED, (data: CalendarSyncedPayload) => {
      console.log('🔄 Calendar synced:', data);

      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['calendars'] });

      const changes = [];
      if (data.events_created > 0) changes.push(`${data.events_created} created`);
      if (data.events_updated > 0) changes.push(`${data.events_updated} updated`);
      if (data.events_deleted > 0) changes.push(`${data.events_deleted} deleted`);

      if (changes.length > 0) {
        toast.success(`Calendar "${data.calendar_name}" synced`, {
          description: changes.join(', '),
          duration: 4000,
        });
      }
    });

    // Calendar Sync Failed
    socket.on(SocketEvent.CALENDAR_SYNC_FAILED, (data: any) => {
      console.error('❌ Calendar sync failed:', data);

      toast.error(`Failed to sync calendar: ${data.calendar_name}`, {
        description: data.error || 'Unknown error',
        duration: 5000,
      });
    });

    // Member Added
    socket.on(SocketEvent.MEMBER_ADDED, (data: MemberAddedPayload) => {
      console.log('👥 Member added:', data);

      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      queryClient.invalidateQueries({
        queryKey: ['calendar', data.calendar_id, 'members'],
      });

      toast.success('New member joined', {
        description: `${data.user_name} joined the calendar`,
        duration: 4000,
      });
    });

    // Member Removed
    socket.on(SocketEvent.MEMBER_REMOVED, (data: any) => {
      console.log('👥 Member removed:', data);

      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      queryClient.invalidateQueries({
        queryKey: ['calendar', data.calendar_id, 'members'],
      });

      toast.info('Member left', {
        description: `${data.user_name} left the calendar`,
        duration: 4000,
      });
    });

    // Invitation Received
    socket.on(SocketEvent.INVITATION_RECEIVED, (data: any) => {
      console.log('✉️ Invitation received:', data);

      queryClient.invalidateQueries({ queryKey: ['invitations'] });

      toast.info('New invitation received', {
        description: `You've been invited to join ${data.calendar_name}`,
        duration: 5000,
      });
    });

    // Cleanup listeners on unmount
    return () => {
      console.log('🧹 Cleaning up WebSocket event listeners');
      socket.off(SocketEvent.EVENT_ASSIGNED);
      socket.off(SocketEvent.EVENT_UNASSIGNED);
      socket.off(SocketEvent.EVENT_CREATED);
      socket.off(SocketEvent.EVENT_UPDATED);
      socket.off(SocketEvent.EVENT_DELETED);
      socket.off(SocketEvent.CALENDAR_SYNCED);
      socket.off(SocketEvent.CALENDAR_SYNC_FAILED);
      socket.off(SocketEvent.MEMBER_ADDED);
      socket.off(SocketEvent.MEMBER_REMOVED);
      socket.off(SocketEvent.INVITATION_RECEIVED);
    };
  }, [socket, isConnected, queryClient]);
}
