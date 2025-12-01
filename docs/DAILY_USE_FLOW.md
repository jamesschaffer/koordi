# Daily Use Flow - Primary User
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## OVERVIEW

This document defines how users interact with the app on a daily basis, covering two primary usage patterns:
- **Option 1:** Using Google Calendar exclusively for day-to-day execution
- **Option 2:** Using the iOS app as the primary interface

Both options are supported and users can switch between them based on preference and context.

---

## TERMINOLOGY REMINDER

- **Google Calendar** = Parent's personal Google Calendar
- **Event Calendar** = Child's activity calendar (ICS feed source)
- **Main Event** = The actual activity from ICS feed (pristine source of truth)
- **Supplemental Events** = Drive time and early arrival buffer events we create

---

## EVENT ARCHITECTURE

### Event Structure in System

**When Event Imported from ICS Feed:**
1. Parse event from ICS feed
2. Extract: title, start time, end time, location, description
3. Main event data stored in database (source of truth)
4. Event status: UNASSIGNED

**When Event Created in Google Calendar (Unassigned State):**

For ALL parent members of the Event Calendar:
```
ONE Google Calendar Event Created:

Title: Emma - Soccer Practice
Time: 5:30 PM - 6:30 PM (from ICS feed)
Location: [Parsed address from ICS]
Description:
  📅 Event Calendar: Emma's Soccer
  👤 Child: Emma
  🎯 Status: Unassigned
  
  [Original description from ICS feed]
  
  Managed by [App Name]
  [Deep link to app]

Notification: None (not assigned yet)
```

**Key Point:** Main event created for ALL parents immediately, but NO supplemental events yet.

---

### Event Structure When Assigned

**When Parent Assigns Event to Themselves (e.g., Jennifer):**

System performs the following for assigned parent (Jennifer) ONLY:

1. **Calculate timing:**
   - Query Google Maps API for drive time from Jennifer's home to event location
   - Add early arrival buffer (parsed from ICS or default 15 min)
   - Calculate departure time
   - Calculate drive home time from event location to Jennifer's home
   - Calculate return home time

2. **Update Main Event:**
```
Title: Emma - Soccer Practice
Time: 5:30 PM - 6:30 PM
Location: [Address]
Description:
  📅 Event Calendar: Emma's Soccer
  👤 Child: Emma
  🎯 Assigned to: Jennifer Smith
  📍 Leave by: 4:30 PM
  ⏰ Arrive 20 min early for warm-ups
  🏠 Back home by: 7:15 PM
  
  Special Instructions:
  • Bring orange slices for snack
  • Wear blue jersey
  
  [Original description from ICS]
  
  Managed by [App Name]
  [Deep link to app]

Notification: 4:20 PM (10 min before departure)
```

3. **Create Supplemental Event: Drive To**
```
Title: 🚗 Drive to Emma's Soccer
Time: 4:30 PM - 5:00 PM (calculated drive time)
Location: [Event address]
Description:
  Drive time to event (30 min with traffic)
  📍 Destination: [Event address]
  [Google Maps link]
  
  Related to: Emma - Soccer Practice
  
Color: Blue (or app-specific color)
Notification: None (main event has the notification)
```

4. **Create Supplemental Event: Early Arrival**
```
Title: ⏰ Emma's Soccer - Arrive Early
Time: 5:00 PM - 5:30 PM (early arrival buffer)
Location: [Event address]
Description:
  Arrive 20 minutes early for warm-ups
  
  Related to: Emma - Soccer Practice
  
Color: Yellow (or app-specific color)
Notification: None
```

5. **Create Supplemental Event: Drive Home**
```
Title: 🚗 Drive home from Emma's Soccer
Time: 6:30 PM - 7:00 PM (calculated return drive)
Location: [Jennifer's home address]
Description:
  Drive time home (30 min)
  📍 Destination: Home
  
  Related to: Emma - Soccer Practice
  
Color: Blue (or app-specific color)
Notification: None
```

**Result for Jennifer's Google Calendar:**
```
4:30 PM | 🚗 Drive to Emma's Soccer
5:00 PM | ⏰ Emma's Soccer - Arrive Early
5:30 PM | Emma - Soccer Practice
6:30 PM | 🚗 Drive home from Emma's Soccer
```

---

**For Other Parent Members (e.g., Tom):**

Main event is updated to show assignment:

```
Title: Emma - Soccer Practice
Time: 5:30 PM - 6:30 PM
Location: [Address]
Description:
  📅 Event Calendar: Emma's Soccer
  👤 Child: Emma
  🎯 Assigned to: Jennifer Smith
  
  [Original description from ICS]
  
  Managed by [App Name]
  [Deep link to app]

Notification: None (not assigned to Tom)
```

**Result for Tom's Google Calendar:**
```
5:30 PM | Emma - Soccer Practice (shows Jennifer is assigned)
```

**No supplemental events created for Tom.**

---

### "Not Attending" Status

**When Parent Marks Event as "Not Attending":**

Some events may not require any parent to attend. The "Not Attending" option allows parents to explicitly mark an event as one they won't be attending, without leaving it in the unassigned state.

**System performs the following:**

1. **Update Main Event in ALL members' Google Calendars:**
```
Title: 🚫 Not Attending - Emma - Soccer Practice
Time: 5:30 PM - 6:30 PM
Location: [Address]
Description:
  📅 Event Calendar: Emma's Soccer
  👤 Child: Emma
  🚫 Status: Not Attending

  No action required - event marked as not attending.

  [Original description from ICS]

  Managed by [App Name]
  [Deep link to app]

Notification: None
```

2. **No Supplemental Events:** Drive times and early arrival events are not created

3. **Excluded from Filters:**
   - Not shown in "Unassigned Events" (it's decided, not pending)
   - Not shown in "My Events" (no one is assigned)
   - Visible in "Upcoming Events" with "Not Attending" badge
   - Excluded from conflict detection for all users

**Undoing "Not Attending":**
- Any parent can assign the event to themselves or another parent
- This clears the "Not Attending" status
- Normal assignment flow proceeds (supplemental events created, etc.)

---

### Reassignment Handling

**When Event Reassigned from Jennifer to Tom:**

**For Jennifer (losing assignment):**
1. Update main event: Change "Assigned to: Tom Smith"
2. **DELETE all supplemental events** (drive to, arrive early, drive home)
3. Remove notification from main event

**For Tom (gaining assignment):**
1. Update main event: Add assignment, add his calculated times
2. **CREATE all supplemental events** (calculated from his home address)
3. Set notification on main event (10 min before his departure time)

**Result:**
- Jennifer sees one event (no longer has supplementals)
- Tom now sees four events (main + three supplementals)

---

## OPTION 1: USING GOOGLE CALENDAR EXCLUSIVELY

### User Behavior

**Weekly Planning:**
- Opens iOS app to assign unassigned events
- Reviews upcoming week
- Coordinates with co-parent on assignments

**Daily Execution:**
- Uses Google Calendar as their primary interface
- Never (or rarely) opens iOS app day-of
- Relies on calendar notifications for departure reminders

**Day-of Flow:**

1. **Morning:** Opens Google Calendar to see day's schedule
   - Sees all four events for each assigned activity
   - Sees single event for activities assigned to co-parent
   - Visual timeline of their day

2. **Before Departure:** Receives Google Calendar notification
   - "Time to leave for Emma - Soccer Practice" (4:20 PM)
   - 10 minutes before calculated departure time

3. **Time to Leave:** Opens Google Calendar
   - Taps on "🚗 Drive to Emma's Soccer" event
   - Taps location field
   - Google Calendar opens Google Maps with destination
   - Begins navigation

4. **During Activity:** Google Calendar shows they're busy
   - "⏰ Emma's Soccer - Arrive Early" (5:00-5:30)
   - "Emma - Soccer Practice" (5:30-6:30)

5. **Heading Home:** Can reference drive home event
   - "🚗 Drive home from Emma's Soccer" (6:30-7:00)
   - Knows when they'll be home

### Benefits of This Approach

**For User:**
- No behavior change (uses existing calendar workflow)
- All information in one place (Google Calendar)
- Standard calendar features (notifications, widgets, watch)
- Works with other calendar apps (if they sync with Google)

**For App:**
- Works even if user doesn't open iOS app daily
- Leverages Google's robust notification system
- Less in-app notification infrastructure needed for MVP

### Limitations

- Can't quickly reassign events (need to open iOS app)
- Can't see app-specific features (conflict detection, bulk assignment)
- No consolidated "My Events" view across all calendars

---

## OPTION 2: USING iOS APP AS PRIMARY INTERFACE

### App Navigation Structure

**Top Level:**
```
┌─────────────────────────────────┐
│ ← [App Name]           [Menu] ☰ │
├─────────────────────────────────┤
│                                 │
│ Child Filter (Horizontal Scroll)│
│ [All Kids ▼] Emma  Jake  Sophie │
│                                 │
├─────────────────────────────────┤
│                                 │
│ Tab Navigation                  │
│ ─────────────────────────       │
│ Unassigned | Upcoming | My Events│
│            |          |          │
├─────────────────────────────────┤
│                                 │
│ [Scrolling Event Feed]          │
│                                 │
└─────────────────────────────────┘
```

---

### Feed View: "My Events" Tab

**Default View After Onboarding**

Shows events assigned to current user, organized chronologically by date.

**Structure:**
```
┌─────────────────────────────────┐
│ My Events                       │
├─────────────────────────────────┤
│ TODAY - Wednesday, Nov 20       │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Emma - Soccer Practice      │ │
│ │ 5:30 PM - 6:30 PM          │ │
│ │                             │ │
│ │ 📍 Leave by: 4:30 PM       │ │
│ │ ⏰ Arrive 20 min early     │ │
│ │ 🏠 Back home: 7:15 PM      │ │
│ │ 🎯 Assigned to: You        │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Jake - Basketball Practice  │ │
│ │ 7:00 PM - 8:30 PM          │ │
│ │                             │ │
│ │ 📍 Leave by: 6:20 PM       │ │
│ │ ⏰ Arrive 15 min early     │ │
│ │ 🏠 Back home: 9:15 PM      │ │
│ │ 🎯 Assigned to: You        │ │
│ └─────────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│ TOMORROW - Thursday, Nov 21     │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Emma - Dance Class          │ │
│ │ 3:30 PM - 4:30 PM          │ │
│ │                             │ │
│ │ 📍 Leave by: 2:50 PM       │ │
│ │ 🏠 Back home: 5:15 PM      │ │
│ │ 🎯 Assigned to: You        │ │
│ └─────────────────────────────┘ │
│                                 │
│ [No more events this week]      │
│                                 │
│ [+ Add Event Calendar]          │
└─────────────────────────────────┘
```

**Scrolling Behavior:**
- Starts at today
- Scroll down reveals future days
- Infinite scroll (loads more weeks as needed)
- Past events automatically archived (not shown in feed)

**Event Block Components:**
- **Title:** Child name + Activity (from main event)
- **Main Time:** Actual event start/end time (from ICS)
- **Leave By:** Calculated departure time
- **Arrive Early:** Early arrival buffer (if applicable)
- **Back Home:** Calculated return time
- **Assignment:** Who is responsible

**Empty State:**
```
┌─────────────────────────────────┐
│ My Events                       │
├─────────────────────────────────┤
│                                 │
│         📅                      │
│                                 │
│    No events assigned to you    │
│                                 │
│  Events will appear here once   │
│  you're assigned to them        │
│                                 │
│  [View Unassigned Events]       │
│                                 │
└─────────────────────────────────┘
```

---

### Feed View: "Upcoming Events" Tab

Shows ALL events for selected child(ren), regardless of assignment.

**Purpose:** See full picture of child's schedule

**Structure:**
```
┌─────────────────────────────────┐
│ Upcoming Events                 │
├─────────────────────────────────┤
│ TODAY - Wednesday, Nov 20       │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Emma - Soccer Practice      │ │
│ │ 5:30 PM - 6:30 PM          │ │
│ │ 🎯 Jennifer                │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Jake - Basketball Practice  │ │
│ │ 7:00 PM - 8:30 PM          │ │
│ │ 🎯 Tom                     │ │
│ └─────────────────────────────┘ │
│                                 │
├─────────────────────────────────┤
│ TOMORROW - Thursday, Nov 21     │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Emma - Dance Class          │ │
│ │ 3:30 PM - 4:30 PM          │ │
│ │ 🎯 Unassigned              │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Differences from "My Events":**
- Shows ALL events (not just assigned to you)
- Simplified view (no departure/return times for others' events)
- Shows who's assigned (or unassigned status)
- Can tap to see full details or reassign

**Use Case:**
- Co-parent wants to see what other parent is handling
- Parent wants overview of full week for child
- Coordinating overlapping schedules

---

### Feed View: "Unassigned Events" Tab

Shows events that need assignment.

**Purpose:** Triaging and assigning new events

**Structure:**
```
┌─────────────────────────────────┐
│ Unassigned Events               │
├─────────────────────────────────┤
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Emma - Dance Class          │ │
│ │ Thursday, Nov 21            │ │
│ │ 3:30 PM - 4:30 PM          │ │
│ │                             │ │
│ │ 🎯 Needs assignment         │ │
│ │                             │ │
│ │ [Tap to assign]             │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Jake - Piano Lesson         │ │
│ │ Friday, Nov 22              │ │
│ │ 5:00 PM - 5:45 PM          │ │
│ │                             │ │
│ │ 🎯 Needs assignment         │ │
│ │                             │ │
│ │ [Tap to assign]             │ │
│ └─────────────────────────────┘ │
│                                 │
│ [15 more unassigned events]     │
└─────────────────────────────────┘
```

**Badge Indicator:**
- App icon shows badge count of unassigned events
- Tab shows count: "Unassigned (17)"

**Empty State:**
```
┌─────────────────────────────────┐
│ Unassigned Events               │
├─────────────────────────────────┤
│                                 │
│         ✅                      │
│                                 │
│    All events are assigned!     │
│                                 │
│   Great job staying organized   │
│                                 │
└─────────────────────────────────┘
```

---

### Child Filter Behavior

**Filter Chips (Horizontal Scroll):**
```
[All Kids ▼] | Emma | Jake | Sophie
   (active)
```

**When "All Kids" Selected:**
- All three tabs show events from ALL Event Calendars user is member of
- Events grouped by date, then sorted by time
- Shows events for all children

**When Specific Child Selected (e.g., "Emma"):**
- All three tabs show ONLY events from Emma's Event Calendars
- "My Events" shows Emma events assigned to you
- "Upcoming" shows all Emma events regardless of assignment
- "Unassigned" shows unassigned Emma events

**Filter Persistence:**
- Selected filter persists as user switches tabs
- Persists across app sessions (saved in local storage)
- Can change filter anytime

**Visual Indicator:**
- Selected chip highlighted
- Count indicator: "Emma (12)" shows 12 upcoming events

---

## EVENT DETAIL SCREEN

### Accessing Detail Screen

**Trigger:** User taps any event block in any feed view

**Transition:** Modal slide-up or push navigation

---

### Detail Screen Layout

```
┌─────────────────────────────────┐
│ ← Back              [⋯ More]    │
├─────────────────────────────────┤
│                                 │
│ Emma - Soccer Practice          │
│ Wednesday, November 20, 2024    │
│                                 │
├─────────────────────────────────┤
│ TIMING                          │
│                                 │
│ 📍 Leave by: 4:30 PM           │
│    (from your home)             │
│                                 │
│ ⏰ Arrive: 5:00 PM             │
│    (20 min early for warm-ups)  │
│                                 │
│ 🏟️ Event: 5:30 PM - 6:30 PM   │
│                                 │
│ 🏠 Back home: 7:15 PM          │
│    (30 min drive)               │
│                                 │
│ ⏱️ Total commitment: 2h 45m    │
│                                 │
├─────────────────────────────────┤
│ LOCATION                        │
│                                 │
│ 📍 Riverside Soccer Fields      │
│    123 Park Ave, Baltimore MD   │
│                                 │
│ [Mini map preview]              │
│                                 │
│ [Navigate Now]  [View in Maps]  │
│                                 │
├─────────────────────────────────┤
│ ASSIGNMENT                      │
│                                 │
│ 🎯 Assigned to: You             │
│                                 │
│ [Reassign Event]                │
│                                 │
├─────────────────────────────────┤
│ DETAILS                         │
│                                 │
│ 📅 Event Calendar: Emma's Soccer│
│ 👤 Child: Emma                  │
│                                 │
│ Special Instructions:           │
│ • Bring orange slices for snack │
│ • Wear blue jersey              │
│ • Field 3                       │
│                                 │
│ [Full Description from ICS]     │
│                                 │
├─────────────────────────────────┤
│ ACTIONS                         │
│                                 │
│ [View in Google Calendar]       │
│ [Share Event Details]           │
│                                 │
└─────────────────────────────────┘
```

---

### Detail Screen - Timing Breakdown

**Visual Timeline (Optional Enhancement):**
```
4:30 PM  ─────────────►  Leave Home
              30 min drive
5:00 PM  ─────────────►  Arrive (Early)
              20 min buffer
5:30 PM  ═════════════►  Event Starts
              1 hour event
6:30 PM  ═════════════►  Event Ends
              30 min drive
7:15 PM  ─────────────►  Back Home
```

**Shows:**
- All four time segments
- Duration of each segment
- Clear visual separation
- Total time commitment

---

### Navigation Actions

**[Navigate Now] Button:**

**Behavior:**
1. User taps "Navigate Now"
2. App opens Google Maps app via deep link
3. Destination pre-populated: Event location address
4. Google Maps ready to start navigation

**Deep Link Format:**
```
comgooglemaps://?daddr=[event_address]&directionsmode=driving
```

**Fallback:**
If Google Maps not installed, open Apple Maps:
```
maps.apple.com/?daddr=[event_address]
```

**[View in Maps] Button:**

Opens full map view in detail screen (or external maps app) without starting navigation. Allows user to review route, see traffic, check parking, etc.

---

### Assignment Actions

**[Reassign Event] Button:**

**Trigger:** User taps "Reassign Event"

**Flow:**
1. Modal appears with list of parent members
2. Shows current assignment highlighted
3. User selects different parent
4. Confirmation: "Assign to [Parent Name]?"
5. User confirms

**System Actions:**
1. Update event assignment in database
2. For previous assignee (you):
   - Update main event in Google Calendar (remove assignment)
   - Delete all supplemental events
   - Remove notification
3. For new assignee:
   - Update main event (add assignment, add their times)
   - Create all supplemental events (calculated from their home)
   - Set notification
4. Send notification to new assignee
5. Refresh app UI

**UI Feedback:**
- Success toast: "Event assigned to [Name]"
- Event moves from "My Events" to "Upcoming Events" for you
- Appears in "My Events" for new assignee

---

### Reassignment Modal

```
┌─────────────────────────────────┐
│ Assign Event                    │
├─────────────────────────────────┤
│                                 │
│ Who should handle this event?   │
│                                 │
│ ○ Jennifer Smith (You) ✓        │
│   Currently assigned            │
│                                 │
│ ○ Tom Johnson                   │
│                                 │
│ ○ Barbara (Grandma)             │
│                                 │
├─────────────────────────────────┤
│                                 │
│ [Cancel]         [Assign Event] │
│                                 │
└─────────────────────────────────┘
```

**Selection:**
- Radio buttons (single selection)
- Current assignee shown with checkmark
- Tap parent name → Select → Tap "Assign Event"

---

## DAILY USE WORKFLOWS

### Workflow 1: Weekly Planning Session

**Scenario:** Sunday evening, Jennifer reviews upcoming week

**Steps:**
1. Opens iOS app
2. Default view: "My Events" tab
3. Sees events assigned to her
4. Switches to "Unassigned Events" tab
5. Sees 8 new events for the week
6. Taps first event → Detail screen
7. Reviews details, sees Tom is better suited
8. Taps "Reassign Event" → Selects Tom → Confirms
9. Event disappears from Unassigned
10. Returns to feed
11. Taps next event → Assigns to self
12. Event moves to "My Events"
13. Continues until all unassigned events handled
14. Switches to "Upcoming Events" to review full week
15. Confirms no conflicts
16. Closes app

**Result:**
- All events assigned for week
- Both parents have clear responsibilities
- Google Calendars updated with supplemental events
- Notifications set

---

### Workflow 2: Day-of Execution (Google Calendar)

**Scenario:** Wednesday afternoon, Jennifer needs to get Emma to soccer

**Steps:**
1. 4:20 PM: Receives Google Calendar notification
   - "Time to leave for Emma - Soccer Practice"
2. Pulls up Google Calendar on phone
3. Sees four events in timeline:
   - 4:30 PM: 🚗 Drive to Emma's Soccer
   - 5:00 PM: ⏰ Emma's Soccer - Arrive Early
   - 5:30 PM: Emma - Soccer Practice
   - 6:30 PM: 🚗 Drive home
4. Taps "🚗 Drive to Emma's Soccer" event
5. Taps location in event
6. Google Maps opens with destination
7. Starts navigation
8. Drives to event

**Result:**
- On time for event
- Never opened iOS app
- Seamless Google Calendar workflow

---

### Workflow 3: Day-of Execution (iOS App)

**Scenario:** Same scenario but Jennifer prefers iOS app

**Steps:**
1. 4:20 PM: Receives Google Calendar notification
2. Opens iOS app (from notification or home screen)
3. "My Events" tab shows today's events
4. Taps "Emma - Soccer Practice" event block
5. Detail screen opens
6. Reviews timing: Leave by 4:30 PM
7. Taps "Navigate Now"
8. Google Maps opens with destination
9. Starts navigation
10. Drives to event

**Alternative:** 
User might have app already open checking schedule. In that case:
1. Opens app during the day
2. Sees "Emma - Soccer Practice" in "My Events"
3. Checks "Leave by: 4:30 PM"
4. Sets own reminder or checks back at 4:20

---

### Workflow 4: Last-Minute Conflict

**Scenario:** Jennifer stuck at work, can't make Emma's soccer at 5:30

**Steps:**
1. 4:00 PM: Realizes she can't leave on time
2. Opens iOS app
3. Navigates to "My Events"
4. Taps "Emma - Soccer Practice"
5. Taps "Reassign Event"
6. Selects "Tom Johnson"
7. Confirms reassignment
8. System sends notification to Tom
9. Tom receives push: "You've been assigned to Emma - Soccer Practice. Leave by 4:45 PM from your home."
10. Tom opens Google Calendar
11. Sees four new events appear (drive, arrive early, main, drive home)
12. Notification set for 4:35 PM
13. Tom makes it on time

**Result:**
- Emergency handled smoothly
- No phone call needed between Jennifer and Tom
- System handled coordination
- Tom had all information needed

---

### Workflow 5: Reviewing Child's Full Schedule

**Scenario:** Tom wants to see everything happening with Emma this week

**Steps:**
1. Opens iOS app
2. Taps child filter at top
3. Selects "Emma" chip
4. Switches to "Upcoming Events" tab
5. Sees chronological list of all Emma's events
6. Notes:
   - Monday: Dance (assigned to Jennifer)
   - Wednesday: Soccer (assigned to Jennifer)
   - Friday: Piano (unassigned)
   - Saturday: Soccer game (assigned to him)
7. Realizes Friday piano is unassigned
8. Taps event → Assigns to himself
9. Now knows his full Emma commitment for week

**Result:**
- Full visibility into child's schedule
- Proactive assignment of unassigned event
- Coordinated without direct communication

---

## NOTIFICATION STRATEGY (MVP)

### Google Calendar Notifications Only

**Approach:**
- Leverage Google Calendar's built-in notification system
- Set notification on main event only
- Triggered 10 minutes before calculated departure time

**Benefits:**
- Users already familiar with Google Calendar notifications
- Works with notification preferences they've set
- Appears in calendar app they already use
- No duplicate notifications
- Simpler to build (no in-app notification system for MVP)

**Limitation:**
- Less customization than in-app notifications
- Relies on Google Calendar being functional
- Can't do rich notifications with actions

**Future Enhancement (Phase 2):**
- In-app notifications with actions (Navigate, Reassign, Snooze)
- Smart notifications (traffic changes, weather alerts)
- Notification preferences in app settings

---

### Notification Content

**Notification for Assigned Event:**
```
Title: Time to leave for Emma - Soccer Practice
Body: Leave by 4:30 PM to arrive on time
Time: 4:20 PM (10 min before departure)
Action: Opens Google Calendar to event
```

**No Notification for:**
- Supplemental events (drive, arrive early, drive home)
- Events assigned to other parents
- Unassigned events

---

## TRAFFIC UPDATES & RECALCULATION

### MVP Approach: Static Calculation

**For MVP:**
- Departure time calculated once at assignment
- Based on typical traffic for that day/time
- No real-time recalculation

**Rationale:**
- Simpler to build
- Good enough for most use cases
- Google Maps will show current traffic when navigation starts

### Future Enhancement: Dynamic Updates

**Phase 2 Features:**
- Monitor traffic in real-time leading up to departure
- If traffic worsens significantly, recalculate departure time
- Update supplemental event times in Google Calendar
- Send updated notification: "Traffic heavy - leave by 4:15 PM instead"
- Show in app: "⚠️ Leave 15 min earlier due to traffic"

**Triggers for Recalculation:**
- 1 hour before departure: Check traffic
- 30 minutes before departure: Check again
- Threshold: If new departure time is 10+ minutes earlier, update

---

## EDGE CASES & ERROR HANDLING

### Event with No Location

**Scenario:** ICS event has no location or location parsing fails

**Behavior:**
- Main event created normally
- **No supplemental events created** (can't calculate drive time)
- Event appears in feeds with warning icon
- Detail screen shows: "⚠️ Location not specified"
- User can manually add location in app
- Once location added, supplemental events created

---

### Event with Virtual Location (Zoom, etc.)

**Scenario:** Event description contains Zoom link instead of address

**Detection:**
- Parse description for keywords: "zoom", "meet", "teams", "virtual"
- Check if location field contains URL

**Behavior:**
- Main event created
- **No supplemental events created** (no drive time needed)
- Detail screen shows: "💻 Virtual Event"
- Navigation buttons hidden
- Shows join link prominently

---

### Drive Time API Failure

**Scenario:** Google Maps API fails to return drive time

**Fallback:**
1. Use estimated drive time based on straight-line distance
   - Formula: distance ÷ 30 mph (conservative estimate)
2. Add buffer (e.g., 25% extra time)
3. Flag event with warning: "⚠️ Estimated time (traffic data unavailable)"
4. Retry API call in background
5. Update times if successful later

**User Notification:**
- Detail screen shows estimation disclaimer
- Can manually adjust departure time

---

### Event Time Changes in ICS Feed

**Scenario:** Soccer practice moved from 5:30 PM to 6:00 PM

**Detection:**
- ICS feed polling detects change
- Compare event timestamp with stored event

**Behavior:**
1. Update main event in database
2. For assigned parent:
   - Recalculate departure/return times
   - Update all four Google Calendar events
   - Update notification time
3. For other parents:
   - Update their main event
4. Send push notification: "⚠️ Emma's Soccer time changed to 6:00 PM"
5. Update app feeds

---

### Event Cancelled in ICS Feed

**Scenario:** Soccer practice cancelled due to weather

**Detection:**
- Event disappears from ICS feed
- OR event status marked as "cancelled"

**Behavior:**
1. Mark event as cancelled in database
2. For all parents:
   - Update Google Calendar events with "CANCELLED" prefix
   - OR delete events entirely (user preference)
3. Send push notification: "❌ Emma's Soccer Practice cancelled"
4. Remove from app feeds (or show with cancelled badge)

---

### Multiple Overlapping Events

**Scenario:** Emma's soccer and Jake's basketball both at 5:30 PM, both assigned to Jennifer

**Detection:**
- Conflict detection when assigning second event
- Check if supplemental events overlap for same parent

**Behavior:**
1. Show warning when assigning: "⚠️ Conflict: You're already assigned to Jake's Basketball at 5:30 PM"
2. User options:
   - "Assign Anyway" (they'll figure it out)
   - "Choose Different Parent" (reassign one)
   - "Cancel" (leave unassigned)
3. If assigned anyway:
   - Both events appear in "My Events"
   - Both have conflict indicator: "⚠️ Overlaps with [other event]"
   - Detail screen shows conflict warning

**Future Enhancement:**
- Automatic conflict detection in "Unassigned Events"
- Smart suggestions: "Tom is free at this time. Assign to Tom?"

---

### GPS/Location Services Disabled

**Scenario:** User has location services turned off

**Impact:**
- Can't get user's current location
- Drive times calculated from stored home address (still works)
- "Navigate Now" still works (uses stored event address)

**Minimal Impact for MVP** since we use stored addresses, not real-time location.

---

### Google Calendar Sync Failure

**Scenario:** Google Calendar API returns error when creating event

**Behavior:**
1. Mark sync status as "failed" in database
2. Retry with exponential backoff (1 min, 5 min, 15 min)
3. After 3 failures:
   - Show error in app: "⚠️ Couldn't sync to Google Calendar"
   - Event still appears in app feeds
   - User can manually trigger retry
   - Contact support option

**User Experience:**
- App still functional (shows events)
- Google Calendar may be missing events
- Clear indicator in app that sync failed

---

## ANALYTICS & TRACKING

### Key Metrics to Track

**Engagement:**
- Daily active users (DAU)
- App opens per day
- Time spent in app
- Tab usage (which tab most used)

**Feature Usage:**
- Events assigned via app vs unassigned
- Navigation button taps
- Detail screen views
- Reassignments (frequency)

**Behavior Patterns:**
- Option 1 users (rarely open app, use calendar) vs Option 2 users (app-first)
- Time from import to assignment
- Weekend planning sessions (spike on Sundays?)

**Performance:**
- API call success rates (Google Calendar, Maps)
- Sync failures
- Notification delivery rates

---

## ACCEPTANCE CRITERIA

### Daily Use Flow is Complete When:

**Option 1 (Google Calendar):**
1. ✅ Events sync to Google Calendar correctly
2. ✅ Four separate events created for assigned parent
3. ✅ One event created for non-assigned parents
4. ✅ Event titles clear and distinguishable
5. ✅ Location field populated correctly
6. ✅ Clicking location opens Google Maps
7. ✅ Notifications fire 10 min before departure
8. ✅ Events appear in correct chronological order

**Option 2 (iOS App):**
9. ✅ Three-tab navigation works correctly
10. ✅ Child filter applies to all tabs
11. ✅ "My Events" shows only assigned events
12. ✅ "Upcoming Events" shows all events with assignment status
13. ✅ "Unassigned Events" shows events needing assignment
14. ✅ Event blocks display all key information
15. ✅ Scrolling feed organized by date
16. ✅ Tapping event opens detail screen
17. ✅ Detail screen shows full information
18. ✅ "Navigate Now" opens Google Maps with destination
19. ✅ Reassignment flow works end-to-end
20. ✅ Supplemental events created/deleted on assignment change

**Notifications:**
21. ✅ Google Calendar notifications set correctly
22. ✅ Notification timing accurate (10 min before departure)
23. ✅ No notifications for unassigned events
24. ✅ No notifications for supplemental events

**Edge Cases:**
25. ✅ Virtual events handled (no supplemental events)
26. ✅ Missing location events handled gracefully
27. ✅ API failures handled with retry and user notification
28. ✅ Event changes/cancellations detected and synced
29. ✅ Conflicts detected and displayed

---

## NEXT STEPS

After completing Daily Use Flow:
1. Document "Unassigned Events Assignment Flow" (bulk operations, filters)
2. Document "Conflict Detection & Resolution Flow"
3. Document "Event Calendar Management Flow" (add/edit/remove calendars)
4. Document "Child Management Flow" (add/edit children)
5. Document "Parent Member Management Flow" (invite/remove members)
6. Document "Settings & Preferences Flow"

---

*This specification defines the complete Daily Use Flow for both Google Calendar and iOS App usage patterns. All details are locked down and ready for UI/UX design and implementation.*
