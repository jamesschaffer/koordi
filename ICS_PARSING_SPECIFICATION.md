# ICS Feed Parsing Specification
## Koordi

**Purpose:** Complete specification for parsing ICS (iCalendar) feeds
**Library:** ical.js (Mozilla Calendar Data API)
**Use Case:** Import events from external calendar feeds (TeamSnap, sports leagues, school calendars)

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [ICS Format Basics](#ics-format-basics)
3. [Library Setup](#library-setup)
4. [Parsing Implementation](#parsing-implementation)
5. [Field Mapping](#field-mapping)
6. [Timezone Handling](#timezone-handling)
7. [Recurring Events](#recurring-events)
8. [Description Field Parsing](#description-field-parsing)
9. [Validation & Error Handling](#validation--error-handling)
10. [Testing](#testing)

---

## OVERVIEW

### What is ICS?

ICS (iCalendar) is a standard format (RFC 5545) for representing calendar and scheduling information. It's plain text format widely supported by calendar applications.

**Example ICS File:**
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TeamSnap//Calendar//EN
X-WR-CALNAME:Soccer - Spring 2024
X-WR-TIMEZONE:America/Los_Angeles
BEGIN:VEVENT
UID:event-12345@teamsnap.com
DTSTART:20240320T160000Z
DTEND:20240320T173000Z
SUMMARY:Soccer Practice
LOCATION:Lincoln Field\, 1234 Sports Dr\, San Francisco\, CA
DESCRIPTION:Practice for U10 team. Bring water and shin guards.
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR
```

### Parsing Goals

1. **Extract Event Data:** Parse VEVENT components into structured data
2. **Handle Timezones:** Convert all times to UTC for database storage
3. **Support Recurring Events:** Expand recurring events into individual instances
4. **Geocode Locations:** Extract location text for geocoding
5. **Idempotency:** Use UID to detect duplicates and updates

---

## ICS FORMAT BASICS

### Core Components

| Component | Purpose | Example |
|-----------|---------|---------|
| `VCALENDAR` | Root container | Wraps entire calendar |
| `VEVENT` | Individual event | Soccer practice, game, etc. |
| `VTODO` | Task/to-do item | Not used in our app |
| `VJOURNAL` | Journal entry | Not used in our app |

### Common Properties

| Property | Description | Required | Example |
|----------|-------------|----------|---------|
| `UID` | Unique identifier | Yes | `event-12345@teamsnap.com` |
| `DTSTART` | Start date/time | Yes | `20240320T160000Z` |
| `DTEND` | End date/time | No* | `20240320T173000Z` |
| `DURATION` | Duration (alternative to DTEND) | No* | `PT1H30M` (1 hour 30 min) |
| `SUMMARY` | Event title | No | `Soccer Practice` |
| `DESCRIPTION` | Event description | No | `Bring water and shin guards.` |
| `LOCATION` | Event location | No | `Lincoln Field, San Francisco` |
| `LAST-MODIFIED` | Last modification time | No | `20240301T120000Z` |
| `RRULE` | Recurrence rule | No | `FREQ=WEEKLY;COUNT=10` |

*Either DTEND or DURATION must be present, not both.

### Date/Time Formats

**UTC Time (ends with Z):**
```
DTSTART:20240320T160000Z
```

**Local Time (with timezone):**
```
DTSTART;TZID=America/Los_Angeles:20240320T090000
```

**All-day Event (date only):**
```
DTSTART;VALUE=DATE:20240320
```

---

## LIBRARY SETUP

### Installation

```bash
npm install ical.js
npm install -D @types/ical.js
```

### Basic Usage

```typescript
import ICAL from 'ical.js';

// Parse ICS string
const jcalData = ICAL.parse(icsString);

// Create component
const comp = new ICAL.Component(jcalData);

// Get all events
const vevents = comp.getAllSubcomponents('vevent');

// Process each event
for (const vevent of vevents) {
  const event = new ICAL.Event(vevent);
  console.log(event.summary, event.startDate.toJSDate());
}
```

---

## PARSING IMPLEMENTATION

### Complete Parser Service

```typescript
// src/services/ics-parser-service.ts
import ICAL from 'ical.js';
import axios from 'axios';
import logger from '../utils/logger';

interface ParsedEvent {
  ics_uid: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: Date;
  end_time: Date;
  is_all_day: boolean;
  last_modified: Date;
}

export async function fetchAndParseIcsFeed(icsUrl: string): Promise<ParsedEvent[]> {
  logger.info('Fetching ICS feed', { icsUrl });

  try {
    // 1. Fetch ICS data
    const response = await axios.get(icsUrl, {
      timeout: 30000, // 30 seconds
      headers: {
        'User-Agent': 'FamilyScheduleApp/1.0',
        'Accept': 'text/calendar',
      },
      maxContentLength: 10 * 1024 * 1024, // 10MB max
    });

    const icsData = response.data;

    // 2. Validate content type
    const contentType = response.headers['content-type'];
    if (!contentType?.includes('text/calendar') && !contentType?.includes('text/plain')) {
      logger.warn('Unexpected content type for ICS feed', { contentType, icsUrl });
    }

    // 3. Parse ICS data
    return parseIcsString(icsData);
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error(`Unable to reach calendar feed: ${error.message}`);
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Calendar feed request timed out');
    } else {
      throw new Error(`Failed to fetch ICS feed: ${error.message}`);
    }
  }
}

export function parseIcsString(icsData: string): ParsedEvent[] {
  try {
    // Parse ICS data
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);

    // Extract calendar timezone (if specified)
    const calendarTimezone = comp.getFirstPropertyValue('x-wr-timezone') || 'UTC';

    // Get all VEVENT components
    const vevents = comp.getAllSubcomponents('vevent');

    logger.info('Parsed ICS feed', { eventCount: vevents.length, timezone: calendarTimezone });

    const events: ParsedEvent[] = [];

    for (const vevent of vevents) {
      try {
        const event = new ICAL.Event(vevent);

        // Skip events without UID (invalid)
        if (!event.uid) {
          logger.warn('Skipping event without UID');
          continue;
        }

        // Handle recurring events
        if (event.isRecurring()) {
          const expandedEvents = expandRecurringEvent(event, calendarTimezone);
          events.push(...expandedEvents);
        } else {
          events.push(parseEvent(event, calendarTimezone));
        }
      } catch (error) {
        logger.error('Failed to parse individual event', { error: error.message });
        // Continue processing other events
      }
    }

    return events;
  } catch (error) {
    logger.error('Failed to parse ICS data', { error: error.message });
    throw new Error(`Invalid ICS format: ${error.message}`);
  }
}

function parseEvent(event: ICAL.Event, calendarTimezone: string): ParsedEvent {
  // Extract basic properties
  const icsUid = event.uid;
  const title = event.summary || 'Untitled Event';
  const description = event.description || null;
  const location = event.location || null;

  // Parse start/end times
  const startDate = event.startDate;
  const endDate = event.endDate;

  // Detect all-day events
  const isAllDay = startDate.isDate;

  // Convert to JavaScript Date objects (UTC)
  const startTime = startDate.toJSDate();
  const endTime = endDate.toJSDate();

  // Get last modified time
  const lastModifiedIcal = event.component.getFirstPropertyValue('last-modified');
  const lastModified = lastModifiedIcal ? lastModifiedIcal.toJSDate() : new Date();

  return {
    ics_uid: icsUid,
    title,
    description,
    location,
    start_time: startTime,
    end_time: endTime,
    is_all_day: isAllDay,
    last_modified: lastModified,
  };
}
```

---

## FIELD MAPPING

### ICS Property → Database Field Mapping

| ICS Property | Database Field | Transformation | Example |
|--------------|----------------|----------------|---------|
| `UID` | `ics_uid` | Direct | `event-123@teamsnap.com` |
| `SUMMARY` | `title` | Direct, default to "Untitled Event" | `Soccer Practice` |
| `DESCRIPTION` | `description` | Direct, null if empty | `Bring water` |
| `LOCATION` | `location` | Direct, null if empty | `Lincoln Field, SF` |
| `DTSTART` | `start_time` | Parse to UTC Date | `2024-03-20 16:00:00+00` |
| `DTEND` or `DURATION` | `end_time` | Calculate UTC Date | `2024-03-20 17:30:00+00` |
| `DTSTART` (date only) | `is_all_day` | `true` if no time component | `true` |
| `LAST-MODIFIED` | `last_modified` | Parse to UTC Date, default to now | `2024-03-01 12:00:00+00` |

### Handling Missing Fields

```typescript
// Title: Default to "Untitled Event"
const title = event.summary || 'Untitled Event';

// Description: null if not present
const description = event.description || null;

// Location: null if not present
const location = event.location || null;

// End time: Calculate from duration if DTEND missing
let endTime: Date;
if (event.endDate) {
  endTime = event.endDate.toJSDate();
} else if (event.duration) {
  const startTime = event.startDate.toJSDate();
  const durationMs = event.duration.toSeconds() * 1000;
  endTime = new Date(startTime.getTime() + durationMs);
} else {
  // Default to 1 hour if neither DTEND nor DURATION present
  const startTime = event.startDate.toJSDate();
  endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
}
```

---

## TIMEZONE HANDLING

### Approach

**Always store in UTC:** Convert all times to UTC before saving to database. This ensures consistency and simplifies queries.

### Timezone Conversion with ical.js

```typescript
import ICAL from 'ical.js';

// ical.js automatically handles timezone conversion
const event = new ICAL.Event(vevent);

// startDate is ICAL.Time object
const startDate = event.startDate;

// Convert to JavaScript Date (automatically converts to local time, then we store as UTC)
const startTimeUTC = startDate.toJSDate();

// Database stores as timestamptz (timezone-aware), automatically converts to UTC
await prisma.event.create({
  data: {
    start_time: startTimeUTC, // Stored as UTC in PostgreSQL
  },
});
```

### Common Timezone Scenarios

**Scenario 1: UTC Time (Z suffix)**
```
DTSTART:20240320T160000Z
```
Already in UTC, no conversion needed.

**Scenario 2: Local Time with TZID**
```
DTSTART;TZID=America/Los_Angeles:20240320T090000
```
ical.js converts to UTC automatically using TZID.

**Scenario 3: Floating Time (no timezone)**
```
DTSTART:20240320T090000
```
Treated as calendar's default timezone (`X-WR-TIMEZONE`).

### Implementation

```typescript
function parseEventWithTimezone(event: ICAL.Event, calendarTimezone: string): ParsedEvent {
  // ical.js handles timezone conversion internally
  const startTime = event.startDate.toJSDate(); // Returns JavaScript Date in local time
  const endTime = event.endDate.toJSDate();

  // PostgreSQL timestamptz stores in UTC automatically
  return {
    start_time: startTime,
    end_time: endTime,
    // ... other fields
  };
}
```

---

## RECURRING EVENTS

### Recurrence Rules (RRULE)

ICS supports recurring events using the `RRULE` property:

**Example: Weekly for 10 weeks**
```
RRULE:FREQ=WEEKLY;COUNT=10
```

**Example: Daily for 30 days**
```
RRULE:FREQ=DAILY;UNTIL=20240420T000000Z
```

### Expansion Strategy

**Approach:** Expand recurring events into individual instances during ICS sync.

**Rationale:**
- Simpler event assignment (each instance can be assigned independently)
- Easier conflict detection
- Consistent data model (no special handling for recurring events)

### Implementation

```typescript
function expandRecurringEvent(event: ICAL.Event, calendarTimezone: string): ParsedEvent[] {
  const expandedEvents: ParsedEvent[] = [];

  // Define expansion window (next 1 year)
  const now = ICAL.Time.now();
  const oneYearFromNow = now.clone();
  oneYearFromNow.year += 1;

  // Create iterator for recurrence
  const iterator = event.iterator();

  let occurrence: ICAL.Time;
  while ((occurrence = iterator.next())) {
    // Stop if beyond expansion window
    if (occurrence.compare(oneYearFromNow) > 0) {
      break;
    }

    // Skip if before today
    if (occurrence.compare(now) < 0) {
      continue;
    }

    // Calculate duration
    const duration = event.duration;
    const startTime = occurrence.toJSDate();
    const endTime = duration
      ? new Date(startTime.getTime() + duration.toSeconds() * 1000)
      : new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour

    // Create unique UID for each occurrence
    const occurrenceUid = `${event.uid}-${occurrence.toString()}`;

    expandedEvents.push({
      ics_uid: occurrenceUid,
      title: event.summary || 'Untitled Event',
      description: event.description || null,
      location: event.location || null,
      start_time: startTime,
      end_time: endTime,
      is_all_day: occurrence.isDate,
      last_modified: new Date(),
    });

    // Safety limit: max 365 occurrences
    if (expandedEvents.length >= 365) {
      logger.warn('Recurring event expansion limit reached', { uid: event.uid });
      break;
    }
  }

  logger.info('Expanded recurring event', {
    uid: event.uid,
    occurrences: expandedEvents.length,
  });

  return expandedEvents;
}
```

### Handling Exceptions (EXDATE)

Some recurring events have exceptions (specific dates excluded):

```
RRULE:FREQ=WEEKLY;COUNT=10
EXDATE:20240327T160000Z
```

**ical.js automatically handles this** - the iterator skips exception dates.

---

## DESCRIPTION FIELD PARSING

### Use Case

Some ICS feeds include structured data in the `DESCRIPTION` field that we want to extract.

**Example: TeamSnap**
```
DESCRIPTION:Practice for U10 team.\\n\\nLocation: Lincoln Field\\nAddress:
 1234 Sports Dr\, San Francisco\, CA 94102\\n\\nBring water and shin guards.
```

### Regex Patterns for Common Data

```typescript
// src/utils/ics-description-parser.ts

/**
 * Extract structured data from ICS description field
 */
export function parseIcsDescription(description: string): {
  cleanDescription: string;
  extractedAddress?: string;
} {
  if (!description) {
    return { cleanDescription: '' };
  }

  // Unescape ICS special characters
  let cleaned = description
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\\\/g, '\\');

  // Try to extract address
  const addressPatterns = [
    /Address:\s*(.+?)(?:\n|$)/i,
    /Location:\s*(.+?)(?:\n|$)/i,
  ];

  let extractedAddress: string | undefined;

  for (const pattern of addressPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      extractedAddress = match[1].trim();
      // Remove the matched line from description
      cleaned = cleaned.replace(match[0], '').trim();
      break;
    }
  }

  return {
    cleanDescription: cleaned,
    extractedAddress,
  };
}
```

### Usage in Parser

```typescript
function parseEvent(event: ICAL.Event, calendarTimezone: string): ParsedEvent {
  const rawDescription = event.description || null;
  const { cleanDescription, extractedAddress } = parseIcsDescription(rawDescription);

  // Use extracted address if location field is empty
  const location = event.location || extractedAddress || null;

  return {
    // ...
    description: cleanDescription,
    location,
    // ...
  };
}
```

---

## VALIDATION & ERROR HANDLING

### Validation Checks

```typescript
// src/utils/ics-validator.ts

export function validateIcsUrl(url: string): { valid: boolean; error?: string } {
  // Check URL format
  try {
    const parsed = new URL(url);

    // Must be HTTP or HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }

    // Reject localhost/private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsed.hostname;
      if (
        hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
      ) {
        return { valid: false, error: 'Private/local URLs are not allowed' };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export function validateParsedEvent(event: ParsedEvent): { valid: boolean; error?: string } {
  // Required fields
  if (!event.ics_uid) {
    return { valid: false, error: 'Event missing UID' };
  }

  if (!event.start_time || isNaN(event.start_time.getTime())) {
    return { valid: false, error: 'Event missing or invalid start time' };
  }

  if (!event.end_time || isNaN(event.end_time.getTime())) {
    return { valid: false, error: 'Event missing or invalid end time' };
  }

  // End time must be after start time
  if (event.end_time <= event.start_time) {
    return { valid: false, error: 'Event end time must be after start time' };
  }

  // Title length
  if (event.title && event.title.length > 255) {
    return { valid: false, error: 'Event title too long (max 255 characters)' };
  }

  return { valid: true };
}
```

### Error Handling in Sync Job

```typescript
// src/jobs/ics-sync.ts (excerpt)
export async function processIcsSyncJob(job: Job<IcsSyncJobData>) {
  const { calendar_id, ics_url } = job.data;

  try {
    // Validate URL
    const urlValidation = validateIcsUrl(ics_url);
    if (!urlValidation.valid) {
      throw new Error(`Invalid ICS URL: ${urlValidation.error}`);
    }

    // Fetch and parse
    const events = await fetchAndParseIcsFeed(ics_url);

    // Validate each event
    const validEvents = events.filter((event) => {
      const validation = validateParsedEvent(event);
      if (!validation.valid) {
        logger.warn('Skipping invalid event', {
          icsUid: event.ics_uid,
          error: validation.error,
        });
        return false;
      }
      return true;
    });

    logger.info('Validated events', {
      total: events.length,
      valid: validEvents.length,
      invalid: events.length - validEvents.length,
    });

    // Process valid events (create/update in database)
    // ...

  } catch (error) {
    logger.error('ICS sync failed', {
      calendarId: calendar_id,
      error: error.message,
    });
    throw error; // Trigger retry
  }
}
```

---

## TESTING

### Unit Tests

```typescript
// tests/services/ics-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseIcsString } from '../../src/services/ics-parser-service';

describe('ICS Parser', () => {
  it('should parse simple ICS event', () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-123@test.com
DTSTART:20240320T160000Z
DTEND:20240320T173000Z
SUMMARY:Test Event
LOCATION:Test Location
DESCRIPTION:Test description
END:VEVENT
END:VCALENDAR`;

    const events = parseIcsString(icsData);

    expect(events).toHaveLength(1);
    expect(events[0].ics_uid).toBe('event-123@test.com');
    expect(events[0].title).toBe('Test Event');
    expect(events[0].location).toBe('Test Location');
    expect(events[0].is_all_day).toBe(false);
  });

  it('should parse all-day event', () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-456@test.com
DTSTART;VALUE=DATE:20240320
DTEND;VALUE=DATE:20240321
SUMMARY:All Day Event
END:VEVENT
END:VCALENDAR`;

    const events = parseIcsString(icsData);

    expect(events[0].is_all_day).toBe(true);
  });

  it('should expand recurring event', () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recurring-123@test.com
DTSTART:20240320T160000Z
DTEND:20240320T170000Z
SUMMARY:Weekly Practice
RRULE:FREQ=WEEKLY;COUNT=4
END:VEVENT
END:VCALENDAR`;

    const events = parseIcsString(icsData);

    expect(events.length).toBeGreaterThanOrEqual(4);
    // Verify UIDs are unique
    const uids = events.map(e => e.ics_uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('should handle missing optional fields', () => {
    const icsData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:minimal-event@test.com
DTSTART:20240320T160000Z
DTEND:20240320T170000Z
END:VEVENT
END:VCALENDAR`;

    const events = parseIcsString(icsData);

    expect(events[0].title).toBe('Untitled Event');
    expect(events[0].description).toBeNull();
    expect(events[0].location).toBeNull();
  });

  it('should throw error on invalid ICS', () => {
    const invalidIcs = 'This is not valid ICS data';

    expect(() => parseIcsString(invalidIcs)).toThrow('Invalid ICS format');
  });
});
```

### Integration Tests (Real ICS Feeds)

```typescript
// tests/integration/ics-parser.test.ts
describe('ICS Parser Integration', () => {
  it('should fetch and parse TeamSnap feed', async () => {
    const testIcsUrl = process.env.TEST_TEAMSNAP_ICS_URL;

    if (!testIcsUrl) {
      console.log('Skipping test: TEST_TEAMSNAP_ICS_URL not set');
      return;
    }

    const events = await fetchAndParseIcsFeed(testIcsUrl);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].ics_uid).toBeDefined();
    expect(events[0].title).toBeDefined();
  });
});
```

### Manual Testing with Sample ICS Files

```typescript
// tests/fixtures/sample.ics
const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TeamSnap//Calendar//EN
X-WR-CALNAME:Soccer - Spring 2024
X-WR-TIMEZONE:America/Los_Angeles
BEGIN:VEVENT
UID:event-12345@teamsnap.com
DTSTART;TZID=America/Los_Angeles:20240320T090000
DTEND;TZID=America/Los_Angeles:20240320T103000
SUMMARY:Soccer Practice
LOCATION:Lincoln Field, 1234 Sports Dr, San Francisco, CA
DESCRIPTION:Practice for U10 team. Bring water and shin guards.
LAST-MODIFIED:20240301T120000Z
END:VEVENT
END:VCALENDAR`;

// Save to file for testing
import fs from 'fs';
fs.writeFileSync('tests/fixtures/sample.ics', sampleIcs);
```

---

## SUMMARY CHECKLIST

### Library Setup
- [ ] ical.js installed and configured
- [ ] TypeScript types installed

### Parsing Implementation
- [ ] Fetch ICS feed with axios (timeout, user-agent)
- [ ] Parse ICS string with ical.js
- [ ] Extract VEVENT components
- [ ] Map ICS properties to database fields
- [ ] Handle missing optional fields (title, description, location)
- [ ] Calculate end time from DURATION if DTEND missing

### Timezone Handling
- [ ] Convert all times to UTC for database storage
- [ ] Handle UTC times (Z suffix)
- [ ] Handle local times with TZID
- [ ] Handle floating times with calendar default timezone
- [ ] Use PostgreSQL timestamptz for automatic UTC conversion

### Recurring Events
- [ ] Detect recurring events (RRULE property)
- [ ] Expand recurring events into individual instances
- [ ] Generate unique UIDs for each occurrence
- [ ] Limit expansion to next 1 year
- [ ] Handle exception dates (EXDATE)
- [ ] Safety limit (max 365 occurrences)

### Validation
- [ ] Validate ICS URL format
- [ ] Reject private/local IPs in production
- [ ] Validate required fields (UID, start_time, end_time)
- [ ] Validate end_time > start_time
- [ ] Validate field lengths (title max 255 chars)
- [ ] Skip invalid events with warning logs

### Error Handling
- [ ] Handle network errors (timeout, unreachable)
- [ ] Handle parsing errors (invalid ICS format)
- [ ] Handle individual event parsing failures
- [ ] Log errors with context
- [ ] Graceful degradation (skip invalid events, continue processing)

### Description Parsing (Optional)
- [ ] Unescape ICS special characters (\\n, \\,, \\\\)
- [ ] Extract structured data (address patterns)
- [ ] Clean description text

### Testing
- [ ] Unit tests for valid ICS parsing
- [ ] Unit tests for all-day events
- [ ] Unit tests for recurring events
- [ ] Unit tests for missing fields
- [ ] Unit tests for invalid ICS
- [ ] Integration tests with real feeds
- [ ] Sample ICS fixtures for testing

---

## ALL PHASES COMPLETE! 🎉

**Phase 1:** ✅ Database, API, Auth, Configuration, Dev Setup
**Phase 2:** ✅ Error Handling, WebSockets, Background Jobs
**Phase 3:** ✅ Google Maps, Google Calendar, ICS Parsing

**You now have complete technical specifications for all aspects of the Family Scheduling Application!**

**Ready to start coding?** Refer to [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md) to begin implementation.
