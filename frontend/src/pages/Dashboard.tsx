import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvents, assignEvent, checkEventConflicts, resolveConflict } from '../lib/api-events';
import type { Event, ConcurrentModificationError } from '../lib/api-events';
import { getCalendars } from '../lib/api-calendars';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, User, AlertTriangle, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ConflictWarningDialog } from '../components/ConflictWarningDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function Dashboard() {
  const token = localStorage.getItem('auth_token') || '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'mine'>('all');
  const [selectedCalendar, setSelectedCalendar] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>('');
  const [conflictDialog, setConflictDialog] = useState<{
    open: boolean;
    conflicts: Event[];
    onConfirm: () => void;
    assigneeName?: string;
  }>({
    open: false,
    conflicts: [],
    onConfirm: () => {},
  });

  // State for version conflict (optimistic locking)
  const [versionConflict, setVersionConflict] = useState<{
    eventId: string;
    eventTitle: string;
    currentState: ConcurrentModificationError['details']['current_state'];
  } | null>(null);

  // Track which event is currently being assigned (for loading state)
  const [pendingAssignmentEventId, setPendingAssignmentEventId] = useState<string | null>(null);

  // Fetch calendars for filter dropdown
  const { data: calendars } = useQuery({
    queryKey: ['calendars'],
    queryFn: () => getCalendars(token),
  });

  // Fetch events based on filters
  const { data: events, isLoading } = useQuery({
    queryKey: ['events', filter, selectedCalendar, startDate, endDate],
    queryFn: () =>
      getEvents(token, {
        calendar_id: selectedCalendar === 'all' ? undefined : selectedCalendar,
        unassigned: filter === 'unassigned',
        assigned_to_me: filter === 'mine',
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
  });

  // Fetch unassigned count separately (for badge display)
  const { data: unassignedEvents } = useQuery({
    queryKey: ['events', 'unassigned-count', startDate, endDate],
    queryFn: () =>
      getEvents(token, {
        unassigned: true,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
  });

  const unassignedCount = unassignedEvents?.length || 0;

  // Assignment mutation with optimistic locking
  const assignMutation = useMutation({
    mutationFn: ({ eventId, userId, expectedVersion }: {
      eventId: string;
      userId: string | null;
      expectedVersion: number;
    }) =>
      assignEvent(eventId, userId, expectedVersion, token),
    onSuccess: () => {
      setPendingAssignmentEventId(null);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast({
        title: 'Success',
        description: 'Event assignment updated',
      });
    },
    onError: (error: any) => {
      setPendingAssignmentEventId(null);
      // Handle concurrent modification (HTTP 409)
      if (error.response?.status === 409 && error.response?.data?.code === 'CONCURRENT_MODIFICATION') {
        const conflictData = error.response.data as ConcurrentModificationError;
        setVersionConflict({
          eventId: conflictData.details.current_state.id,
          eventTitle: conflictData.details.current_state.title,
          currentState: conflictData.details.current_state,
        });
      } else {
        toast({
          title: 'Error',
          description: error.response?.data?.error || 'Failed to assign event',
          variant: 'destructive',
        });
      }
    },
  });

  // Resolve conflict mutation
  const resolveConflictMutation = useMutation({
    mutationFn: ({
      event1Id,
      event2Id,
      reason,
      assignedUserId,
    }: {
      event1Id: string;
      event2Id: string;
      reason: 'same_location' | 'other';
      assignedUserId: string;
    }) => resolveConflict(event1Id, event2Id, reason, assignedUserId, token),
    onSuccess: async () => {
      // Force immediate refetch to update UI with deleted supplemental events
      await queryClient.refetchQueries({ queryKey: ['events'] });
      toast({
        title: 'Conflict Resolved',
        description: 'The conflict has been cleared',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to resolve conflict',
        variant: 'destructive',
      });
    },
  });

  // Handle assignment with conflict check and optimistic locking
  const handleAssign = async (eventId: string, userId: string | null) => {
    // Find the event to get its version
    const event = events?.find((e) => e.id === eventId);
    if (!event) {
      toast({
        title: 'Error',
        description: 'Event not found',
        variant: 'destructive',
      });
      return;
    }

    // Set loading state immediately
    setPendingAssignmentEventId(eventId);

    if (userId) {
      try {
        const { hasConflicts, conflicts } = await checkEventConflicts(eventId, userId, token);
        if (hasConflicts) {
          // Clear loading state since we're showing a dialog
          setPendingAssignmentEventId(null);
          // Find assignee name
          const assignee = allMembers?.find((m) => m.id === userId);

          // Show conflict dialog instead of window.confirm
          setConflictDialog({
            open: true,
            conflicts,
            assigneeName: assignee?.name || assignee?.email,
            onConfirm: () => {
              setPendingAssignmentEventId(eventId);
              assignMutation.mutate({ eventId, userId, expectedVersion: event.version });
            },
          });
          return;
        }
      } catch (error) {
        console.error('Failed to check conflicts:', error);
        setPendingAssignmentEventId(null);
        return;
      }
    }
    assignMutation.mutate({ eventId, userId, expectedVersion: event.version });
  };

  // Get unique members from all calendars
  const allMembers = calendars?.reduce((acc, cal) => {
    cal.members.forEach((member) => {
      if (member.user && !acc.find((m) => m.id === member.user.id)) {
        acc.push(member.user);
      }
    });
    return acc;
  }, [] as Array<{ id: string; name: string; email: string; avatar_url?: string | null }>);

  // Helper function to parse arrival time from event description
  const parseArrivalTime = (description: string | undefined, eventStartTime: string): Date | null => {
    if (!description) return null;

    // Look for "Arrival Time: HH:MM AM/PM" pattern
    const arrivalMatch = description.match(/Arrival Time:\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!arrivalMatch) return null;

    let hours = parseInt(arrivalMatch[1]);
    const minutes = parseInt(arrivalMatch[2]);
    const meridiem = arrivalMatch[3].toUpperCase();

    // Convert to 24-hour format
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    // Use the event's start date
    const eventDate = new Date(eventStartTime);
    const arrivalTime = new Date(eventDate);
    arrivalTime.setHours(hours, minutes, 0, 0);

    return arrivalTime;
  };

  // Detect conflicts between events for the same assignee, including drive times
  const eventsWithConflicts = useMemo(() => {
    if (!events || events.length === 0) return {};

    // Group events by assignee
    const eventsByAssignee = events.reduce((acc, event) => {
      if (event.assigned_to_user_id) {
        if (!acc[event.assigned_to_user_id]) {
          acc[event.assigned_to_user_id] = [];
        }
        acc[event.assigned_to_user_id].push(event);
      }
      return acc;
    }, {} as Record<string, Event[]>);

    // For each event, check if it conflicts with any other event for the same assignee
    const conflicts: Record<string, string[]> = {}; // event.id -> [conflicting event ids]

    Object.values(eventsByAssignee).forEach((userEvents) => {
      for (let i = 0; i < userEvents.length; i++) {
        for (let j = i + 1; j < userEvents.length; j++) {
          const event1 = userEvents[i];
          const event2 = userEvents[j];

          // Calculate full time windows using supplemental events
          // Backend always returns supplemental events (no privacy filtering for conflict detection)

          // Get supplemental events for both events
          const departure1 = event1.supplemental_events?.find(e => e.type === 'departure');
          const buffer1 = event1.supplemental_events?.find(e => e.type === 'buffer');
          const return1 = event1.supplemental_events?.find(e => e.type === 'return');
          const departure2 = event2.supplemental_events?.find(e => e.type === 'departure');
          const buffer2 = event2.supplemental_events?.find(e => e.type === 'buffer');
          const return2 = event2.supplemental_events?.find(e => e.type === 'return');

          // Calculate effective start time:
          // 1. Use departure supplemental event if it exists
          // 2. Use buffer supplemental event if it exists
          // 3. For unassigned events with location, estimate drive time
          // 4. Otherwise use main event start time
          const start1 = departure1
            ? new Date(departure1.start_time).getTime()
            : buffer1
              ? new Date(buffer1.start_time).getTime()
              : !event1.assigned_to_user_id && event1.location
                ? (() => {
                    const arrival1 = parseArrivalTime(event1.description, event1.start_time);
                    return arrival1
                      ? arrival1.getTime()
                      : new Date(event1.start_time).getTime() - (30 * 60000);
                  })()
                : new Date(event1.start_time).getTime();

          const start2 = departure2
            ? new Date(departure2.start_time).getTime()
            : buffer2
              ? new Date(buffer2.start_time).getTime()
              : !event2.assigned_to_user_id && event2.location
                ? (() => {
                    const arrival2 = parseArrivalTime(event2.description, event2.start_time);
                    return arrival2
                      ? arrival2.getTime()
                      : new Date(event2.start_time).getTime() - (30 * 60000);
                  })()
                : new Date(event2.start_time).getTime();

          // Calculate effective end time:
          // 1. Use return supplemental event if it exists
          // 2. For unassigned events with location, estimate drive time
          // 3. Otherwise use main event end time
          const end1 = return1
            ? new Date(return1.end_time).getTime()
            : !event1.assigned_to_user_id && event1.location
              ? new Date(event1.end_time).getTime() + (30 * 60000)
              : new Date(event1.end_time).getTime();

          const end2 = return2
            ? new Date(return2.end_time).getTime()
            : !event2.assigned_to_user_id && event2.location
              ? new Date(event2.end_time).getTime() + (30 * 60000)
              : new Date(event2.end_time).getTime();

          // Events conflict if their full time windows overlap or touch
          // Two time windows conflict if start1 <= end2 AND end1 >= start2
          if (start1 <= end2 && end1 >= start2) {
            // Mark both events as conflicting with each other
            if (!conflicts[event1.id]) conflicts[event1.id] = [];
            if (!conflicts[event2.id]) conflicts[event2.id] = [];
            conflicts[event1.id].push(event2.id);
            conflicts[event2.id].push(event1.id);
          }
        }
      }
    });

    return conflicts;
  }, [events]);

  const formatDateTime = (dateString: string, isAllDay: boolean) => {
    const date = new Date(dateString);
    if (isAllDay) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Filter tabs */}
            <div className="flex gap-2">
              <Button
                onClick={() => setFilter('unassigned')}
                variant={filter === 'unassigned' ? 'default' : 'outline'}
                className="relative"
              >
                Unassigned
                {unassignedCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-medium px-1.5">
                    {unassignedCount > 99 ? '99+' : unassignedCount}
                  </span>
                )}
              </Button>
              <Button
                onClick={() => setFilter('mine')}
                variant={filter === 'mine' ? 'default' : 'outline'}
              >
                My Events
              </Button>
              <Button
                onClick={() => setFilter('all')}
                variant={filter === 'all' ? 'default' : 'outline'}
              >
                All Events
              </Button>
            </div>

            {/* Additional filters */}
            <div className="flex flex-col md:flex-row gap-4 md:flex-wrap md:items-center">
              {/* Calendar filter */}
              <div className="w-full md:flex-1 md:min-w-[200px]">
                <Select value={selectedCalendar} onValueChange={setSelectedCalendar}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Calendars" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Calendars</SelectItem>
                    {calendars?.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        {calendar.name} ({calendar.child.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range filters */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex gap-2 items-center">
                  <label className="text-sm font-medium shrink-0">From:</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full sm:w-40"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-sm font-medium shrink-0">To:</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full sm:w-40"
                  />
                </div>
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartDate(new Date().toISOString().split('T')[0]);
                    setEndDate('');
                  }}
                >
                  Clear Dates
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events List */}
      {!events || events.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="pt-6">
            {(!calendars || calendars.length === 0) ? (
              <div className="space-y-4">
                <p className="text-muted-foreground">Add your first calendar</p>
                <p className="text-sm text-muted-foreground">
                  Once you add a calendar you can view and manage events with Google Calendar
                </p>
                <Button onClick={() => navigate('/calendars?action=add')}>+ Add Calendar</Button>
              </div>
            ) : (
              <>
                <p className="text-muted-foreground mb-2">No events found</p>
                <p className="text-sm text-muted-foreground">
                  {filter === 'all'
                    ? 'No upcoming events in your calendars'
                    : filter === 'unassigned'
                    ? 'All events are currently assigned'
                    : 'You have no assigned events'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filter === 'unassigned' && (
            <p className="text-lg text-muted-foreground">
              📅 Please assign who is responsible for these events
            </p>
          )}
          {events.map((event: Event, index: number) => {
            const conflicts = eventsWithConflicts as Record<string, string[]>;
            const hasConflict = conflicts[event.id]?.length > 0;
            const conflictingEventIds = conflicts[event.id] || [];

            // Find the next event in the list
            const nextEvent = index < events.length - 1 ? events[index + 1] : null;
            const showConflictBetween = nextEvent && conflictingEventIds.includes(nextEvent.id);

            return (
              <div key={event.id}>
                <Card className={`hover:shadow-md transition-shadow ${hasConflict ? 'border-amber-300 border-2' : ''}`}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row items-start md:justify-between gap-4">
                      <div className="flex-1 w-full">
                        <div className="flex items-center gap-3 mb-4">
                          <div
                            className="w-1 h-12 rounded-full shrink-0"
                            style={{ backgroundColor: event.event_calendar.color }}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg">{event.title}</CardTitle>
                              {hasConflict && (
                                <Badge variant="destructive" className="bg-amber-600">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Conflict
                                </Badge>
                              )}
                            </div>
                            <CardDescription>
                              {event.event_calendar.child.name} • {event.event_calendar.name}
                            </CardDescription>
                          </div>
                        </div>

                    <div className="ml-4 space-y-2">
                      {/* Date/Time */}
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>
                          {formatDateTime(event.start_time, event.is_all_day)}
                          {!event.is_all_day && (
                            <> - {formatDateTime(event.end_time, event.is_all_day)}</>
                          )}
                        </span>
                      </div>

                      {/* Location */}
                      {event.location && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span>{event.location}</span>
                        </div>
                      )}

                      {/* Description */}
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-2">{event.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Assignment Controls */}
                  <div className="w-full md:w-auto md:ml-4 flex flex-col gap-2 items-stretch md:items-end">
                    {(() => {
                      const isAssigning = pendingAssignmentEventId === event.id;
                      return (
                        <Select
                          value={event.assigned_to_user_id || 'unassigned'}
                          onValueChange={(value) =>
                            handleAssign(event.id, value === 'unassigned' ? null : value)
                          }
                          disabled={isAssigning}
                        >
                          <SelectTrigger className="w-full md:w-64" disabled={isAssigning}>
                            <SelectValue>
                              {isAssigning ? (
                                <div className="flex items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span className="text-muted-foreground">Updating...</span>
                                </div>
                              ) : event.assigned_to ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarImage src={event.assigned_to.avatar_url || undefined} alt={event.assigned_to.name} />
                                    <AvatarFallback className="text-xs">
                                      {event.assigned_to.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col items-start text-left">
                                    <span className="text-sm font-medium leading-tight">{event.assigned_to.name}</span>
                                    <span className="text-xs text-muted-foreground leading-tight">{event.assigned_to.email}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                    <User className="w-3 h-3 text-muted-foreground" />
                                  </div>
                                  <span className="text-muted-foreground">Unassigned</span>
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                  <User className="w-3 h-3 text-muted-foreground" />
                                </div>
                                <span>Unassigned</span>
                              </div>
                            </SelectItem>
                            {allMembers?.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarImage src={member.avatar_url || undefined} alt={member.name} />
                                    <AvatarFallback className="text-xs">
                                      {member.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col items-start">
                                    <span className="text-sm font-medium leading-tight">{member.name}</span>
                                    <span className="text-xs text-muted-foreground leading-tight">{member.email}</span>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Inline conflict warning between events */}
            {showConflictBetween && nextEvent && (
              <div className="flex items-center justify-center py-2 gap-2">
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800 rounded-full text-sm font-medium text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    Scheduling conflict with "{nextEvent.title}" for{' '}
                    {event.assigned_to?.email || 'this assignee'}
                  </span>
                </div>

                {/* Clear Conflict Button */}
                <Select
                  onValueChange={(reason) => {
                    if (event.assigned_to_user_id) {
                      resolveConflictMutation.mutate({
                        event1Id: event.id,
                        event2Id: nextEvent.id,
                        reason: reason as 'same_location' | 'other',
                        assignedUserId: event.assigned_to_user_id,
                      });
                    }
                  }}
                >
                  <SelectTrigger className="w-40 h-8 bg-white dark:bg-gray-800">
                    <SelectValue placeholder="Clear Conflict" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same_location">Same Location</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
            );
          })}
        </div>
      )}

      {/* Conflict Warning Dialog */}
      <ConflictWarningDialog
        open={conflictDialog.open}
        onOpenChange={(open) => setConflictDialog({ ...conflictDialog, open })}
        conflicts={conflictDialog.conflicts}
        onConfirm={conflictDialog.onConfirm}
        assigneeName={conflictDialog.assigneeName}
      />

      {/* Version Conflict Dialog (Optimistic Locking) */}
      <AlertDialog open={!!versionConflict} onOpenChange={() => setVersionConflict(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Event Was Modified
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                The event "{versionConflict?.eventTitle}" has been modified by another user since you last viewed it.
              </p>
              {versionConflict?.currentState.assigned_to ? (
                <div className="p-3 bg-muted rounded-md">
                  <p className="font-medium text-sm text-foreground mb-1">Current Assignment:</p>
                  <p className="text-sm">
                    Assigned to: <span className="font-medium">{versionConflict.currentState.assigned_to.name}</span>
                    {' '}({versionConflict.currentState.assigned_to.email})
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm">The event is currently <span className="font-medium">unassigned</span>.</p>
                </div>
              )}
              <p className="text-sm">
                Please refresh the event list to see the latest changes and try again.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setVersionConflict(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setVersionConflict(null);
                queryClient.invalidateQueries({ queryKey: ['events'] });
              }}
            >
              Refresh Events
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Dashboard;
