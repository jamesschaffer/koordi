import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvents, assignEvent, checkEventConflicts } from '../lib/api-events';
import { getCalendars } from '../lib/api-calendars';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, User, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

function Dashboard() {
  const token = localStorage.getItem('auth_token') || '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'mine'>('all');
  const [selectedCalendar, setSelectedCalendar] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>('');

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

  // Assignment mutation
  const assignMutation = useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string | null }) =>
      assignEvent(eventId, userId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast({
        title: 'Success',
        description: 'Event assignment updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to assign event',
        variant: 'destructive',
      });
    },
  });

  // Handle assignment with conflict check
  const handleAssign = async (eventId: string, userId: string | null) => {
    if (userId) {
      try {
        const { hasConflicts, conflicts } = await checkEventConflicts(eventId, userId, token);
        if (hasConflicts) {
          const confirmAssign = window.confirm(
            `Warning: This assignment will create ${conflicts.length} scheduling conflict(s). Continue anyway?`
          );
          if (!confirmAssign) return;
        }
      } catch (error) {
        console.error('Failed to check conflicts:', error);
      }
    }
    assignMutation.mutate({ eventId, userId });
  };

  // Get unique members from all calendars
  const allMembers = calendars?.reduce((acc, cal) => {
    cal.members.forEach((member) => {
      if (!acc.find((m) => m.id === member.user.id)) {
        acc.push(member.user);
      }
    });
    return acc;
  }, [] as Array<{ id: string; name: string; email: string }>);

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
        <p className="text-muted-foreground mt-1">
          View and manage all events from your children's calendars
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Filter tabs */}
            <div className="flex gap-2">
              <Button
                onClick={() => setFilter('all')}
                variant={filter === 'all' ? 'default' : 'outline'}
              >
                All Events
              </Button>
              <Button
                onClick={() => setFilter('unassigned')}
                variant={filter === 'unassigned' ? 'default' : 'outline'}
              >
                Unassigned
              </Button>
              <Button
                onClick={() => setFilter('mine')}
                variant={filter === 'mine' ? 'default' : 'outline'}
              >
                My Events
              </Button>
            </div>

            {/* Additional filters */}
            <div className="flex gap-4 flex-wrap items-center">
              {/* Calendar filter */}
              <div className="flex-1 min-w-[200px]">
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
              <div className="flex gap-2 items-center">
                <label className="text-sm font-medium">From:</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-sm font-medium">To:</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40"
                />
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
            <p className="text-muted-foreground mb-2">No events found</p>
            <p className="text-sm text-muted-foreground">
              {filter === 'all'
                ? 'Add a calendar and sync it to see events'
                : filter === 'unassigned'
                ? 'All events are currently assigned'
                : 'You have no assigned events'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-1 h-12 rounded-full shrink-0"
                        style={{ backgroundColor: event.event_calendar.color }}
                      />
                      <div>
                        <CardTitle className="text-lg">{event.title}</CardTitle>
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
                  <div className="ml-4 flex flex-col gap-2 items-end">
                    <Select
                      value={event.assigned_to_user_id || 'unassigned'}
                      onValueChange={(value) =>
                        handleAssign(event.id, value === 'unassigned' ? null : value)
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue>
                          {event.assigned_to ? (
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              {event.assigned_to.email}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Unassigned</span>
                            </div>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            Unassigned
                          </div>
                        </SelectItem>
                        {allMembers?.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4" />
                              {member.email}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
