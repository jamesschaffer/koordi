# Decision Log

This document records significant technical and architectural decisions made during the development of Koordi.

---

## 2025-01-28 - Production Database Migration to Neon

**Context:**
The production database was initially planned to use Google Cloud SQL (PostgreSQL). During deployment, we evaluated alternatives for cost efficiency and ease of use.

**Decision:**
Migrate from Google Cloud SQL to Neon (serverless PostgreSQL) for the production database.

**Alternatives Considered:**
1. **Google Cloud SQL** - Managed PostgreSQL with fixed monthly cost
2. **Neon** - Serverless PostgreSQL with pay-per-use pricing
3. **PlanetScale** - Serverless MySQL (would require schema changes)
4. **Supabase** - PostgreSQL with built-in auth (more than we need)

**Rationale:**
- **Cost:** Neon's free tier (0.5 GB storage, 191 compute hours/month) is generous for early-stage apps. Cloud SQL has a minimum monthly cost regardless of usage.
- **Serverless:** Neon scales to zero when inactive, reducing costs for low-traffic periods.
- **Connection Pooling:** Built-in via the pooler endpoint - no need for PgBouncer or Prisma Accelerate.
- **Developer Experience:** Easy setup, web-based SQL editor, database branching for development.
- **Compatibility:** Standard PostgreSQL - no migration required from existing Prisma schema.

**Consequences:**
- Slightly higher latency from Cloud Run (us-central1) to Neon (us-east-1) - acceptable for this use case
- Dependency on external provider (Neon) rather than keeping everything in GCP
- Need to ensure sslmode=require in all connection strings
- All documentation updated to reference Neon instead of Cloud SQL

---

## 2025-01-28 - Cancelled Event Detection Feature

**Context:**
ICS feeds from sports leagues (especially TeamSnap) sometimes mark events as cancelled rather than deleting them. Users reported confusion when cancelled events still appeared in their calendars.

**Decision:**
Implement cancelled event detection that:
1. Detects cancellation via standard iCalendar `STATUS:CANCELLED` property
2. Detects TeamSnap-style `[CANCELED]`/`[CANCELLED]` prefix in event title
3. Automatically unassigns cancelled events
4. Removes cancelled events from all users' Google Calendars
5. Displays a "Cancelled" badge in the frontend UI

**Alternatives Considered:**
1. **Delete cancelled events** - Simple but loses the record of what was cancelled
2. **Keep in calendar with strikethrough** - Google Calendar doesn't support custom styling
3. **Show with special title prefix** - Clutters Google Calendar with cancelled events
4. **Current approach** - Remove from Google Calendar, show as cancelled in Koordi

**Rationale:**
- Users don't want cancelled events cluttering their Google Calendars
- Keeping the event in Koordi's database preserves history
- The grey "Cancelled" badge clearly communicates status
- Automatic unassignment prevents confusion about who's handling a cancelled event
- Supporting both STATUS property and [CANCELED] prefix handles different ICS feed formats

**Consequences:**
- Added `is_cancelled` boolean field to Event model in Prisma schema
- ICS sync service now parses event status
- Frontend shows disabled assignment dropdown for cancelled events
- Cancelled events excluded from conflict detection
- Events can be "un-cancelled" if the ICS feed status changes back

---

## 2024-11-23 - Multi-User Google Calendar Sync Architecture

**Context:**
Initial implementation synced events to a single user's Google Calendar. Requirements expanded to support multiple family members sharing a calendar.

**Decision:**
Implement per-user Google Calendar sync tracking via the `UserGoogleEventSync` junction table.

**Alternatives Considered:**
1. **Single calendar sync** - Only sync to assigned user's calendar
2. **Shared Google Calendar** - Create a shared calendar all users see
3. **Per-user sync** - Each user gets their own copy of events in their calendar

**Rationale:**
- Each family member may have their own Google Calendar setup
- Users want to see all events, not just ones assigned to them
- Per-user tracking allows independent sync states and preferences
- The `UserGoogleEventSync` table tracks each user's Google Event ID separately

**Consequences:**
- More API calls (one per user per event)
- More database records (one sync record per user per event)
- More complex sync logic (parallel operations, partial failure handling)
- Users have full control over their individual calendar sync settings

---

## 2024-11-15 - ICS Parsing Libraries (ical.js + node-ical)

**Context:**
Needed to parse ICS feeds from various sources (TeamSnap, school calendars, sports leagues).

**Decision:**
Use two libraries: `ical.js` for validation and `node-ical` for sync parsing.

**Alternatives Considered:**
1. **ical.js only** - Powerful but complex API
2. **node-ical only** - Simple but limited validation
3. **ical-generator** - For generating ICS, not parsing
4. **Both libraries** - Use each for its strengths

**Rationale:**
- `ical.js` provides robust validation and calendar metadata extraction
- `node-ical` has a simpler API for iterating over events during sync
- Using both allows best-of-both-worlds approach
- Both are actively maintained and handle edge cases well

**Consequences:**
- Two dependencies to maintain
- Slightly larger bundle size
- Clear separation: icsService.ts (validation) vs icsSyncService.ts (sync)
- Well-tested parsing across different ICS feed formats

---

## 2024-11-10 - Encrypted Token Storage

**Context:**
Google OAuth refresh tokens need to be stored securely to maintain user sessions and sync access.

**Decision:**
Encrypt refresh tokens using AES-256-CBC before storing in the database.

**Alternatives Considered:**
1. **Plain text storage** - Simple but insecure
2. **Hashing** - One-way, can't retrieve tokens
3. **AES encryption** - Reversible encryption with secret key
4. **External secret manager** - More complex, additional dependency

**Rationale:**
- Refresh tokens must be retrievable (unlike passwords)
- AES-256-CBC is industry standard for at-rest encryption
- Encryption key stored in environment variable, not in code or database
- If database is compromised, tokens are still protected

**Consequences:**
- Requires `ENCRYPTION_KEY` environment variable (32-byte hex string)
- All token read/write operations go through encrypt/decrypt utilities
- Key rotation requires re-encrypting all tokens
- Added dependency on Node.js crypto module (built-in)

---

## Template for Future Decisions

```markdown
## [Date] - Decision Title

**Context:**
What situation prompted this decision?

**Decision:**
What did we decide?

**Alternatives Considered:**
What else was on the table?

**Rationale:**
Why this choice?

**Consequences:**
What does this mean going forward?
```
