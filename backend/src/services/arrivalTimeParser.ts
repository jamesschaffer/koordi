import { parseISO, differenceInMinutes, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export interface ArrivalTimeInfo {
  arrivalTime: Date;
  bufferMinutes: number;
  comfortBufferMinutes: number;
  source: 'parsed' | 'default';
}

/**
 * Parse arrival time from TeamSnap event description
 * Example format: "(Arrival Time: 1:30 PM (Eastern Time (US & Canada)))"
 *
 * When an arrival time is parsed from the description:
 * - The parsed arrival time represents when the team/coach expects you to arrive
 * - The comfort buffer is ADDED on top of this, so you arrive even earlier
 * - Example: If event description says "Arrival Time: 1:30 PM" and comfort buffer is 5 min,
 *   the effective arrival time becomes 1:25 PM
 *
 * When no arrival time is found in the description:
 * - The comfort buffer is subtracted from the event start time as the arrival time
 *
 * @param description - Event description that may contain arrival time
 * @param eventStartTime - The event's actual start time
 * @param comfortBufferMinutes - User's comfort buffer (always added on top of arrival time)
 * @returns ArrivalTimeInfo with parsed or default buffer, plus comfort buffer applied
 */
export function parseArrivalTime(
  description: string | null | undefined,
  eventStartTime: Date,
  comfortBufferMinutes: number
): ArrivalTimeInfo {
  if (!description) {
    // No description, use event start time minus comfort buffer
    const arrivalTime = new Date(eventStartTime.getTime() - comfortBufferMinutes * 60000);
    return {
      arrivalTime,
      bufferMinutes: comfortBufferMinutes,
      comfortBufferMinutes,
      source: 'default',
    };
  }

  try {
    // Regex to match: (Arrival Time: 1:30 PM (Eastern Time (US & Canada)))
    // or: (Arrival Time: 1:30 PM (timezone))
    const arrivalTimeRegex = /\(Arrival Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*\(([^)]+)\)\)/i;
    const match = description.match(arrivalTimeRegex);

    if (!match) {
      // No arrival time found in description, use event start time minus comfort buffer
      const arrivalTime = new Date(eventStartTime.getTime() - comfortBufferMinutes * 60000);
      return {
        arrivalTime,
        bufferMinutes: comfortBufferMinutes,
        comfortBufferMinutes,
        source: 'default',
      };
    }

    const timeString = match[1]; // e.g., "1:30 PM"
    const timezoneString = match[2]; // e.g., "Eastern Time (US & Canada)"

    // Map timezone strings to IANA timezone identifiers
    const timezone = mapTimezoneString(timezoneString);

    // IMPORTANT: Extract the date in the EVENT'S LOCAL TIMEZONE, not UTC
    // Example: 8:30 PM EST Dec 1 is stored as 2025-12-02T01:30:00Z (Dec 2 in UTC)
    // If we used UTC date (Dec 2), we'd parse "Dec 2 8:00 PM" instead of "Dec 1 8:00 PM"
    const year = eventStartTime.toLocaleString('en-US', { timeZone: timezone, year: 'numeric' });
    const month = eventStartTime.toLocaleString('en-US', { timeZone: timezone, month: '2-digit' });
    const day = eventStartTime.toLocaleString('en-US', { timeZone: timezone, day: '2-digit' });
    const eventDateLocal = `${year}-${month}-${day}`;

    const dateTimeString = `${eventDateLocal} ${timeString}`;

    // Parse the time in the event's timezone
    const parsedTime = parse(dateTimeString, 'yyyy-MM-dd h:mm a', new Date());
    const zonedArrivalTime = toZonedTime(parsedTime, timezone);

    // Calculate the buffer from the parsed arrival time to event start (before adding comfort buffer)
    const parsedBufferMinutes = differenceInMinutes(eventStartTime, zonedArrivalTime);

    // Sanity check: parsed buffer should be positive and reasonable (0-120 minutes)
    if (parsedBufferMinutes < 0 || parsedBufferMinutes > 120) {
      console.warn(`Parsed buffer ${parsedBufferMinutes} minutes is out of range, using default`);
      const defaultArrivalTime = new Date(eventStartTime.getTime() - comfortBufferMinutes * 60000);
      return {
        arrivalTime: defaultArrivalTime,
        bufferMinutes: comfortBufferMinutes,
        comfortBufferMinutes,
        source: 'default',
      };
    }

    // Apply comfort buffer ON TOP of the parsed arrival time
    // If description says "Arrival Time: 1:30 PM" and comfort buffer is 5 min,
    // effective arrival time becomes 1:25 PM
    const effectiveArrivalTime = new Date(zonedArrivalTime.getTime() - comfortBufferMinutes * 60000);

    // Total buffer is parsed buffer + comfort buffer
    const totalBufferMinutes = parsedBufferMinutes + comfortBufferMinutes;

    console.log(`Parsed arrival time: ${zonedArrivalTime.toISOString()}, adding ${comfortBufferMinutes}min comfort buffer, effective arrival: ${effectiveArrivalTime.toISOString()}`);

    return {
      arrivalTime: effectiveArrivalTime,
      bufferMinutes: totalBufferMinutes,
      comfortBufferMinutes,
      source: 'parsed',
    };
  } catch (error) {
    console.error('Error parsing arrival time:', error);
    const arrivalTime = new Date(eventStartTime.getTime() - comfortBufferMinutes * 60000);
    return {
      arrivalTime,
      bufferMinutes: comfortBufferMinutes,
      comfortBufferMinutes,
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
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'Central Time (US & Canada)': 'America/Chicago',
    'Central Time': 'America/Chicago',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'Mountain Time (US & Canada)': 'America/Denver',
    'Mountain Time': 'America/Denver',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'Pacific Time (US & Canada)': 'America/Los_Angeles',
    'Pacific Time': 'America/Los_Angeles',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
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
