import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCalendarMembers,
  sendInvitation,
  resendInvitation,
  cancelInvitation,
  removeMember,
  type CalendarMembers,
} from '../lib/api-calendars';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Mail, UserPlus, Trash2, RefreshCw, UserMinus, Crown, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface MembersDialogProps {
  calendarId: string;
  calendarName: string;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MembersDialog({ calendarId, calendarName, isOwner, open, onOpenChange }: MembersDialogProps) {
  const queryClient = useQueryClient();
  const token = localStorage.getItem('auth_token') || '';
  const [inviteEmail, setInviteEmail] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Fetch members
  const { data: membersData, isLoading } = useQuery({
    queryKey: ['calendar-members', calendarId],
    queryFn: () => getCalendarMembers(calendarId, token),
    enabled: open,
  });

  // Send invitation mutation
  const sendInvitationMutation = useMutation({
    mutationFn: (email: string) => sendInvitation(calendarId, email, token),
    onMutate: async (email: string) => {
      // Cancel outgoing queries to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['calendar-members', calendarId] });

      // Snapshot previous value
      const previousMembers = queryClient.getQueryData<CalendarMembers>(['calendar-members', calendarId]);

      // Optimistically update cache
      if (previousMembers) {
        queryClient.setQueryData<CalendarMembers>(['calendar-members', calendarId], {
          ...previousMembers,
          members: [
            ...previousMembers.members,
            {
              id: `temp-${Date.now()}`,
              status: 'pending' as const,
              invited_email: email,
              invited_at: new Date().toISOString(),
              invited_by: {
                name: previousMembers.owner.name,
                email: previousMembers.owner.email,
              },
            },
          ],
        });
      }

      return { previousMembers };
    },
    onSuccess: () => {
      setInviteEmail('');
      toast.success('Parent added to calendar');
    },
    onError: (error: any, _email, context) => {
      // Rollback on error
      if (context?.previousMembers) {
        queryClient.setQueryData(['calendar-members', calendarId], context.previousMembers);
      }
      toast.error('Failed to send invitation', {
        description: error.message || 'Please try again',
      });
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['calendar-members', calendarId] });
    },
  });

  // Resend invitation mutation
  const resendInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => resendInvitation(invitationId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-members', calendarId] });
      toast.success('Invitation resent!');
    },
    onError: (error: any) => {
      toast.error('Failed to resend invitation', {
        description: error.message || 'Please try again',
      });
    },
  });

  // Cancel invitation mutation
  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => cancelInvitation(invitationId, token),
    onMutate: async (invitationId: string) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['calendar-members', calendarId] });

      // Snapshot previous value
      const previousMembers = queryClient.getQueryData<CalendarMembers>(['calendar-members', calendarId]);

      // Optimistically remove the invitation
      if (previousMembers) {
        queryClient.setQueryData<CalendarMembers>(['calendar-members', calendarId], {
          ...previousMembers,
          members: previousMembers.members.filter((m) => m.id !== invitationId),
        });
      }

      return { previousMembers };
    },
    onSuccess: () => {
      toast.success('Invitation cancelled');
    },
    onError: (error: any, _invitationId, context) => {
      // Rollback on error
      if (context?.previousMembers) {
        queryClient.setQueryData(['calendar-members', calendarId], context.previousMembers);
      }
      toast.error('Failed to cancel invitation', {
        description: error.message || 'Please try again',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-members', calendarId] });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) => removeMember(membershipId, token),
    onMutate: async (membershipId: string) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['calendar-members', calendarId] });
      await queryClient.cancelQueries({ queryKey: ['calendars'] });

      // Snapshot previous value
      const previousMembers = queryClient.getQueryData<CalendarMembers>(['calendar-members', calendarId]);

      // Optimistically remove the member
      if (previousMembers) {
        queryClient.setQueryData<CalendarMembers>(['calendar-members', calendarId], {
          ...previousMembers,
          members: previousMembers.members.filter((m) => m.id !== membershipId),
        });
      }

      return { previousMembers };
    },
    onSuccess: () => {
      setConfirmRemoveId(null);
      toast.success('Member removed');
    },
    onError: (error: any, _membershipId, context) => {
      // Rollback on error
      if (context?.previousMembers) {
        queryClient.setQueryData(['calendar-members', calendarId], context.previousMembers);
      }
      toast.error('Failed to remove member', {
        description: error.message || 'Please try again',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-members', calendarId] });
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
    },
  });

  const handleSendInvitation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    sendInvitationMutation.mutate(inviteEmail);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const acceptedMembers = membersData?.members.filter((m) => m.status === 'accepted') || [];
  const pendingMembers = membersData?.members.filter((m) => m.status === 'pending') || [];
  const declinedMembers = membersData?.members.filter((m) => m.status === 'declined') || [];

  // Member limit constants
  const MAX_MEMBERS = 10;
  const memberCount = acceptedMembers.length;
  const isAtCapacity = memberCount >= MAX_MEMBERS;
  const isNearCapacity = memberCount >= 8;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Members</DialogTitle>
            <DialogDescription>{calendarName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Invitation Analytics */}
            {membersData?.analytics && (
              <div className="grid grid-cols-5 gap-3 pb-4 border-b">
                <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {membersData.analytics.total}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Total</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {membersData.analytics.accepted}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Accepted</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {membersData.analytics.pending}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Pending</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {membersData.analytics.declined}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Declined</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {membersData.analytics.expired}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Expired</div>
                </div>
              </div>
            )}

            {/* Member Limit Warning */}
            {isOwner && isNearCapacity && (
              <Alert variant={isAtCapacity ? "destructive" : "default"} className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                <AlertDescription className="text-sm text-amber-900 dark:text-amber-200">
                  {isAtCapacity ? (
                    <>
                      <strong>Calendar at capacity</strong> ({memberCount}/{MAX_MEMBERS} members).
                      Remove a member to add more.
                    </>
                  ) : (
                    <>
                      <strong>Almost at capacity</strong> ({memberCount}/{MAX_MEMBERS} members).
                      You can add {MAX_MEMBERS - memberCount} more member{MAX_MEMBERS - memberCount !== 1 ? 's' : ''}.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Send Invitation Section (Owner Only) - Moved to top */}
            {isOwner && (
              <div className="space-y-2 pb-4 border-b">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-blue-500" />
                  Add Parent
                </h3>
                <form onSubmit={handleSendInvitation} className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="email"
                      placeholder={isAtCapacity ? "Calendar at capacity" : "Enter email address"}
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={sendInvitationMutation.isPending || isAtCapacity}
                    />
                  </div>
                  <Button type="submit" disabled={sendInvitationMutation.isPending || isAtCapacity}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {sendInvitationMutation.isPending ? 'Adding...' : 'Add Parent'}
                  </Button>
                </form>
                {!isAtCapacity && (
                  <p className="text-xs text-muted-foreground">
                    New users will receive an email invitation. Existing users will automatically be added to the event calendar.
                  </p>
                )}
              </div>
            )}

            {/* Accepted Members Section */}
            {acceptedMembers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Parents ({acceptedMembers.length})
                  {membersData && (
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      • Owner: {membersData.owner.name}
                    </span>
                  )}
                </h3>
                <div className="space-y-2">
                  {acceptedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                    >
                      <Avatar>
                        <AvatarImage src={member.user?.avatar_url} />
                        <AvatarFallback>{getInitials(member.user?.name || member.invited_email)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{member.user?.name || member.invited_email}</p>
                        <p className="text-sm text-muted-foreground truncate">{member.user?.email || member.invited_email}</p>
                      </div>
                      {isOwner && member.user?.id !== membersData?.owner.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive"
                          onClick={() => setConfirmRemoveId(member.id)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending Invitations Section */}
            {pendingMembers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Pending Invitations ({pendingMembers.length})
                </h3>
                <div className="space-y-2">
                  {pendingMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                    >
                      <Avatar>
                        <AvatarFallback>
                          <Mail className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{member.invited_email}</p>
                        <p className="text-xs text-muted-foreground">
                          Invited {new Date(member.invited_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary">Pending</Badge>
                      {isOwner && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => resendInvitationMutation.mutate(member.id)}
                            disabled={resendInvitationMutation.isPending}
                            title="Resend invitation email"
                          >
                            <RefreshCw className={`h-3 w-3 mr-1 ${resendInvitationMutation.isPending ? 'animate-spin' : ''}`} />
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-destructive hover:text-destructive"
                            onClick={() => cancelInvitationMutation.mutate(member.id)}
                            disabled={cancelInvitationMutation.isPending}
                            title="Cancel invitation"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Declined Invitations Section */}
            {declinedMembers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Declined ({declinedMembers.length})
                </h3>
                <div className="space-y-2">
                  {declinedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card opacity-60"
                    >
                      <Avatar>
                        <AvatarFallback>
                          <Mail className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{member.invited_email}</p>
                        <p className="text-xs text-muted-foreground">
                          Declined {member.responded_at ? new Date(member.responded_at).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <Badge variant="destructive">Declined</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isLoading && (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={confirmRemoveId !== null} onOpenChange={(open) => !open && setConfirmRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will lose access to this calendar and all its events. They can be re-invited later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemoveId && removeMemberMutation.mutate(confirmRemoveId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMemberMutation.isPending ? 'Removing...' : 'Remove Member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
