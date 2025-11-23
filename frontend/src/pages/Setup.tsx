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
  const { user } = useAuth();
  const token = localStorage.getItem('auth_token') || '';

  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  // Update address mutation
  const updateAddressMutation = useMutation({
    mutationFn: () => updateAddress({ address, latitude, longitude }, token),
    onSuccess: () => {
      // Invalidate user query to refetch with updated address
      queryClient.invalidateQueries({ queryKey: ['user'] });
      toast.success('Profile setup complete!');
      // Navigate after a short delay to ensure user data is updated
      setTimeout(() => navigate('/'), 500);
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
      toast.error('Please select a valid address from the suggestions');
      return;
    }
    updateAddressMutation.mutate();
  };

  // Prevent navigating away before completing setup
  const handleSkip = () => {
    toast.error('Home address is required to use Koordie', {
      description: 'We need your address to calculate drive times for events',
    });
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
            Let's set up your profile to get started.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Why we need your home address</h3>
                <p className="text-sm text-blue-800">
                  Koordie automatically calculates drive times and creates travel blocks for your events.
                  We'll use your home address to estimate when you need to leave and return home.
                </p>
              </div>

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
