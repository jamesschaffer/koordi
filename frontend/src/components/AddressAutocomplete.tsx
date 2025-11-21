import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import { Alert, AlertDescription } from '@/components/ui/alert';

const libraries: ("places")[] = ["places"];

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: { address: string; latitude: number; longitude: number }) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  label = "Address",
  placeholder = "123 Main St, City, State ZIP",
  disabled = false,
}: AddressAutocompleteProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  const onLoad = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();

      if (place.geometry && place.geometry.location) {
        const address = place.formatted_address || '';
        const latitude = place.geometry.location.lat();
        const longitude = place.geometry.location.lng();

        onChange(address);
        onPlaceSelect({ address, latitude, longitude });
      }
    }
  };

  // Show error if API key is missing or invalid
  if (!apiKey || apiKey === 'your_maps_api_key_here') {
    return (
      <div className="space-y-2">
        <Label htmlFor="address">{label}</Label>
        <Input
          id="address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Alert>
          <AlertDescription className="text-sm">
            <strong>Note:</strong> Google Maps API key is not configured.
            Please add <code className="bg-muted px-1 py-0.5 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to your <code className="bg-muted px-1 py-0.5 rounded">.env</code> file to enable address autocomplete and validation.
            <br />
            You can still enter an address manually, but it won't be validated or geocoded.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-2">
        <Label htmlFor="address">{label}</Label>
        <Input
          id="address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Alert variant="destructive">
          <AlertDescription className="text-sm">
            Failed to load Google Maps. Please check your API key and try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="space-y-2">
        <Label htmlFor="address">{label}</Label>
        <Input
          id="address"
          placeholder="Loading..."
          disabled
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="address">{label}</Label>
      <Autocomplete
        onLoad={onLoad}
        onPlaceChanged={onPlaceChanged}
        options={{
          types: ['address'],
          componentRestrictions: { country: 'us' }, // Restrict to US addresses, adjust as needed
        }}
      >
        <Input
          ref={inputRef}
          id="address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </Autocomplete>
      <p className="text-sm text-muted-foreground">
        Start typing your address and select from the suggestions
      </p>
    </div>
  );
}

export default AddressAutocomplete;
