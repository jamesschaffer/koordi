import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getPendingInvitations, acceptInvitation, declineInvitation } from '../lib/api-calendars';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Calendar, CheckCircle2, XCircle, User, Baby, Clock } from 'lucide-react';

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const authToken = localStorage.getItem('auth_token') || '';
  const [processing, setProcessing] = useState(false);

  // Fetch all pending invitations to find the one matching this token
  const { data: invitations, isLoading } = useQuery({
    queryKey: ['pending-invitations'],
    queryFn: () => getPendingInvitations(authToken),
    retry: false,
  });

  const invitation = invitations?.find((inv) => inv.invitation_token === token);

  // Accept invitation mutation
  const acceptMutation = useMutation({
    mutationFn: () => acceptInvitation(token!, authToken),
    onSuccess: () => {
      toast.success('Invitation accepted!', {
        description: 'You now have access to this calendar',
      });
      setTimeout(() => {
        navigate('/calendars');
      }, 2000);
    },
    onError: (error: any) => {
      toast.error('Failed to accept invitation', {
        description: error.message || 'Please try again',
      });
      setProcessing(false);
    },
  });

  // Decline invitation mutation
  const declineMutation = useMutation({
    mutationFn: () => declineInvitation(token!, authToken),
    onSuccess: () => {
      toast.success('Invitation declined');
      setTimeout(() => {
        navigate('/calendars');
      }, 2000);
    },
    onError: (error: any) => {
      toast.error('Failed to decline invitation', {
        description: error.message || 'Please try again',
      });
      setProcessing(false);
    },
  });

  const handleAccept = () => {
    setProcessing(true);
    acceptMutation.mutate();
  };

  const handleDecline = () => {
    setProcessing(true);
    declineMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-center">Invitation Not Found</CardTitle>
            <CardDescription className="text-center">
              This invitation may have expired, been cancelled, or already responded to.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button onClick={() => navigate('/calendars')}>Go to Calendars</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (invitation.status !== 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-center">Invitation Already Responded</CardTitle>
            <CardDescription className="text-center">
              You have already {invitation.status} this invitation.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button onClick={() => navigate('/calendars')}>Go to Calendars</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardHeader className="text-center space-y-2 pb-4">
          <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-2">
            <Calendar className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl">Calendar Invitation</CardTitle>
          <CardDescription>
            You've been invited to collaborate on a family calendar
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Invited by</p>
                <p className="font-medium">{invitation.invited_by.name}</p>
                <p className="text-sm text-muted-foreground">{invitation.invited_by.email}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Calendar</p>
                <p className="font-medium">{invitation.event_calendar?.name}</p>
              </div>
            </div>

            {invitation.event_calendar?.child && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
                <Baby className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Child</p>
                  <p className="font-medium">{invitation.event_calendar.child.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Invited</p>
                <p className="font-medium">
                  {new Date(invitation.invited_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>

          {/* What you'll be able to do */}
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4">
            <p className="font-medium mb-2">What you'll be able to do:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• View all events for {invitation.event_calendar?.child.name}</li>
              <li>• Assign events to yourself or other parents</li>
              <li>• Get automatic drive time calculations</li>
              <li>• See events in your Google Calendar</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDecline}
            disabled={processing}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Decline
          </Button>
          <Button
            className="flex-1"
            onClick={handleAccept}
            disabled={processing}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {processing ? 'Accepting...' : 'Accept Invitation'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
