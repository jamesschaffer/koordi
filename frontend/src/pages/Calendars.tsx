import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCalendars,
  getChildren,
  createCalendar,
  createChild,
  updateCalendar,
  deleteCalendar,
  validateICS,
  type ICSValidation,
} from '../lib/api-calendars';
import { syncCalendar } from '../lib/api-events';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Pencil, Trash2, RefreshCw, AlertCircle, CheckCircle2, Users, MoreVertical, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { MembersDialog } from '../components/MembersDialog';
import { OperationBlockingModal } from '../components/OperationBlockingModal';
import { MultiMemberDeleteError } from '../components/MultiMemberDeleteError';
import { useAuth } from '../contexts/AuthContext';

type DialogMode = 'add' | 'edit' | null;

function Calendars() {
  const queryClient = useQueryClient();
  const token = localStorage.getItem('auth_token') || '';
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(null);

  // Child combobox state
  const [childComboboxOpen, setChildComboboxOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [membersDialogCalendarId, setMembersDialogCalendarId] = useState<string | null>(null);

  // Multi-member deletion error state
  const [multiMemberError, setMultiMemberError] = useState<{ calendarId: string; memberCount: number } | null>(null);

  // Blocking modal states
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ICS Validation state
  const [icsUrl, setIcsUrl] = useState('');
  const [icsValidation, setIcsValidation] = useState<ICSValidation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStep, setValidationStep] = useState<'url' | 'details'>('url');

  // Fetch calendars and children
  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: ['calendars'],
    queryFn: () => getCalendars(token),
  });

  const { data: children } = useQuery({
    queryKey: ['children'],
    queryFn: () => getChildren(token),
  });

  // Auto-open add dialog if action=add query param is present
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setDialogMode('add');
      // Clear the query param
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Get selected calendar for editing
  const calendarToEdit = calendars?.find((c) => c.id === selectedCalendar);

  // Validate ICS mutation
  const validateICSMutation = useMutation({
    mutationFn: (url: string) => validateICS(url, token),
    onSuccess: (data) => {
      if (data.valid) {
        setIcsValidation(data);
        setValidationStep('details');
        toast.success('Calendar feed validated!');
      } else {
        toast.error('Invalid calendar feed', {
          description: data.error || 'Please check the URL and try again',
        });
      }
    },
    onError: (error: any) => {
      toast.error('Failed to validate ICS feed', {
        description: error.message || 'Please try again',
      });
    },
  });

  // Create calendar mutation
  const createCalendarMutation = useMutation({
    mutationFn: (data: { name: string; ics_url: string; child_id: string; color?: string }) =>
      createCalendar(data, token),
    onMutate: () => {
      setIsCreating(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['children'] });
      setIsCreating(false);
      resetDialog();
      toast.success('Calendar created successfully!');
    },
    onError: (error: any) => {
      setIsCreating(false);
      toast.error('Failed to create calendar', {
        description: error.message || 'Please try again',
      });
    },
  });

  // Update calendar mutation
  const updateCalendarMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; ics_url?: string; color?: string } }) =>
      updateCalendar(id, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      resetDialog();
      toast.success('Calendar updated successfully!');
    },
    onError: (error: any) => {
      toast.error('Failed to update calendar', {
        description: error.message || 'Please try again',
      });
    },
  });

  // Delete calendar mutation
  const deleteCalendarMutation = useMutation({
    mutationFn: (id: string) => deleteCalendar(id, token),
    onMutate: () => {
      setIsDeleting(true);
      setDeleteConfirmId(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setIsDeleting(false);
      toast.success('Calendar deleted successfully');
    },
    onError: (error: any) => {
      setIsDeleting(false);
      toast.error('Failed to delete calendar', {
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
      // Handle 409 Conflict (sync already in progress) with specific message
      if (error.response?.status === 409) {
        toast.info('Sync already in progress', {
          description: 'Another sync is currently running for this calendar. Please wait for it to complete.',
        });
      } else {
        toast.error('Failed to sync calendar', {
          description: error.message || 'Please try again',
        });
      }
    },
  });

  const resetDialog = () => {
    setDialogMode(null);
    setSelectedCalendar(null);
    setIcsUrl('');
    setIcsValidation(null);
    setValidationStep('url');
    setSelectedChildId(null);
    setNewChildName('');
    setChildComboboxOpen(false);
  };

  const handleValidateICS = () => {
    if (!icsUrl.trim()) {
      toast.error('Please enter an ICS URL');
      return;
    }
    setIsValidating(true);
    validateICSMutation.mutate(icsUrl, {
      onSettled: () => setIsValidating(false),
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (dialogMode === 'edit' && selectedCalendar) {
      // Edit existing calendar
      updateCalendarMutation.mutate({
        id: selectedCalendar,
        data: {
          name: formData.get('name') as string,
          ics_url: formData.get('ics_url') as string,
          color: formData.get('color') as string,
        },
      });
    } else {
      // Create new calendar
      let childId = selectedChildId;

      // If creating a new child, create it first
      if (!selectedChildId && newChildName.trim()) {
        try {
          const newChild = await createChildMutation.mutateAsync({ name: newChildName.trim() });
          childId = newChild.id;
        } catch (error) {
          console.error('Failed to create child:', error);
          toast.error('Failed to create child');
          return;
        }
      }

      if (!childId) {
        toast.error('Please select or create a child');
        return;
      }

      createCalendarMutation.mutate({
        name: formData.get('name') as string,
        ics_url: icsUrl,
        child_id: childId,
        color: formData.get('color') as string,
      });
    }
  };

  const handleDeleteCalendar = (calendarId: string) => {
    const calendar = calendars?.find(c => c.id === calendarId);
    if (!calendar) return;

    // Check if calendar has multiple accepted members
    const acceptedMembers = calendar.members?.filter(m => m.status === 'accepted') || [];

    if (acceptedMembers.length > 1) {
      // Show multi-member error dialog
      setMultiMemberError({
        calendarId,
        memberCount: acceptedMembers.length,
      });
      return;
    }

    // Only owner remains - proceed with deletion confirmation
    setDeleteConfirmId(calendarId);
  };

  const openEditDialog = (calendarId: string) => {
    setSelectedCalendar(calendarId);
    const calendar = calendars?.find((c) => c.id === calendarId);
    if (calendar) {
      setIcsUrl(calendar.ics_url);
    }
    setDialogMode('edit');
  };

  const openAddDialog = () => {
    setDialogMode('add');
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
          <h1 className="text-3xl font-bold tracking-tight">Calendars</h1>
        </div>
        <Button onClick={openAddDialog}>+ Add Calendar</Button>
      </div>

      {/* Calendar Dialog (Add/Edit) */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'edit' ? 'Edit Calendar' : 'Add Event Calendar'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'edit'
                ? 'Update your calendar settings'
                : 'Connect an ICS calendar feed to track your child\'s events'}
            </DialogDescription>
          </DialogHeader>

          {dialogMode === 'add' && validationStep === 'url' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="validate_ics_url">ICS Feed URL *</Label>
                <Input
                  id="validate_ics_url"
                  type="url"
                  placeholder="https://example.com/calendar.ics"
                  value={icsUrl}
                  onChange={(e) => setIcsUrl(e.target.value)}
                  disabled={isValidating}
                />
                <p className="text-sm text-muted-foreground">
                  Enter the URL of an ICS calendar feed to import events
                </p>
              </div>

              {icsValidation && !icsValidation.valid && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">Invalid Calendar Feed</p>
                    <p>{icsValidation.error || 'Please check the URL and try again'}</p>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetDialog}>
                  Cancel
                </Button>
                <Button onClick={handleValidateICS} disabled={isValidating}>
                  {isValidating ? 'Validating...' : 'Validate Feed'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {((dialogMode === 'add' && validationStep === 'details' && icsValidation?.valid) || dialogMode === 'edit') && (
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                {dialogMode === 'add' && icsValidation && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-green-50 text-green-900">
                    <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">Calendar Validated Successfully!</p>
                      {icsValidation.calendar_name && <p>Name: {icsValidation.calendar_name}</p>}
                      {icsValidation.event_count !== undefined && (
                        <p>Events: {icsValidation.event_count}</p>
                      )}
                      {icsValidation.date_range && (
                        <p>
                          Range: {new Date(icsValidation.date_range.start).toLocaleDateString()} -{' '}
                          {new Date(icsValidation.date_range.end).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Calendar Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Soccer Team Calendar"
                    defaultValue={calendarToEdit?.name || icsValidation?.calendar_name || ''}
                    required
                  />
                </div>

                {dialogMode === 'edit' && (
                  <div className="space-y-2">
                    <Label htmlFor="ics_url">ICS Feed URL *</Label>
                    <Input
                      id="ics_url"
                      name="ics_url"
                      type="url"
                      placeholder="https://example.com/calendar.ics"
                      defaultValue={calendarToEdit?.ics_url}
                      required
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="color">Calendar Color</Label>
                  <Input
                    id="color"
                    name="color"
                    type="color"
                    defaultValue={calendarToEdit?.color || '#3B82F6'}
                  />
                </div>

                {dialogMode === 'add' && (
                  <div className="space-y-2">
                    <Label>Child *</Label>
                    <Popover open={childComboboxOpen} onOpenChange={setChildComboboxOpen} modal={true}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={childComboboxOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedChildId
                            ? children?.find((child) => child.id === selectedChildId)?.name
                            : newChildName
                            ? `Create "${newChildName}"`
                            : "Select or create a child..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search or enter new name..."
                            value={newChildName}
                            onValueChange={(value) => {
                              setNewChildName(value);
                              // Clear selection if user starts typing
                              if (selectedChildId) {
                                setSelectedChildId(null);
                              }
                            }}
                          />
                          <CommandList>
                            {children && children.length > 0 && (
                              <CommandGroup heading="Existing children">
                                {children.map((child) => (
                                  <CommandItem
                                    key={child.id}
                                    value={child.name}
                                    onSelect={() => {
                                      setSelectedChildId(child.id);
                                      setNewChildName('');
                                      setChildComboboxOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedChildId === child.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {child.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                            {newChildName.trim() && !children?.some(
                              (child) => child.name.toLowerCase() === newChildName.toLowerCase()
                            ) && (
                              <CommandGroup heading="Create new">
                                <CommandItem
                                  value={`create-${newChildName}`}
                                  onSelect={() => {
                                    setSelectedChildId(null);
                                    setChildComboboxOpen(false);
                                  }}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Create "{newChildName}"
                                </CommandItem>
                              </CommandGroup>
                            )}
                            {!newChildName.trim() && (!children || children.length === 0) && (
                              <CommandEmpty>Type a name to create a new child</CommandEmpty>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createCalendarMutation.isPending ||
                    createChildMutation.isPending ||
                    updateCalendarMutation.isPending
                  }
                >
                  {createCalendarMutation.isPending ||
                  createChildMutation.isPending ||
                  updateCalendarMutation.isPending
                    ? 'Saving...'
                    : dialogMode === 'edit'
                    ? 'Update Calendar'
                    : 'Create Calendar'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this calendar and all its events. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteCalendarMutation.mutate(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCalendarMutation.isPending ? 'Deleting...' : 'Delete Calendar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Calendars List */}
      {!calendars || calendars.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground">Create a Calendar to Manage Events</p>
            <Button onClick={openAddDialog}>+ Add Calendar</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {calendars.map((calendar) => (
            <Card key={calendar.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: calendar.color }} />
                      <CardTitle className="text-lg">{calendar.name}</CardTitle>
                    </div>
                    <CardDescription>{calendar.child.name}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => openEditDialog(calendar.id)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteCalendar(calendar.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setMembersDialogCalendarId(calendar.id)}>
                        <Users className="h-4 w-4 mr-2" />
                        Manage Members
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => syncCalendarMutation.mutate(calendar.id)}
                        disabled={syncCalendarMutation.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncCalendarMutation.isPending ? 'animate-spin' : ''}`} />
                        Sync Events
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Owner:</span>
                    <span className="font-medium text-foreground">{calendar.owner.name}</span>
                  </div>
                  {calendar.members.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span>Members:</span>
                      <span className="font-medium text-foreground text-right">
                        {(() => {
                          const accepted = calendar.members.filter(m => m.status === 'accepted');
                          const pending = calendar.members.filter(m => m.status === 'pending');
                          const parts = [];

                          // Add accepted member names
                          if (accepted.length > 0) {
                            parts.push(accepted.map(m => m.user.name).join(', '));
                          }

                          // Add pending invite count
                          if (pending.length > 0) {
                            parts.push(`${pending.length} pending ${pending.length === 1 ? 'invite' : 'invites'}`);
                          }

                          return parts.join(', ');
                        })()}
                      </span>
                    </div>
                  )}
                  {calendar.last_sync_at && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              calendar.last_sync_status === 'success'
                                ? '#22c55e'
                                : calendar.last_sync_status === 'error'
                                ? '#ef4444'
                                : '#22c55e'
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          {calendar.last_sync_status === 'error' && (
                            <span className="text-destructive mr-1">Error -</span>
                          )}
                          Last synced:{' '}
                          {new Date(calendar.last_sync_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Members Dialog */}
      {membersDialogCalendarId && (
        <MembersDialog
          calendarId={membersDialogCalendarId}
          calendarName={calendars?.find((c) => c.id === membersDialogCalendarId)?.name || ''}
          isOwner={calendars?.find((c) => c.id === membersDialogCalendarId)?.owner.id === user?.id}
          open={membersDialogCalendarId !== null}
          onOpenChange={(open) => !open && setMembersDialogCalendarId(null)}
        />
      )}

      {/* Multi-member deletion error */}
      <MultiMemberDeleteError
        isOpen={multiMemberError !== null}
        memberCount={multiMemberError?.memberCount || 0}
        onClose={() => setMultiMemberError(null)}
        onViewMembers={() => {
          if (multiMemberError) {
            setMembersDialogCalendarId(multiMemberError.calendarId);
          }
        }}
      />

      {/* Calendar creation blocking modal */}
      <OperationBlockingModal
        isOpen={isCreating}
        title="Importing calendar and syncing events to Google Calendar"
        message="This may take up to 90 seconds depending on calendar size. Please do not close this window."
        showElapsedTime={true}
        elapsedTimeThreshold={15}
      />

      {/* Calendar deletion blocking modal */}
      <OperationBlockingModal
        isOpen={isDeleting}
        title="Deleting calendar and removing events from Google Calendar"
        message="Please wait while we clean up your Google Calendar events..."
        showElapsedTime={true}
        elapsedTimeThreshold={10}
      />
    </div>
  );
}

export default Calendars;
