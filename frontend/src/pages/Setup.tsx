import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { updateAddress } from '../lib/api-users';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { useAuth } from '../contexts/AuthContext';
import { MapPin } from 'lucide-react';

function Setup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const token = localStorage.getItem('auth_token') || '';

  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: () => updateAddress({ address, latitude, longitude }, token),
    onSuccess: async () => {
      toast.success('Profile setup complete!');
      // Refresh the user in AuthContext to get updated address
      await refreshUser();
      // Also invalidate React Query cache for any components using it
      await queryClient.invalidateQueries({ queryKey: ['user'] });
      // Now navigate to dashboard
      navigate('/');
    },
    onError: (error: any) => {
      console.error('Address update error:', error);
      toast.error('Failed to save address', {
        description: error?.response?.data?.error || error.message || 'Please try again',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !latitude || !longitude) {
      toast.error('Please select a valid address', {
        description: 'Choose an address from the dropdown suggestions',
      });
      return;
    }
    updateAddressMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center space-y-3 pb-8">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-2">
            <MapPin className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-3xl font-bold">Welcome to Koordie!</CardTitle>
          <CardDescription className="text-lg">
            {user?.name ? `Hi ${user.name.split(' ')[0]}! ` : 'Hi! '}
            Let's set your address so we can provide you drive time estimates for your events.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <AddressAutocomplete
                  value={address}
                  onChange={(value) => setAddress(value)}
                  onPlaceSelect={({ address: addr, latitude: lat, longitude: lng }) => {
                    setAddress(addr);
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                  label="Home Address *"
                  placeholder="Enter your home address"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                className="flex-1"
                size="lg"
                disabled={!address || !latitude || !longitude || updateAddressMutation.isPending}
              >
                {updateAddressMutation.isPending ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </div>

            <p className="text-center text-xs text-gray-500">
              Your address is only used for drive time calculations and is never shared.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default Setup;
