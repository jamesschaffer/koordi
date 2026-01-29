# ICS Feed Parsing Specification
## Koordi

**Purpose:** Complete specification for parsing ICS (iCalendar) feeds
**Libraries:** `ical.js` (validation) and `node-ical` (sync parsing)
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
| `STATUS` | Event status | No | `CONFIRMED`, `TENTATIVE`, `CANCELLED` |

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
npm install ical.js node-ical axios
npm install -D @types/ical.js
```

### Two Services

The implementation uses two separate services:

1. **`icsService.ts`** - Uses `ical.js` for validation and basic parsing
2. **`icsSyncService.ts`** - Uses `node-ical` for the actual sync process

### Basic Usage with ical.js (Validation)

```typescript
import ICAL from 'ical.js';

// Parse ICS string
const jcalData = ICAL.parse(icsString);

// Create component
const comp = new ICAL.Component(jcalData);

// Get calendar name
const calendarName = comp.getFirstPropertyValue('x-wr-calname');

// Get all events
const vevents = comp.getAllSubcomponents('vevent');

// Process each event
for (const vevent of vevents) {
  const event = new ICAL.Event(vevent);
  console.log(event.summary, event.startDate.toJSDate());
}
```

### Basic Usage with node-ical (Sync)

```typescript
import ical from 'node-ical';

// Parse ICS data
const events = await ical.async.parseICS(icsData);

for (const event of Object.values(events)) {
  if (event.type !== 'VEVENT') continue;
  console.log(event.summary, event.start);
}
```

---

## PARSING IMPLEMENTATION

### Validation Service (icsService.ts)

```typescript
// src/services/icsService.ts
import ICAL from 'ical.js';
import { prisma } from '../lib/prisma';

interface ParsedEvent {
  ics_uid: string;
  title: string;
  description?: string;
  location?: string;
  start_time: Date;
  end_time: Date;
  is_all_day: boolean;
}

/**
 * Fetch ICS feed from URL using native fetch
 */
export const fetchICSFeed = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Koordi/1.0' },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('text/calendar') && !contentType.includes('text/plain')) {
      console.warn(`Unexpected content-type: ${contentType}`);
    }

    return await response.text();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - ICS feed took too long to respond');
    }
    throw new Error(`Failed to fetch ICS feed: ${error.message}`);
  }
};

/**
 * Validate an ICS feed URL and return metadata
 */
export const validateICSFeed = async (url: string): Promise<{
  valid: boolean;
  calendarName?: string;
  eventCount?: number;
  dateRange?: { earliest: Date; latest: Date };
  error?: string;
}> => {
  try {
    const icsData = await fetchICSFeed(url);
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);

    // Get calendar name
    const calendarName = String(
      comp.getFirstPropertyValue('x-wr-calname') ||
      comp.getFirstPropertyValue('name') ||
      'Unnamed Calendar'
    );

    // Get all events
    const vevents = comp.getAllSubcomponents('vevent');

    if (vevents.length === 0) {
      return { valid: true, calendarName, eventCount: 0, error: 'Calendar contains no events' };
    }

    // Find date range
    let earliest: Date | null = null;
    let latest: Date | null = null;

    vevents.forEach((vevent) => {
      const event = new ICAL.Event(vevent);
      const startDate = event.startDate.toJSDate();
      const endDate = event.endDate.toJSDate();
      if (!earliest || startDate < earliest) earliest = startDate;
      if (!latest || endDate > latest) latest = endDate;
    });

    return {
      valid: true,
      calendarName,
      eventCount: vevents.length,
      dateRange: earliest && latest ? { earliest, latest } : undefined,
    };
  } catch (error: any) {
    return { valid: false, error: error.message || 'Failed to parse ICS feed' };
  }
};

/**
 * Parse events from ICS data using ical.js
 */
export const parseICSEvents = (icsData: string): ParsedEvent[] => {
  const jcalData = ICAL.parse(icsData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  return vevents.map((vevent) => {
    const event = new ICAL.Event(vevent);
    return {
      ics_uid: event.uid,
      title: event.summary || 'Untitled Event',
      description: event.description ? String(event.description) : undefined,
      location: event.location ? String(event.location) : undefined,
      start_time: event.startDate.toJSDate(),
      end_time: event.endDate.toJSDate(),
      is_all_day: event.startDate.isDate,
    };
  });
};
```

### Sync Service (icsSyncService.ts)

```typescript
// src/services/icsSyncService.ts
import axios from 'axios';
import ical from 'node-ical';
import { syncMainEventToAllMembers } from './multiUserSyncService';
import { prisma } from '../lib/prisma';

interface ParsedEvent {
  ics_uid: string;
  title: string;
  description?: string;
  location?: string;
  start_time: Date;
  end_time: Date;
  is_all_day: boolean;
  last_modified: Date;
}

/**
 * Fetch and parse ICS feed from URL using node-ical
 */
export const fetchAndParseICS = async (icsUrl: string): Promise<ParsedEvent[]> => {
  const response = await axios.get(icsUrl, {
    timeout: 30000,
    headers: { 'User-Agent': 'Koordi/1.0' },
  });

  const events = await ical.async.parseICS(response.data);
  const parsedEvents: ParsedEvent[] = [];

  for (const event of Object.values(events)) {
    if (event.type !== 'VEVENT') continue;

    // Extract event data
    const icsUid = event.uid || '';
    const title = event.summary || 'Untitled Event';
    const description = event.description || undefined;
    const location = event.location || undefined;

    // Handle start/end times
    let startTime: Date;
    let endTime: Date;
    let isAllDay = false;

    if (typeof event.start === 'string') {
      startTime = new Date(event.start);
    } else if (event.start instanceof Date) {
      startTime = event.start;
    } else {
      continue; // Skip events without valid start time
    }

    if (typeof event.end === 'string') {
      endTime = new Date(event.end);
    } else if (event.end instanceof Date) {
      endTime = event.end;
    } else {
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Default 1 hour
    }

    if (event.datetype === 'date') {
      isAllDay = true;
    }

    const lastModified = event.lastmodified instanceof Date ? event.lastmodified : new Date();

    parsedEvents.push({
      ics_uid: icsUid,
      title,
      description,
      location,
      start_time: startTime,
      end_time: endTime,
      is_all_day: isAllDay,
      last_modified: lastModified,
    });
  }

  return parsedEvents;
};

/**
 * Sync a single calendar's events from its ICS feed
 * Also syncs events to Google Calendar for all members
 */
export const syncCalendar = async (calendarId: string): Promise<{
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  error?: string;
}> => {
  // ... (See actual implementation in codebase)
  // After syncing events, calls syncCalendarEventsToMembers(calendarId)
};

/**
 * Sync all enabled calendars
 */
export const syncAllCalendars = async (): Promise<{
  totalCalendars: number;
  successCount: number;
  errorCount: number;
  results: Array<{ calendarId: string; success: boolean; error?: string }>;
}>;

/**
 * Sync all events from a calendar to all members' Google Calendars
 * Called after ICS sync completes
 */
export async function syncCalendarEventsToMembers(calendarId: string): Promise<void> {
  const events = await prisma.event.findMany({
    where: { event_calendar_id: calendarId },
    select: { id: true, title: true },
  });

  for (const event of events) {
    await syncMainEventToAllMembers(event.id);
  }
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

### Current Status: NOT IMPLEMENTED

Recurring event expansion is **not currently implemented**. The parser treats recurring events as single events without expanding their occurrences.

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

### Possible Future Implementation

If recurring event expansion is needed in the future:

**Approach:** Expand recurring events into individual instances during ICS sync.

**Rationale:**
- Simpler event assignment (each instance can be assigned independently)
- Easier conflict detection
- Consistent data model (no special handling for recurring events)

**Notes:**
- Most ICS feeds from sports leagues (TeamSnap, etc.) pre-expand recurring events
- Each occurrence appears as a separate VEVENT with its own UID
- This is why explicit recurring event handling hasn't been needed

---

## CANCELLED EVENT DETECTION

### Overview

The ICS sync service detects cancelled events through two methods:

1. **Standard iCalendar STATUS Property:** The `STATUS:CANCELLED` property per RFC 5545
2. **TeamSnap-Style Title Prefix:** The `[CANCELED]` or `[CANCELLED]` prefix in the event title

### Detection Logic

```typescript
// In icsSyncService.ts

// Method 1: Check STATUS property
const status = event.status?.toLowerCase();
const isCancelledByStatus = status === 'cancelled';

// Method 2: Check for TeamSnap-style prefix in title
const cancelledPrefixRegex = /^\[CANCELL?ED\]\s*/i;
const hasCancelledPrefix = cancelledPrefixRegex.test(event.summary || '');

// Event is cancelled if either method detects it
const isCancelled = isCancelledByStatus || hasCancelledPrefix;

// Strip the prefix from title for clean display
const cleanTitle = hasCancelledPrefix
  ? (event.summary || '').replace(cancelledPrefixRegex, '')
  : event.summary || 'Untitled Event';
```

### Behavior When Event Is Cancelled

1. **Database Updates:**
   - Set `is_cancelled = true` on the Event record
   - Set `assigned_to_user_id = null` (unassign the event)
   - Store the clean title (without `[CANCELED]` prefix)

2. **Supplemental Events:**
   - Delete all supplemental events (drive times) associated with this event

3. **Google Calendar Sync:**
   - Remove the event from all users' Google Calendars
   - Delete via `UserGoogleEventSync` tracking records

4. **Frontend Display:**
   - Show grey "Cancelled" badge on the event
   - Disable assignment dropdown
   - Exclude from conflict detection

### Behavior When Event Is Un-Cancelled

If an event was previously cancelled and the ICS feed now shows it as active:

1. Set `is_cancelled = false`
2. Event becomes available for assignment
3. Event will sync to Google Calendar when assigned

### Example ICS Events

**Standard Cancelled Event:**
```
BEGIN:VEVENT
UID:event-123@teamsnap.com
DTSTART:20240320T160000Z
DTEND:20240320T173000Z
SUMMARY:Soccer Practice
STATUS:CANCELLED
END:VEVENT
```

**TeamSnap-Style Cancelled Event:**
```
BEGIN:VEVENT
UID:event-456@teamsnap.com
DTSTART:20240325T100000Z
DTEND:20240325T120000Z
SUMMARY:[CANCELED] Soccer Game vs Eagles
END:VEVENT
```

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
- [x] `ical.js` installed and configured (validation)
- [x] `node-ical` installed and configured (sync)
- [x] `axios` for HTTP requests
- [x] TypeScript types installed

### Parsing Implementation
- [x] Two services: `icsService.ts` (validation) and `icsSyncService.ts` (sync)
- [x] Fetch ICS feed with native fetch (validation, 10s timeout) and axios (sync, 30s timeout)
- [x] Parse ICS data with `ical.js` and `node-ical`
- [x] Extract VEVENT components
- [x] Map ICS properties to database fields
- [x] Handle missing optional fields (title, description, location)
- [x] Calculate end time from DURATION if DTEND missing (default 1 hour)

### Timezone Handling
- [x] Convert all times to UTC for database storage
- [x] Handle UTC times (Z suffix)
- [x] Handle local times with TZID (via library)
- [x] Use PostgreSQL timestamptz for automatic UTC conversion

### Recurring Events
- [ ] NOT IMPLEMENTED - recurring events not expanded
- [x] Most ICS feeds from sports leagues pre-expand recurring events

### Validation
- [x] ICS feed validation service (`validateICSFeed`)
- [x] Calendar name extraction
- [x] Event count and date range extraction
- [x] Skip events without valid start time
- [ ] Private/local IP rejection (not implemented)
- [ ] Field length validation (not implemented)

### Cancelled Event Detection
- [x] Standard iCalendar `STATUS:CANCELLED` property detection
- [x] TeamSnap-style `[CANCELED]` / `[CANCELLED]` prefix detection
- [x] Clean title extraction (strip cancelled prefix)
- [x] Automatic unassignment of cancelled events
- [x] Supplemental event deletion on cancellation
- [x] Google Calendar removal on cancellation
- [x] Un-cancellation support (re-enable events)

### Sync Features
- [x] Sync enabled/disabled flag per calendar
- [x] Event diff (add/update/delete) based on UID
- [x] Conditional updates based on `last_modified` timestamp
- [x] Sync status tracking (`last_sync_at`, `last_sync_status`, `last_sync_error`)
- [x] Google Calendar sync after ICS sync (`syncCalendarEventsToMembers`)

### Error Handling
- [x] Handle network errors (timeout, unreachable)
- [x] Handle parsing errors (invalid ICS format)
- [x] Update calendar with error status on failure
- [x] Console logging for errors

### Testing
- [ ] Unit tests for valid ICS parsing
- [ ] Unit tests for all-day events
- [ ] Unit tests for missing fields
- [ ] Integration tests with real feeds

---

**Next Steps:** Proceed to [BACKGROUND_JOBS.md](./BACKGROUND_JOBS.md) for background job specifications.
