export interface ArrivalTimeInfo {
  arrivalTime: Date;
  source: 'parsed' | 'none';
}

/**
 * Parse arrival time from TeamSnap event description
 * Example format: "(Arrival Time: 1:30 PM (Eastern Time (US & Canada)))"
 *
 * Returns the exact arrival time as specified in the description, or null if none found.
 * The comfort buffer is NOT applied here - it's added to drive time instead.
 *
 * @param description - Event description that may contain arrival time
 * @param eventStartTime - The event's actual start time (used to determine the date)
 * @returns ArrivalTimeInfo with parsed arrival time, or null if no arrival time in description
 */
export function parseArrivalTime(
  description: string | null | undefined,
  eventStartTime: Date
): ArrivalTimeInfo | null {
  if (!description) {
    return null;
  }

  try {
    // Regex to match: (Arrival Time: 1:30 PM (Eastern Time (US & Canada)))
    // or: (Arrival Time: 1:30 PM (timezone))
    const arrivalTimeRegex = /\(Arrival Time:\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*\(([^)]+)\)\)/i;
    const match = description.match(arrivalTimeRegex);

    if (!match) {
      return null;
    }

    const timeString = match[1]; // e.g., "1:30 PM"
    const timezoneString = match[2]; // e.g., "Eastern Time (US & Canada)"

    // Map timezone strings to IANA timezone identifiers
    const timezone = mapTimezoneString(timezoneString);

    // Parse arrival time string (e.g., "8:00 PM")
    const arrivalMatch = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!arrivalMatch) {
      console.warn(`Could not parse arrival time string: ${timeString}`);
      return null;
    }

    let arrivalHour = parseInt(arrivalMatch[1], 10);
    const arrivalMinute = parseInt(arrivalMatch[2], 10);
    const arrivalPeriod = arrivalMatch[3].toUpperCase();

    // Convert to 24-hour format
    if (arrivalPeriod === 'PM' && arrivalHour !== 12) {
      arrivalHour += 12;
    } else if (arrivalPeriod === 'AM' && arrivalHour === 12) {
      arrivalHour = 0;
    }

    // Get event start time in local timezone to determine the date
    const eventHour = parseInt(eventStartTime.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }), 10);
    const eventMinute = parseInt(eventStartTime.toLocaleString('en-US', { timeZone: timezone, minute: '2-digit' }), 10);

    // Calculate buffer in minutes (event time - arrival time) to get the offset
    const eventMinutesFromMidnight = eventHour * 60 + eventMinute;
    const arrivalMinutesFromMidnight = arrivalHour * 60 + arrivalMinute;
    const bufferMinutes = eventMinutesFromMidnight - arrivalMinutesFromMidnight;

    // Sanity check: arrival should be before or at event start (0-120 minutes before)
    if (bufferMinutes < 0 || bufferMinutes > 120) {
      console.warn(`Arrival time ${arrivalHour}:${arrivalMinute} is outside expected range relative to event start`);
      return null;
    }

    // If arrival time equals event start, no early arrival needed
    if (bufferMinutes === 0) {
      return null;
    }

    // Calculate arrival time by subtracting buffer from event start
    const arrivalTime = new Date(eventStartTime.getTime() - bufferMinutes * 60000);

    console.log(`[parseArrivalTime] Parsed arrival time: ${arrivalTime.toISOString()} (${bufferMinutes} min before event)`);

    return {
      arrivalTime,
      source: 'parsed',
    };
  } catch (error) {
    console.error('Error parsing arrival time:', error);
    return null;
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
