import { parseISO, differenceInMinutes, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export interface ArrivalTimeInfo {
  arrivalTime: Date;
  bufferMinutes: number;
  source: 'parsed' | 'default';
}

/**
 * Parse arrival time from TeamSnap event description
 * Example format: "(Arrival Time: 1:30 PM (Eastern Time (US & Canada)))"
 *
 * @param description - Event description that may contain arrival time
 * @param eventStartTime - The event's actual start time
 * @param defaultBufferMinutes - Fallback buffer if parsing fails (user's comfort_buffer_minutes)
 * @returns ArrivalTimeInfo with parsed or default buffer
 */
export function parseArrivalTime(
  description: string | null | undefined,
  eventStartTime: Date,
  defaultBufferMinutes: number
): ArrivalTimeInfo {
  if (!description) {
    return {
      arrivalTime: new Date(eventStartTime.getTime() - defaultBufferMinutes * 60000),
      bufferMinutes: defaultBufferMinutes,
      source: 'default',
    };
  }

  try {
    // Regex to match: (Arrival Time: 1:30 PM (Eastern Time (US & Canada)))
    // or: (Arrival Time: 1:30 PM (timezone))
    const arrivalTimeRegex = /\(Arrival Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*\(([^)]+)\)\)/i;
    const match = description.match(arrivalTimeRegex);

    if (!match) {
      return {
        arrivalTime: new Date(eventStartTime.getTime() - defaultBufferMinutes * 60000),
        bufferMinutes: defaultBufferMinutes,
        source: 'default',
      };
    }

    const timeString = match[1]; // e.g., "1:30 PM"
    const timezoneString = match[2]; // e.g., "Eastern Time (US & Canada)"

    // Map timezone strings to IANA timezone identifiers
    const timezone = mapTimezoneString(timezoneString);

    // Parse the time string on the same date as the event
    const eventDate = eventStartTime.toISOString().split('T')[0]; // Get YYYY-MM-DD
    const dateTimeString = `${eventDate} ${timeString}`;

    // Parse the time in the event's timezone
    const parsedTime = parse(dateTimeString, 'yyyy-MM-dd h:mm a', new Date());
    const arrivalTime = toZonedTime(parsedTime, timezone);

    // Calculate buffer in minutes
    const bufferMinutes = differenceInMinutes(eventStartTime, arrivalTime);

    // Sanity check: buffer should be positive and reasonable (0-120 minutes)
    if (bufferMinutes < 0 || bufferMinutes > 120) {
      console.warn(`Parsed buffer ${bufferMinutes} minutes is out of range, using default`);
      return {
        arrivalTime: new Date(eventStartTime.getTime() - defaultBufferMinutes * 60000),
        bufferMinutes: defaultBufferMinutes,
        source: 'default',
      };
    }

    return {
      arrivalTime,
      bufferMinutes,
      source: 'parsed',
    };
  } catch (error) {
    console.error('Error parsing arrival time:', error);
    return {
      arrivalTime: new Date(eventStartTime.getTime() - defaultBufferMinutes * 60000),
      bufferMinutes: defaultBufferMinutes,
      source: 'default',
    };
  }
}

/**
 * Map common timezone strings to IANA timezone identifiers
 */
function mapTimezoneString(timezoneString: string): string {
  const timezoneMap: Record<string, string> = {
    'Eastern Time (US & Canada)': 'America/New_York',
    'Eastern Time': 'America/New_York',
    'Central Time (US & Canada)': 'America/Chicago',
    'Central Time': 'America/Chicago',
    'Mountain Time (US & Canada)': 'America/Denver',
    'Mountain Time': 'America/Denver',
    'Pacific Time (US & Canada)': 'America/Los_Angeles',
    'Pacific Time': 'America/Los_Angeles',
    'Alaska Time': 'America/Anchorage',
    'Hawaii Time': 'Pacific/Honolulu',
    'Arizona Time': 'America/Phoenix',
  };

  // Try exact match first
  if (timezoneMap[timezoneString]) {
    return timezoneMap[timezoneString];
  }

  // Try case-insensitive match
  const lowerTimezone = timezoneString.toLowerCase();
  for (const [key, value] of Object.entries(timezoneMap)) {
    if (key.toLowerCase() === lowerTimezone) {
      return value;
    }
  }

  // Try partial match (e.g., "Eastern" matches "Eastern Time")
  for (const [key, value] of Object.entries(timezoneMap)) {
    if (key.toLowerCase().includes(lowerTimezone) || lowerTimezone.includes(key.toLowerCase())) {
      return value;
    }
  }

  // Default to Eastern Time if we can't parse
  console.warn(`Unknown timezone: ${timezoneString}, defaulting to America/New_York`);
  return 'America/New_York';
}

/**
 * Extract location from description
 * TeamSnap format: "Location: Turf (Arrival Time: ...)"
 *
 * @param description - Event description
 * @returns Extracted location or null
 */
export function extractLocationFromDescription(description: string | null | undefined): string | null {
  if (!description) {
    return null;
  }

  try {
    // Match "Location: <location name>"
    const locationRegex = /Location:\s*([^(]+?)(?:\s*\(|$)/i;
    const match = description.match(locationRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  } catch (error) {
    console.error('Error extracting location:', error);
    return null;
  }
}
