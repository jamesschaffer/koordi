# Google Maps Platform Integration
## Koordi

**Purpose:** Complete specification for Google Maps API integration
**APIs Used:** Geocoding API, Directions API, Distance Matrix API
**Use Cases:** Address → Lat/Lng conversion, route calculation, drive time estimation with traffic

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [API Setup](#api-setup)
3. [Geocoding API](#geocoding-api)
4. [Directions API](#directions-api)
5. [Distance Matrix API](#distance-matrix-api)
6. [Caching Strategy](#caching-strategy)
7. [Error Handling](#error-handling)
8. [Cost Optimization](#cost-optimization)
9. [Testing](#testing)

---

## OVERVIEW

### Google Maps APIs Usage

| API | Purpose | When Used |
|-----|---------|-----------|
| **Geocoding API** | Convert addresses to lat/lng coordinates | When user updates home address, when parsing event locations from ICS |
| **Directions API** | Calculate route and driving directions | When creating supplemental events (not currently used, but available) |
| **Distance Matrix API** | Calculate drive time with traffic | When creating supplemental events, during traffic recalculation job |

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User Updates Home Address / ICS Sync Imports Event             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Geocoding API        │
         │  Address → Lat/Lng    │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Store in Database    │
         │  (User/Event)         │
         └───────────┬───────────┘
                     │
        Event Assigned to User?
                     │
                     ▼
         ┌───────────────────────┐
         │ Distance Matrix API   │
         │ Calculate Drive Time  │
         │ (with traffic)        │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Create Supplemental   │
         │ Events (Departure/    │
         │ Return)               │
         └───────────────────────┘
```

---

## API SETUP

### Google Cloud Console Configuration

**Step 1: Enable APIs**

Navigate to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Library

Enable the following APIs:
- [x] Geocoding API
- [x] Directions API
- [x] Distance Matrix API

**Step 2: Create API Key**

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → API Key**
3. Copy the API key → `GOOGLE_MAPS_API_KEY` in `.env`

**Step 3: Restrict API Key (Recommended)**

1. Click **Restrict Key**
2. **API restrictions:**
   - Select "Restrict key"
   - Choose only:
     - Geocoding API
     - Directions API
     - Distance Matrix API
3. **Application restrictions (optional):**
   - HTTP referrers: `https://yourdomain.com/*`
   - IP addresses: Your server IPs

**Step 4: Enable Billing**

Google Maps Platform requires a billing account. Free tier includes:
- **$200/month credit** (covers ~28,500 geocoding requests or ~40,000 Distance Matrix requests)

Monitor usage at **APIs & Services → Dashboard**

### Environment Variable

```env
GOOGLE_MAPS_API_KEY="AIzaSyAbc123Def456Ghi789Jkl012Mno345"
```

---

## GEOCODING API

### Purpose

Convert human-readable addresses to geographic coordinates (latitude/longitude).

### Use Cases

1. **User Home Address:** When user updates home address in settings
2. **Event Locations:** When ICS feed includes location text
3. **Manual Event Creation:** If future feature allows manual event creation

### API Request Format

**Endpoint:**
```
GET https://maps.googleapis.com/maps/api/geocode/json
```

**Parameters:**
- `address` (required): The address to geocode
- `key` (required): API key

**Example Request:**
```http
GET https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA&key=YOUR_API_KEY
```

### API Response Format

```json
{
  "results": [
    {
      "address_components": [ /* ... */ ],
      "formatted_address": "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
      "geometry": {
        "location": {
          "lat": 37.4224764,
          "lng": -122.0842499
        },
        "location_type": "ROOFTOP",
        "viewport": { /* ... */ }
      },
      "place_id": "ChIJ2eUgeAK6j4ARbn5u_wAGqWA",
      "types": ["street_address"]
    }
  ],
  "status": "OK"
}
```

### Implementation

```typescript
// src/services/geocoding-service.ts
import axios from 'axios';
import { getFromCache, setInCache } from '../lib/redis-cache';
import logger from '../utils/logger';

interface GeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  // Check cache first (24-hour TTL)
  const cacheKey = `geocode:${address.toLowerCase().trim()}`;
  const cached = await getFromCache<GeocodeResult>(cacheKey);

  if (cached) {
    logger.debug('Geocoding cache hit', { address });
    return cached;
  }

  logger.info('Geocoding address', { address });

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          address,
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
        timeout: 10000, // 10 seconds
      }
    );

    const { data } = response;

    if (data.status !== 'OK') {
      throw new Error(`Geocoding failed: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }

    if (data.results.length === 0) {
      throw new Error('No results found for address');
    }

    const result = data.results[0];
    const geocoded: GeocodeResult = {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formatted_address: result.formatted_address,
    };

    // Cache for 24 hours
    await setInCache(cacheKey, geocoded, 24 * 60 * 60);

    logger.info('Geocoding successful', {
      address,
      lat: geocoded.lat,
      lng: geocoded.lng,
    });

    return geocoded;
  } catch (error) {
    logger.error('Geocoding failed', {
      address,
      error: error.message,
    });

    // Rethrow with more context
    throw new Error(`Failed to geocode address "${address}": ${error.message}`);
  }
}
```

### Status Codes

| Status | Meaning | Action |
|--------|---------|--------|
| `OK` | Success | Use results |
| `ZERO_RESULTS` | No results found | Prompt user to verify address |
| `OVER_QUERY_LIMIT` | API quota exceeded | Retry with backoff, alert admins |
| `REQUEST_DENIED` | API key invalid | Check configuration |
| `INVALID_REQUEST` | Missing parameters | Fix request format |

### Usage Example

```typescript
// When user updates home address
router.patch('/users/me/settings/address', authenticateJWT, async (req, res) => {
  const { address } = req.body;

  try {
    // Geocode the address
    const { lat, lng, formatted_address } = await geocodeAddress(address);

    // Update user record
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        home_address: formatted_address,
        home_lat: lat,
        home_lng: lng,
      },
    });

    res.json({
      home_address: formatted_address,
      home_lat: lat,
      home_lng: lng,
    });
  } catch (error) {
    logger.error('Failed to update home address', { error });
    res.status(400).json({
      error: 'GEOCODING_FAILED',
      message: 'Unable to find location. Please check the address.',
    });
  }
});
```

---

## DIRECTIONS API

### Purpose

Calculate driving route between two locations (detailed turn-by-turn directions).

**Note:** Currently not used in the application, but available for future features (e.g., showing route map).

### API Request Format

**Endpoint:**
```
GET https://maps.googleapis.com/maps/api/directions/json
```

**Parameters:**
- `origin` (required): Starting point (lat,lng or address)
- `destination` (required): End point (lat,lng or address)
- `mode` (optional): Travel mode (driving, walking, bicycling, transit)
- `departure_time` (optional): Unix timestamp for traffic-aware routing
- `key` (required): API key

**Example Request:**
```http
GET https://maps.googleapis.com/maps/api/directions/json?origin=37.7749,-122.4194&destination=37.7850,-122.4200&mode=driving&departure_time=now&key=YOUR_API_KEY
```

### API Response Format

```json
{
  "routes": [
    {
      "legs": [
        {
          "distance": { "text": "5.2 km", "value": 5200 },
          "duration": { "text": "12 mins", "value": 720 },
          "duration_in_traffic": { "text": "18 mins", "value": 1080 },
          "start_address": "San Francisco, CA, USA",
          "end_address": "Oakland, CA, USA",
          "steps": [ /* turn-by-turn directions */ ]
        }
      ],
      "overview_polyline": { "points": "encoded_polyline_string" }
    }
  ],
  "status": "OK"
}
```

### Implementation (For Future Use)

```typescript
// src/services/directions-service.ts
export async function getDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  departureTime?: Date
): Promise<DirectionsResult> {
  const response = await axios.get(
    'https://maps.googleapis.com/maps/api/directions/json',
    {
      params: {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: 'driving',
        departure_time: departureTime ? Math.floor(departureTime.getTime() / 1000) : 'now',
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    }
  );

  const { data } = response;

  if (data.status !== 'OK') {
    throw new Error(`Directions API failed: ${data.status}`);
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    distance_meters: leg.distance.value,
    duration_seconds: leg.duration.value,
    duration_in_traffic_seconds: leg.duration_in_traffic?.value || leg.duration.value,
    steps: leg.steps,
    polyline: route.overview_polyline.points,
  };
}
```

---

## DISTANCE MATRIX API

### Purpose

Calculate travel time and distance between multiple origins and destinations. **This is the primary API used for drive time calculation.**

### Use Cases

1. **Initial Drive Time Calculation:** When event is assigned, calculate departure/return drive times
2. **Traffic Recalculation:** Hourly job updates drive times based on current traffic

### API Request Format

**Endpoint:**
```
GET https://maps.googleapis.com/maps/api/distancematrix/json
```

**Parameters:**
- `origins` (required): Starting points (lat,lng pairs separated by |)
- `destinations` (required): End points (lat,lng pairs separated by |)
- `mode` (optional): Travel mode (default: driving)
- `departure_time` (optional): Unix timestamp for traffic-aware routing
- `traffic_model` (optional): `best_guess`, `pessimistic`, `optimistic`
- `key` (required): API key

**Example Request:**
```http
GET https://maps.googleapis.com/maps/api/distancematrix/json?origins=37.7749,-122.4194&destinations=37.7850,-122.4200&departure_time=1609459200&traffic_model=best_guess&key=YOUR_API_KEY
```

### API Response Format

```json
{
  "destination_addresses": ["Oakland, CA, USA"],
  "origin_addresses": ["San Francisco, CA, USA"],
  "rows": [
    {
      "elements": [
        {
          "distance": { "text": "5.2 km", "value": 5200 },
          "duration": { "text": "12 mins", "value": 720 },
          "duration_in_traffic": { "text": "18 mins", "value": 1080 },
          "status": "OK"
        }
      ]
    }
  ],
  "status": "OK"
}
```

### Implementation

```typescript
// src/services/distance-matrix-service.ts
import axios from 'axios';
import { getFromCache, setInCache } from '../lib/redis-cache';
import logger from '../utils/logger';

interface DistanceMatrixResult {
  distance_meters: number;
  duration_seconds: number;
  duration_in_traffic_seconds: number;
}

export async function calculateDriveTime(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  departureTime: Date
): Promise<DistanceMatrixResult> {
  // Cache key includes departure time rounded to nearest hour
  const departureHour = new Date(departureTime);
  departureHour.setMinutes(0, 0, 0);
  const cacheKey = `distance:${origin.lat},${origin.lng}:${destination.lat},${destination.lng}:${departureHour.getTime()}`;

  // Check cache (1-hour TTL)
  const cached = await getFromCache<DistanceMatrixResult>(cacheKey);
  if (cached) {
    logger.debug('Distance Matrix cache hit', { origin, destination });
    return cached;
  }

  logger.info('Calculating drive time', { origin, destination, departureTime });

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/distancematrix/json',
      {
        params: {
          origins: `${origin.lat},${origin.lng}`,
          destinations: `${destination.lat},${destination.lng}`,
          mode: 'driving',
          departure_time: Math.floor(departureTime.getTime() / 1000),
          traffic_model: 'best_guess',
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
        timeout: 10000,
      }
    );

    const { data } = response;

    if (data.status !== 'OK') {
      throw new Error(`Distance Matrix API failed: ${data.status}`);
    }

    const element = data.rows[0].elements[0];

    if (element.status !== 'OK') {
      throw new Error(`Distance Matrix element failed: ${element.status}`);
    }

    const result: DistanceMatrixResult = {
      distance_meters: element.distance.value,
      duration_seconds: element.duration.value,
      duration_in_traffic_seconds: element.duration_in_traffic?.value || element.duration.value,
    };

    // Cache for 1 hour
    await setInCache(cacheKey, result, 60 * 60);

    logger.info('Drive time calculated', {
      origin,
      destination,
      durationMinutes: Math.ceil(result.duration_in_traffic_seconds / 60),
    });

    return result;
  } catch (error) {
    logger.error('Distance Matrix API failed', {
      origin,
      destination,
      error: error.message,
    });
    throw new Error(`Failed to calculate drive time: ${error.message}`);
  }
}
```

### Usage Example (Creating Supplemental Events)

```typescript
// src/services/supplemental-event-service.ts
import { calculateDriveTime } from './distance-matrix-service';

export async function createSupplementalEvents(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      assigned_to: true,
      event_calendar: true,
    },
  });

  if (!event || !event.assigned_to) {
    throw new Error('Event not found or not assigned');
  }

  const user = event.assigned_to;

  if (!user.home_lat || !user.home_lng || !event.location_lat || !event.location_lng) {
    logger.warn('Missing coordinates for supplemental event creation', { eventId });
    return;
  }

  // Calculate drive time from home to event
  const driveTimeResult = await calculateDriveTime(
    { lat: user.home_lat.toNumber(), lng: user.home_lng.toNumber() },
    { lat: event.location_lat.toNumber(), lng: event.location_lng.toNumber() },
    event.start_time
  );

  const driveTimeMinutes = Math.ceil(driveTimeResult.duration_in_traffic_seconds / 60);
  const comfortBuffer = user.comfort_buffer_minutes;

  // Calculate departure time
  const departureTime = new Date(
    event.start_time.getTime() - (driveTimeMinutes + comfortBuffer) * 60 * 1000
  );

  // Create departure event
  await prisma.supplementalEvent.create({
    data: {
      parent_event_id: eventId,
      type: 'departure',
      title: `Drive to ${event.title}`,
      start_time: departureTime,
      end_time: event.start_time,
      origin_address: user.home_address!,
      origin_lat: user.home_lat,
      origin_lng: user.home_lng,
      destination_address: event.location!,
      destination_lat: event.location_lat,
      destination_lng: event.location_lng,
      drive_time_minutes: driveTimeMinutes,
      last_traffic_check: new Date(),
    },
  });

  // Calculate return drive time
  const returnDriveTimeResult = await calculateDriveTime(
    { lat: event.location_lat.toNumber(), lng: event.location_lng.toNumber() },
    { lat: user.home_lat.toNumber(), lng: user.home_lng.toNumber() },
    event.end_time
  );

  const returnDriveTimeMinutes = Math.ceil(returnDriveTimeResult.duration_in_traffic_seconds / 60);

  // Create return event
  await prisma.supplementalEvent.create({
    data: {
      parent_event_id: eventId,
      type: 'return',
      title: `Drive home from ${event.title}`,
      start_time: event.end_time,
      end_time: new Date(event.end_time.getTime() + returnDriveTimeMinutes * 60 * 1000),
      origin_address: event.location!,
      origin_lat: event.location_lat,
      origin_lng: event.location_lng,
      destination_address: user.home_address!,
      destination_lat: user.home_lat,
      destination_lng: user.home_lng,
      drive_time_minutes: returnDriveTimeMinutes,
      last_traffic_check: new Date(),
    },
  });

  logger.info('Created supplemental events', {
    eventId,
    departureDriveTime: driveTimeMinutes,
    returnDriveTime: returnDriveTimeMinutes,
  });
}
```

---

## CACHING STRATEGY

### Redis Cache Implementation

```typescript
// src/lib/redis-cache.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    logger.error('Redis get failed', { key, error });
    return null; // Fail gracefully
  }
}

export async function setInCache(key: string, value: any, ttlSeconds: number): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logger.error('Redis set failed', { key, error });
    // Don't throw - caching failure shouldn't break the request
  }
}

export async function deleteFromCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    logger.error('Redis delete failed', { key, error });
  }
}
```

### Cache TTL Strategy

| Data Type | TTL | Reason |
|-----------|-----|--------|
| **Geocoding Results** | 24 hours | Addresses rarely change coordinates |
| **Distance Matrix (traffic)** | 1 hour | Traffic conditions change frequently |
| **Directions** | 1 hour | Routes may change with traffic |

### Cache Key Patterns

```typescript
// Geocoding
`geocode:${address.toLowerCase().trim()}`

// Distance Matrix (rounded to nearest hour)
`distance:${origin.lat},${origin.lng}:${dest.lat},${dest.lng}:${departureHour.getTime()}`
```

---

## ERROR HANDLING

### Status Code Handling

```typescript
// src/services/google-maps-error-handler.ts
export function handleGoogleMapsError(status: string, errorMessage?: string): Error {
  switch (status) {
    case 'OK':
      return null; // No error

    case 'ZERO_RESULTS':
      return new Error('No results found. Please check the address or coordinates.');

    case 'OVER_QUERY_LIMIT':
      logger.error('Google Maps API quota exceeded');
      return new Error('Service temporarily unavailable. Please try again later.');

    case 'REQUEST_DENIED':
      logger.error('Google Maps API key invalid or API not enabled', { errorMessage });
      return new Error('Service configuration error. Please contact support.');

    case 'INVALID_REQUEST':
      return new Error('Invalid request. Please check your input.');

    case 'UNKNOWN_ERROR':
      logger.error('Google Maps API returned unknown error');
      return new Error('An unexpected error occurred. Please try again.');

    case 'NOT_FOUND':
      return new Error('Location not found.');

    default:
      logger.error('Unexpected Google Maps API status', { status, errorMessage });
      return new Error('An unexpected error occurred.');
  }
}
```

### Retry Logic

```typescript
// src/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors
      if (error.message.includes('INVALID_REQUEST') || error.message.includes('REQUEST_DENIED')) {
        throw error;
      }

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        logger.warn('Retrying Google Maps API call', { attempt: attempt + 1, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Usage:
const result = await retryWithBackoff(() => geocodeAddress(address));
```

### Fallback Strategy

```typescript
// If Google Maps fails, use last known coordinates or skip supplemental events
export async function createSupplementalEventsWithFallback(eventId: string, userId: string) {
  try {
    await createSupplementalEvents(eventId, userId);
  } catch (error) {
    logger.error('Failed to create supplemental events', { eventId, userId, error });

    // Log error but don't fail the event assignment
    // Supplemental events are nice-to-have, not critical
    logger.warn('Supplemental events skipped due to Google Maps error', { eventId });
  }
}
```

---

## COST OPTIMIZATION

### Pricing (as of 2024)

| API | Cost per Request | Free Tier (with $200 credit) |
|-----|------------------|-------------------------------|
| **Geocoding API** | $0.005 per request | ~40,000 requests/month |
| **Distance Matrix API** | $0.005 per element | ~40,000 elements/month |
| **Directions API** | $0.005 per request | ~40,000 requests/month |

**Note:** Prices subject to change. Check [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/) for current rates.

### Cost Reduction Strategies

1. **Aggressive Caching:**
   - Geocoding: 24-hour cache (addresses don't change)
   - Distance Matrix: 1-hour cache (traffic changes)
   - Estimated savings: 80-90% of API calls

2. **Batch Requests:**
   - Distance Matrix supports up to 25 origins × 25 destinations per request
   - Use for bulk operations (not currently needed but available)

3. **Only Calculate When Needed:**
   - Don't calculate drive times for unassigned events
   - Only recalculate traffic for events within 48 hours
   - Skip supplemental events if user hasn't set home address

4. **Fallback to Estimated Drive Times:**
   - If API fails, use last known drive time
   - Or estimate based on straight-line distance (not recommended for accuracy)

### Usage Monitoring

```typescript
// src/utils/api-usage-tracker.ts
import { Counter } from 'prom-client';

export const googleMapsApiCallsCounter = new Counter({
  name: 'google_maps_api_calls_total',
  help: 'Total number of Google Maps API calls',
  labelNames: ['api', 'status'], // api: geocoding | distance_matrix | directions
});

// Increment after each API call
googleMapsApiCallsCounter.inc({ api: 'geocoding', status: 'success' });
googleMapsApiCallsCounter.inc({ api: 'distance_matrix', status: 'failed' });
```

**Set up alerts** when monthly usage exceeds 80% of free tier ($160 of $200).

---

## TESTING

### Unit Tests

```typescript
// tests/services/geocoding.test.ts
import { describe, it, expect, vi } from 'vitest';
import { geocodeAddress } from '../../src/services/geocoding-service';
import axios from 'axios';

vi.mock('axios');

describe('Geocoding Service', () => {
  it('should geocode address successfully', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        status: 'OK',
        results: [
          {
            formatted_address: '1600 Amphitheatre Parkway, Mountain View, CA 94043, USA',
            geometry: {
              location: { lat: 37.4224764, lng: -122.0842499 },
            },
          },
        ],
      },
    });

    const result = await geocodeAddress('1600 Amphitheatre Parkway');

    expect(result.lat).toBe(37.4224764);
    expect(result.lng).toBe(-122.0842499);
    expect(result.formatted_address).toContain('Mountain View');
  });

  it('should handle ZERO_RESULTS', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { status: 'ZERO_RESULTS', results: [] },
    });

    await expect(geocodeAddress('invalid address')).rejects.toThrow('No results found');
  });

  it('should use cache on second call', async () => {
    const address = '123 Test St';

    // Mock cache hit
    vi.spyOn(redisCache, 'getFromCache').mockResolvedValue({
      lat: 37.0,
      lng: -122.0,
      formatted_address: '123 Test St, City, CA',
    });

    const result = await geocodeAddress(address);

    expect(axios.get).not.toHaveBeenCalled(); // Should not call API
    expect(result.lat).toBe(37.0);
  });
});
```

### Integration Tests

```typescript
// tests/integration/google-maps.test.ts
import { describe, it, expect } from 'vitest';
import { geocodeAddress } from '../../src/services/geocoding-service';
import { calculateDriveTime } from '../../src/services/distance-matrix-service';

describe('Google Maps Integration', () => {
  it('should geocode real address', async () => {
    const result = await geocodeAddress('1600 Amphitheatre Parkway, Mountain View, CA');

    expect(result.lat).toBeCloseTo(37.422, 1);
    expect(result.lng).toBeCloseTo(-122.084, 1);
  });

  it('should calculate drive time with traffic', async () => {
    const origin = { lat: 37.7749, lng: -122.4194 }; // San Francisco
    const destination = { lat: 37.7850, lng: -122.4200 }; // Oakland
    const departureTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    const result = await calculateDriveTime(origin, destination, departureTime);

    expect(result.duration_in_traffic_seconds).toBeGreaterThan(0);
    expect(result.distance_meters).toBeGreaterThan(0);
  });
});
```

### Manual Testing with Postman

**Test Geocoding:**
```http
GET https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA&key=YOUR_API_KEY
```

**Test Distance Matrix:**
```http
GET https://maps.googleapis.com/maps/api/distancematrix/json?origins=37.7749,-122.4194&destinations=37.7850,-122.4200&departure_time=now&key=YOUR_API_KEY
```

---

## SUMMARY CHECKLIST

### Setup
- [ ] Geocoding API enabled in Google Cloud Console
- [ ] Distance Matrix API enabled
- [ ] Directions API enabled (optional, for future use)
- [ ] API key created and added to `.env`
- [ ] API key restricted to Maps APIs only
- [ ] Billing enabled with budget alerts

### Implementation
- [ ] Geocoding service with caching
- [ ] Distance Matrix service with traffic-aware routing
- [ ] Cache implementation with Redis (TTL: 24h for geocoding, 1h for distance)
- [ ] Error handling for all status codes
- [ ] Retry logic with exponential backoff
- [ ] Fallback strategy for API failures

### Cost Optimization
- [ ] Aggressive caching implemented
- [ ] Only calculate drive times for assigned events
- [ ] Only recalculate traffic for events within 48 hours
- [ ] Usage monitoring with Prometheus
- [ ] Budget alerts configured in Google Cloud

### Testing
- [ ] Unit tests for geocoding service
- [ ] Unit tests for distance matrix service
- [ ] Integration tests with real API calls
- [ ] Mock responses for CI/CD pipeline
- [ ] Error scenario tests (ZERO_RESULTS, OVER_QUERY_LIMIT)

---

**Next Steps:** Proceed to [GOOGLE_CALENDAR_INTEGRATION.md](./GOOGLE_CALENDAR_INTEGRATION.md) for Google Calendar API integration.
