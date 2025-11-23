import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMe, updateAddress, updateComfortBuffer, updateRetention, deleteAccount } from '../lib/api-users';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { CheckCircle2, Loader2 } from 'lucide-react';

function Settings() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const token = localStorage.getItem('auth_token') || '';

  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [comfortBuffer, setComfortBuffer] = useState<number[]>([15]);
  const [keepSupplemental, setKeepSupplemental] = useState(false);
  const [addressSaveStatus, setAddressSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [bufferSaveStatus, setBufferSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Fetch user data
  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => getMe(token),
  });

  // Update state when user data loads
  useEffect(() => {
    if (user) {
      setAddress(user.home_address || '');
      setComfortBuffer([user.comfort_buffer_minutes]);
      setKeepSupplemental(user.keep_supplemental_events);
    }
  }, [user]);

  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: () => updateAddress({ address, latitude, longitude }, token),
    onMutate: () => {
      setAddressSaveStatus('saving');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setAddressSaveStatus('saved');
      setTimeout(() => setAddressSaveStatus('idle'), 2000);
    },
    onError: (error: any) => {
      setAddressSaveStatus('error');
      toast.error('Failed to save address', {
        description: error.message || 'Please try again',
      });
      setTimeout(() => setAddressSaveStatus('idle'), 3000);
    },
  });

  // Update comfort buffer mutation
  const updateComfortBufferMutation = useMutation({
    mutationFn: (minutes: number) => updateComfortBuffer(minutes, token),
    onMutate: () => {
      setBufferSaveStatus('saving');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setBufferSaveStatus('saved');
      setTimeout(() => setBufferSaveStatus('idle'), 2000);
    },
    onError: (error: any) => {
      setBufferSaveStatus('error');
      toast.error('Failed to save comfort buffer', {
        description: error.message || 'Please try again',
      });
      setTimeout(() => setBufferSaveStatus('idle'), 3000);
    },
  });

  // Update retention mutation
  const updateRetentionMutation = useMutation({
    mutationFn: (keep: boolean) => updateRetention(keep, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Retention setting updated!');
    },
    onError: (error: any) => {
      toast.error('Failed to update retention setting', {
        description: error.message || 'Please try again',
      });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(token),
    onSuccess: () => {
      toast.success('Account deleted successfully');
      logout();
      navigate('/login');
    },
    onError: (error: any) => {
      toast.error('Failed to delete account', {
        description: error.message || 'Please try again',
      });
    },
  });

  const saveAddress = useCallback(() => {
    if (!address.trim()) {
      return;
    }
    updateAddressMutation.mutate();
  }, [address, latitude, longitude, updateAddressMutation]);

  const handlePlaceSelect = (place: { address: string; latitude: number; longitude: number }) => {
    setAddress(place.address);
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    // Auto-save when a place is selected from autocomplete
    setTimeout(() => {
      updateAddressMutation.mutate();
    }, 100);
  };

  const handleAddressBlur = () => {
    // Auto-save on blur if address has changed
    if (address && address !== user?.home_address) {
      if (!latitude || !longitude) {
        toast.warning('Address not validated', {
          description: 'Select from suggestions for accurate location',
        });
      }
      saveAddress();
    }
  };

  const handleComfortBufferChange = (value: number[]) => {
    setComfortBuffer(value);
    updateComfortBufferMutation.mutate(value[0]);
  };

  const handleRetentionToggle = (checked: boolean) => {
    setKeepSupplemental(checked);
    updateRetentionMutation.mutate(checked);
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
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your basic account information from Google</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {user?.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Home Address Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Home Address</span>
            {addressSaveStatus === 'saving' && (
              <span className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {addressSaveStatus === 'saved' && (
              <span className="text-sm font-normal text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Used to calculate drive times and departure times for events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            onPlaceSelect={handlePlaceSelect}
            onBlur={handleAddressBlur}
            disabled={addressSaveStatus === 'saving'}
          />
        </CardContent>
      </Card>

      {/* Comfort Buffer Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Comfort Buffer</span>
            {bufferSaveStatus === 'saving' && (
              <span className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {bufferSaveStatus === 'saved' && (
              <span className="text-sm font-normal text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Extra time to add before events (0-60 minutes)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Buffer: {comfortBuffer[0]} minutes</Label>
            <Slider
              value={comfortBuffer}
              onValueChange={handleComfortBufferChange}
              max={60}
              step={5}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              This adds extra time to your departure time calculations
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Supplemental Events Section */}
      <Card>
        <CardHeader>
          <CardTitle>Supplemental Events</CardTitle>
          <CardDescription>
            Control how supplemental events are handled
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="retention">Keep Supplemental Events</Label>
              <p className="text-sm text-muted-foreground">
                Retain supplemental events added to your Google Calendar
              </p>
            </div>
            <Switch
              id="retention"
              checked={keepSupplemental}
              onCheckedChange={handleRetentionToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions - proceed with caution
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account and remove all your data including calendars, children, and events.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteAccountMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete Account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

export default Settings;
