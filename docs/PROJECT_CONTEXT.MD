# Product Requirements Document (PRD)
# Family Scheduling iOS Application - v1.0.0

---

## EXECUTIVE SUMMARY

### What We're Building
An iOS application that automatically calculates both departure and return-home times for family activities, extracts and surfaces critical event details (early arrival requirements, special instructions), assigns events to specific family members, and provides a shared view accessible to all caregivers—all by integrating with Google Calendar and activity provider calendars.

### Why We're Building It
Parents waste mental energy calculating "when do we need to leave?" and coordinating with partners/co-parents. This creates stress, missed activities, and relationship friction. We eliminate this burden through automation.

### Primary Success Metric
Users report they "don't have to think about when to leave anymore" and reduce scheduling-related conflicts with their partner/co-parent.

---

## VALUE PROPOSITION

**Core Statement:**  
"Stop doing mental math for your family's schedule. [App Name] automatically coordinates departure times and overlapping activities—giving you one trusted system that reduces friction between parents and frees you to focus on being present, not planning."

**Four Critical Capabilities:**
1. **Eliminates Mental Math:** Automatic calculation of both departure AND return-home times based on drive time, traffic, and early arrival buffers
2. **Surfaces Critical Event Details:** Extracts and displays early arrival requirements, special instructions, and items to bring—no more digging through emails
3. **Clear Assignment:** Every event assigned to specific family member—eliminates "I thought YOU were taking them" confusion
4. **Reduces Parental Friction:** Single source of truth accessible to all parents/caregivers, enabling coordination without constant communication

---

## TARGET USERS (MVP FOCUS)

### Primary: Sarah (Coordinating Parent)
- **Profile:** 38, married, working parent, 3 kids, high tech comfort
- **Core Problem:** Primary logistics coordinator carrying constant mental burden of calculating timing, coordinating with spouse, and managing overlapping activities
- **Must-Have Features:** Auto-calculation, shared calendar view, conflict detection
- **Success Metric:** "I don't have to think about when to leave anymore"

### Secondary: Mike (Partner/Less-Engaged Parent)
- **Profile:** 40, travels frequently for work, medium tech comfort
- **Core Problem:** Feels out of loop on timing details, relies on partner for information, wants to be capable without constant questions
- **Must-Have Features:** Simple notifications, no manual calculation, clear visibility
- **Success Metric:** "I can handle kids' activities without asking for details"

### Co-Parent Context: Jennifer & Tom (Separated/Divorced)
- **Profile:** Share 50/50 custody, communicate minimally, different homes/schedules
- **Core Problem:** Need neutral system to coordinate without direct communication; avoid "I thought YOU were taking them" conflicts
- **Must-Have Features:** Separate accounts, shared view of responsibilities, assignment clarity
- **Success Metric:** "Kids get there on time even on ex's days without me reminding them"

**Phase 2 Personas:** Barbara (Helper/Grandparent with low tech comfort), Marcus (Single parent power user)

---

## CORE JOBS TO BE DONE (PRIORITIZED)

### MVP Must-Haves

1. **Calculate accurate departure and return-home times automatically**
   - System tells user exactly when to leave AND when they'll be back home
   - Based on: event start time + early arrival requirement + event duration + drive time/traffic (both directions)
   - User never does mental math for either journey

2. **Extract and surface critical event information**
   - Parse event descriptions for early arrival requirements, special instructions, items to bring
   - Display prominently in app and notifications
   - Eliminates need to dig through emails or calendar descriptions

3. **Assign events to specific family members**
   - Clear indication of which parent/caregiver is responsible for each event
   - Both parents see who's assigned
   - Eliminates "I thought YOU were taking them" confusion

4. **Share scheduling information transparently across parents/caregivers**
   - Co-parent/partner has complete visibility into timing, requirements, and assignments
   - Eliminates manual communication of details

5. **Detect and surface scheduling conflicts proactively**
   - Alert when multiple events overlap in time
   - Show who needs to handle which responsibility

6. **Reduce anxiety and maintain peace of mind** (Emotional Job)
   - User confident nothing will be missed
   - Trust system when kids are with other parent

7. **Avoid controlling/micromanaging perception** (Social Job - Co-parent specific)
   - Neutral system communicates requirements
   - Not parent-to-parent nagging

### Phase 2 Enhancements
- Automated assignment based on custody schedules or work calendar conflicts
- Extended family/helper access with simplified views
- Predictive conflict warnings (e.g., "This will conflict with your commute home from work")

---

## HIGH-LEVEL OBJECTIVES

1. **Eliminate Mental Math:** Automatically calculate accurate departure AND return-home times by integrating drive time, traffic conditions, and early arrival requirements
2. **Surface Critical Information:** Extract and prominently display event details (early arrival, special instructions, items to bring) so parents never miss important details buried in descriptions
3. **Clear Responsibility Assignment:** Every event assigned to specific family member with visibility for all caregivers, eliminating confusion about "who's taking them"
4. **Reduce Parental Friction:** Provide single, trusted source of truth accessible to all parents/caregivers, enabling coordination without constant manual communication

---

## KEY TECHNICAL REQUIREMENTS

### Data Sources & Integration

#### Target Calendar (User's Calendar)
- **Platform:** Google Calendar (MVP)
- **Required Permissions:** Read, Create, Update, Delete events
- **Usage:** This is the user's primary calendar where enhanced events will be created/managed
- **Key Data:** Event title, date/time, location, description, attendees

#### Source Calendars (Activity Providers)
- **Format:** ICS format (iCalendar)
- **Access Method:** Public calendar URLs
- **Usage:** Read-only import of events from sports leagues, schools, activity providers
- **Key Data to Parse:**
  - Event date/time
  - Location address
  - Description text containing:
    - Early arrival requirements (e.g., "arrive 30 min before game time")
    - Special instructions (e.g., "wear blue jersey")
    - Contact information

---

## SCOPE BOUNDARIES

### In Scope (MVP)
- Google Calendar integration (read/write)
- ICS calendar import (read-only) from public URLs
- Automatic departure time calculation with traffic
- Automatic return-home time calculation with traffic
- Event information extraction (early arrival requirements, special instructions, items to bring)
- Manual event assignment to specific family member
- Multi-user access (shared household or co-parent modes)
- Conflict detection for overlapping events (including return journey)
- Push notifications for departure times
- iOS application only

### Explicitly Out of Scope (MVP)
- Apple Calendar integration
- Outlook/other calendar platforms
- Android application
- Automated assignment based on custody schedules
- In-app messaging between parents
- Carpool coordination features
- Activity registration/payment
- Integration with school portals requiring authentication
- Guest/helper limited access (Phase 2)
- Work calendar integration (Phase 2)

---

## DETAILED FLOW SPECIFICATIONS

The following documents provide complete, implementation-ready specifications for each major user flow:

### Core User Flows

1. **[ONBOARDING_FLOW.md](./ONBOARDING_FLOW.md)** - Complete onboarding experience for new users
   Covers the entire journey from account creation through Google authentication, home address setup, adding the first Event Calendar via ICS feed, creating child profiles, and inviting parent members to the family. Includes distinct paths for Event Calendar owners versus invited members, with detailed UI specifications for each step. The flow ensures users understand the calendar-centric model where each Event Calendar represents one child's activities from a specific source.

2. **[DAILY_USE_FLOW.md](./DAILY_USE_FLOW.md)** - Day-to-day interaction patterns and event management
   Describes two primary usage patterns: Google Calendar-first (notifications drive app usage) and iOS app-first (dashboard as planning tool). Details the event structure with main events syncing to all parents and supplemental events (drive times) appearing only for the assigned parent. Covers the three-tab dashboard interface (Unassigned, Upcoming, My Events), event detail screens with timing breakdowns, and workflows for both planning sessions and day-of execution.

3. **[EVENT_ASSIGNMENT_TRANSFER_FLOW.md](./EVENT_ASSIGNMENT_TRANSFER_FLOW.md)** - Transferring event responsibilities between parents
   Specifies three assignment scenarios: giving away an event, taking over an event, and assigning to self from unassigned. Includes detailed UI designs showing assignment controls for different states (assigned to me, assigned to other parent, unassigned). Covers supplemental event handling during transfers with configurable retention settings, multi-parent scenarios with 3+ family members, and real-time WebSocket updates ensuring all parents see changes immediately.

### Management Flows

4. **[CHILD_MANAGEMENT_FLOW.md](./CHILD_MANAGEMENT_FLOW.md)** - Managing child profiles and their Event Calendars
   Details the complete lifecycle of child management including adding children after initial onboarding, viewing child details with associated Event Calendars, editing child information (name, photo, date of birth), and deletion constraints (prevented when Event Calendars exist). Covers child filter behavior across the app and emphasizes that all parent members have equal management rights regardless of Event Calendar ownership.

5. **[EVENT_CAL_MGMT.md](./EVENT_CAL_MGMT.md)** - Managing Event Calendars throughout their lifecycle
   Covers post-onboarding Event Calendar management including adding additional calendars, viewing calendar details with sync status and event counts, manual refresh for immediate synchronization, automatic periodic sync (every 5 minutes), sync failure handling with error indicators, and calendar deletion with high-friction confirmation. Details ICS URL immutability and owner-only deletion permissions.

6. **[PARENT_MEMBER_MGMT.md](./PARENT_MEMBER_MGMT.md)** - Managing parent member access to Event Calendars
   Specifies parent member lifecycle including inviting new members to Event Calendars, accepting/declining invitations, viewing member lists with ownership indicators, removing members (deletes events from their Google Calendar), member leaving calendars, resending/canceling invitations, and partial membership support (member of some calendars but not others for same child). Covers equal permissions for all members except calendar deletion.

7. **[SETTINGS_FLOW.md](./SETTINGS_FLOW.md)** - User preferences and account configuration
   Comprehensive coverage of all user-configurable settings including location settings (default starting address for drive time calculations), timing settings (comfort buffer for departure calculations), and event settings (supplemental event retention behavior after reassignment). Provides access to Event Calendar and child management, account settings (email, Google Calendar connection, privacy controls, account deletion), and about section with version information, terms of service, and support contact.

### System Flows

8. **[CONFLICT_RESOLUTION.md](./CONFLICT_RESOLUTION.md)** - Detecting and resolving scheduling conflicts
   Defines conflict detection logic based on total time commitment (including drive times), conflict warning modals displayed during assignment, conflict display in event feeds with color-coded indicators, resolution suggestions, and handling of multi-child conflicts. Emphasizes warning users without preventing assignment, allowing for backup plans and carpools.

9. **[EVENT_CHANGE_FLOW.md](./EVENT_CHANGE_FLOW.md)** - Automatic synchronization from source ICS calendars
   Describes the automatic sync process that runs every 5 minutes to detect changes in source ICS feeds. Covers how new events are automatically added, existing events are updated when time/location/description changes occur, and deleted events are removed from the system. Details the assignment preservation rules ensuring parent assignments survive event updates, real-time WebSocket notifications to all family members, and sync status visibility showing last successful sync time.

---

## DATA MODEL / DATABASE SCHEMA

### Core Entities

#### 1. User
Represents a parent/caregiver account in the system.

**Fields:**
- `id` (UUID, Primary Key)
- `email` (String, Unique, Required)
- `name` (String, Required)
- `avatar_url` (String, Nullable) - Profile photo URL
- `google_refresh_token_enc` (String, Encrypted, Nullable) - Encrypted Google refresh token
- `google_calendar_id` (String, Nullable) - User's primary Google Calendar ID
- `google_calendar_sync_enabled` (Boolean, Default: false) - Whether Google Calendar sync is enabled
- `home_address` (String, Nullable) - For drive time calculations
- `home_latitude` (Decimal, Nullable)
- `home_longitude` (Decimal, Nullable)
- `comfort_buffer_minutes` (Integer, Default: 5) - Extra time added to departure calculations (0-60 minutes)
- `keep_supplemental_events` (Boolean, Default: false) - Keep drive times on reassignment
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Relationships:**
- Owns many Event Calendars (as owner)
- Has many Event Calendar Memberships
- Has many Event Assignments (assigned events)
- Has many sent invitations
- Has many UserGoogleEventSync records

---

#### 2. Child
Represents a child whose activities are being tracked.

**Fields:**
- `id` (UUID, Primary Key)
- `name` (String, Required)
- `photo_url` (String, Nullable)
- `date_of_birth` (Date, Nullable)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Relationships:**
- Has many Event Calendars
- Has many Events (through Event Calendars)

**Business Rules:**
- Cannot be deleted if any associated Event Calendars exist
- All parents with access to child's Event Calendars can manage child information

---

#### 3. Event Calendar
Represents a single ICS feed source associated with one child (e.g., "Xander's Soccer League").

**Fields:**
- `id` (UUID, Primary Key)
- `child_id` (UUID, Foreign Key → Child, Required)
- `owner_id` (UUID, Foreign Key → User, Required) - Parent who added this calendar
- `name` (String, Required) - E.g., "Soccer - Spring 2024"
- `ics_url` (String, Required) - Public ICS feed URL
- `color` (String, Default: "#3B82F6") - Hex color for visual identification
- `sync_enabled` (Boolean, Default: true)
- `last_sync_at` (Timestamp, Nullable)
- `last_sync_status` (String, Default: "pending") - pending, success, error
- `last_sync_error` (String, Nullable)
- `google_calendar_watch_token` (String, Nullable) - Watch API token
- `google_calendar_watch_expiry` (Timestamp, Nullable)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Relationships:**
- Belongs to one Child
- Belongs to one User (owner)
- Has many Event Calendar Memberships (parents with access)
- Has many Events

**Business Rules:**
- Owner can delete the calendar
- All members can view and assign events
- Syncs automatically every 5 minutes
- Cannot have duplicate ICS URLs for the same child

---

#### 4. Event Calendar Membership
Join table representing parent access to an Event Calendar (invitation system).

**Fields:**
- `id` (UUID, Primary Key)
- `event_calendar_id` (UUID, Foreign Key → Event Calendar, Required)
- `user_id` (UUID, Foreign Key → User, Nullable) - Null until invitation accepted
- `invited_email` (String, Required) - Email address of invitee
- `invitation_token` (String, Unique, Required) - Token for invitation link
- `status` (String, Default: "pending") - pending, accepted, declined
- `invited_by_user_id` (UUID, Foreign Key → User, Required) - Who sent the invitation
- `invited_at` (Timestamp)
- `responded_at` (Timestamp, Nullable)
- `expires_at` (Timestamp, Nullable) - Invitations expire after 30 days
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Relationships:**
- Belongs to one Event Calendar
- Belongs to one User (the member, once accepted)
- References one User (who invited them)

**Business Rules:**
- Owner automatically becomes a member
- All members have equal access to events (except deletion rights)
- Members see events filtered by their memberships
- Unique constraint on (event_calendar_id, user_id) to prevent duplicate memberships

---

#### 5. Event
Represents the main event synced from an ICS feed.

**Fields:**
- `id` (UUID, Primary Key)
- `event_calendar_id` (UUID, Foreign Key → Event Calendar, Required)
- `ics_uid` (String, Required) - Original ICS UID for idempotency
- `title` (String, Required)
- `description` (Text, Nullable) - Raw description from ICS
- `location` (String, Nullable) - Location text
- `location_lat` (Decimal, Nullable)
- `location_lng` (Decimal, Nullable)
- `start_time` (Timestamp, Required)
- `end_time` (Timestamp, Required)
- `is_all_day` (Boolean, Default: false)
- `assigned_to_user_id` (UUID, Foreign Key → User, Nullable) - Which parent is responsible
- `version` (Integer, Default: 1) - Optimistic locking: increments on each assignment change
- `last_modified` (Timestamp, Default: now) - From ICS or update timestamp
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Relationships:**
- Belongs to one Event Calendar
- Assigned to one User (optional)
- Has many Supplemental Events
- Has many UserGoogleEventSync records

**Business Rules:**
- Assignment preserved during ICS updates (unless event deleted)
- Main event syncs to ALL parent members' Google Calendars (via UserGoogleEventSync)
- Child accessed via Event Calendar relationship
- If unassigned, appears in "Unassigned" tab for all members
- Unique constraint on (event_calendar_id, ics_uid) prevents duplicate imports

---

#### 6. Supplemental Event
Represents system-generated drive time events (departure, buffer, and return trips) that are children of main events.

**Fields:**
- `id` (UUID, Primary Key)
- `parent_event_id` (UUID, Foreign Key → Event, Required)
- `type` (String, Required) - 'departure', 'buffer', or 'return'
- `title` (String, Required) - E.g., "Leave for Soccer Practice"
- `start_time` (Timestamp, Required) - Calculated departure/return time
- `end_time` (Timestamp, Required)
- `origin_address` (String, Required) - User's home or previous event location
- `origin_lat` (Decimal, Required)
- `origin_lng` (Decimal, Required)
- `destination_address` (String, Required)
- `destination_lat` (Decimal, Required)
- `destination_lng` (Decimal, Required)
- `drive_time_minutes` (Integer, Required) - Raw drive time from Google Maps (0 for buffer events)
- `last_traffic_check` (Timestamp, Nullable) - Last time traffic data was fetched
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Relationships:**
- Child of one Event (parent event)
- Has many UserGoogleEventSync records

**Business Rules:**
- Created automatically when main event is assigned to a parent
- Inherits timing from main event
- Syncs only to assigned parent's Google Calendar (via UserGoogleEventSync)
- When main event is reassigned from Parent A to Parent B:
  - New supplemental events automatically created for Parent B (always)
  - Parent A's supplemental events behavior based on user preference:
    - If `keep_supplemental_events = false`: Delete Parent A's supplemental events
    - If `keep_supplemental_events = true`: Keep Parent A's supplemental events
- Recalculated when:
  - Traffic conditions change significantly
  - Assigned user's home address changes
  - Assigned user's comfort buffer changes
  - Main event time/location changes

---

#### 7. UserGoogleEventSync
Tracks which events and supplemental events are synced to which users' Google Calendars. Supports multi-user event visibility.

**Fields:**
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key → User, Required)
- `event_id` (UUID, Foreign Key → Event, Nullable)
- `supplemental_event_id` (UUID, Foreign Key → Supplemental Event, Nullable)
- `google_event_id` (String, Required) - Google Calendar event ID for this user
- `sync_type` (String, Required) - 'main' or 'supplemental'
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

**Relationships:**
- Belongs to one User
- References one Event (optional)
- References one Supplemental Event (optional)

**Business Rules:**
- Main events can be synced to multiple users (all calendar members)
- Supplemental events are synced only to the assigned user
- Unique constraint on (user_id, event_id) and (user_id, supplemental_event_id)
- When event is deleted, corresponding sync records are cascade deleted

---

### Entity Relationships Diagram (Text Format)

```
User (Parent)
 ├─→ Owns many Event Calendars (as owner)
 ├─→ Has many Event Calendar Memberships
 ├─→ Assigned to many Events
 ├─→ Has sent many Invitations
 └─→ Has many UserGoogleEventSync records

Child
 └─→ Has many Event Calendars

Event Calendar
 ├─→ Belongs to one Child
 ├─→ Owned by one User (owner)
 ├─→ Has many Event Calendar Memberships (shared with parents)
 └─→ Has many Events

Event Calendar Membership (Invitation System)
 ├─→ Belongs to one Event Calendar
 ├─→ Belongs to one User (once accepted, nullable until then)
 └─→ References one User (invited_by)

Event (Main Event)
 ├─→ Belongs to one Event Calendar
 ├─→ Assigned to one User (optional)
 ├─→ Has many Supplemental Events (departure, buffer, return)
 └─→ Has many UserGoogleEventSync records

Supplemental Event (Drive Time)
 ├─→ Belongs to one Event (parent event)
 └─→ Has many UserGoogleEventSync records

UserGoogleEventSync (Google Calendar Tracking)
 ├─→ Belongs to one User
 ├─→ References one Event (optional)
 └─→ References one Supplemental Event (optional)
```

---

### Key Indexes

**Performance-critical indexes:**

**User:**
- `email` (unique)

**EventCalendar:**
- `child_id` (frequent joins)
- `owner_id` (ownership queries)
- `ics_url` (sync job lookups)
- `last_sync_at` (sync scheduling)

**EventCalendarMembership:**
- `event_calendar_id` (membership lookups)
- `user_id` (user's calendars queries)
- `invited_email` (invitation lookups)
- `invitation_token` (unique token validation)
- `status` (pending invitations queries)
- Unique constraint on `(event_calendar_id, user_id)`

**Event:**
- Unique constraint on `(event_calendar_id, ics_uid)` (idempotency)
- `event_calendar_id` (calendar's events)
- `assigned_to_user_id` (user's assigned events)
- `start_time`, `end_time` (date range queries for dashboard)

**SupplementalEvent:**
- `parent_event_id` (cascade deletions)
- `type` (departure/buffer/return filtering)
- `start_time` (dashboard queries)

**UserGoogleEventSync:**
- `user_id`
- `event_id`
- `supplemental_event_id`
- `google_event_id`
- Composite: `(event_id, sync_type)`, `(supplemental_event_id, sync_type)`, `(user_id, sync_type)`
- Unique constraints: `(user_id, event_id)`, `(user_id, supplemental_event_id)`

---

### Data Integrity Constraints

1. **Cascade Deletes:**
   - Delete User → Cascade: owned Event Calendars, Event Calendar Memberships; SetNull: assigned Events
   - Delete Child → Cascade: Event Calendars
   - Delete Event Calendar → Cascade: Members, Events
   - Delete Event → Cascade: Supplemental Events, UserGoogleEventSync records
   - Delete Supplemental Event → Cascade: UserGoogleEventSync records

2. **Assignment Integrity:**
   - Event can only be assigned to User who is a member of the Event Calendar
   - Assignment changes increment Event.version for optimistic locking

3. **Sync Integrity:**
   - `Event.ics_uid` must be unique within an Event Calendar (unique constraint)
   - Child relationship accessed via Event Calendar (not stored directly on Event)

---

## TECHNOLOGY STACK

### Strategic Approach: Web-First with Native Mobile Capabilities

**Architecture:** Progressive Web App (PWA) + Capacitor for native mobile deployment

**Rationale:**
- Single codebase deploys to iOS, Android, and web simultaneously
- Supports mixed-device families from day 1 (critical for co-parent scenarios)
- Native capabilities (push notifications, in-app purchases) added via Capacitor plugins
- Fastest speed to market while maintaining quality and flexibility
- No vendor lock-in: can always extract web app or build native later

---

### Frontend Stack

#### Core Framework
- **Primary:** React 19 with TypeScript
- **State Management:** React Context + TanStack Query (React Query) for server state
- **Routing:** React Router v7
- **UI Components:** shadcn/ui (Radix UI primitives + Tailwind CSS)
- **Styling:** Tailwind CSS for responsive, mobile-first design

**Rationale:**
- React: Industry standard, massive ecosystem, excellent mobile performance
- TypeScript: Type safety critical for complex calendar/assignment logic
- TanStack Query: Perfect for real-time data sync, caching, optimistic updates
- shadcn/ui: Accessible, customizable components that work across all platforms

#### Mobile Deployment
- **Capacitor 5+** (by Ionic)
- **Target Platforms:** iOS 14+, Android 10+, Modern Web Browsers
- **Key Capacitor Plugins:**
  - `@capacitor/app` - App lifecycle, deep linking
  - `@capacitor/push-notifications` - Native push notifications
  - `@capacitor/preferences` - Local storage
  - `@capacitor/network` - Connectivity detection
  - `@capacitor-community/in-app-purchases` - StoreKit + Google Play Billing
  - `@capacitor/haptics` - Native haptic feedback
  - `@capacitor/share` - Native share sheet

#### Real-Time Communication
- **Socket.io Client** for WebSocket connections
- **Features:**
  - Real-time event updates across all family members
  - Assignment changes propagate instantly
  - Sync status notifications
  - Automatic reconnection handling

#### Maps & Directions
- **Google Maps JavaScript API**
- **Features:**
  - Address autocomplete (Places API)
  - Drive time calculations with traffic (Directions API)
  - Distance Matrix API for conflict detection
  - Geocoding API for address validation

---

### Backend Stack

#### Runtime & Framework
- **Node.js 20 LTS** with TypeScript
- **Framework:** Express.js with async/await error handling
- **Alternative Consideration:** Fastify (if performance becomes critical)

**Rationale:**
- JavaScript/TypeScript alignment with frontend reduces context switching
- Excellent WebSocket support (Socket.io)
- Strong ecosystem for calendar/ICS parsing
- Mature OAuth libraries for Google integration

#### API Architecture
- **REST API** for primary operations (CRUD)
- **WebSocket (Socket.io)** for real-time updates
- **API Documentation:** OpenAPI 3.0 (Swagger) specification

#### Database
- **PostgreSQL 15+**
- **ORM:** Prisma (type-safe, migration management, excellent TypeScript support)
- **Connection Pooling:** pg-pool or Prisma built-in pooling
- **Features Used:**
  - JSONB for flexible event metadata storage
  - Partial indexes for performance
  - Row-level security (future multi-tenancy)
  - Native UUID support

#### Background Jobs & Scheduling
- **node-cron** for scheduling periodic tasks
- **Bull Queue** (Redis-backed job queue) for job processing
- **Job Types:**
  - ICS feed synchronization (every 5 minutes for all calendars)
  - Google Calendar sync (on-demand and scheduled)
  - Expired invitation cleanup (daily at 2 AM)

#### Caching Layer
- **Redis 7+**
- **Use Cases:**
  - ICS feed caching (reduce external calls)
  - Google Calendar API response caching
  - Traffic data caching (5-10 min TTL)
  - Session storage
  - WebSocket connection management
  - Bull queue backend

---

### Third-Party Integrations

#### Authentication
- **Google OAuth 2.0**
- **Library:** `googleapis` (Node.js)
- **Scopes Required:**
  - `https://www.googleapis.com/auth/userinfo.email` - User identification
  - `https://www.googleapis.com/auth/userinfo.profile` - User profile data
  - `https://www.googleapis.com/auth/calendar` - Read/write calendar access
  - `https://www.googleapis.com/auth/calendar.events` - Event management
- **Token Management:**
  - Refresh tokens stored encrypted in PostgreSQL (google_refresh_token_enc)
  - Always uses `prompt='consent'` to ensure refresh token is received
  - Access tokens generated on-demand from refresh token
  - Graceful handling of revoked access

#### Calendar Integration
- **Google Calendar API v3**
- **ICS Parsing:** `ical.js` and `node-ical` libraries
- **Features:**
  - Create/update/delete events in user calendars
  - Watch API for real-time Google Calendar changes (webhook)
  - Batch operations for efficiency

#### Mapping & Traffic
- **Google Maps Platform APIs**
- **APIs Used:**
  - Directions API (drive time with traffic)
  - Distance Matrix API (bulk calculations)
  - Places API (address autocomplete)
  - Geocoding API (address → lat/lng)
- **Optimization:**
  - Batch requests where possible
  - Cache results with TTL
  - Fallback to cached data if API unavailable

#### Push Notifications
- **Apple Push Notification Service (APNs)** via Capacitor
- **Firebase Cloud Messaging (FCM)** for Android via Capacitor
- **Web Push API** for web browsers (progressive enhancement)
- **Library:** `node-apn` for server-side APNs, `firebase-admin` for FCM

---

### Monetization & Payments

#### Payment Processing
- **Hybrid Paywall Strategy:**
  - **Web Users:** Stripe Checkout + Customer Portal
  - **iOS Users:** Apple StoreKit via `@capacitor-community/in-app-purchases`
  - **Android Users:** Google Play Billing via `@capacitor-community/in-app-purchases`

#### Subscription Management
- **Stripe API** (for web subscriptions)
- **Apple App Store Server API** (receipt validation)
- **Google Play Developer API** (purchase validation)
- **Backend:** Unified subscription validation regardless of source

#### Implementation Phases
1. **Phase 1 (MVP):** No paywall, focus on product-market fit
2. **Phase 2:** Add Stripe for web-based subscriptions
3. **Phase 3:** Add native IAP plugins for app store compliance

---

### Infrastructure & DevOps

#### Hosting
- **Platform:** Google Cloud Platform (GCP)
- **Frontend:** Google Cloud Run (containerized, auto-scaling)
  - Service: koordie-frontend
  - URL: https://app.koordie.com
- **Backend:** Google Cloud Run (containerized, auto-scaling)
  - Service: koordie-backend
  - URL: https://api.koordie.com
- **Container Registry:** Google Artifact Registry (us-central1)
- **Database:** PostgreSQL (Cloud SQL or external)
- **Redis:** Managed Redis

#### CI/CD
- **GitHub Actions**
- **Workflows:**
  - `backend-deploy.yml` - Deploys backend on push to main (backend/** changes)
  - `frontend-deploy.yml` - Deploys frontend on push to main (frontend/** changes)
  - `marketing-site-deploy.yml` - Deploys marketing site
- **Pipeline Steps:**
  - Validate required secrets
  - Build and validate TypeScript
  - Build Docker image
  - Push to Artifact Registry
  - Deploy to Cloud Run
  - Health checks and smoke tests

#### Monitoring & Logging
- **Application Monitoring:** Sentry (error tracking)
- **Logging:** Structured JSON logs with Winston or Pino
- **Analytics:** PostHog or Mixpanel (privacy-focused)
- **Uptime Monitoring:** BetterUptime or UptimeRobot

---

### Development Tools

#### Code Quality
- **TypeScript** (strict mode enabled)
- **ESLint** + **Prettier** (consistent formatting)
- **Husky** (Git hooks for pre-commit checks)
- **lint-staged** (run linters on staged files only)

#### Testing
- **Unit Tests:** Vitest (fast, compatible with Vite) - Backend and Frontend
- **Integration Tests:** Supertest (API testing)
- **E2E Tests:** Playwright (frontend)
- **Test Commands:**
  - Backend: `npm test` (Vitest)
  - Frontend: `npm test` (Vitest), `npm run test:e2e` (Playwright)

#### Local Development
- **Frontend Dev Server:** Vite 7 (fast HMR, optimized builds)
- **Backend Dev Server:** nodemon with ts-node (TypeScript execution with auto-reload)
- **Database Migrations:** Prisma Migrate
- **Dev Commands:**
  - Frontend: `npm run dev` (Vite dev server on port 5173)
  - Backend: `npm run dev` (nodemon on port 3000)
  - Prisma Studio: `npm run prisma:studio`

---

### Security Considerations

#### Authentication & Authorization
- **JWT tokens** for API authentication
- **HTTP-only cookies** for web sessions
- **Refresh token rotation** for mobile apps
- **Rate limiting** on all public endpoints

#### Data Protection
- **Encryption at rest:** PostgreSQL encryption, encrypted S3 for backups
- **Encryption in transit:** TLS 1.3 for all connections
- **Sensitive data encryption:** AES-256 for OAuth tokens in database
- **Environment variables:** Never committed, managed via hosting platform

#### API Security
- **CORS:** Configured for specific origins only
- **CSRF protection:** For web session-based requests
- **Input validation:** Zod schemas for all API inputs
- **SQL injection prevention:** Prisma parameterized queries
- **XSS prevention:** React's built-in escaping + CSP headers

---

### Scalability Considerations

#### Current Architecture (MVP)
- Single backend server
- Managed database with read replicas (future)
- Redis for caching and job queue
- Scales vertically initially

#### Future Scaling Path
- **Horizontal scaling:** Load balancer + multiple backend instances
- **Database:** Read replicas for queries, primary for writes
- **CDN:** Static assets and API response caching
- **Regional deployment:** Multiple regions for global users
- **Microservices (if needed):** Separate sync service from API service

---

## SYSTEM ARCHITECTURE

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   iOS App    │  │ Android App  │  │   Web App    │              │
│  │  (Capacitor) │  │  (Capacitor) │  │   (Browser)  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┴──────────────────┘                      │
│                            │                                          │
│                   React + TypeScript                                 │
│                   TanStack Query + Socket.io Client                  │
│                                                                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            │ HTTPS / WSS
                            │
┌───────────────────────────┴─────────────────────────────────────────┐
│                       API GATEWAY / BACKEND                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Express.js REST API + Socket.io Server          │   │
│  │                    (Node.js + TypeScript)                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Auth Service │  │ Event Service│  │  Sync Service│              │
│  │ (OAuth/JWT)  │  │ (CRUD/Logic) │  │  (ICS/GCal)  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                       │
│         └──────────────────┴──────────────────┘                      │
│                            │                                          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼──────┐
│   PostgreSQL   │  │     Redis      │  │  Bull Queue │
│   (Primary DB) │  │   (Cache +     │  │ (Background │
│                │  │    Sessions)   │  │    Jobs)    │
└────────────────┘  └────────────────┘  └──────┬──────┘
                                               │
                    ┌──────────────────────────┘
                    │
        ┌───────────┴───────────┬──────────────────┬─────────────────┐
        │                       │                  │                 │
┌───────▼────────┐  ┌───────────▼──────┐  ┌───────▼──────┐  ┌──────▼──────┐
│  Google OAuth  │  │  Google Calendar │  │ Google Maps  │  │  ICS Feeds  │
│  (Auth Flow)   │  │   API (Events)   │  │  (Traffic)   │  │  (External) │
└────────────────┘  └──────────────────┘  └──────────────┘  └─────────────┘
```

---

### Component Breakdown

#### 1. Client Applications (Frontend)

**Responsibilities:**
- User interface rendering and interaction
- Local state management (TanStack Query)
- WebSocket connection management
- Optimistic UI updates
- Offline-capable data caching

**Key Features:**
- Single React codebase deployed to all platforms via Capacitor
- Real-time event updates via Socket.io
- Google Maps integration for address autocomplete and directions
- Native features (push notifications, haptics) via Capacitor plugins

**Communication:**
- REST API calls for CRUD operations (authenticated via JWT)
- WebSocket connection for real-time updates
- Google OAuth flow for authentication

---

#### 2. API Gateway / Backend Server

**Responsibilities:**
- API endpoint routing and request handling
- Authentication and authorization
- Business logic execution
- WebSocket connection management
- Background job scheduling

**Key Services:**

**a) Auth Service**
- Google OAuth 2.0 flow implementation
- JWT token generation and validation
- Token refresh and rotation
- Session management

**b) Event Service**
- Event CRUD operations
- Assignment logic (transfer, create, update)
- Supplemental event generation
- Conflict detection
- Event filtering and querying

**c) Sync Service**
- ICS feed polling and parsing
- Google Calendar synchronization
- Event change detection and propagation
- Traffic data fetching and caching

**d) WebSocket Service**
- Real-time event broadcasting
- User connection management
- Room-based messaging (per family/Event Calendar)

---

#### 3. Data Layer

**PostgreSQL Database**
- Primary data store for all application data
- Stores: Users, Children, Event Calendars, Events, Supplemental Events, Memberships
- Handles transactional integrity
- Prisma ORM for type-safe queries

**Redis Cache**
- Session storage
- ICS feed caching (reduce external calls)
- Google Calendar API response caching
- Traffic data caching (TTL: 5-10 minutes)
- WebSocket connection state
- Rate limiting counters

---

#### 4. Background Job Queue (Bull + Redis)

**Job Types:**

**a) ICS Sync Job (Every 5 minutes per Event Calendar)**
- Fetch ICS feed from URL
- Parse events using ical.js
- Compare with existing events (by ics_event_uid)
- Create new events, update changed events, delete removed events
- Preserve assignments during updates
- Trigger Google Calendar sync

**b) Google Calendar Sync Job (On-demand + scheduled)**
- Create/update/delete events in user's Google Calendars
- Main events → all family members
- Supplemental events → assigned parent only
- Batch operations for efficiency

**c) Traffic Recalculation Job (Hourly for upcoming events)**
- Identify events in next 24 hours with assignments
- Fetch current traffic data from Google Maps API
- Recalculate departure times if significant change (>5 minutes)
- Update supplemental events
- Notify assigned parent if departure time changed

**d) Push Notification Job (Time-based triggers)**
- Send departure reminders (configurable: 15/30/60 minutes before)
- Send assignment change notifications
- Send sync error notifications

**e) Subscription Validation Job (Daily)**
- Validate active subscriptions (Stripe, Apple, Google)
- Update user subscription status
- Handle expired subscriptions

---

### Key Data Flow Patterns

The system implements several core interaction patterns between components. For detailed feature-level flows, see [FEATURES.md](./FEATURES.md).

**Authentication & Session Management:**
- OAuth flow with Google → Backend exchanges tokens → Encrypted storage → JWT for app auth
- WebSocket connections authenticated via JWT, users join rooms per Event Calendar membership

**Event Lifecycle:**
- ICS sync (every 5 minutes) → Parse/geocode → Create/update database events → Sync to all members' Google Calendars
- Assignment preserves through updates; supplemental events (drive times) created only for assigned parent
- Real-time propagation via WebSocket broadcasts to Event Calendar rooms

**Assignment & Transfer:**
- Assignment triggers: Drive time calculation → Supplemental event creation → Google Calendar sync (assigned parent only)
- Reassignment: New supplemental events for new assignee, configurable retention for previous assignee
- All changes broadcast via WebSocket for instant UI updates across devices

**Background Processing:**
- Bull Queue manages: ICS sync, Google Calendar sync, traffic recalculation, push notifications
- Traffic recalculation (hourly) updates departure times for events in next 24 hours if traffic changes >5 min
- Batch operations for Google Calendar API efficiency (max 50 operations per batch)

---

### Security Architecture

#### Authentication Flow

```
┌─────────┐                ┌─────────┐               ┌────────────┐
│  Client │                │ Backend │               │   Google   │
└────┬────┘                └────┬────┘               └─────┬──────┘
     │                          │                          │
     │  1. Request OAuth URL    │                          │
     ├─────────────────────────>│                          │
     │                          │                          │
     │  2. Return auth URL      │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │  3. Redirect to Google   │                          │
     ├──────────────────────────┼─────────────────────────>│
     │                          │                          │
     │  4. User authenticates   │                          │
     │                          │                          │
     │  5. Redirect with code   │                          │
     │<─────────────────────────┼──────────────────────────┤
     │                          │                          │
     │  6. Send auth code       │                          │
     ├─────────────────────────>│                          │
     │                          │  7. Exchange code        │
     │                          ├─────────────────────────>│
     │                          │                          │
     │                          │  8. Return tokens        │
     │                          │<─────────────────────────┤
     │                          │                          │
     │                          │  9. Store tokens (encrypted)
     │                          │     Generate JWT         │
     │                          │                          │
     │  10. Return JWT          │                          │
     │<─────────────────────────┤                          │
     │                          │                          │
     │  11. Subsequent requests │                          │
     │      with JWT in header  │                          │
     ├─────────────────────────>│                          │
```

#### Authorization Model

**Access Control:**
- User can only access Event Calendars where they have membership
- Events inherit access from their Event Calendar
- Only Event Calendar owner can delete the calendar
- All members can assign events to themselves or other members
- All members can manage children associated with their Event Calendars

**API Authorization Middleware:**
```typescript
// Check if user has access to Event Calendar
async function requireCalendarAccess(req, res, next) {
  const calendarId = req.params.calendar_id;
  const userId = req.user.id; // From JWT

  const membership = await db.eventCalendarMembership.findFirst({
    where: { event_calendar_id: calendarId, user_id: userId }
  });

  if (!membership) {
    return res.status(403).json({ error: "Access denied" });
  }

  next();
}
```

---

### Error Handling & Resilience

#### External Service Failures

**Google Calendar API:**
- Retry with exponential backoff (max 3 attempts)
- Queue failed syncs for later retry
- Display sync error in UI with manual retry option
- Continue app functionality (events still viewable in app)

**ICS Feed Unavailable:**
- Use cached feed data (Redis, TTL: 24 hours)
- Display warning: "Last synced X hours ago"
- Retry on next scheduled sync
- Notify Event Calendar owner if failures persist > 24 hours

**Google Maps API:**
- Use cached traffic data if API unavailable
- Fallback to static drive time estimates (no traffic)
- Display warning: "Drive times may not reflect current traffic"

**WebSocket Disconnection:**
- Automatic reconnection with exponential backoff
- On reconnect, fetch missed updates via REST API
- Display connection status in UI

#### Data Consistency

**Concurrent Assignment Changes:**
- Use database transactions with row-level locking
- Last-write-wins strategy
- Broadcast final state via WebSocket to all clients

**Google Calendar Sync Conflicts:**
- App is source of truth for assignments and supplemental events
- If main event modified in Google Calendar, those changes don't sync back (read-only from Google perspective)
- Manual edits in Google Calendar are overwritten on next sync

---

### Performance Optimization

#### Database Query Optimization
- Indexes on frequently queried fields (see Data Model section)
- Eager loading for related data (Prisma includes)
- Query result caching in Redis for expensive queries
- Connection pooling to handle concurrent requests

#### API Response Optimization
- Pagination for list endpoints (default: 50 items)
- Field selection (only return requested fields)
- Compression (gzip) for large responses
- ETags for conditional requests (304 Not Modified)

#### Background Job Optimization
- Parallel processing for independent calendars
- Batch Google Calendar API calls (max 50 operations per batch)
- Stagger ICS sync jobs to avoid thundering herd
- Priority queues (user-triggered syncs > scheduled syncs)

#### Frontend Optimization
- Code splitting by route (lazy loading)
- Image optimization (WebP format, responsive sizes)
- Service worker for offline functionality
- TanStack Query caching reduces redundant API calls
- Optimistic UI updates (instant feedback)

---

## FEATURE BREAKDOWN & BUSINESS LOGIC

**All 53 features across 6 major flows are documented in [FEATURES.md](./FEATURES.md).**

This separate document provides comprehensive breakdowns of:
- **User Actions:** What the user does to trigger each feature
- **Business Logic:** Step-by-step processing that occurs
- **Edge Cases:** Exceptional scenarios and how they're handled
- **Background Jobs:** Async processes triggered by each feature

**Quick Reference:**
1. Onboarding Flow (11 features) - User signup, calendar setup, invitations
2. Daily Use Flow (10 features) - Dashboard, assignments, real-time updates
3. Event Assignment/Transfer Flow (7 features) - Supplemental events, takeovers, multi-parent
4. Child Management Flow (8 features) - Add, edit, delete children
5. Settings Flow (9 features) - Address, timing, account management
6. Event Change Flow (8 features) - ICS sync, event updates, preserving assignments

---
