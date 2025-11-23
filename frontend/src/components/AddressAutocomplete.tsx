import { useEffect, useRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLoadScript } from '@react-google-maps/api';
import { Alert, AlertDescription } from '@/components/ui/alert';

const libraries: ("places")[] = ["places"];

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: { address: string; latitude: number; longitude: number }) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

interface Suggestion {
  placePrediction: google.maps.places.PlacePrediction;
  text: string;
}

function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  onBlur,
  label = "Address",
  placeholder = "123 Main St, City, State ZIP",
  disabled = false,
}: AddressAutocompleteProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const placesLibRef = useRef<typeof google.maps.places | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  // Load Places library
  useEffect(() => {
    const loadPlacesLibrary = async () => {
      if (isLoaded && window.google) {
        try {
          const lib = await google.maps.importLibrary('places') as typeof google.maps.places;
          placesLibRef.current = lib;
          setIsLoadingLibrary(false);
        } catch (error) {
          console.error('Failed to load Places library:', error);
          setIsLoadingLibrary(false);
        }
      }
    };

    loadPlacesLibrary();
  }, [isLoaded]);

  // Fetch autocomplete suggestions using new API
  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input.trim() || !placesLibRef.current) {
      setSuggestions([]);
      return;
    }

    try {
      const { suggestions: results } = await placesLibRef.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        includedPrimaryTypes: ['street_address', 'route', 'premise'],
        includedRegionCodes: ['us'], // Restrict to US addresses
      });

      const formattedSuggestions = results
        .filter((suggestion) => suggestion.placePrediction !== null)
        .map((suggestion) => ({
          placePrediction: suggestion.placePrediction!,
          text: suggestion.placePrediction!.text.toString(),
        }));

      setSuggestions(formattedSuggestions);
      setOpen(formattedSuggestions.length > 0);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    }
  }, []);

  // Handle suggestion selection
  const handleSelectSuggestion = async (suggestion: Suggestion) => {
    try {
      const place = suggestion.placePrediction.toPlace();

      await place.fetchFields({
        fields: ['location', 'formattedAddress'],
      });

      const location = place.location;
      const formattedAddress = place.formattedAddress;

      if (location && formattedAddress) {
        const latitude = typeof location.lat === 'function' ? location.lat() : location.lat;
        const longitude = typeof location.lng === 'function' ? location.lng() : location.lng;

        onChange(formattedAddress);
        onPlaceSelect({
          address: formattedAddress,
          latitude,
          longitude,
        });
      }

      setOpen(false);
      setSuggestions([]);
    } catch (error) {
      console.error('Error fetching place details:', error);
    }
  };

  // Debounce input changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (value && !isLoadingLibrary) {
        fetchSuggestions(value);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value, fetchSuggestions, isLoadingLibrary]);

  // Show error if API key is missing or invalid
  if (!apiKey || apiKey === 'your_maps_api_key_here') {
    return (
      <div className="space-y-2">
        <Label htmlFor="address">{label}</Label>
        <Input
          id="address"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
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
          onBlur={onBlur}
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

  if (!isLoaded || isLoadingLibrary) {
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
      <div className="relative">
        <Input
          ref={inputRef}
          id="address"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!e.target.value.trim()) {
              setOpen(false);
              setSuggestions([]);
            }
          }}
          onBlur={() => {
            // Delay to allow click on suggestion
            setTimeout(() => {
              setOpen(false);
              onBlur?.();
            }, 200);
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                onClick={() => handleSelectSuggestion(suggestion)}
                className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm"
              >
                {suggestion.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Start typing your address and select from the suggestions
      </p>
    </div>
  );
}

export default AddressAutocomplete;
