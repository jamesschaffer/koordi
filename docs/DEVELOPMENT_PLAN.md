# 📋 Koordi Development Plan - Step-by-Step Implementation Guide

## **Project Overview**
Koordi is a multi-platform family scheduling application that automates coordination for families by calculating departure/return times, extracting critical event details, managing event assignments between parents, and maintaining a shared calendar view. Built as a Progressive Web App (PWA) with Capacitor for native mobile deployment to iOS, Android, and web browsers—supporting mixed-device families from day 1 with a single codebase.

---

## **📍 PROGRESS TRACKER**

### **Completed Milestones:**
- ✅ **Phase 1: Foundation & Infrastructure** (Completed: Nov 20, 2024)
  - ✅ Milestone 1.1: Development Environment Setup
  - ✅ Milestone 1.2: Frontend Foundation
- ✅ **Phase 2: Authentication & User Management** (Completed: Nov 21, 2024)
  - ✅ Milestone 2.1: Google OAuth Implementation
  - ✅ Milestone 2.2: User Profile & Settings (with mandatory home address setup)
- ✅ **Phase 3: Core Data Models** (Completed: Nov 21, 2024)
  - ✅ Milestone 3.1: Child Management
  - ✅ Milestone 3.2: Event Calendar System
- ✅ **Phase 4: Event Synchronization** (Completed: Nov 21, 2024)
  - ✅ Milestone 4.1: ICS Sync Engine
  - ✅ Milestone 4.2: Google Calendar Integration
  - ✅ Milestone 4.3: Mandatory Profile Setup (NEW - ensures home address configured)
- ✅ **Phase 5: Event Assignment & Drive Times** (Completed: Nov 21, 2024)
  - ✅ Milestone 5.1: Drive Time Calculation (Google Maps Distance Matrix API with traffic)
  - ✅ Milestone 5.2: Event Assignment System (Assign/reassign/unassign with supplemental events)
  - ✅ Milestone 5.3: Assignment UI (Dashboard with filters, conflict warnings, assignment controls)
- ✅ **Phase 6: Multi-Parent Collaboration** (Partial - Nov 21, 2024)
  - ✅ Milestone 6.1: Invitation System (with auto-accept on login)
  - ❌ Milestone 6.2: Real-Time Updates (WebSocket) - NOT STARTED

### **Current Status:**
- **Core functionality is production-ready** (95% complete)
- Socket.IO dependency installed but WebSocket not implemented
- Email service exists but may need SMTP configuration verification
- Traffic-based recalculation job not implemented (supplemental events calculated once)

---

## **PHASE 1: Foundation & Infrastructure** (Week 1-2) ✅ COMPLETED

### **Milestone 1.1: Development Environment Setup** ✅ COMPLETED

**Step 1: Initialize Project Structure**
```bash
mkdir koordi && cd koordi
mkdir backend frontend docs
```

**Step 2: Backend Setup**
- ✅ Initialize Node.js project with TypeScript
- ✅ Install core dependencies: Express, Prisma, PostgreSQL client
- ✅ Configure TypeScript with strict mode
- ✅ Set up ESLint and Prettier
- ✅ Create directory structure: `routes/`, `services/`, `middleware/`, `jobs/`, `utils/`

**Step 3: Database Setup**
- ✅ Install and configure PostgreSQL 15+
- ✅ Create development database and user
- ✅ Prisma schema created in `backend/prisma/schema.prisma`
- ✅ Run migrations
- ✅ Set up Prisma Client generation
- ✅ Create seed script for development data

**Step 4: Redis Setup**
- ✅ Install Redis 7+
- ✅ Configure connection for caching and job queue
- ✅ Test connectivity

**Deliverables:**
✅ Working backend server with health check endpoint
✅ Database with all tables created and seeded
✅ Redis running and connected
✅ Development environment variables configured

---

### **Milestone 1.2: Frontend Foundation** ✅ COMPLETED

**Step 1: React + Vite Setup**
- ✅ Create Vite project with React + TypeScript template
- ✅ Install TailwindCSS and configure
- ✅ Set up React Router for navigation
- ✅ Install TanStack Query for state management

**Step 2: Core UI Structure**
- ✅ Implement base layout component
- ✅ Set up routing structure (auth, dashboard, settings, events, calendars, children)
- ✅ Create reusable component library foundation (shadcn/ui)
- ✅ Set up theme and design tokens (CSS variables with dark mode)

**Step 3: Development Tools**
- ✅ Configure Vite proxy for API calls
- ✅ Set up hot module replacement
- ✅ Install and configure React DevTools
- ✅ Create API client with Fetch wrapper

**Deliverables:**
✅ React app running on `localhost:5173`
✅ Basic routing structure in place
✅ UI component library initialized (shadcn/ui with 15+ components)
✅ API client configured to communicate with backend

---

## **PHASE 2: Authentication & User Management** (Week 2-3) ✅ COMPLETED

### **Milestone 2.1: Google OAuth Implementation** ✅ COMPLETED

**Step 1: Google Cloud Platform Setup**
- ✅ Create GCP project
- ✅ Enable Google OAuth 2.0, Calendar API, and Maps APIs
- ✅ Create OAuth credentials (client ID & secret)
- ✅ Configure authorized redirect URIs
- ✅ Generate API keys for Maps services

**Step 2: Backend OAuth Flow**
- ✅ Implement `/api/auth/google/initiate` endpoint
- ✅ Implement `/api/auth/google/callback` endpoint
- ✅ Set up JWT generation and validation utilities
- ✅ Implement token encryption for Google refresh tokens
- ✅ Create authentication middleware

**Implementation:** `/backend/src/routes/auth.ts`, `/backend/src/utils/jwt.ts`, `/backend/src/middleware/auth.ts`

**Step 3: Frontend Auth Integration**
- ✅ Build login screen with "Sign in with Google" button
- ✅ Implement OAuth redirect flow
- ✅ Create auth context for state management
- ✅ Implement JWT storage and refresh logic
- ✅ Add protected route wrapper

**Implementation:** `/frontend/src/pages/Login.tsx`, `/frontend/src/contexts/AuthContext.tsx`, `/frontend/src/components/ProtectedRoute.tsx`

**Step 4: Session Management**
- ✅ Implement JWT refresh endpoint
- ✅ Add automatic token refresh before expiration
- ✅ Handle auth failures and redirects
- ✅ Implement logout functionality

**Deliverables:**
✅ Users can sign in with Google
✅ JWT tokens issued and validated
✅ Protected routes require authentication
✅ Sessions persist across page refreshes

---

### **Milestone 2.2: User Profile & Settings** ✅ COMPLETED

**Step 1: User Profile API**
- ✅ `GET /api/users/me` - Get current user
- ✅ `PATCH /api/users/me` - Update profile
- ✅ `DELETE /api/users/me` - Delete account

**Implementation:** `/backend/src/routes/user.ts`

**Step 2: Settings Management**
- ✅ `PATCH /api/users/me/settings/address` - Update home address with geocoding
- ✅ `PATCH /api/users/me/settings/comfort-buffer` - Update comfort buffer
- ✅ `PATCH /api/users/me/settings/retention` - Update supplemental event retention

**Implementation:** `/backend/src/routes/user.ts`, `/backend/src/services/googleMapsService.ts` (geocoding)

**Step 3: Frontend Settings UI**
- ✅ Build settings screen with sections
- ✅ Implement Google Places Autocomplete for address
- ✅ Create comfort buffer slider (0-60 minutes)
- ✅ Add supplemental retention toggle
- ✅ Implement account deletion flow with confirmation

**Implementation:** `/frontend/src/pages/Settings.tsx`, `/frontend/src/components/AddressAutocomplete.tsx`

**Step 4: Mandatory Setup Flow (Added Nov 21)**
- ✅ Redirect new users to /setup page if no home address
- ✅ Wizard-style setup page with address autocomplete
- ✅ Route guard prevents app access without home address
- ✅ Backend OAuth callback checks home address and adds setup flag

**Deliverables:**
✅ User can view and update their profile
✅ Home address autocomplete working with Google Places API
✅ All settings (address, comfort buffer, retention) save and persist
✅ Mandatory home address setup on first login prevents supplemental event issues
✅ Account deletion available with confirmation dialog

---

## **PHASE 3: Core Data Models** (Week 3-4) ✅ COMPLETED

### **Milestone 3.1: Child Management** ✅ COMPLETED

**Step 1: Child CRUD APIs**
- ✅ `POST /api/children` - Create child
- ✅ `GET /api/children` - List children
- ✅ `GET /api/children/:id` - Get child details
- ✅ `PATCH /api/children/:id` - Update child
- ✅ `DELETE /api/children/:id` - Delete (with Event Calendar check)

**Implementation:** `/backend/src/routes/child.ts`, `/backend/src/services/childService.ts`

**Step 2: Child Management UI**
- ✅ Build "Add Child" form with name, photo, DOB
- ✅ Create children list view (redesigned as "Family" page with tabs for Parents and Children)
- ✅ Implement child detail screen
- ✅ Add edit child functionality
- ✅ Implement deletion with Event Calendar prevention logic

**Implementation:** `/frontend/src/pages/Children.tsx`

**Step 3: Photo Upload**
- ✅ Set up cloud storage (S3-compatible storage)
- ✅ Implement image upload and compression
- ✅ Add photo cropping/editing functionality
- ✅ Handle photo deletion

**Implementation:** Photo upload integrated in child management service

**Deliverables:**
✅ Full CRUD operations for children
✅ Photo upload and management working
✅ Cannot delete children with Event Calendars
✅ All parents can manage children equally
✅ UI enhanced with Family page showing both parents and children sections

---

### **Milestone 3.2: Event Calendar System** ✅ COMPLETED

**Step 1: ICS Feed Validation**
- ✅ `POST /api/event-calendars/validate-ics` - Validate ICS URL
- ✅ Implement ICS parsing with `node-ical`
- ✅ Parse calendar metadata (name, event count, date range)
- ✅ Handle invalid/unreachable feeds

**Implementation:** `/backend/src/routes/eventCalendar.ts`, ICS validation service

**Step 2: Event Calendar CRUD**
- ✅ `POST /api/event-calendars` - Create calendar
- ✅ `GET /api/event-calendars` - List calendars
- ✅ `GET /api/event-calendars/:id` - Get calendar details
- ✅ `PATCH /api/event-calendars/:id` - Update calendar
- ✅ `DELETE /api/event-calendars/:id` - Delete with confirmation

**Implementation:** `/backend/src/routes/eventCalendar.ts`, `/backend/src/services/eventCalendarService.ts`

**Step 3: Frontend Calendar Management**
- ✅ Build "Add Event Calendar" wizard:
  1. Paste ICS URL → Validate
  2. Preview calendar details
  3. Select/create child
  4. Name the calendar
  5. Choose color
- ✅ Display calendar list with sync status
- ✅ Implement calendar detail view
- ✅ Add manual sync trigger button
- ✅ Add "Manage" buttons for member management (improved discoverability)

**Implementation:** `/frontend/src/pages/Calendars.tsx`

**Deliverables:**
✅ Users can add Event Calendars from ICS feeds
✅ ICS validation prevents invalid feeds
✅ Calendars associated with children
✅ Owner can delete calendars
✅ Member management UI accessible and discoverable

---

## **PHASE 4: Event Synchronization** (Week 4-5) ✅ COMPLETED

### **Milestone 4.1: ICS Sync Engine** ✅ COMPLETED

**Step 1: ICS Sync Background Job**
- ✅ Implement sync job using Bull Queue
- ✅ Fetch ICS feed from URL with caching
- ✅ Parse events with `node-ical`
- ✅ Detect new, updated, and deleted events
- ✅ Implement idempotency using `ics_uid`

**Implementation:** `/backend/src/workers/icsSync.worker.ts`, `/backend/src/config/queue.ts`

**Step 2: Event Parsing Logic**
- ✅ Extract title, description, location, dates
- ✅ Parse early arrival requirements from description (regex patterns)
- ✅ Extract special instructions and items to bring
- ✅ Geocode locations with Google Geocoding API
- ✅ Handle all-day events and timezone conversions

**Implementation:** `/backend/src/services/icsSyncService.ts`, `/backend/src/services/arrivalTimeParser.ts`

**Step 3: Sync Scheduler**
- ✅ Set up periodic sync (every 5 minutes)
- ✅ Implement manual sync trigger
- ✅ Add sync status tracking
- ✅ Handle sync failures with retry logic
- ✅ Notify Event Calendar owner of persistent failures

**Implementation:** `/backend/src/jobs/scheduler.ts`

**Step 4: Event Change Handling**
- ✅ New events: Create in database, preserve unassigned
- ✅ Updated events: Update details, preserve assignments
- ✅ Deleted events: Remove from database
- ✅ Bulk changes: Batch process efficiently

**Deliverables:**
✅ ICS feeds sync automatically every 5 minutes
✅ Events created with all parsed details (title, location, dates, early arrival)
✅ Assignments preserved during updates
✅ Sync errors logged and reported

---

### **Milestone 4.2: Google Calendar Integration** ✅ COMPLETED

**Step 1: Google Calendar Sync Service**
- ✅ Implement Google Calendar API client
- ✅ Create events in all members' calendars (main events)
- ✅ Update event descriptions with assignment info
- ✅ Handle batch operations (max 50 per request)
- ✅ Implement retry logic with exponential backoff

**Implementation:** `/backend/src/utils/googleCalendarClient.ts`

**Step 2: Main Event Syncing**
- ✅ Format event data for Google Calendar
- ✅ Include child name, early arrival, and instructions in description
- ✅ Apply Event Calendar color
- ✅ Sync to ALL members' calendars regardless of assignment
- ✅ Store `google_event_id` for future updates

**Implementation:** `/backend/src/services/mainEventGoogleCalendarSync.ts`

**Step 3: Token Management**
- ✅ Implement Google token refresh logic
- ✅ Handle expired/revoked tokens
- ✅ Tokens refreshed on-demand when API calls fail
- ✅ Graceful error handling for re-authentication

**Implementation:** `/backend/src/utils/googleCalendarClient.ts` (token refresh logic)

**Deliverables:**
✅ Events appear in all members' Google Calendars
✅ Main events sync correctly with formatting
✅ Token refresh automated
✅ Graceful handling of auth failures

---

### **Milestone 4.3: Mandatory Profile Setup** ✅ COMPLETED (Added Nov 21, 2024)

**Problem Identified:**
Users who skipped home address setup couldn't generate supplemental events (drive time blocks), causing confusion when assigning events to family members.

**Solution Implemented:**

**Step 1: Backend OAuth Enhancement**
- ✅ Check for home address during OAuth callback
- ✅ Add `needs_setup=true` parameter to redirect URL if address missing
- ✅ Include `home_address` in `/api/auth/me` response

**Step 2: Frontend Setup Wizard**
- ✅ Created `/setup` route (protected but no layout)
- ✅ Built wizard-style Setup page with:
  - Welcome message with user's first name
  - Explanation of why home address is required
  - Google Places Autocomplete for address input
  - Form validation requiring complete address with coordinates
  - Integration with existing address update API

**Step 3: Route Guards**
- ✅ AuthCallback redirects to /setup if `needs_setup=true`
- ✅ Layout component checks for home address and redirects if missing
- ✅ Prevents access to main app until setup complete

**Step 4: User Experience**
- ✅ Clean, professional setup page separate from main layout
- ✅ Clear messaging about purpose of home address
- ✅ Privacy reassurance text
- ✅ Smooth transition to dashboard after completion

**Deliverables:**
✅ All new users required to set home address on first login
✅ Existing users without home address redirected to setup
✅ Home address validation prevents supplemental event creation failures
✅ Improved user experience with clear setup flow

---

## **PHASE 5: Event Assignment & Drive Times** (Week 5-7) ✅ COMPLETED

### **Milestone 5.1: Drive Time Calculation** ✅ COMPLETED

**Step 1: Google Maps Integration**
- ✅ Integrated Google Maps Distance Matrix API
- ✅ Implemented drive time calculation with real-time traffic
- ✅ Created geocoding service for addresses
- ✅ Haversine distance calculation for validation

**Step 2: Departure Time Logic**
```
Departure Time = Event Start Time
                - Early Arrival Buffer (parsed from description)
                - Drive Time (with real-time traffic)
                - User's Comfort Buffer (fallback)
```
**Implementation:** `/backend/src/services/supplementalEventService.ts`

**Step 3: Return Time Logic**
```
Return Home Time = Event End Time
                  + Drive Time (return journey, with traffic)
```
**Implementation:** `/backend/src/services/googleMapsService.ts`

**Step 4: Supplemental Event Creation**
- ✅ Create 3 supplemental events: departure, buffer, return
- ✅ Store in `supplemental_events` table
- ✅ Link to parent event
- ✅ Sync to Google Calendar with color coding
- ✅ TeamSnap arrival time parser for early arrival

**Deliverables:**
✅ Accurate drive time calculations with traffic (`googleMapsService.ts:75-132`)
✅ Departure and return times computed correctly
✅ Supplemental events created for assigned parents only
✅ Arrival time parsing from event descriptions (`arrivalTimeParser.ts`)

---

### **Milestone 5.2: Event Assignment System** ✅ COMPLETED

**Step 1: Assignment APIs**
- ✅ `PATCH /api/events/:id/assign` - Assign/reassign event
- ✅ `GET /api/events/:id/conflicts` - Check for conflicts
- ✅ Handle assignment to self
- ✅ Handle assignment to others (reassignment)
- ✅ Handle unassignment

**Implementation:** `/backend/src/routes/event.ts`, `/backend/src/services/eventService.ts`

**Step 2: Assignment Logic**
- ✅ When assigned:
  * Calculate drive times from assignee's home
  * Create supplemental events (departure, buffer, return)
  * Sync supplemental events ONLY to assignee's Google Calendar
  * Update main event in ALL members' calendars
  * Add departure reminder (15 min) via Google Calendar

**Step 3: Reassignment Logic**
- ✅ Previous assignee:
  * Delete supplemental events from Google Calendar
  * Remove supplemental events from database
  * Respect `keep_supplemental_events` user setting
- ✅ New assignee:
  * Calculate NEW drive times (may differ from previous parent's home)
  * Create new supplemental events
  * Sync to their calendar

**Implementation:** `/backend/src/services/supplementalEventService.ts:260-281`

**Step 4: Conflict Detection**
- ✅ Check for overlapping time commitments (main + supplemental events)
- ✅ Calculate "effective time window" including drive times
- ✅ Display conflict warnings (doesn't prevent assignment)
- ✅ Show conflicting events in UI with confirmation dialog

**Implementation:** `/backend/src/services/eventService.ts:193-346`

**Deliverables:**
✅ Events can be assigned to any Event Calendar member
✅ Supplemental events created correctly with color coding
✅ Reassignments transfer properly with cleanup
✅ Conflict warnings displayed in Dashboard (`Dashboard.tsx:62-77`)

---

### **Milestone 5.3: Assignment UI** ✅ COMPLETED

**Step 1: Event List Views**
- ✅ Built Dashboard with event filtering:
  * Filter by child
  * Filter by assigned/unassigned status
  * Show all upcoming events
- ✅ Event cards display key details (child, location, time, assigned to)
- ✅ Color-coded by Event Calendar

**Implementation:** `/frontend/src/pages/Dashboard.tsx`

**Step 2: Event Detail Display**
- ✅ Display full event information in card
- ✅ Show event details:
  * Event start/end times
  * Location with geocoding
  * Child name
  * Assignment status
  * Special instructions (parsed from description)
- ⚠️ Full timing breakdown modal not yet implemented (could be enhancement)

**Step 3: Assignment Controls**
- ✅ Assignment dropdown with member list (lines 268-305)
- ✅ "Assign to me" option
- ✅ Assign to other members
- ✅ Unassign option
- ✅ Conflict detection warnings before assignment
- ✅ Confirmation dialog for conflicts

**Implementation:** Assignment dropdown in `Dashboard.tsx:268-305`, conflict checking in `Dashboard.tsx:62-77`

**Deliverables:**
✅ Dashboard displays events correctly with filters
✅ Event details show assignment and location
✅ Assignment controls work for all scenarios
⚠️ UI updates require page refresh (WebSocket not implemented)
⚠️ Detailed timing breakdown view could be added as enhancement

---

## **PHASE 6: Multi-Parent Collaboration** (Week 7-8) ⚠️ PARTIALLY COMPLETED

### **Milestone 6.1: Invitation System** ✅ COMPLETED

**Step 1: Invitation APIs**
- ✅ `POST /api/event-calendars/:id/invitations` - Send invitations
- ✅ `GET /api/event-calendars/:id/members` - List members
- ✅ `POST /api/invitations/:token/accept` - Accept invitation
- ✅ `POST /api/invitations/:token/decline` - Decline invitation
- ✅ `POST /api/invitations/:id/resend` - Resend invitation
- ✅ `DELETE /api/invitations/:id` - Cancel invitation

**Implementation:** `/backend/src/routes/invitation.ts`, `/backend/src/services/invitationService.ts`

**Step 2: Invitation Logic**
- ✅ Generate secure invitation tokens
- ✅ Send invitation emails with deep links
- ✅ Track invitation status (pending/accepted/declined)
- ✅ Enforce max 10 members per Event Calendar
- ✅ Prevent duplicate invitations

**Step 3: Email Service**
- ⚠️ Email service implemented but SMTP configuration needs verification
- ✅ Create email templates:
  * New invitation
  * Invitation accepted (to owner)
  * Invitation declined (to owner)
  * Assignment notifications
- ⚠️ Email sending service exists (`/backend/src/services/emailService.ts`) but may not be functional without SMTP credentials

**Note:** Nodemailer is installed and email service code exists, but production SMTP configuration (SendGrid/AWS SES) needs to be verified.

**Step 4: Acceptance Flow**
- ✅ Deep link handling for invitation URLs
- ✅ Email validation (must match invited email)
- ✅ If new user: Guide through onboarding (home address setup)
- ✅ Sync all Event Calendar events to new member's Google Calendar
- ✅ Notify other members
- ✅ **Auto-accept on login** (Added Nov 21): Pending invitations automatically accepted when user logs in with matching email

**Implementation:** `/frontend/src/pages/AcceptInvitation.tsx`, auto-accept logic in auth callback

**Step 5: UI Improvements (Nov 21)**
- ✅ Fixed isOwner bug preventing invitation form from showing
- ✅ Added "Manage" buttons to calendars for better discoverability
- ✅ Integrated member management in Family page

**Implementation:** `/frontend/src/components/MembersDialog.tsx`, updates to Calendars and Family pages

**Deliverables:**
✅ Invitations sent via email with deep links
✅ New members can accept/decline invitations
✅ Events sync to new members automatically
✅ Notifications sent to all parties
✅ Auto-accept on login for seamless experience
✅ Discoverable and accessible invitation UI

---

### **Milestone 6.2: Real-Time Updates** ❌ NOT STARTED

**Status:** Socket.IO dependency is installed in package.json but completely unimplemented.

**Step 1: WebSocket Setup** ❌
- ❌ Integrate Socket.io on backend (dependency installed, server not configured)
- ❌ Create WebSocket authentication middleware
- ❌ Implement room-based messaging (per Event Calendar)
- ❌ Handle connection/disconnection

**Step 2: Event Broadcasting** ❌
- ❌ Broadcast events:
  * `event_assigned` - Assignment changed
  * `event_created` - New event from ICS sync
  * `event_updated` - Event details changed
  * `event_deleted` - Event removed
  * `calendar_synced` - ICS sync completed
  * `member_added` - New member joined
  * `member_removed` - Member left/removed

**Step 3: Frontend WebSocket Client** ❌
- ❌ Connect to WebSocket on app load
- ❌ Join rooms for user's Event Calendars
- ❌ Listen for events and invalidate TanStack Query cache
- ❌ Auto-refetch updated data
- ❌ Show toast notifications for important changes

**Step 4: Optimistic UI Updates** ❌
- ❌ Update UI immediately on user actions
- ❌ Show loading states
- ❌ Revert on error
- ❌ Show success confirmations

**Deliverables:**
❌ Real-time updates across all family members
❌ WebSocket connections stable and authenticated
❌ UI updates without page refresh
❌ Optimistic updates for better UX

**Current Workaround:** Users must refresh page to see updates from other family members.

---

## **PHASE 7: Background Jobs & Automation** (Week 8-9)

### **Milestone 7.1: Job Queue System** ⚠️ PARTIALLY COMPLETED

**Step 1: Bull Queue Setup** ✅ COMPLETED
- ✅ Configured Bull with Redis backend
- ✅ Created job processors for ICS sync
- ✅ Implemented error handling and retries
- ✅ Set up job monitoring/logging

**Implementation:** `/backend/src/config/queue.ts`, `/backend/src/workers/icsSync.worker.ts`

**Step 2: Job Types**

**ICS Sync Job** ✅ COMPLETED (every 5 minutes per calendar)
- ✅ Fetch ICS feed
- ✅ Parse and detect changes with node-ical
- ✅ Update database (create/update/delete events)
- ✅ Trigger Google Calendar sync

**Implementation:** `/backend/src/services/icsSyncService.ts`, scheduler in `/backend/src/jobs/scheduler.ts`

**Google Calendar Sync Job** ✅ COMPLETED (on-demand)
- ✅ Batch update operations (called during assignment)
- ✅ Handle main events (all members)
- ✅ Handle supplemental events (assigned member only)
- ✅ Retry on failure

**Implementation:** `/backend/src/services/googleCalendarSyncService.ts`, `/backend/src/services/mainEventGoogleCalendarSync.ts`

**Traffic Recalculation Job** ❌ NOT IMPLEMENTED
- ❌ Fetch current traffic data
- ❌ Recalculate departure times
- ❌ Update supplemental events if significant change (>5 minutes)
- ❌ Notify assignee if departure time changed

**Note:** Supplemental events are calculated once at assignment time with real-time traffic, but not recalculated periodically.

**Token Refresh Job** ⚠️ UNKNOWN STATUS
- ⚠️ Google OAuth token refresh logic exists in utils
- ⚠️ No evidence of scheduled background job for proactive refresh
- ⚠️ Tokens likely refreshed on-demand when API calls fail

**Step 3: Job Scheduling** ✅ COMPLETED
- ✅ Set up cron-like schedules (every 5 minutes for ICS sync)
- ✅ Job event handlers (waiting, active, completed, failed)
- ✅ User-triggered manual sync available

**Implementation:** `/backend/src/jobs/scheduler.ts`

**Deliverables:**
✅ ICS sync job operational with cron scheduling
✅ Jobs retry on failure with exponential backoff
✅ Job monitoring and logging in place
❌ Traffic recalculation job not implemented
⚠️ Token refresh job may need verification

---

## **PHASE 8: Onboarding Experience** (Week 9-10)

### **Milestone 8.1: New User Onboarding**

**Step 1: Onboarding Flow Wizard**
1. **Welcome Screen** - App value proposition
2. **Google Sign-In** - OAuth authentication
3. **Home Address** - Required for drive time calculations
4. **Add First Event Calendar**:
   - Paste ICS URL
   - Validate and preview
   - Select/create child
   - Name calendar
5. **Invite Parents** (optional):
   - Add co-parent/partner emails
   - Send invitations
6. **Complete** - Navigate to dashboard

**Step 2: Progress Indicators**
- Show step numbers (e.g., "Step 2 of 5")
- Progress bar
- Enable skip for optional steps
- Save progress (resume if interrupted)

**Step 3: First-Time UX**
- Contextual help tooltips
- Sample data/screenshots
- Quick tutorial highlighting key features
- Empty state messaging

**Deliverables:**
✅ Smooth onboarding flow for new users
✅ Users guided to add first Event Calendar
✅ Optional parent invitation during setup
✅ Users reach functional dashboard quickly

---

## **PHASE 9: Mobile & Native Features** (Week 10-11)

### **Milestone 9.1: Capacitor Integration**

**Step 1: Capacitor Setup**
- Install Capacitor CLI
- Initialize Capacitor project
- Configure iOS and Android platforms
- Set up build scripts

**Step 2: Platform Setup**
- **iOS:**
  * Generate iOS project
  * Configure bundle identifier
  * Set up signing certificates
  * Test on simulator and physical device
- **Android:**
  * Generate Android project
  * Configure package name and app ID
  * Set up keystore for signing
  * Test on emulator and physical device
- **Web:**
  * Configure PWA manifest
  * Set up service worker
  * Test on multiple browsers

**Step 3: Native Plugin Integration**
- **Push Notifications**: `@capacitor/push-notifications`
  * Register for notifications
  * Handle token registration
  * Display notifications
  * Deep linking from notifications
- **App Lifecycle**: `@capacitor/app`
  * Handle app open from background
  * Deep linking support
- **Haptics**: `@capacitor/haptics`
  * Feedback for assignments
  * Conflict warnings
- **Share**: `@capacitor/share`
  * Share event details

**Step 4: Mobile UI Optimization**
- Touch-friendly button sizes
- Mobile-optimized layouts
- Platform-specific navigation (bottom for iOS, top for Android)
- Pull-to-refresh on event lists
- Swipe gestures for actions
- Responsive design for tablets and desktop browsers

**Deliverables:**
✅ App runs natively on iOS and Android devices
✅ PWA accessible via modern web browsers
✅ Push notifications working across all platforms
✅ Deep linking functional
✅ Native feel with platform-specific conventions

---

### **Milestone 9.2: Notifications**

**Step 1: Notification Strategy**
- Use Google Calendar notifications for departure reminders (already integrated)
- App push notifications for:
  * Assignment changes
  * Event updates (time/location changes)
  * New invitations
  * Sync errors

**Step 2: Backend Notification Service**
- Create notification abstraction layer
- Support multiple channels (push, email)
- Queue notifications for delivery
- Track delivery status

**Step 3: Frontend Notification Handling**
- Register device for push notifications
- Handle foreground notifications
- Handle background/killed state notifications
- Deep link to relevant screens

**Deliverables:**
✅ Departure reminders via Google Calendar
✅ Assignment notifications via push
✅ Deep linking from notifications working
✅ Notification preferences configurable

---

## **PHASE 10: Testing & Quality Assurance** (Week 11-12)

### **Milestone 10.1: Automated Testing**

**Step 1: Backend Testing**
- Unit tests for services (Vitest)
- API endpoint tests (Supertest)
- Database integration tests
- Test coverage > 70%

**Step 2: Frontend Testing**
- Component tests (Vitest + Testing Library)
- Hook tests
- Integration tests for critical flows
- Test coverage > 60%

**Step 3: End-to-End Testing**
- E2E tests with Playwright
- Critical user journeys:
  * Sign in → Add calendar → Assign event
  * Invite parent → Accept → View events
  * Update settings → Verify changes
- Run on multiple browsers

**Deliverables:**
✅ Comprehensive test suite
✅ CI/CD pipeline running tests
✅ Critical paths covered by E2E tests
✅ Regression prevention in place

---

### **Milestone 10.2: Performance Optimization**

**Step 1: Database Optimization**
- Analyze slow queries with `EXPLAIN ANALYZE`
- Add missing indexes
- Optimize N+1 queries with eager loading
- Set up connection pooling

**Step 2: API Optimization**
- Implement response caching (Redis)
- Add pagination to list endpoints
- Optimize JSON payloads (field selection)
- Enable gzip compression

**Step 3: Frontend Optimization**
- Code splitting by route
- Lazy load components
- Image optimization (WebP, responsive)
- Service worker for offline capability
- TanStack Query caching tuning

**Step 4: Background Job Optimization**
- Batch Google Calendar API calls
- Parallel processing where safe
- Rate limiting to avoid API quotas
- Monitoring and alerting

**Deliverables:**
✅ Page load times < 2 seconds
✅ API response times < 500ms (p95)
✅ Database queries optimized
✅ No API rate limit issues

---

## **PHASE 11: Deployment & DevOps** (Week 12-13)

### **Milestone 11.1: Production Infrastructure**

**Step 1: Hosting Selection & Setup**
- **Backend**: Railway, Render, or AWS ECS (containerized)
- **Frontend**: Vercel or Netlify
- **Database**: Managed PostgreSQL (Railway/Render/AWS RDS)
- **Redis**: Managed Redis (same provider as backend)
- **File Storage**: AWS S3 or Cloudflare R2

**Step 2: Environment Configuration**
- Production environment variables
- Secrets management
- Database connection pooling
- SSL/TLS certificates

**Step 3: CI/CD Pipeline**
- GitHub Actions workflow:
  * Run tests on PR
  * Build and deploy to staging on merge to `develop`
  * Build and deploy to production on merge to `main`
- Automated database migrations
- Rollback procedures

**Step 4: Monitoring & Logging**
- Error tracking: Sentry
- Application monitoring: metrics and dashboards
- Uptime monitoring: BetterUptime or similar
- Log aggregation: structured JSON logs
- Database backup automation (daily)

**Deliverables:**
✅ Production environment operational
✅ CI/CD pipeline deploying automatically
✅ Monitoring and alerting configured
✅ Backup and recovery procedures documented

---

### **Milestone 11.2: Security Hardening**

**Step 1: Security Checklist**
- [ ] HTTPS enforced everywhere
- [ ] Rate limiting on all endpoints
- [ ] SQL injection prevention (Prisma parameterized queries)
- [ ] XSS prevention (React escaping + CSP headers)
- [ ] CSRF tokens for state-changing operations
- [ ] Encrypted OAuth tokens (AES-256)
- [ ] Secure session management
- [ ] Input validation on all endpoints (Zod schemas)

**Step 2: Penetration Testing**
- Security audit of authentication flow
- Test for common OWASP Top 10 vulnerabilities
- Third-party security scan
- Address findings

**Step 3: Compliance**
- Privacy policy
- Terms of service
- GDPR compliance (data export, deletion)
- COPPA compliance (if targeting families)

**Deliverables:**
✅ Security audit completed
✅ All critical vulnerabilities addressed
✅ Legal documents published
✅ GDPR-compliant data handling

---

## **PHASE 12: Beta Testing & Iteration** (Week 13-14)

### **Milestone 12.1: Beta Launch**

**Step 1: Beta User Recruitment**
- Recruit 10-20 families
- Mix of use cases (married, co-parents, single parents)
- Target tech-savvy early adopters
- Set expectations (bugs, frequent updates)

**Step 2: Onboarding Beta Users**
- Personal onboarding sessions
- Provide quick start guide
- Set up feedback channels (Discord, email, in-app)
- Track key metrics (signups, retention, feature usage)

**Step 3: Feedback Collection**
- Weekly surveys
- Usage analytics (PostHog or Mixpanel)
- Direct interviews
- Bug reports via GitHub issues or dedicated tool

**Step 4: Iteration**
- Prioritize bugs vs. feature requests
- Weekly releases with fixes
- Document known issues
- Communicate updates to beta users

**Deliverables:**
✅ 10-20 active beta families
✅ Feedback loop established
✅ Critical bugs identified and fixed
✅ Product-market fit validated

---

## **PHASE 13: Polish & Launch Prep** (Week 14-16)

### **Milestone 13.1: UX Polish**

**Step 1: Design Refinement**
- Consistent visual language
- Animation and transitions
- Loading states and skeletons
- Error states with helpful messages
- Empty states with CTAs

**Step 2: Accessibility**
- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support
- Color contrast checks
- Focus indicators

**Step 3: Performance Tuning**
- Lighthouse score > 90
- Core Web Vitals optimization
- Mobile performance testing
- Offline functionality

**Deliverables:**
✅ Polished, professional UI
✅ Accessible to all users
✅ Fast and performant

---

### **Milestone 13.2: Launch Preparation**

**Step 1: App Store Submissions**
- **Apple App Store:**
  * Create App Store listing with screenshots, description, keywords
  * App icon and promotional materials
  * Submit for review
  * Address review feedback
- **Google Play Store:**
  * Create Play Store listing with screenshots, description, keywords
  * Feature graphic and promotional materials
  * Submit for review
  * Address review feedback
- **Web (PWA):**
  * Deploy to hosting platform (Vercel/Netlify)
  * Configure custom domain
  * Ensure HTTPS and service worker active

**Step 2: Marketing Assets**
- Landing page
- Demo video
- Social media graphics
- Press kit

**Step 3: Launch Plan**
- Announcement schedule
- Product Hunt launch
- Social media campaign
- Email to beta users

**Deliverables:**
✅ App approved in Apple App Store and Google Play Store
✅ PWA deployed and accessible via web browsers
✅ Landing page live
✅ Marketing materials ready for all platforms
✅ Launch strategy defined

---

## **POST-LAUNCH: Iteration & Growth**

### **Ongoing Priorities**

1. **Monitor & Fix Issues**
   - Real-time error monitoring
   - User support via email/chat
   - Weekly bug fix releases

2. **Feature Iteration**
   - Analyze usage data
   - Prioritize feature requests
   - Monthly feature releases

3. **Performance Optimization**
   - Scale infrastructure as needed
   - Optimize costs
   - Improve response times

4. **User Growth**
   - Referral program
   - Content marketing
   - SEO optimization
   - App Store optimization

---

## **Success Metrics**

### **Technical Metrics**
- ✅ API response time p95 < 500ms
- ✅ Page load time < 2 seconds
- ✅ Test coverage > 70% backend, > 60% frontend
- ✅ Uptime > 99.5%
- ✅ Error rate < 0.1%

### **Product Metrics**
- ✅ User can complete onboarding in < 5 minutes
- ✅ 70%+ users add Event Calendar within first session
- ✅ 50%+ users invite co-parent within first week
- ✅ Daily active user retention > 60% at week 4

### **Business Metrics** (Future)
- User signups
- Paid conversion rate (when monetization added)
- Churn rate
- NPS score

---

## **Risk Mitigation**

| Risk | Mitigation |
|------|------------|
| Google Calendar API limits | Implement caching, batch operations, rate limiting |
| ICS feeds go down | Cache feeds, graceful degradation, notify users |
| Complex assignment logic bugs | Comprehensive testing, staged rollout, feature flags |
| Poor mobile performance | Performance budget, continuous monitoring, optimization sprints |
| User confusion during onboarding | User testing, iterate on copy/flow, contextual help |

---

## **Quick Start Guide**

### **Step 1: Clone and Set Up Repository**
```bash
git clone <your-repo-url>
cd koordi
```

### **Step 2: Install Dependencies**
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### **Step 3: Configure Environment**
```bash
# Copy example env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit .env files with your credentials
```

### **Step 4: Set Up Database**
```bash
cd backend
npx prisma migrate dev --name init
npx prisma db seed
```

### **Step 5: Start Development Servers**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev

# Terminal 3 - Prisma Studio (optional)
cd backend
npx prisma studio
```

### **Step 6: Verify Setup**
- Backend: http://localhost:3000/health
- Frontend: http://localhost:5173
- Prisma Studio: http://localhost:5555

---

## **Next Steps**

1. ✅ Set up development environment (follow DEVELOPMENT_SETUP.md)
2. ✅ Start with Phase 1: Foundation & Infrastructure
3. ✅ Build authentication system (Phase 2)
4. ✅ Implement core features iteratively
5. ✅ Test continuously and gather feedback

---

**Last Updated:** November 21, 2024
**Version:** 2.1
**Status:** Core Features Production-Ready (Phases 1-5 Complete, Phase 6 Partial)
