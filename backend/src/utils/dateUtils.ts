import { fromZonedTime } from 'date-fns-tz';

/**
 * Parse a date string (YYYY-MM-DD) as representing a specific timezone
 * Returns a Date object representing the start of that day in that timezone
 *
 * @param dateString - Date string in YYYY-MM-DD format (e.g., "2025-11-27")
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @param endOfDay - If true, returns 23:59:59.999 instead of 00:00:00
 * @returns Date object in UTC representing the correct instant
 */
export function parseDateInTimezone(
  dateString: string,
  timezone: string,
  endOfDay: boolean = false
): Date {
  // Parse the date parts
  const [year, month, day] = dateString.split('-').map(Number);

  // Create a date-time string for the specified time in the timezone
  // fromZonedTime converts a "wall clock" time in a timezone to UTC
  if (endOfDay) {
    // End of day: 23:59:59.999
    const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59.999`;
    return fromZonedTime(localDateStr, timezone);
  } else {
    // Start of day: 00:00:00.000
    const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000`;
    return fromZonedTime(localDateStr, timezone);
  }
}

/**
 * Default timezone to use when user hasn't set one
 * Falls back to America/New_York as a reasonable US default
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Get the start of today (midnight) in a specific timezone as a UTC Date
 *
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 * @returns Date object in UTC representing midnight today in the given timezone
 */
export function getStartOfTodayInTimezone(timezone: string): Date {
  // Get current date parts in the specified timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateString = formatter.format(now); // Returns YYYY-MM-DD

  // Convert that midnight in the timezone back to UTC
  return fromZonedTime(`${dateString}T00:00:00.000`, timezone);
}
