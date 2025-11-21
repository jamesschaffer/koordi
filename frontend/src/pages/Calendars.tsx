import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCalendars, getChildren, createCalendar, createChild } from '../lib/api-calendars';
import { syncCalendar } from '../lib/api-events';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function Calendars() {
  const queryClient = useQueryClient();
  const token = localStorage.getItem('auth_token') || '';

  const [showCalendarForm, setShowCalendarForm] = useState(false);
  const [childMode, setChildMode] = useState<'existing' | 'new'>('existing');

  // Fetch calendars and children
  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: ['calendars'],
    queryFn: () => getCalendars(token),
  });

  const { data: children } = useQuery({
    queryKey: ['children'],
    queryFn: () => getChildren(token),
  });

  // Create calendar mutation
  const createCalendarMutation = useMutation({
    mutationFn: (data: { name: string; ics_url: string; child_id: string }) =>
      createCalendar(data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      setShowCalendarForm(false);
      toast.success('Calendar created successfully!');
    },
    onError: (error: any) => {
      toast.error('Failed to create calendar', {
        description: error.message || 'Please try again',
      });
    },
  });

  // Create child mutation
  const createChildMutation = useMutation({
    mutationFn: (data: { name: string }) => createChild(data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
    },
  });

  // Sync calendar mutation
  const syncCalendarMutation = useMutation({
    mutationFn: (calendarId: string) => syncCalendar(calendarId, token),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      toast.success('Calendar synced successfully!', {
        description: `${data.created} created, ${data.updated} updated, ${data.deleted} deleted`,
      });
    },
    onError: (error: any) => {
      toast.error('Failed to sync calendar', {
        description: error.message || 'Please try again',
      });
    },
  });

  const handleCreateCalendar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    let childId = formData.get('child_id') as string;

    // If creating a new child, create it first
    if (childMode === 'new') {
      const childName = formData.get('new_child_name') as string;
      if (!childName) return;

      try {
        const newChild = await createChildMutation.mutateAsync({ name: childName });
        childId = newChild.id;
      } catch (error) {
        console.error('Failed to create child:', error);
        toast.error('Failed to create child');
        return;
      }
    }

    // Then create the calendar
    createCalendarMutation.mutate({
      name: formData.get('name') as string,
      ics_url: formData.get('ics_url') as string,
      child_id: childId,
    });
  };

  if (calendarsLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Event Calendars</h1>
          <p className="text-muted-foreground mt-1">
            Manage your children's event calendars and sync their activities
          </p>
        </div>
        <Button onClick={() => {
          setChildMode((!children || children.length === 0) ? 'new' : 'existing');
          setShowCalendarForm(true);
        }}>
          + Add Calendar
        </Button>
      </div>

      {/* Calendar Form Modal */}
      {showCalendarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Add Event Calendar</CardTitle>
              <CardDescription>
                Connect an ICS calendar feed to track your child's events
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCreateCalendar}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Calendar Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Soccer Team Calendar"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ics_url">ICS Feed URL *</Label>
                  <Input
                    id="ics_url"
                    name="ics_url"
                    type="url"
                    placeholder="https://example.com/calendar.ics"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Child *</Label>

                  {/* Toggle between existing and new child */}
                  <div className="flex gap-4 mb-3">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="child_mode"
                        value="existing"
                        checked={childMode === 'existing'}
                        onChange={() => setChildMode('existing')}
                        className="mr-2"
                      />
                      <span className="text-sm">Select existing</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="child_mode"
                        value="new"
                        checked={childMode === 'new'}
                        onChange={() => setChildMode('new')}
                        className="mr-2"
                      />
                      <span className="text-sm">Create new</span>
                    </label>
                  </div>

                  {childMode === 'existing' ? (
                    <Select name="child_id" required={childMode === 'existing'}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a child" />
                      </SelectTrigger>
                      <SelectContent>
                        {children?.map((child) => (
                          <SelectItem key={child.id} value={child.id}>
                            {child.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      name="new_child_name"
                      placeholder="Enter child's name"
                      required={childMode === 'new'}
                    />
                  )}
                </div>
              </CardContent>

              <CardFooter className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCalendarForm(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createCalendarMutation.isPending || createChildMutation.isPending}
                  className="flex-1"
                >
                  {createCalendarMutation.isPending || createChildMutation.isPending
                    ? 'Creating...'
                    : 'Create Calendar'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* Calendars List */}
      {!calendars || calendars.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="pt-6">
            <p className="text-muted-foreground mb-2">No calendars yet</p>
            <p className="text-sm text-muted-foreground">
              Click "+ Add Calendar" to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {calendars.map((calendar) => (
            <Card key={calendar.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{calendar.name}</CardTitle>
                    <CardDescription>{calendar.child.name}</CardDescription>
                  </div>
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: calendar.color }}
                  />
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Owner:</span>
                    <span className="font-medium text-foreground">{calendar.owner.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Members:</span>
                    <Badge variant="secondary">{calendar.members.length}</Badge>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs truncate" title={calendar.ics_url}>
                      {calendar.ics_url}
                    </p>
                    {calendar.last_sync_at && (
                      <p className="text-xs mt-1">
                        Last synced: {new Date(calendar.last_sync_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  onClick={() => syncCalendarMutation.mutate(calendar.id)}
                  disabled={syncCalendarMutation.isPending}
                  className="w-full"
                  variant="default"
                >
                  {syncCalendarMutation.isPending ? 'Syncing...' : 'Sync Events'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default Calendars;
