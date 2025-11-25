# Complete Onboarding Flows - FINAL SPECIFICATION
## Family Scheduling iOS Application

---

## TERMINOLOGY

**Critical Distinctions:**
- **Google Calendar** = Parent's personal Google Calendar (their existing calendar where we sync events)
- **Event Calendar** = A child's activity calendar sourced from ICS feed (e.g., "Emma's Soccer", "Jake's Basketball")
- **Parent** = Adult user with account (owner or member of Event Calendars)
- **Child** = Minor associated with Event Calendar(s), no account
- **Owner** = Parent who created/uploaded an Event Calendar
- **Member** = Parent invited to access an Event Calendar

---

## ARCHITECTURAL OVERVIEW

### Calendar-Centric Model

**Event Calendar is the Hub:**
```
Event Calendar
├── Owner (parent who added it)
├── Child (which kid)
├── ICS URL (source of events)
├── Calendar Name ("Emma's Soccer")
└── Parent Members (list with access)
```

**Key Principles:**
- Event Calendar is the fundamental unit of organization
- Each Event Calendar has ONE child
- Each Event Calendar has multiple parent members
- Parents can be members of multiple Event Calendars
- Access is per-Event Calendar (enables step-children separation)
- Events inherit child assignment from their Event Calendar
- Events can be assigned to any parent member of that Event Calendar

**Example - Jennifer's Blended Family:**
```
Event Calendar: "Emma's Soccer"
├── Owner: Jennifer
├── Child: Emma
└── Members: Jennifer, Tom (ex-husband)

Event Calendar: "Jake's Basketball"
├── Owner: Jennifer
├── Child: Jake
└── Members: Jennifer, Tom (ex-husband)

Event Calendar: "Sophie's Daycare"
├── Owner: Jennifer
├── Child: Sophie (from new relationship)
└── Members: Jennifer, Mike (new partner)
```
**Result:** Tom never sees Sophie's events. Mike never sees Emma/Jake's events. Perfect separation.

---

## DATA MODEL

### Parent
```
parent_id (UUID, primary key)
email (unique, for login)
name
google_oauth_token
google_calendar_id (which Google Calendar to sync to)
home_address (for departure calculations)
notification_preferences
created_at
updated_at
```

### Child
```
child_id (UUID, primary key)
name
created_at
updated_at
```

### Event Calendar
```
event_calendar_id (UUID, primary key)
owner_parent_id (who added it)
child_id (which kid)
ics_url
calendar_name ("Emma's Soccer")
created_at
updated_at
```

### Event Calendar Membership (Junction Table)
```
membership_id (UUID, primary key)
event_calendar_id
parent_id
status (invited, active, removed)
invited_at
accepted_at
```

### Invitation
```
invitation_id (UUID, primary key)
event_calendar_id (what they're being invited to)
inviting_parent_id (who sent it)
recipient_email
invitation_token (secure)
status (pending, accepted, declined)
created_at
```

### Event
```
event_id (UUID, primary key)
event_calendar_id (source)
child_id (inherited from Event Calendar)
assigned_parent_id (NULL = unassigned)
title
start_time
end_time
location
description
parsed_early_arrival (minutes)
parsed_special_instructions
google_event_id (for syncing)
created_at
updated_at
```

### Event Calendar Sync (Per Parent)
```
sync_id (UUID, primary key)
event_id
parent_id
google_calendar_id (target)
google_event_id (Google's ID for this copy)
sync_status (pending, synced, failed)
last_synced_at
sync_error
```

---

## PRIMARY FLOW: FIRST-TIME ONBOARDING (EVENT CALENDAR OWNER)

### Step 1: Account Creation & Authentication

**Trigger:** User downloads app and opens for first time

**Screen Display:**
- Welcome screen with app value proposition
- Button: "Get Started with Google"

**Actions:**
1. User taps "Get Started with Google"
2. Google OAuth flow initiated
3. User authenticates with Google account
4. App requests permissions:
   - Read/write access to Google Calendar
   - Basic profile information (name, email)
5. User grants permissions
6. App receives OAuth token and user profile

**Data Captured:**
- Email address (from Google)
- Full name (from Google)
- Google OAuth token (stored securely)
- Google Calendar ID (primary calendar by default)

**System Actions:**
- Create parent record with status "Active"
- Generate unique parent_id
- Store OAuth token securely
- Default google_calendar_id to primary calendar

**Edge Cases:**
- User cancels Google sign-in → Return to welcome screen
- User denies calendar permissions → Show error: "Calendar access required for app to function"
- Google authentication fails → Show error and retry option
- Email already exists → Load existing account instead of creating new

**Next Step:** Step 2

---

### Step 2: Home Address Setup

**Trigger:** Successful authentication

**Screen Display:**
- "What's your home address?"
- Subtitle: "We'll calculate when you need to leave based on your location"
- Address search/input field with autocomplete (Google Places API)
- Map preview showing selected location
- Button: "Confirm Location"
- Link: "Why do we need this?"

**Actions:**
1. User begins typing address
2. App shows autocomplete suggestions
3. User selects address
4. Map displays selected location with pin
5. User confirms location is correct
6. User taps "Confirm Location"

**Data Captured:**
- Full address (street, city, state, zip)
- Latitude/longitude coordinates
- Formatted address string (for display)

**System Actions:**
- Geocode address to lat/long
- Store address with parent record
- Validate address is real location

**Validation:**
- Address must geocode successfully
- Coordinates must be within reasonable bounds

**Edge Cases:**
- Address not found → Allow manual entry, flag for later verification
- Multiple matching addresses → Show list to choose from
- User enters PO Box → Warning: "We need a physical address for accurate drive times"
- GPS/location services disabled → Still allow manual entry

**Help Text:**
"Your home address is used to calculate accurate departure times based on real-time traffic. Co-parents can set their own address so everyone gets personalized departure times."

**Next Step:** Step 3

---

### Step 3: Add First Event Calendar

**Trigger:** Home address confirmed

**Screen Display:**
- "Add your first activity calendar"
- Subtitle: "Import events from your child's sports league, school, or activity provider"
- Input field: "Calendar URL (ICS link)"
- Input field: "Calendar name" (placeholder: "Emma's Soccer")
- Button: "Continue"
- Link: "Where do I find an ICS link?"

**Actions:**
1. User pastes ICS URL
2. User enters calendar name
3. User taps "Continue"
4. App validates ICS URL (fetches and parses calendar)
5. Shows preview: "Found 15 events from [date] to [date]"
6. User confirms
7. Proceeds to child creation

**Data Captured:**
- ICS URL
- Calendar name

**System Actions:**
- Validate ICS URL format
- Fetch ICS feed to verify it works
- Parse calendar to count events
- Check for duplicate ICS URL across all Event Calendars

**Validation:**
- ICS URL must be valid format
- ICS URL must return valid iCalendar data
- ICS URL must not already exist in system (no duplicates)
- Calendar name: max 50 characters

**Edge Cases:**
- Invalid URL → Error: "This doesn't appear to be a valid calendar link"
- ICS feed doesn't load → Error: "Can't access this calendar. Check the link and try again."
- Duplicate ICS URL → Error: "This calendar has already been added [by you/by Parent Name]"
- Empty calendar (no events) → Warning: "This calendar has no events. Add anyway?"
- URL requires authentication → Error: "This calendar requires login. Please use a public calendar link."

**Help Content (for "Where do I find an ICS link?"):**
- Instructions for common providers (TeamSnap, LeagueApps, schools)
- Screenshots/examples
- "Look for 'Subscribe' or 'Export Calendar' options"

**Next Step:** Step 4

---

### Step 4: Create Child

**Trigger:** Event Calendar URL validated

**Screen Display:**
- "Who is this calendar for?"
- Input field: "Child's name" (placeholder: "Emma")
- Button: "Continue"
- Context: "You're adding: [Calendar Name]"

**Actions:**
1. User enters child's name
2. User taps "Continue"

**Data Captured:**
- Child name

**System Actions:**
- Create child record
- Generate unique child_id
- Link child to Event Calendar

**Validation:**
- Child name: Required, max 100 characters

**Edge Cases:**
- Empty name → Error: "Please enter your child's name"
- Very long name → Truncate with warning

**Next Step:** Step 5

---

### Step 5: Add Parent Members

**Trigger:** Child created and linked to Event Calendar

**Screen Display:**
- "Who else should see [Calendar Name]?"
- Subtitle: "Add co-parents, partners, or family members who need access"
- Input fields for each parent:
  - "Name" (placeholder: "Tom Smith")
  - "Email" (placeholder: "tom@example.com")
- Button: "+ Add Another Parent"
- Button: "Skip for Now" (bottom)
- Button: "Send Invitations" (primary action)
- Info box: "You're automatically added to this calendar"

**Actions:**
1. User enters name and email for parent member
2. User optionally taps "+ Add Another Parent" to add more
3. User taps "Send Invitations"
4. System validates emails and sends invitations

**Data Captured:**
- Parent member name
- Parent member email (for each)

**System Actions:**
- Validate email format for each
- Check if email already exists in system:
  - If exists: Check if already member of THIS Event Calendar → Error
  - If exists but different calendar: Allow, will link existing parent
  - If doesn't exist: Will create invitation
- Create invitation records for each parent
- Generate secure invitation tokens
- Send invitation emails
- Create membership records with status "invited"
- Automatically create membership for owner with status "active"

**Validation:**
- Email: Valid format required
- Email: Cannot be same as owner's email
- Email: Cannot duplicate within same Event Calendar
- Name: Required for each email
- Max 10 parent members per Event Calendar (MVP limit)

**Email Template:**
```
Subject: [Owner Name] invited you to [Calendar Name] on [App Name]

Hi [Member Name],

[Owner Name] has invited you to access [Calendar Name] for [Child Name] 
on [App Name].

You'll be able to:
• See all [Child Name]'s activities in one place
• Get automatic departure time notifications
• Coordinate who's handling each event
• Never miss early arrival requirements

[Join Calendar] (big button with deep link)

This invitation does not expire.
```

**Confirmation Screen:**
- "Invitations sent!"
- List of invited parents with status
- Button: "Continue to Dashboard"
- Link: "Resend invitation" (if needed)

**Edge Cases:**
- Email already member of this Event Calendar → Error: "This parent is already added to [Calendar Name]"
- Email has pending invitation to this calendar → Error: "You've already invited [email]. Resend invitation?"
- Email bounces (detected later) → Flag invitation as failed, notify owner
- User enters own email → Error: "You're automatically added to this calendar"
- User taps "Skip for Now" → Proceed to dashboard without inviting anyone

**Next Step:** Step 6

---

### Step 6: Initial Dashboard View

**Trigger:** First Event Calendar created with parent members invited

**Screen Display:**
- Top: Child filter chips: "[All Kids ▼] | Emma"
- Three tabs:
  - **Unassigned Events** (default view)
  - **Upcoming Events**
  - **My Events**
- In Unassigned Events tab:
  - List of all events from Emma's Soccer
  - Each event shows: Date, Time, Title, Location
  - Badge: "Unassigned"
- Empty state for "My Events": "No events assigned to you yet"
- Floating action button: "+" (to add more Event Calendars)
- Info banner: "Assign events to coordinate with co-parents"

**System State:**
- Owner parent fully configured
- First Event Calendar created
- First child created
- Events imported from ICS feed (initially all unassigned)
- Parent member invitations sent (pending)
- Events synced to owner's Google Calendar (with "Unassigned" in description)

**Available Actions:**
- Tap event → View event detail → Assign to parent
- Filter by child (when more children added)
- Add more Event Calendars (+ button)
- View pending invitations (settings)
- Add more children
- Assign events

**Onboarding Complete Indicator:**
- Tutorial tooltip: "Tap an event to assign it to yourself or a co-parent"
- Dismissible banner: "Getting Started: Assign your first event"

**Next Steps:**
- User assigns events from Unassigned Events feed
- User adds more Event Calendars for same or different children
- Wait for parent members to accept invitations

---

## SECONDARY FLOW: PARENT MEMBER ONBOARDING (INVITED)

### Step 7A: Receiving & Opening Invitation

**Trigger:** Parent member receives invitation email to Event Calendar

**Scenario A: Does NOT have app installed**
1. Opens email on mobile device
2. Taps invitation button/link
3. Redirects to App Store
4. Downloads and installs app
5. Opens app → App detects invitation token in deep link
6. Displays invitation acceptance screen

**Scenario B: HAS app installed**
1. Opens email
2. Taps invitation button/link
3. App opens via deep link with token
4. Displays invitation acceptance screen

**Scenario C: Opens link on desktop**
1. Opens email on computer
2. Taps invitation link
3. Web page opens with QR code
4. Instructions: "Scan this QR code with your phone"
5. Scans QR code → Proceeds to Scenario A or B

**Edge Cases:**
- Invalid/tampered token → Error page with support contact
- Invitation already accepted → Show "You're already a member of this calendar"
- Invalid token → Error page with support contact

---

### Step 7B: Invitation Acceptance Screen

**Trigger:** Parent member opened invitation link via app

**Screen Display:**
- "[Owner Name] invited you to [Calendar Name]"
- Profile photo of owner (if available)
- Details:
  - Calendar: [Calendar Name]
  - Child: [Child Name]
  - Events: [Count] upcoming activities
- Description: "You'll be able to see all activities, get departure notifications, and coordinate with [Owner Name]"
- Button: "Accept Invitation"
- Link: "Decline"

**Actions:**
1. User reviews invitation details
2. User taps "Accept Invitation"

**Next Step:** Step 7C (if not signed in) or Step 7E (if already signed in)

---

### Step 7C: Parent Member Authentication

**Trigger:** Accepted invitation but not authenticated

**Screen Display:**
- "Sign in to join [Calendar Name]"
- Button: "Sign in with Google"
- Text: "Please sign in with [invitation email]"

**Actions:**
1. User taps "Sign in with Google"
2. Google OAuth flow initiated
3. User authenticates

**Important Validation:**
- Email from Google MUST match invitation email
- If mismatch → Error: "Please sign in with [invitation email] or ask [owner] to send new invitation to your email"

**Data Captured:**
- Email address (must match invitation)
- Full name (from Google)
- Google OAuth token
- Google Calendar ID (primary)

**System Actions:**
- Create parent record OR load existing if email already in system
- Generate unique parent_id (if new)
- Store OAuth token
- Link parent to invitation

**Edge Cases:**
- Email mismatch → Error, must use correct email
- Google authentication fails → Show error and retry
- User cancels → Return to invitation acceptance screen
- User denies calendar permissions → Error: "Calendar access required"

**Next Step:** Step 7D

---

### Step 7D: Parent Member Home Address Setup

**Trigger:** Parent member authenticated

**Screen Display:**
- "What's your home address?"
- Subtitle: "Since you and [owner name] may live in different locations, we'll calculate your departure times based on your address"
- Address search/input field with autocomplete
- Map preview
- Button: "Confirm Location"
- Info box: "Your address is private. [Owner name] will not see your specific address."

**Actions:**
- Same as Step 2 (home address setup)

**Data Captured:**
- Full address
- Latitude/longitude
- Formatted address

**System Actions:**
- Geocode address
- Store with parent record
- Validate address

**Edge Cases:**
- Same as Step 2
- Address same as owner → Allow (might live in same area/building)

**Next Step:** Step 7E

---

### Step 7E: Parent Member Notification Preferences

**Trigger:** Home address confirmed

**Screen Display:**
- "Notification preferences"
- Info: "We'll use Google Calendar notifications (10 minutes before you need to leave)"
- Toggle: "Enable calendar notifications" (on by default)
- Button: "Complete Setup"

**Actions:**
1. User reviews preferences
2. User taps "Complete Setup"

**System Actions:**
- Store notification preferences with parent record
- **Update invitation status to "Accepted"**
- **Update membership status to "Active"**
- **Sync all events from Event Calendar to this parent's Google Calendar**
- **Notify owner** (push notification and/or email)
- **Set Google Calendar notifications** (10 min before calculated departure time)

**Notification to Owner:**
- Push: "[Member name] accepted your invitation and joined [Calendar Name]"
- Email: Similar message with login prompt

**Next Step:** Step 7F

---

### Step 7F: Parent Member Dashboard View

**Trigger:** Setup complete, parent successfully joined Event Calendar

**Screen Display:**
- Top: Child filter: "[All Kids ▼] | Emma"
- Three tabs: Unassigned Events | Upcoming Events | My Events
- Shows events from Emma's Soccer Event Calendar
- Departure times calculated from THEIR home address
- Info banner: "You're now a member of [Calendar Name]. Events have been added to your Google Calendar."

**System State:**
- Parent member fully configured and active
- Member of Event Calendar
- Can see all events from Event Calendar
- Events synced to their Google Calendar
- Gets notifications for events assigned to them
- Can be assigned events
- Can add their own Event Calendars

**Available Actions:**
- View events (filtered by child if multiple)
- Tap event to see details
- See event assignments
- Add their own Event Calendars (+ button)
- Can add Event Calendars for same child or different children
- Can invite other parents to calendars they own

**Member Onboarding Complete**

---

## FEED STRUCTURE & EVENT ASSIGNMENT

### Dashboard Feed Views

**Top Navigation:**
- Child Filter: Horizontal scrollable chips
  - "[All Kids ▼]" (default, shows all children)
  - "Emma"
  - "Jake"
  - etc.
- Selected filter applies to all three tabs below

**Three Main Tabs:**

#### 1. Unassigned Events
- Shows events with no assigned_parent_id
- Filtered by selected child (or all kids)
- Badge: "Unassigned" on each event
- Tap event → Detail screen with assignment UI

#### 2. Upcoming Events
- Shows all upcoming events for child(ren)
- Filtered by selected child (or all kids)
- Shows assignment status:
  - "You" if assigned to current user
  - "[Parent Name]" if assigned to someone else
  - "Unassigned" if no assignment
- Sorted chronologically
- Shows departure time calculated from current user's home

#### 3. My Events
- Shows only events assigned to current user
- Filtered by selected child (or all kids)
- Sorted chronologically
- Shows departure time, return time
- Primary action view for daily use

**Filter Behavior:**
- "All Kids" selected: All three tabs show events from all Event Calendars user is member of
- "Emma" selected: All three tabs show only events from Emma's Event Calendar(s)
- Filter persists as user switches tabs
- If user only has one child, filter is hidden

---

### Event Assignment UI (Option A: Individual Assignment)

**Trigger:** User taps event from Unassigned Events or Upcoming Events

**Event Detail Screen:**
- Event title, date, time
- Child name and Event Calendar name
- Location with map preview
- Calculated departure time (from user's home)
- Calculated return home time
- Early arrival requirement (if parsed)
- Special instructions (if parsed)
- Full description from ICS feed

**Assignment Section:**
- Label: "Assigned to:"
- Current state:
  - If unassigned: "Unassigned"
  - If assigned: "[Parent Name]" with avatar
- Button/Dropdown: "Assign Event"

**Tapping "Assign Event":**
1. Shows modal or dropdown with list of all parent members of this Event Calendar
2. User selects parent
3. User taps "Save" or "Assign"
4. Modal closes, detail screen updates

**System Actions on Assignment:**
1. Update event.assigned_parent_id
2. Update event in assigned parent's Google Calendar:
   - Update description to include "🎯 Assigned to: [Name]"
   - Update notification time to 10 min before calculated departure
3. Update event in all other parents' Google Calendars:
   - Update description to show who's assigned
   - Remove departure notification (or make it informational)
4. Send push notification to assigned parent
5. Refresh feed views

**Notification to Assigned Parent:**
"You've been assigned to [Event Name] on [Date] at [Time]. Leave by [Departure Time]."

**Edge Cases:**
- Reassignment: Notify previous assignee they're no longer assigned
- Self-assignment: "You assigned yourself to [Event Name]"
- Assignment to parent who declined invitation: Not possible (only active members shown)

---

## ADDING ADDITIONAL EVENT CALENDARS & CHILDREN

### Adding Second (or More) Event Calendar

**Trigger:** User taps "+" button on dashboard

**Flow:**
1. Same as Steps 3-5 (Add Event Calendar → Create/Select Child → Add Parent Members)
2. Can create new child or select existing child from dropdown
3. If selecting existing child:
   - Can choose to auto-invite same parents from other calendars for that child
   - Or manually enter different parents
4. Return to dashboard with new Event Calendar's events in feed

**Selecting Existing vs Creating New Child:**

**Screen Display:**
- "Who is this calendar for?"
- Radio buttons:
  - ○ Existing child: [Dropdown showing "Emma", "Jake"]
  - ○ New child: [Text input]
- Button: "Continue"

**If Selecting Existing Child:**
- Next screen: "Add parent members"
- Shows list of parents already members of OTHER calendars for this child
- Checkboxes pre-selected for those parents
- Text: "These parents already have access to other calendars for [Child Name]"
- Can uncheck to not invite
- Can add additional parents
- Button: "Send Invitations" or "Continue" (if no new invites)

**Result:**
- New Event Calendar created
- Linked to existing child
- Existing parents receive invitations to this new calendar
- New parents receive invitations
- Events import and appear in feed

---

## EDGE CASES & VARIATIONS

### Declining Invitation

**Trigger:** Parent member taps "Decline" on invitation acceptance screen (Step 7B)

**Actions:**
1. Confirmation: "Are you sure you want to decline this invitation?"
2. User confirms

**System Actions:**
- Update invitation status to "Declined"
- Invalidate invitation token
- Update membership status to "Declined"
- Notify owner (push and/or email)

**Notification to Owner:**
"[Name/Email] declined your invitation to [Calendar Name]"

**Options for Owner:**
- Resend invitation
- Remove from member list
- Contact person directly

---

### Invalid Invitation Token

**Trigger:** Parent member tries to use invalid or canceled invitation link

**Screen Display:**
- "This invitation is invalid"
- "This invitation may have been canceled. Please contact [owner name] for a new invitation."
- Button: "OK"

**System Actions:**
- Show error state
- Do not allow acceptance

**Owner Can:**
- Resend invitation from Event Calendar settings
- Generates new token

---

### Resending Invitation

**Trigger:** Owner wants to resend invitation to pending member

**Location:** Event Calendar Settings → Members → Pending Invitations

**Actions:**
1. Owner taps "Resend" next to pending invitation
2. Confirmation: "Resend invitation to [email]?"
3. Owner confirms

**System Actions:**
- Generate new invitation token
- Update invitation record with new token and timestamp
- Previous token remains valid unless explicitly canceled
- Send new invitation email

---

### Removing Parent Member

**Trigger:** Owner wants to remove active or pending member

**Location:** Event Calendar Settings → Members → [Select Member]

**Actions:**
1. Owner taps "Remove [Name]"
2. Confirmation screen:
   - "Remove [Name] from [Calendar Name]?"
   - "They will no longer see events for [Child Name] or receive notifications"
   - "Events will be removed from their Google Calendar"
3. Owner confirms

**System Actions:**
- Update membership status to "Removed"
- Remove events from member's Google Calendar
- Unassign any events assigned to this member (mark as unassigned)
- Notify removed member (email)

**Notification to Removed Member:**
"You have been removed from [Calendar Name] by [Owner Name]. You will no longer receive notifications or see events for [Child Name]."

---

### Parent Member Joins Multiple Event Calendars

**Scenario:** Tom is invited to both "Emma's Soccer" and "Jake's Basketball"

**Process:**
1. Tom receives two invitation emails
2. Opens first invitation → Accepts → Goes through onboarding (Steps 7A-7F)
3. Opens second invitation → Since already authenticated, skips to Step 7B
4. Accepts second invitation → Immediately joins, no re-onboarding needed
5. Dashboard now shows both Emma and Jake in child filter
6. Sees events from both Event Calendars

**System State:**
- One parent account
- Two memberships (two Event Calendar access)
- Can view/filter by either child
- Can be assigned events from either calendar

---

### Parent in Multiple Families (Step-Children Scenario)

**Scenario:** Jennifer shares Emma/Jake with Tom, and Sophie with Mike

**Jennifer's Setup:**
1. Creates "Emma's Soccer" → Invites Tom
2. Creates "Jake's Basketball" → Invites Tom
3. Creates "Sophie's Daycare" → Invites Mike

**Tom's Experience:**
- Receives invitations for Emma and Jake only
- Accepts both
- Sees Emma and Jake in child filter
- Never sees Sophie (not a member of that Event Calendar)

**Mike's Experience:**
- Receives invitation for Sophie only
- Accepts
- Sees only Sophie in child filter
- Never sees Emma or Jake

**Jennifer's Experience:**
- Sees all three children in filter
- Can toggle between all three
- Perfect separation maintained

---

### Duplicate ICS URL Prevention

**Trigger:** User tries to add Event Calendar with ICS URL that already exists

**Validation:**
- Check ICS URL against all Event Calendars in database
- If exact match found:
  - Show error: "This calendar has already been added"
  - Show who added it:
    - "You added this calendar as '[Calendar Name]'" (if same user)
    - "[Parent Name] added this calendar as '[Calendar Name]'" (if different user in same Event Calendar)
  - Option: "View existing calendar"
  - Cannot proceed with duplicate

**Why This Matters:**
- Prevents accidental duplication
- Prevents conflicts in event sync
- Maintains data integrity

---

### Parent Member Adds Their Own Event Calendar for Same Child

**Scenario:** Tom is member of "Emma's Soccer" (created by Jennifer). Tom wants to add "Emma's Dance".

**Process:**
1. Tom taps "+" to add Event Calendar
2. Enters ICS URL for Emma's Dance
3. Selects existing child "Emma" from dropdown
4. Adds parent members:
   - Jennifer appears in list (already member of Emma's Soccer)
   - Tom can check Jennifer's checkbox to invite her to Emma's Dance
   - Tom can add other parents
5. Tom is now owner of "Emma's Dance"
6. Jennifer receives invitation to Emma's Dance
7. Jennifer accepts → Now sees events from both calendars

**Result:**
- Emma has two Event Calendars: Soccer (Jennifer owns) and Dance (Tom owns)
- Both parents are members of both calendars
- Each can add additional parents independently
- Events from both appear in feed, filtered by "Emma"

---

## NOTIFICATION SPECIFICATIONS

### Event Synced to Google Calendar

**When:** Event imported from ICS feed and synced to parent's Google Calendar

**Google Calendar Event Format:**
```
Title: [Child Name] - [Event Title]
Example: Emma - Soccer Practice

Time: [Start Time] - [End Time]
Location: [Parsed Location]

Description:
📅 Event Calendar: Emma's Soccer
👤 Child: Emma
🎯 Assigned to: Unassigned (or Parent Name)
📍 Leave by: 4:30 PM
🏠 Back home by: 7:15 PM
⏰ Arrive 20 min early for warm-ups

Special Instructions:
• Bring orange slices for snack
• Wear blue jersey

Managed by [App Name]
[Deep link to app]

Notification/Alert:
- 10 minutes before calculated departure time
- Only if event is assigned to this parent
```

---

### Push Notifications

**Event Assigned to You:**
"You've been assigned to [Event Name] on [Date] at [Time]. Leave by [Departure Time]."

**Parent Member Accepted Invitation:**
(To Owner): "[Name] accepted your invitation and joined [Calendar Name]"

**Parent Member Declined Invitation:**
(To Owner): "[Name] declined your invitation to [Calendar Name]"

**Event Reassigned:**
(To previous assignee): "You're no longer assigned to [Event Name]. [New Name] is now handling it."

**Departure Reminder:**
(From Google Calendar): "Time to leave for [Event Name]" - 10 minutes before departure

---

## GOOGLE CALENDAR INTEGRATION DETAILS

### OAuth Permissions Required

**Scopes Needed:**
- `https://www.googleapis.com/auth/calendar.events` (read/write events)
- `https://www.googleapis.com/auth/userinfo.email` (user email)
- `https://www.googleapis.com/auth/userinfo.profile` (user name)

**Requested During:** Step 1 (First-time) and Step 7C (Parent Member)

---

### Event Sync Strategy

**Push-Only (MVP):**
- App database is source of truth
- App writes events to parent's Google Calendar
- If parent edits in Google Calendar, app overwrites on next sync
- If parent deletes in Google Calendar, app re-syncs event
- Simple, predictable, app-authoritative

**Sync Frequency:**
- Immediate: When event created/updated/assigned in app
- Polling: Check ICS feed every 15 minutes for new/changed events
- Webhook: Google Calendar webhook for external changes (Phase 2)

**Sync Operations:**

**CREATE (New Event from ICS):**
1. Import event from ICS feed
2. Create event in database (assigned_parent_id = NULL)
3. For each active parent member of Event Calendar:
   - Create sync record (status = pending)
   - Queue Google Calendar API write
   - Write event to parent's Google Calendar
   - Update sync record (status = synced, capture google_event_id)
4. Handle failures with retry

**UPDATE (Event Changed in ICS or Assigned):**
1. Detect change in ICS feed or app assignment
2. Update event in database
3. For each existing sync record:
   - Update status to pending
   - Queue Google Calendar API update
   - Update event using stored google_event_id
   - Update sync record (status = synced)
4. Handle failures with retry

**DELETE (Event Removed from ICS):**
1. Mark event as deleted in database
2. For each sync record:
   - Queue Google Calendar API delete
   - Delete event using google_event_id
   - Delete sync record
3. Hard delete event after all syncs confirmed

---

### Handling Multiple Google Calendars

**MVP:** Always write to parent's Primary Google Calendar

**Phase 2:** Allow parent to choose target calendar during onboarding
- Option 1: Primary Calendar (default)
- Option 2: Select existing calendar
- Option 3: Create new dedicated calendar ("Family Activities")

**Storage:** `google_calendar_id` field on parent record determines target

---

## ANALYTICS & TRACKING

### Key Metrics

**Onboarding Funnel (Owner):**
- Started onboarding (downloaded app)
- Completed Google auth
- Completed address entry
- Completed first Event Calendar addition
- Created first child
- Invited parent members (% who invite vs skip)
- Reached dashboard
- Assigned first event

**Drop-off Points:**
- Where users abandon
- Time spent on each step
- Errors encountered

**Parent Member Funnel:**
- Invitation sent
- Invitation opened (email tracking)
- Invitation accepted
- Completed authentication
- Completed address setup
- Reached dashboard

**Invitation Metrics:**
- Invitations sent
- Acceptance rate
- Decline rate
- Expiration rate
- Time to acceptance

**Event Calendar Metrics:**
- Event Calendars per parent (average)
- Children per parent (average)
- Parents per Event Calendar (average)
- ICS feed success/failure rate
- Duplicate ICS URL attempts

**Assignment Metrics:**
- % of events assigned
- Time from import to assignment
- Assignment distribution (who gets assigned most)
- Reassignment frequency

---

## SECURITY CONSIDERATIONS

### Invitation Security

**Tokens:**
- Cryptographically secure random (32+ characters)
- One-time use (invalidated after acceptance)
- No expiration (valid until accepted, declined, or canceled)
- Cannot be guessed or enumerated

**Email Verification:**
- Must sign in with exact email from invitation
- Prevents unauthorized access
- Protects child information

### Authorization

**Event Calendar Access:**
- Parent must be active member to view events
- Owner can remove members
- Members can leave voluntarily

**Event Assignment:**
- Can only assign to active members of that Event Calendar
- Can only assign events from Event Calendars you're a member of

**Google Calendar Access:**
- OAuth tokens stored securely (encrypted)
- Tokens can be revoked
- Minimal required scopes

**Child Privacy:**
- Children only visible through Event Calendar membership
- Step-children separation enforced at data level
- No public child profiles

---

## ACCEPTANCE CRITERIA

### Onboarding is Complete When:

**Owner Flow:**
1. ✅ Can sign in with Google
2. ✅ Can set home address
3. ✅ Can add ICS URL and validate it works
4. ✅ Can name Event Calendar
5. ✅ Can create child
6. ✅ Can add multiple parent members with name/email
7. ✅ Invitations sent with secure tokens
8. ✅ Events imported from ICS feed
9. ✅ Events synced to owner's Google Calendar
10. ✅ Dashboard shows three views with events
11. ✅ Child filter works correctly
12. ✅ Can assign events to self or members

**Parent Member Flow:**
13. ✅ Can receive and open invitation email
14. ✅ Can accept invitation
15. ✅ Can sign in with Google (must match invitation email)
16. ✅ Can set their own home address
17. ✅ Events synced to their Google Calendar
18. ✅ Dashboard shows events with their departure times
19. ✅ Can see event assignments
20. ✅ Can add their own Event Calendars

**Data Integrity:**
21. ✅ Duplicate ICS URLs prevented
22. ✅ Step-children separation maintained
23. ✅ Each parent sees only their calendars
24. ✅ Event sync tracks per-parent status

**Notifications:**
25. ✅ Google Calendar notifications set (10 min before departure)
26. ✅ Push notifications for assignments work
27. ✅ Owner notified when member accepts/declines

**Edge Cases:**
28. ✅ Invalid/canceled invitations handled
29. ✅ Declined invitations handled
30. ✅ Failed ICS feeds handled gracefully
31. ✅ Email mismatches prevented
32. ✅ Removed members lose access

---

## OPEN QUESTIONS & FUTURE ENHANCEMENTS

### Future Considerations

**Role-Based Permissions:**
- Currently all parents equal
- Future: Owner vs Member permissions?
- Observer role for grandparents?

**Automatic Assignment:**
- Based on custody schedule
- Based on work calendar conflicts
- ML prediction based on past patterns

**Bidirectional Google Calendar Sync:**
- Detect external edits
- Sync back to app
- Conflict resolution

**Batch Operations:**
- Bulk assign events
- Bulk import calendars
- Season schedule handling

**Enhanced Notifications:**
- SMS fallback
- In-app notifications
- Escalation if unread

**Calendar Management:**
- Edit ICS URL
- Refresh calendar manually
- Pause/resume calendar sync

---

## NEXT STEPS

1. ✅ **Review and approve this complete specification**
2. Create detailed UI/UX mockups for each screen
3. Design database schema implementation
4. Build API endpoints for all flows
5. Implement invitation system with email service
6. Build event sync service with Google Calendar
7. Implement ICS feed parsing and import
8. Build dashboard with three-view feed
9. Implement event assignment UI
10. Build parent member invitation/acceptance flows
11. Create comprehensive test suite
12. Set up analytics tracking
13. Deploy MVP

---

*This specification defines the complete onboarding flows with calendar-centric architecture, child profiles, and parent member management. All details are locked down and ready for implementation.*
