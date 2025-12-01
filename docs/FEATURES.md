# Feature Breakdown & Business Logic
## Koordi

---

## OVERVIEW

This document provides a comprehensive breakdown of core features in Koordi. Each feature includes:
- **User Actions:** What the user does to trigger this feature
- **Business Logic:** Step-by-step processing that occurs
- **Edge Cases:** Exceptional scenarios and how they're handled
- **Background Jobs:** Async processes triggered by this feature

**Total Features:** 54 features across 6 major flows

**Note:** Additional specialized flows (Event Calendar Management, Parent Member Management, Conflict Resolution) are documented in their respective flow specification files. See [EVENT_CAL_MGMT.md](./EVENT_CAL_MGMT.md), [PARENT_MEMBER_MGMT.md](./PARENT_MEMBER_MGMT.md), and [CONFLICT_RESOLUTION.md](./CONFLICT_RESOLUTION.md).

---

## TABLE OF CONTENTS

1. [Onboarding Flow](#onboarding-flow---feature-breakdown) (11 features)
2. [Daily Use Flow](#daily-use-flow---feature-breakdown) (11 features)
3. [Event Assignment/Transfer Flow](#event-assignmenttransfer-flow---feature-breakdown) (7 features)
4. [Child Management Flow](#child-management-flow---feature-breakdown) (8 features)
5. [Settings Flow](#settings-flow---feature-breakdown) (9 features)
6. [Event Change Flow](#event-change-flow---feature-breakdown) (8 features)

---

## ONBOARDING FLOW - Feature Breakdown

### Feature 1.1: Initiate Google OAuth Authentication

**User Action:**
- User taps "Get Started with Google" button on welcome screen

**Business Logic:**
1. Generate Google OAuth URL with required scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
2. Include callback URL for app
3. Include state parameter (CSRF protection + invitation token if present)

**Edge Cases:**
- If invitation_token provided, validate it exists and is valid

**Background Jobs:**
- None

---

### Feature 1.2: Complete Google OAuth & Create Account

**User Action:**
- User completes Google authentication and grants permissions
- Google redirects back to app with auth code

**Business Logic:**
1. Validate state parameter (CSRF protection)
2. Exchange auth code for access token + refresh token with Google
3. Fetch user profile from Google (email, name, photo)
4. Check if email already exists in database:
   - If exists: Load existing user, update tokens
   - If new: Create new user record
5. Encrypt and store Google tokens (AES-256)
6. Store Google Calendar ID (primary calendar)
7. Generate JWT for app authentication
8. If invitation_token in state, associate with user for later

**Edge Cases:**
- Email already exists: Login instead of create
- Google auth fails: Return 401 error
- Calendar permission denied: Return error requiring retry
- Invalid state: Return 403 CSRF error
- Expired auth code: Return 400 error

**Background Jobs:**
- None

---

### Feature 1.3: Set Home Address

**User Action:**
- User searches for address using autocomplete
- User selects address from suggestions
- User confirms address

**Business Logic:**
1. Call Google Places Autocomplete API for address suggestions
2. Filter to address types only
3. Return top 5 suggestions
4. When user confirms:
   - Validate user is authenticated (JWT)
   - Call Google Geocoding API to get full address details (lat/lng, formatted address, components)
   - Validate address is physical location (not PO Box)
   - Update user record with address information

**Edge Cases:**
- Invalid place_id: Return 400 error
- Geocoding fails: Return 400 error with message
- PO Box detected: Return 400 with warning message
- User enters invalid address: Validation error

**Background Jobs:**
- None

---

### Feature 1.4: Validate ICS Feed URL

**User Action:**
- User pastes ICS URL
- User enters calendar name
- User taps "Continue"

**Business Logic:**
1. Validate ICS URL format
2. Fetch ICS feed from URL (with timeout)
3. Parse ICS data using ical.js library
4. Extract basic info:
   - Calendar name from feed (if present)
   - Event count
   - Date range of events
5. Check for duplicate ICS URL in database for this user
6. Return preview data without creating records yet

**Edge Cases:**
- Invalid URL format: Return 400 error
- ICS feed unreachable: Return 400 error "Can't access calendar"
- ICS feed invalid/not parseable: Return 400 error "Invalid calendar format"
- Duplicate ICS URL: Return 409 error "Calendar already added"
- Empty calendar (0 events): Return 200 with warning flag
- Feed requires authentication: Return 400 error "Calendar requires login"

**Background Jobs:**
- None

---

### Feature 1.5: Create Event Calendar with Child

**User Action:**
- User confirms ICS feed preview
- User enters child's name
- User taps "Continue"

**Business Logic:**
1. Validate user is authenticated
2. Re-validate ICS URL (in case it changed)
3. If creating new child:
   - Create new child record
4. If selecting existing child:
   - Validate user has access to that child
5. Create Event Calendar record:
   - Link to child
   - Set owner to current user
   - Store ICS URL and calendar name
6. Create Event Calendar Membership for owner (status: active)
7. Enqueue background job: ICS Sync (immediate)
8. Return calendar details

**Edge Cases:**
- Child name empty: Return 400 error
- ICS URL changed/invalid: Return 400 error
- Duplicate calendar name for same child: Allow (warn but allow)
- User has no home address: Allow but warn that departure times can't calculate

**Background Jobs:**
- ICS Sync Job (immediate execution)

---

### Feature 1.6: Invite Parent Members to Event Calendar

**User Action:**
- User enters name and email for each parent member they want to invite
- User taps "+ Add Another Parent" to add more (optional)
- User taps "Send Invitations" OR "Skip for Now"

**Business Logic:**
1. Validate each email format
2. For each email, check if user already exists in system:
   - If exists AND already member of THIS calendar: Error
   - If exists AND member of OTHER calendars: Allow (will link existing user)
   - If doesn't exist: Will create invitation for new user
3. Validate no duplicate emails in invitation list
4. Validate owner's email not in invitation list
5. Enforce max 10 parent members per Event Calendar limit
6. For each parent to invite:
   - Create invitation record with secure token
   - Create membership record with status "invited"
   - Send invitation email with deep link
7. Return success with invitation details

**Edge Cases:**
- Email already member of this Event Calendar: "This parent is already added to [Calendar Name]"
- Email has pending invitation to this calendar: "You've already invited [email]. Resend invitation?"
- User enters own email: "You're automatically added to this calendar"
- User taps "Skip for Now": Proceed without sending invitations
- Email bounces (async detection): Flag invitation as failed, notify owner later
- Invalid email format: Validation error per email
- More than 10 members: "Maximum 10 parents per calendar"
- No name provided for email: "Please enter a name for each parent"

**Background Jobs:**
- Send invitation email (async)
- Track email delivery status

---

### Feature 1.7: ICS Sync Background Job (Initial Import)

**User Action:**
- (Automatic - triggered by Event Calendar creation)

**Business Logic:**
1. Fetch ICS feed from stored URL
2. Parse ICS data using ical.js
3. For each event in feed:
   - Extract: uid, title, description, location, start time, end time, last-modified
   - Parse description for:
     - Early arrival requirements (regex patterns: "arrive X min early", "be there X minutes before")
     - Special instructions
     - Items to bring
   - Geocode location address to lat/lng using Google Geocoding API
   - Create Event record:
     - Link to Event Calendar
     - Inherit child_id from Event Calendar
     - Set assigned_to_user_id = NULL (unassigned)
     - Store parsed data
4. Update Event Calendar:
   - last_synced_at = now
   - last_sync_status = "success" or "failed"
   - last_sync_error = error message if failed
5. Enqueue Google Calendar Sync Job for each member

**Edge Cases:**
- ICS feed unreachable: Mark sync as failed, retry in 1 hour
- ICS feed invalid/unparseable: Mark sync as failed, notify owner
- No events in feed: Mark sync as success with 0 events
- Geocoding fails for location: Store address anyway, lat/lng = null
- Event missing required fields (title, start): Skip event, log warning
- Duplicate event UIDs: Keep first, skip duplicates
- Events in past: Import anyway (for historical context)

**Background Jobs:**
- Google Calendar Sync Job (for each calendar member)

---

### Feature 1.8: Google Calendar Sync Job (Initial Sync)

**User Action:**
- (Automatic - triggered after ICS Sync completes)

**Business Logic:**
1. For each Event Calendar member:
   - Get member's Google Calendar ID
   - Get member's Google OAuth tokens (decrypt)
   - Refresh token if expired
2. For each Event in the Event Calendar:
   - Create main event in member's Google Calendar:
     - Title: [Event title]
     - Start/end times
     - Location
     - Description: Include child name, early arrival, special instructions, "Unassigned" status
     - Color: Match Event Calendar color
   - Store google_calendar_event_id in Event record
   - Mark synced_to_google = true
3. Handle supplemental events:
   - If event is unassigned: Do NOT create supplemental events
   - If event is assigned: Handled in assignment flow

**Edge Cases:**
- Google Calendar API fails: Retry with exponential backoff (max 3 attempts)
- OAuth token expired and refresh fails: Notify user to re-authenticate
- Rate limit hit: Queue for retry after delay
- Event already exists in Google Calendar: Update instead of create
- Member's Google Calendar deleted: Error, notify user

**Background Jobs:**
- None

---

### Feature 1.9: Load Dashboard (Initial View)

**User Action:**
- User completes onboarding
- System navigates to dashboard

**Business Logic:**
1. Fetch all Event Calendars where user is a member
2. Fetch all children associated with those Event Calendars
3. Fetch upcoming events (next 90 days) from user's Event Calendars:
   - Group by assignment status (unassigned, assigned to user, assigned to others)
   - Calculate departure times from user's home address for each event
4. For each event, include:
   - Event details (title, location, time, description)
   - Child information
   - Event Calendar information
   - Assignment status
   - Calculated departure time (if user has home address)
   - Calculated return time (if assigned to user)
5. Return data grouped for three tabs:
   - Unassigned Events
   - Upcoming Events (all events, any status)
   - My Events (assigned to current user only)

**Edge Cases:**
- No Event Calendars yet: Show empty state with "Add your first calendar" CTA
- ICS sync still in progress: Show loading indicator with "Importing events..."
- All events assigned to others: Show empty state in "My Events" tab
- No unassigned events: Show empty state in "Unassigned" tab
- User has no home address: Show events without departure times, prompt to add address

**Background Jobs:**
- None

---

### Feature 1.10: Accept Invitation (Member Onboarding)

**User Action:**
- Invited parent receives email
- Taps invitation link (deep link to app or web)
- Views invitation details
- Taps "Accept Invitation"

**Business Logic:**
1. Validate invitation token
2. Check invitation status:
   - If already accepted: Redirect to calendar
   - If declined: Show error
3. Check if user is authenticated:
   - If not authenticated: Redirect to Google OAuth
   - If authenticated: Proceed
4. Validate authenticated email matches invitation email:
   - If mismatch: Error "Please sign in with [invitation email]"
5. If user is new (first calendar):
   - Require home address setup
6. Update invitation status to "accepted"
7. Update membership status from "invited" to "accepted"
8. Set joined_at timestamp
9. Enqueue Google Calendar Sync Job for this user
10. Send notification to Event Calendar owner: "[Name] accepted your invitation"
11. Return calendar details and redirect to dashboard

**Edge Cases:**
- Invitation already accepted: "You're already a member of this calendar"
- Invalid/tampered token: "Invalid invitation link"
- Email mismatch: "Please sign in with [correct email] or request new invitation"
- User already member via different invitation: "You're already a member"
- Event Calendar deleted before acceptance: "This calendar no longer exists"

**Background Jobs:**
- Google Calendar Sync Job (sync all events to new member's calendar)
- Send notification to owner (email/push)

---

### Feature 1.11: Decline Invitation

**User Action:**
- Invited parent views invitation
- Taps "Decline"

**Business Logic:**
1. Validate invitation token
2. Update invitation status to "declined"
3. Update membership status to "declined"
4. Send notification to Event Calendar owner: "[Name] declined your invitation to [Calendar Name]"
5. Remove invitation from recipient's pending invitations

**Edge Cases:**
- Invitation already accepted: Cannot decline, show message
- Invitation already declined: Show "Already declined"

**Background Jobs:**
- Send notification to owner (email/push)

---

## DAILY USE FLOW - Feature Breakdown

### Feature 2.1: Load Dashboard with Three Tabs

**User Action:**
- User opens app after onboarding complete
- User navigates to dashboard (home screen)

**Business Logic:**
1. Fetch all Event Calendars where user is a member
2. Fetch all children associated with those Event Calendars
3. Fetch upcoming events (next 90 days):
   - Filter by current child selection (All Kids or specific child)
   - Group by assignment status
   - Calculate departure/return times for all events from user's home
4. Organize data for three tabs:
   - **Unassigned Events:** Events where assigned_to_user_id = NULL
   - **Upcoming Events:** All events regardless of assignment status
   - **My Events:** Events where assigned_to_user_id = current user
5. Sort chronologically by date, then by time
6. Return event data with calculated times

**Edge Cases:**
- No Event Calendars: Show empty state "Add your first calendar"
- ICS sync in progress: Show loading state "Importing events..."
- No events in date range: Show empty state per tab
- User has no home address: Show events without departure/return times, prompt to add address
- All events assigned to others: Empty state in "My Events"
- No unassigned events: Empty state with "All events assigned!" message
- Clock changes (DST): Recalculate all event times

**Background Jobs:**
- None (query-based)

---

### Feature 2.2: Filter Events by Child

**User Action:**
- User taps child filter chip at top of dashboard
- User selects specific child or "All Kids"

**Business Logic:**
1. Validate user has access to selected child's Event Calendars
2. Store filter selection in local state (persist across sessions)
3. Re-query events filtered by selected child:
   - If "All Kids": Include all Event Calendars user is member of
   - If specific child: Include only Event Calendars for that child
4. Update all three tabs with filtered data
5. Update badge counts on tabs

**Edge Cases:**
- User only has one child: Hide filter (unnecessary)
- Child's Event Calendar deleted during session: Remove from filter options
- No events for selected child: Show empty state per tab
- Filter persists across app restarts

**Background Jobs:**
- None

---

### Feature 2.3: View Event Detail Screen

**User Action:**
- User taps event card in any tab (Unassigned, Upcoming, or My Events)
- Detail screen opens

**Business Logic:**
1. Fetch complete event details:
   - Event information (title, time, location, description)
   - Child information
   - Event Calendar information
   - Assignment status
   - Parsed special instructions
   - Parsed early arrival requirements
2. Calculate timing breakdown for current user:
   - Departure time from user's home
   - Drive duration to event
   - Early arrival time
   - Event start/end times
   - Drive duration home
   - Return home time
   - Total time commitment
3. Load map preview for location
4. Determine available actions based on assignment:
   - If assigned to user: Show "Reassign Event" button
   - If assigned to other: Show "Take Over Event" button
   - If unassigned: Show "Assign to Me" button
5. Display full details with timing timeline

**Edge Cases:**
- Event location has no coordinates: Show address without map preview
- Event has no location: Hide navigation buttons
- User has no home address: Show event times without departure/return calculation
- Event deleted while viewing: Show error, return to feed
- Multiple users view same event simultaneously: Show real-time assignment updates

**Background Jobs:**
- None

---

### Feature 2.4: Navigate to Event Location

**User Action:**
- User on event detail screen
- User taps "Navigate Now" button

**Business Logic:**
1. Get event location address/coordinates
2. Detect which navigation apps are installed on device:
   - Prefer Google Maps if installed
   - Fallback to Apple Maps
3. Generate deep link with destination pre-populated
4. Open navigation app via deep link
5. User handed off to maps app for turn-by-turn navigation

**Edge Cases:**
- No navigation apps installed: Show error "Please install Google Maps or use Apple Maps"
- Event has no location: Button disabled
- Location is invalid address: Try coordinates, or show error
- User offline: Maps app will handle offline state

**Background Jobs:**
- None

---

### Feature 2.5: Assign Unassigned Event to Self

**User Action:**
- User viewing unassigned event detail
- User taps "Assign to Me" button

**Business Logic:**
1. Update event record: Set assigned_to_user_id = current user
2. Calculate drive times and create timing:
   - Query Google Maps Directions API:
     - Origin: User's home address
     - Destination: Event location
     - Departure time: Event start time minus early arrival buffer
     - Get duration with current traffic patterns
   - Calculate departure time: Event start - early arrival - drive time - comfort buffer
   - Calculate return time: Event end + drive home time
3. Create supplemental events:
   - Drive To event (departure time → arrival time)
   - Early Arrival event (arrival → event start, if applicable)
   - Drive Home event (event end → return home time)
4. Update main event in all members' Google Calendars:
   - Update description to show "Assigned to: [User Name]"
   - For assigned user: Add notification (10 min before departure)
5. Create supplemental events in assigned user's Google Calendar only
6. Broadcast WebSocket event to all Event Calendar members
7. Update UI: Move event from Unassigned to My Events

**Edge Cases:**
- User has no home address: Prompt to add address first
- Event location has no coordinates: Use address string, may fail
- Google Maps API fails: Retry, or use cached/estimated times
- Event starts very soon (<1 hour): Show warning "Event starts soon!"
- Event in past: Allow assignment but skip Google Calendar sync
- Drive time exceeds event start time: Show warning "Not enough time to arrive!"

**Background Jobs:**
- Google Calendar Sync Job (update main event for all members, create supplemental for assigned user)
- Send push notification to user: "You've been assigned to [Event]"

---

### Feature 2.6: Reassign Event to Another Parent

**User Action:**
- User viewing event detail (currently assigned to them or someone else)
- User taps "Reassign Event" button
- User selects different parent from list
- User confirms reassignment

**Business Logic:**
1. Validate target parent is member of Event Calendar
2. Get previous assignment (if any)
3. Update event record: Set assigned_to_user_id = new parent
4. **For previous assignee (if exists):**
   - Delete supplemental events from database
   - Delete supplemental events from their Google Calendar
   - Update main event in their Google Calendar:
     - Remove notification
     - Update description to show new assignment
5. **For new assignee:**
   - Calculate drive times from their home address (may differ from previous parent)
   - Create supplemental events with their timing
   - Update main event in their Google Calendar:
     - Add notification (10 min before their departure time)
     - Update description with their timing
   - Sync supplemental events to their Google Calendar
6. **For all other Event Calendar members:**
   - Update main event description to show new assignment
7. Broadcast WebSocket event: "event_reassigned"
8. Send push notification to new assignee
9. Update UI for all connected users

**Edge Cases:**
- Target parent has no home address: Proceed with assignment, skip supplemental events, notify them to add address
- Event assigned to same person: No-op, show message "Already assigned to this person"
- Event Calendar member removed during reassignment: Show error, reload member list
- Multiple parents try to assign simultaneously: Last write wins, broadcast to all
- New assignee's drive time conflicts with another event: Show warning (conflict detection)

**Background Jobs:**
- Google Calendar Sync Job (update all members' main events, delete old supplemental events, create new ones)
- Send push notification to new assignee
- Send push notification to previous assignee (optional): "You're no longer assigned to [Event]"

---

### Feature 2.7: Mark Event as "Not Attending"

**User Action:**
- User viewing event detail
- User taps "Not Attending" button
- Confirmation appears
- User confirms they won't attend this event

**Business Logic:**
1. Update event record: Set `is_skipped = true` and `assigned_to_user_id = null`
2. Increment event version (optimistic locking)
3. Delete any existing supplemental events from database
4. Update main event in ALL members' Google Calendars:
   - Update title to "🚫 Not Attending - [Event Title]"
   - Update description to reflect "Not attending - no action required"
5. Delete supplemental events from previous assignee's Google Calendar (if any)
6. Event excluded from "Unassigned" filter (doesn't count as unassigned)
7. Event excluded from conflict detection for all users
8. Broadcast WebSocket event: "event_assigned" with `is_skipped: true`
9. Update UI: Event displays with "Not Attending" badge

**Edge Cases:**
- Event already marked as "Not Attending": No-op, show message
- Multiple users try to mark simultaneously: First wins via optimistic locking
- User marks then wants to undo: Can reassign event to self or another user (clears skip flag)
- All-day events: Cannot be skipped (no "Not Attending" option shown)
- Event in past: Allow marking as "Not Attending" for record keeping

**Background Jobs:**
- Google Calendar Sync Job (update all members' main events with "Not Attending" title)

---

### Feature 2.8: Calculate Departure and Return Times

**User Action:**
- (Automatic calculation triggered by event assignment, address change, or settings change)

**Business Logic:**
1. Validate inputs:
   - User home address (lat/lng)
   - Event location (lat/lng)
   - Event start time
   - Event end time
   - Early arrival buffer (parsed from event or default)
   - User's comfort buffer setting
2. Calculate departure journey:
   - Call Google Maps Directions API:
     - Origin: User home
     - Destination: Event location
     - Departure time: Event start - early arrival - estimated drive time
     - Mode: Driving
     - Traffic model: Best guess
   - Get drive duration with traffic
   - Departure time = Event start - early arrival - drive duration - comfort buffer
3. Calculate return journey:
   - Call Google Maps Directions API:
     - Origin: Event location
     - Destination: User home
     - Departure time: Event end time
     - Mode: Driving
   - Get drive duration with traffic
   - Return time = Event end + drive duration
4. Store calculated times:
   - Departure time (for notification)
   - Drive to duration
   - Drive home duration
   - Return home time
5. Create/update supplemental events with these times

**Edge Cases:**
- Google Maps API fails: Use estimated times (30 min default), flag for recalculation
- No route found: Use straight-line distance * 2 minutes per mile estimate
- Drive time > 3 hours: Show warning "Long drive - verify location"
- Departure time in past: Set to "now", show warning
- Event location same as home: Set drive time to 0, skip supplemental drive events
- Multiple events at same location: Could optimize by caching drive time

**Background Jobs:**
- Cache drive time results in Redis (TTL: 4 hours)
- Traffic Recalculation Job (hourly for events in next 24 hours)

---

### Feature 2.8: Sync Events to Google Calendar

**User Action:**
- (Automatic sync triggered by event changes or assignments)

**Business Logic:**
1. **For main event sync to all members:**
   - Get all Event Calendar members
   - For each member:
     - Get their Google Calendar ID and OAuth tokens
     - Create or update event in their Google Calendar:
       - Title: [Child Name] - [Event Title]
       - Start/end: From ICS feed
       - Location: Event location
       - Description: Format with child, calendar, assignment, parsed instructions
       - Color: Match Event Calendar color
       - Notification: Only if assigned to this member
     - Store google_calendar_event_id
2. **For supplemental events (assigned user only):**
   - Create Drive To event
   - Create Early Arrival event (if applicable)
   - Create Drive Home event
   - Link all back to main event
3. Handle sync failures:
   - Retry with exponential backoff (3 attempts)
   - If still failing: Mark sync as failed, notify user
4. Track sync status per event per member

**Edge Cases:**
- OAuth token expired: Refresh token, retry
- Google Calendar API rate limit: Queue for later, respect rate limits
- Member's Google Calendar deleted: Mark as sync error, notify member
- Event already exists: Update instead of create (use stored google_calendar_event_id)
- Member removed from Event Calendar: Delete events from their Google Calendar
- Duplicate events created (race condition): Detect and delete duplicates

**Background Jobs:**
- This IS a background job
- Runs async after assignment changes or ICS sync
- Batches operations when possible (max 50 events per batch API call)

---

### Feature 2.9: Real-time Updates via WebSocket

**User Action:**
- (Automatic - active when user has app open)

**Business Logic:**
1. When data changes on server:
   - Identify affected Event Calendar(s)
   - Identify all connected users who are members
   - Emit event to WebSocket room for that Event Calendar
2. WebSocket event types:
   - `event_assigned`: Event assignment changed
   - `event_created`: New event added from ICS sync
   - `event_updated`: Event details changed
   - `event_deleted`: Event removed
   - `calendar_synced`: ICS sync completed
   - `member_added`: New parent joined calendar
3. Client receives event:
   - Invalidate TanStack Query cache for affected data
   - Automatically refetch updated data
   - Update UI without user action
   - Show toast notification (optional): "Events updated"

**Edge Cases:**
- WebSocket disconnected: Reconnect with exponential backoff
- Missed updates during disconnect: Fetch delta on reconnect
- Multiple tabs/devices open: All receive updates
- User not in room for Event Calendar: Don't receive updates (expected)
- Rapid updates (burst): Throttle UI updates, batch refetches

**Background Jobs:**
- None (real-time push)

---

### Feature 2.10: Handle Push Notifications

**User Action:**
- User assigned to event
- Departure time approaching (10 min before)
- Google Calendar sends notification

**Business Logic:**
1. Google Calendar notification triggered at calculated time
2. Notification content:
   - Title: "Time to leave for [Child] - [Event]"
   - Body: "Leave by [Time] to arrive on time"
   - Deep link to Google Calendar event
3. User taps notification:
   - Opens Google Calendar to event
   - User can then navigate from there
4. Alternative: User can tap notification action (future):
   - "Navigate" → Opens maps directly
   - "Reassign" → Opens app to reassignment flow

**Edge Cases:**
- User disabled Google Calendar notifications: They won't get reminder
- Multiple events with same departure time: Multiple notifications (Google Calendar handles)
- Event canceled after notification set: Update notification (delete)
- Traffic causes delay: MVP doesn't recalculate (Phase 2: send updated notification)
- User already at event: They'll ignore notification

**Background Jobs:**
- None (Google Calendar handles notification scheduling)

---

## EVENT ASSIGNMENT/TRANSFER FLOW - Feature Breakdown

**Note:** Many assignment features are covered in Daily Use Flow (Features 2.5 and 2.6). This section focuses on supplemental event retention and multi-parent scenarios.

### Feature 3.1: Configure Supplemental Event Retention Setting

**User Action:**
- User navigates to App Settings
- User navigates to Calendar Sync section
- User toggles "Keep event details when reassigned to someone else"
- Setting saved

**Business Logic:**
1. Store user preference: `keep_supplemental_events` (boolean)
2. Default value: false (OFF - delete supplemental events)
3. Setting applies to ALL Event Calendars for this user
4. Setting takes effect on next reassignment (doesn't retroactively change existing events)
5. Save setting to database immediately

**Edge Cases:**
- Toggle during active session: Save immediately, no confirmation needed
- User changes setting multiple times: Last value wins
- Setting doesn't affect events already reassigned: Only future reassignments
- Setting is per-user: Each parent can have different preference

**Background Jobs:**
- None

---

### Feature 3.2: Handle Supplemental Events on Give Away (Retention OFF)

**User Action:**
- (Automatic - triggered when event is reassigned and previous assignee has retention setting OFF)

**Business Logic:**
1. Update event assignment: assigned_to_user_id = User B
2. **For User A (losing assignment):**
   - Delete supplemental events from database:
     - Drive To event
     - Early Arrival event (if exists)
     - Drive Home event
   - Delete supplemental events from User A's Google Calendar
   - Update main event in User A's Google Calendar:
     - Remove timing details (Leave by, Back home)
     - Update description: "Assigned to: User B"
     - Remove notification
3. **For User B (gaining assignment):**
   - Calculate drive times from User B's home address
   - Create new supplemental events in database
   - Update main event in User B's Google Calendar:
     - Add timing details
     - Add notification (10 min before departure)
   - Create supplemental events in User B's Google Calendar
4. **For other members:**
   - Update main event description to show new assignment
5. Broadcast WebSocket event: "event_reassigned"
6. Send push notification to User B

**Edge Cases:**
- Supplemental events already deleted: Skip delete, continue
- Google Calendar API fails on delete: Retry, mark as sync error if fails
- User A's Google Calendar deleted: Skip Google sync for them
- Race condition (User A and User B both acting): Last write wins, notify both

**Background Jobs:**
- Google Calendar Sync Job (delete old supplemental events, create new ones, update main events)
- Send push notifications

---

### Feature 3.3: Handle Supplemental Events on Give Away (Retention ON)

**User Action:**
- (Automatic - triggered when event is reassigned and previous assignee has retention setting ON)

**Business Logic:**
1. Update event assignment: assigned_to_user_id = User B
2. **For User A (losing assignment, keeping details):**
   - Keep supplemental events in database (mark as informational)
   - Update supplemental events in User A's Google Calendar:
     - Prepend "(User B's)" to titles
     - Update description: "User B is handling this event"
     - Change color to gray/muted
     - Remove all notifications
   - Update main event:
     - Update description: "Assigned to: User B"
     - Remove notification from main event
3. **For User B (gaining assignment):**
   - Same as Feature 3.2 (calculate times, create new supplemental events)
4. **For other members:**
   - Update main event description
5. Broadcast WebSocket event
6. Send notifications

**Edge Cases:**
- User A changes setting after assignment but before reassignment: Use setting value at time of reassignment
- Supplemental events marked as informational don't trigger notifications
- If User A later takes event back: Delete informational events, create new active ones
- Gray color scheme not supported in Google Calendar: Use description prefix instead

**Background Jobs:**
- Google Calendar Sync Job (update old supplemental events to informational, create new ones for new assignee)
- Send push notifications

---

### Feature 3.4: Take Over Event with Confirmation

**User Action:**
- User B viewing event detail
- Event currently assigned to User A
- User B taps "Take Over This Event" button
- Confirmation modal appears
- User B confirms action

**Business Logic:**
1. Show confirmation modal with:
   - Current assignment (User A)
   - Event details
   - User B's calculated departure time
   - Warning that User A will be notified
2. User confirms
3. Update event assignment: assigned_to_user_id = User B
4. Handle supplemental events based on User A's retention setting (Feature 3.2 or 3.3)
5. Create supplemental events for User B
6. Update all members' Google Calendar main events
7. Broadcast WebSocket event
8. Send notifications:
   - To User A: "User B took over [Event]. You're no longer assigned."
   - To other members: "User B took over [Event] from User A"

**Edge Cases:**
- User A deleted event while User B confirming: Show error "Event no longer exists"
- User C takes over while User B confirming: Show error "Event already reassigned to User C"
- User B has no home address: Show error, require address before takeover
- Event starts very soon: Show warning in confirmation "Event starts in 30 minutes!"
- User A and User B both try to take over simultaneously: First wins, second gets error

**Background Jobs:**
- Google Calendar Sync Job
- Send push notifications

---

### Feature 3.5: Multi-Parent Assignment (3+ Parents)

**User Action:**
- Event Calendar has 3 or more parent members
- Any parent can view and reassign event

**Business Logic:**
1. When displaying "Give to Someone Else" modal:
   - List all Event Calendar members except current user
   - Show up to 10 members (MVP limit)
   - Display name and optional relationship label
2. Assignment logic identical to 2-parent scenario:
   - Previous assignee loses supplemental events (per their setting)
   - New assignee gets supplemental events
   - All other members see updated main event
3. Notifications sent to all affected parties:
   - New assignee: "You've been assigned..."
   - Previous assignee (if takeover): "X took over event..."
   - All other members: "X assigned Y to event..."

**Edge Cases:**
- More than 10 members: Limit list, show first 10 alphabetically
- Member removed during assignment flow: Refresh member list, show error if they select removed member
- All members viewing event simultaneously: Each sees current state via WebSocket
- Sequential reassignments (A→B→C→A): Each transfer independent, follows standard flow

**Background Jobs:**
- Same as standard reassignment
- Notification job scales to number of members

---

### Feature 3.6: New Member Sees Historical Events

**User Action:**
- New parent joins Event Calendar
- Event Calendar has events with existing assignments (past and future)

**Business Logic:**
1. When new member accepts invitation:
   - Sync ALL events from Event Calendar (no date filter)
   - Include past events (historical context)
   - Include currently assigned events
   - Include unassigned events
2. New member can immediately:
   - View all events in "Upcoming Events" tab
   - See current assignments
   - Take over any event (past or future)
   - View past events for context
3. Main events synced to new member's Google Calendar
4. No supplemental events created until they're assigned something

**Edge Cases:**
- Event Calendar has 1000+ past events: Sync in batches, may take time
- New member takes over event immediately: Standard takeover flow applies
- Event assigned before their join: They can still take it over (full access)
- Past events: Allow takeover but don't sync to Google Calendar (already passed)

**Background Jobs:**
- Google Calendar Sync Job (sync all main events to new member)

---

### Feature 3.7: Handle Concurrent Assignment Attempts

**User Action:**
- (Automatic conflict resolution when multiple parents try to assign/take over simultaneously)

**Business Logic:**
1. Use database transaction with row-level locking on event record
2. First request to reach database wins
3. Second request fails with conflict error
4. Losing user receives error message: "This event was just assigned to [User]. Please refresh."
5. WebSocket broadcasts assignment to all connected clients
6. UI automatically updates for all users showing new assignment

**Edge Cases:**
- Users on poor connections: May experience delay but eventually consistent
- Three-way conflict (A, B, and C all try): First wins, B and C get error
- User doesn't have WebSocket connection: Next API call/refresh shows correct state
- Offline user makes assignment: Queued until online, may conflict and fail

**Background Jobs:**
- None (handled synchronously)

---

## CHILD MANAGEMENT FLOW - Feature Breakdown

### Feature 4.1: Add New Child

**User Action:**
- User taps "+" button on dashboard or "Add Child" in Settings
- User enters child name (required)
- User optionally uploads photo
- User optionally enters date of birth
- User taps "Add Child"

**Business Logic:**
1. Validate child name:
   - Required, 1-50 characters
   - Check for duplicate name within user's accessible children
2. If duplicate: Show error "You already have a child named [Name]. Use a different name or add a middle initial."
3. Create child record:
   - Generate child_id
   - Store name, photo (upload to storage), DOB
   - Set created_at, updated_at
4. Child is accessible to all parents who share Event Calendars with the creating user
5. Broadcast WebSocket event: "child_created"
6. Return child details

**Edge Cases:**
- Duplicate name: Prevent creation, suggest alternatives
- Photo upload fails: Continue without photo, allow retry later
- Very long name: Truncate at 50 characters
- Invalid DOB (future date): Validation error
- No Event Calendars yet: Allow child creation, can add calendars later
- User creates child, other parent creates same name simultaneously: First wins, second gets duplicate error

**Background Jobs:**
- Upload photo to cloud storage (async)
- Send WebSocket broadcast to all family members

---

### Feature 4.2: View Child Detail

**User Action:**
- User navigates to Settings → Children
- User taps on child name

**Business Logic:**
1. Fetch child record with:
   - Basic info (name, photo, DOB, calculated age)
   - Associated Event Calendars
2. For each Event Calendar:
   - Count upcoming events (next 90 days)
   - Get next event details (date, time)
   - Include calendar name and icon
3. Determine available actions:
   - Edit Child (always available)
   - Add Event Calendar (always available)
   - Delete Child (only if no Event Calendars exist)
4. Display all information

**Edge Cases:**
- Child has no Event Calendars: Show empty state "No calendars for this child yet"
- All events in past: Show "No upcoming events"
- Photo not loaded: Show placeholder initials
- Child deleted while viewing: Show error, return to list
- DOB not set: Don't show age

**Background Jobs:**
- None

---

### Feature 4.3: Edit Child Information

**User Action:**
- User on child detail screen
- User taps "Edit Child"
- User modifies name, photo, or DOB
- User taps "Save Changes"

**Business Logic:**
1. Validate changes:
   - Name required, 1-50 characters
   - Check name uniqueness (excluding current child)
   - DOB cannot be future date
2. Update child record in database
3. If photo changed:
   - Upload new photo to storage
   - Delete old photo
4. If name changed:
   - Update all Event Calendar associations
   - Update all event displays
   - Update filter dropdowns
5. Broadcast WebSocket event: "child_updated"
6. Show success message

**Edge Cases:**
- Name changed to duplicate: Show error, prevent save
- Photo upload fails: Keep old photo, show error
- Large photo file: Resize/compress before upload
- User removes photo: Set to null, show initials
- Multiple parents editing simultaneously: Last write wins, both notified via WebSocket
- Child has 100+ events: Name update may take few seconds, show loading

**Background Jobs:**
- Upload new photo to storage (async)
- Delete old photo from storage
- Broadcast WebSocket update to all members

---

### Feature 4.4: Attempt to Delete Child (Has Event Calendars - Blocked)

**User Action:**
- User on child detail screen
- Child has one or more Event Calendars
- User taps "Delete Child"

**Business Logic:**
1. Check child's associated Event Calendars
2. Count: child has N Event Calendars
3. Show prevention dialog:
   - List all Event Calendar names
   - Explain must delete calendars first
   - Provide shortcut to view calendars
4. Block deletion (no way to proceed)

**Edge Cases:**
- Event Calendar deleted while user viewing: Recheck count, may allow deletion now
- Child has only past events: Still blocked (Event Calendar exists)
- User is not owner of some Event Calendars: Still shows all, but only owner can delete calendars
- 10+ Event Calendars: Show first 5 and "and X more..."

**Background Jobs:**
- None

---

### Feature 4.5: Delete Child (No Event Calendars - Allowed)

**User Action:**
- User on child detail screen
- Child has zero Event Calendars
- User taps "Delete Child"
- Confirmation modal appears
- User confirms deletion

**Business Logic:**
1. Check child's associated Event Calendars (final verification)
2. If any found: Block deletion (race condition protection)
3. Show confirmation dialog:
   - Warn action is irreversible
   - Explain child has no calendars so safe to delete
4. User confirms
5. Delete child record from database
6. Remove child from all associations
7. Broadcast WebSocket event: "child_deleted"
8. Update UI for all connected users
9. Return to Settings → Children list

**Edge Cases:**
- Event Calendar added between check and delete: Transaction fails, show error "Child now has calendars"
- Child deleted by another parent simultaneously: Show error "Child already deleted"
- Last child being deleted: Allow deletion (user can add more children later)
- Child has past events via deleted calendars: Allow deletion (orphaned historical data)

**Background Jobs:**
- Delete child photo from storage
- Broadcast WebSocket update

---

### Feature 4.6: Real-time Child Updates

**User Action:**
- (Automatic - triggered when any parent creates, updates, or deletes a child)

**Business Logic:**
1. When child data changes:
   - Broadcast to all members who share Event Calendars with this user
   - WebSocket event types:
     - `child_created`: New child added
     - `child_updated`: Child info changed
     - `child_deleted`: Child removed
2. Connected clients receive event:
   - Invalidate child data cache
   - Refetch child list
   - Update UI:
     - Filter dropdown
     - Settings → Children list
     - Event displays showing child name
   - Show toast (optional): "Child information updated"

**Edge Cases:**
- WebSocket disconnected: Updates fetched on reconnect
- Multiple rapid updates: Throttle UI updates, batch refetches
- User viewing child detail when deleted: Show error, return to list
- User editing child when another parent also edits: Last save wins, both see update

**Background Jobs:**
- None (real-time push)

---

### Feature 4.7: Child Filter on Dashboard

**User Action:**
- User on dashboard
- User taps child filter dropdown
- User selects specific child or "All Kids"

**Business Logic:**
1. Load all accessible children for user
2. Display filter options:
   - "All Kids" (default)
   - List of children alphabetically
3. User selects filter
4. Store filter preference in local state (persist across sessions)
5. Re-query events filtered by selected child:
   - If "All Kids": Show events from all Event Calendars
   - If specific child: Show only events from that child's Event Calendars
6. Update all three tabs (Unassigned, Upcoming, My Events)
7. Update badge counts
8. Show filter indicator: "Showing [Child]'s Events"

**Edge Cases:**
- User has only one child: Hide filter (not needed)
- Selected child deleted: Automatically reset to "All Kids"
- No children exist: Hide filter
- Filter persists after app restart
- User switches between children rapidly: Debounce queries

**Background Jobs:**
- None

---

### Feature 4.8: All Parents Can Manage Children

**User Action:**
- Any parent member accesses Settings → Children
- Any parent can add, edit, or delete (if allowed) children

**Business Logic:**
1. No permission checks beyond basic membership
2. All parents who share any Event Calendar together can:
   - See all children associated with shared Event Calendars
   - Add new children
   - Edit any child
   - Delete any child (if no Event Calendars)
3. No concept of "child owner"
4. Changes immediately visible to all members via WebSocket

**Edge Cases:**
- Parent removed from all Event Calendars: Loses access to children
- New parent joins: Immediately sees all existing children
- Parent with no Event Calendars yet: Can create children before adding calendars
- Contentious co-parents: Either can modify child info (document encourages communication)

**Background Jobs:**
- None

---

## SETTINGS FLOW - Feature Breakdown

### Feature 5.1: Update Default Starting Address

**User Action:**
- User navigates to Settings → Default Starting Address
- User taps "Edit Address"
- User searches for or enters new address
- User saves changes

**Business Logic:**
1. Validate address using Google Places API
2. Geocode address to get lat/lng coordinates
3. Update user record with new address
4. Identify all events assigned to this user (upcoming only)
5. For each assigned event:
   - Recalculate drive time TO event from new address
   - Recalculate drive time FROM event to new address
   - Update supplemental events with new times
   - Update departure and return times
6. Batch update Google Calendar supplemental events
7. Show progress indicator during recalculation
8. Broadcast WebSocket update (for user's own devices)

**Edge Cases:**
- Invalid address: Show error, don't save
- Address same as current: No-op, show message
- User has 100+ assigned events: Show progress bar, may take 30+ seconds
- Google Maps API fails: Use old address, show error, allow retry
- PO Box detected: Warning but allow (user may have valid reason)
- User changes address while events being recalculated: Queue new calculation

**Background Jobs:**
- Recalculation Job (may take time for many events)
- Google Calendar Sync Job (update supplemental events)

---

### Feature 5.2: Toggle Comfort Buffer

**User Action:**
- User navigates to Settings → Timing
- User toggles "Use Comfort Buffer" ON or OFF

**Business Logic:**
1. Store new comfort buffer enabled status
2. If toggling ON:
   - Show "Comfort Buffer Duration" setting (default: 5 minutes)
   - Apply comfort buffer to all assigned events
3. If toggling OFF:
   - Hide "Comfort Buffer Duration" setting
   - Remove comfort buffer from all assigned events
4. Recalculate departure times for all assigned events
5. Update supplemental "Drive To" events with new departure times
6. Update Google Calendar events
7. Changes apply immediately

**Edge Cases:**
- No assigned events: Toggle saves but no recalculation needed
- User toggles rapidly: Debounce, use final state
- Comfort buffer value not set when first enabled: Use default 5 minutes
- Toggle while viewing event detail: Event detail updates in real-time

**Background Jobs:**
- Google Calendar Sync Job (update departure times)

---

### Feature 5.3: Adjust Comfort Buffer Duration

**User Action:**
- User navigates to Settings → Comfort Buffer Duration (only visible if enabled)
- User adjusts slider (0-60 minutes, 5-minute increments)
- User saves new duration

**Business Logic:**
1. Validate duration (0-60 minutes)
2. Store new comfort buffer duration value
3. Recalculate departure times for all assigned events:
   - Old departure = event start - early arrival - drive time - old comfort buffer
   - New departure = event start - early arrival - drive time - new comfort buffer
4. Update supplemental "Drive To" events with new departure times
5. Update Google Calendar events
6. Show progress if many events affected

**Edge Cases:**
- Setting to 0 minutes: Effectively same as disabling, but keep enabled
- User has event starting very soon: New departure time may be in past, show warning
- Multiple assigned events with different drive times: Each calculated individually
- Comfort buffer exceeds available time: Allow (may result in past departure times)

**Background Jobs:**
- Google Calendar Sync Job (update departure times)

---

### Feature 5.4: Toggle Supplemental Event Retention

**User Action:**
- (Covered in Feature 3.1)

**Business Logic:**
- See Event Assignment/Transfer Flow - Feature 3.1

**Edge Cases:**
- See Feature 3.1

**Background Jobs:**
- None

---

### Feature 5.5: Access Event Calendar Management

**User Action:**
- User navigates to Settings → Manage Event Calendars
- Screen shows list of all Event Calendars user is member of

**Business Logic:**
1. Fetch all Event Calendars where user has membership
2. For each calendar display:
   - Calendar name and color
   - Associated child name
   - Event count (upcoming)
   - Sync status (last synced time)
   - Ownership indicator (if user is owner)
3. User can tap calendar to view details
4. User can add new Event Calendar
5. User can delete Event Calendar (if owner)

**Edge Cases:**
- No Event Calendars: Show empty state "Add your first calendar"
- Sync in progress: Show loading indicator
- Sync failed: Show error indicator with retry option

**Background Jobs:**
- None (covered in other flows)

---

### Feature 5.6: Access Child Management

**User Action:**
- User navigates to Settings → Manage Children
- Screen shows list of all children

**Business Logic:**
1. Fetch all children accessible to user
2. For each child display:
   - Child name and photo
   - Age (if DOB provided)
   - Event Calendar count
3. User can tap child to view details
4. User can add new child
5. User can edit child
6. User can delete child (if no Event Calendars)

**Edge Cases:**
- No children: Show empty state "Add your first child"
- Child with many Event Calendars: Show count, all accessible via detail view

**Background Jobs:**
- None (covered in Child Management Flow)

---

### Feature 5.7: View/Change Email Address

**User Action:**
- User navigates to Settings → Email Address
- User taps "Change Email"
- Confirmation dialog appears explaining sign-out/sign-in process
- User proceeds to re-authenticate with new Google account

**Business Logic:**
1. Show warning about signing out
2. Preserve user's Event Calendar memberships and data
3. Sign user out
4. Initiate Google OAuth with new account
5. Link new Google account to existing user record
6. Update email address in database
7. Update Google Calendar ID for new account
8. Re-sync all events to new Google Calendar
9. User retains all memberships, assignments, settings

**Edge Cases:**
- New email already in system: Show error "This email is already associated with another account"
- User cancels mid-flow: Return to settings, no changes
- OAuth fails: Return to sign-in, allow retry
- New Google Calendar empty: Events sync correctly

**Background Jobs:**
- Google Calendar Sync Job (re-sync all events to new calendar)

---

### Feature 5.8: Manage Google Calendar Connection

**User Action:**
- User navigates to Settings → Google Calendar
- Shows connection status
- User can disconnect and reconnect

**Business Logic:**
1. Display connection status:
   - "Connected" - OAuth tokens valid
   - "Connection Error" - OAuth tokens expired/invalid
2. If connected, show:
   - Connected email address
   - Last sync time
   - Option to "Reconnect" (refresh tokens)
   - Option to "Disconnect"
3. If connection error:
   - Show error details
   - Button to "Reconnect"
4. Reconnect flow:
   - Initiate OAuth flow
   - Get new tokens
   - Resume syncing

**Edge Cases:**
- Tokens expired: Auto-refresh on next sync attempt
- User revoked access in Google: Show error, require reconnect
- Multiple failed refresh attempts: Require full re-auth
- Disconnect while events syncing: Queue continues after reconnect

**Background Jobs:**
- None (sync jobs handle token refresh)

---

### Feature 5.9: Delete Account

**User Action:**
- User navigates to Settings → Delete Account
- Confirmation dialog with warning
- User must type "DELETE" to confirm
- User confirms deletion

**Business Logic:**
1. Show deletion warning:
   - All data will be permanently deleted
   - Event Calendars owned by user will be deleted (affects other members)
   - Memberships in others' calendars will be removed
   - Cannot be undone
2. Require explicit confirmation (type "DELETE")
3. Delete user data:
   - Delete user record
   - Delete owned Event Calendars (cascade to events, supplemental events)
   - Remove memberships from shared Event Calendars
   - Delete all Google Calendar synced events
   - Delete stored photos
4. Notify other Event Calendar members of removed calendars
5. Sign user out
6. Return to welcome screen

**Edge Cases:**
- User owns Event Calendars with other members: Warn about impact, require acknowledgment
- User types wrong confirmation: Don't proceed
- Deletion fails mid-process: Roll back, show error
- User is only member of Event Calendar: Calendar and events deleted

**Background Jobs:**
- Delete Google Calendar events (all synced events)
- Send notifications to affected members
- Delete cloud storage files (photos)

---

## EVENT CHANGE FLOW - Feature Breakdown

### Feature 6.1: Automatic ICS Sync (Scheduled Background Job)

**User Action:**
- (Automatic - scheduled job runs every 5 minutes)

**Business Logic:**
1. Fetch all Event Calendars with sync_enabled = true
2. For each Event Calendar:
   - Fetch ICS feed from stored URL
   - Parse events using ical.js
   - Compare with database events (match by ics_event_uid)
   - Identify changes: new events, updated events, deleted events
3. Process changes (calls Features 6.2, 6.3, 6.4, 6.5)
4. Update Event Calendar sync status:
   - last_synced_at = now
   - last_sync_status = success/failed
5. Broadcast WebSocket update: "calendar_synced"

**Edge Cases:**
- ICS feed unreachable: Mark sync failed, retry in 1 hour, notify owner after 3 failures
- ICS feed invalid/corrupted: Mark sync failed, notify owner
- ICS feed empty: Valid but no events, update sync status
- Feed returns 404: Notify owner, disable sync after 24 hours of failures
- Rate limiting: Stagger sync jobs, don't sync all calendars simultaneously

**Background Jobs:**
- This IS the background job
- Triggers: Feature 6.2, 6.3, 6.4, 6.5, Google Calendar Sync

---

### Feature 6.2: Process New Events from ICS

**User Action:**
- (Automatic - triggered when ICS sync detects new event)

**Business Logic:**
1. Parse new event details:
   - ics_event_uid, title, start_time, end_time, location, description
   - Extract early arrival requirements
   - Extract special instructions
2. Geocode location (if provided)
3. Create Event record:
   - Link to Event Calendar
   - Inherit child_id from Event Calendar
   - Set assigned_to_user_id = NULL (unassigned)
   - Store parsed data
4. Create main event in ALL Event Calendar members' Google Calendars
5. DO NOT create supplemental events (unassigned)
6. Broadcast WebSocket: "event_created"

**Edge Cases:**
- Event has no location: Store without geocoding
- Event in past: Import anyway (historical context)
- Description parsing fails: Store raw description, no parsed fields
- Duplicate ics_event_uid: Skip, log warning
- Google Calendar sync fails: Mark for retry

**Background Jobs:**
- Google Calendar Sync Job (create main event for all members)

---

### Feature 6.3: Process Event Time Changes from ICS

**User Action:**
- (Automatic - triggered when ICS sync detects time change)

**Business Logic:**
1. Update Event record with new times
2. Update main event in ALL members' Google Calendars
3. If event is assigned:
   - Recalculate drive times (traffic patterns may differ at new time)
   - Recalculate departure time
   - Recalculate early arrival event time
   - Recalculate return home time
   - Update all supplemental events in assigned parent's Google Calendar
4. Broadcast WebSocket: "event_updated"
5. Google Calendar sends standard "Event updated" notification to users

**Edge Cases:**
- Event moved to past: Update anyway, no notifications needed
- Event moved far in future: Standard update
- Time change while user viewing: Event detail updates in real-time via WebSocket
- Assigned parent has event starting very soon: New departure time may be in past

**Background Jobs:**
- Google Calendar Sync Job (update main events, recalculate supplemental events)

---

### Feature 6.4: Process Event Location Changes from ICS

**User Action:**
- (Automatic - triggered when ICS sync detects location change)

**Business Logic:**
1. Geocode new location
2. Update Event record with new location
3. Update main event in ALL members' Google Calendars
4. If event is assigned:
   - Recalculate drive time TO new location
   - Recalculate drive time FROM new location to home
   - Update departure time
   - Update return home time
   - Update supplemental events in assigned parent's Google Calendar
5. Broadcast WebSocket: "event_updated"

**Edge Cases:**
- New location can't be geocoded: Store address, skip supplemental event updates
- Location added to previously location-less event: Calculate drive times for first time
- Location removed: Delete supplemental events, keep main event
- Location change is minor (Field A → Field B same complex): May result in same drive time

**Background Jobs:**
- Google Calendar Sync Job (update location, recalculate supplemental events)

---

### Feature 6.5: Process Event Description Changes from ICS

**User Action:**
- (Automatic - triggered when ICS sync detects description change)

**Business Logic:**
1. Re-parse description:
   - Extract early arrival requirements (e.g., "arrive 30 min early")
   - Extract special instructions
   - Extract items to bring
2. Update Event record with new parsed data
3. Update main event description in ALL members' Google Calendars
4. If early arrival requirement changed AND event is assigned:
   - Recalculate early arrival event duration
   - Recalculate departure time (may need to leave earlier/later)
   - Update supplemental events
5. Broadcast WebSocket: "event_updated"

**Edge Cases:**
- Early arrival added where none existed: Create early arrival supplemental event
- Early arrival removed: Delete early arrival supplemental event
- Early arrival increased significantly: Departure time moves much earlier
- Parsing fails: Update raw description, don't change parsed fields

**Background Jobs:**
- Google Calendar Sync Job (update descriptions, recalculate if early arrival changed)

---

### Feature 6.6: Process Event Deletions from ICS

**User Action:**
- (Automatic - triggered when event no longer appears in ICS feed)

**Business Logic:**
1. Delete Event record from database (cascades to supplemental events)
2. Delete main event from ALL members' Google Calendars
3. If event was assigned:
   - Delete supplemental events from assigned parent's Google Calendar
4. Broadcast WebSocket: "event_deleted"
5. Google Calendar sends standard "Event canceled" notification

**Edge Cases:**
- Event deleted while user viewing: Show modal "Event canceled", return to feed
- Event deleted while being assigned: Assignment process fails, user notified
- Many events deleted at once: Process in batch, users get multiple cancellation emails
- Event deleted then re-added with same UID: Treat as new event

**Background Jobs:**
- Google Calendar Sync Job (delete all calendar events)

---

### Feature 6.7: Handle Bulk Changes from ICS

**User Action:**
- (Automatic - triggered when ICS sync detects 10+ changes)

**Business Logic:**
1. Process all changes in single sync cycle:
   - Group by type: new, updated, deleted
   - Process new events first
   - Process updates second
   - Process deletions last
2. Batch Google Calendar operations (max 50 per API call)
3. Single WebSocket broadcast with all changes
4. Update Event Calendar sync status once for entire batch

**Edge Cases:**
- Entire season rescheduled (50+ events): May take 5-10 seconds, show sync progress
- Many events deleted: Users get many cancellation emails from Google
- Mix of adds/updates/deletes: Process in correct order to avoid conflicts
- Sync fails mid-batch: Mark which events processed, retry remaining

**Background Jobs:**
- Google Calendar Sync Job (batched operations)

---

### Feature 6.8: Preserve Assignments Through Updates

**User Action:**
- (Automatic principle applied during event updates)

**Business Logic:**
1. When updating event from ICS:
   - ALWAYS preserve assigned_to_user_id
   - Don't unassign even if time/location/description changes
2. Recalculate supplemental events with new details
3. Assignment stays intact unless event is deleted
4. User sees updated event details but remains assigned

**Edge Cases:**
- Event time moves to conflict with another assigned event: Keep assignment, show conflict warning
- Event location becomes invalid: Keep assignment, may need manual intervention
- Event significantly different (time/location): Keep assignment, let user decide to reassign

**Background Jobs:**
- None (principle applied during sync processing)

---

