import axios from 'axios';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  console.warn('Warning: GOOGLE_MAPS_API_KEY is not set');
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  address: string;
  coordinates: Coordinates;
  formatted_address: string;
}

export interface DriveTimeResult {
  duration_minutes: number;
  duration_in_traffic_minutes: number;
  distance_meters: number;
  distance_text: string;
  duration_text: string;
}

/**
 * Geocode an address to get lat/lng coordinates
 * @param address - The address to geocode
 * @returns GeocodeResult with coordinates and formatted address
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key is not configured');
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address,
        key: GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Geocoding failed: ${response.data.status}`);
    }

    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('No results found for address');
    }

    const result = response.data.results[0];
    const { lat, lng } = result.geometry.location;

    return {
      address,
      coordinates: { lat, lng },
      formatted_address: result.formatted_address,
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    throw new Error(`Failed to geocode address: ${address}`);
  }
}

/**
 * Calculate drive time between two locations using Distance Matrix API
 * @param origin - Origin coordinates
 * @param destination - Destination coordinates
 * @param departureTime - Optional departure time for traffic-aware calculation (defaults to now)
 * @returns DriveTimeResult with duration and distance information
 */
export async function calculateDriveTime(
  origin: Coordinates,
  destination: Coordinates,
  departureTime?: Date
): Promise<DriveTimeResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key is not configured');
  }

  try {
    const params: any = {
      origins: `${origin.lat},${origin.lng}`,
      destinations: `${destination.lat},${destination.lng}`,
      mode: 'driving',
      key: GOOGLE_MAPS_API_KEY,
    };

    // Add departure time for traffic-aware routing
    // Use 'now' for real-time traffic, or specific timestamp for future time
    if (departureTime) {
      params.departure_time = Math.floor(departureTime.getTime() / 1000);
    } else {
      params.departure_time = 'now';
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params,
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Distance Matrix API failed: ${response.data.status}`);
    }

    if (!response.data.rows || response.data.rows.length === 0) {
      throw new Error('No route found');
    }

    const element = response.data.rows[0].elements[0];

    if (element.status !== 'OK') {
      throw new Error(`Route calculation failed: ${element.status}`);
    }

    // duration_in_traffic is only available when departure_time is specified
    const durationInTraffic = element.duration_in_traffic || element.duration;

    return {
      duration_minutes: Math.ceil(element.duration.value / 60),
      duration_in_traffic_minutes: Math.ceil(durationInTraffic.value / 60),
      distance_meters: element.distance.value,
      distance_text: element.distance.text,
      duration_text: durationInTraffic.text,
    };
  } catch (error) {
    console.error('Drive time calculation error:', error);
    throw new Error('Failed to calculate drive time');
  }
}

/**
 * Validate if coordinates are valid
 * @param coordinates - Coordinates to validate
 * @returns boolean indicating if coordinates are valid
 */
export function isValidCoordinates(coordinates: Coordinates): boolean {
  return (
    typeof coordinates.lat === 'number' &&
    typeof coordinates.lng === 'number' &&
    coordinates.lat >= -90 &&
    coordinates.lat <= 90 &&
    coordinates.lng >= -180 &&
    coordinates.lng <= 180
  );
}

/**
 * Calculate the distance between two coordinates (Haversine formula)
 * Used for quick distance checks without API calls
 * @param coord1 - First coordinate
 * @param coord2 - Second coordinate
 * @returns Distance in kilometers
 */
export function calculateDistanceKm(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
      Math.cos(toRadians(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get timezone from coordinates using Google Time Zone API
 * @param coordinates - The coordinates to lookup
 * @returns IANA timezone string (e.g., "America/New_York")
 */
export async function getTimezoneFromCoordinates(coordinates: Coordinates): Promise<string> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key is not configured');
  }

  try {
    // Timestamp in seconds (required by the API)
    const timestamp = Math.floor(Date.now() / 1000);

    const response = await axios.get('https://maps.googleapis.com/maps/api/timezone/json', {
      params: {
        location: `${coordinates.lat},${coordinates.lng}`,
        timestamp,
        key: GOOGLE_MAPS_API_KEY,
      },
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Time Zone API failed: ${response.data.status}`);
    }

    // Returns IANA timezone ID like "America/New_York"
    return response.data.timeZoneId;
  } catch (error) {
    console.error('Timezone lookup error:', error);
    throw new Error('Failed to get timezone from coordinates');
  }
}
