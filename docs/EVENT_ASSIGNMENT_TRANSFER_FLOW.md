# Event Assignment Transfer Flow
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## FINALIZED DESIGN DECISIONS

These decisions were made to prioritize simplicity and avoid unnecessary complexity:

1. ✅ **No "Take It Back" Quick Action**
   - Notification does NOT include "Take It Back" button
   - User must open app to reverse assignment
   - Prevents toxic ping-pong battles between contentious co-parents
   - Requires deliberate action to reverse

2. ✅ **Single Toggle for Supplemental Events**
   - All-or-nothing: Keep ALL supplemental events or delete ALL
   - No per-parent, per-child, or per-calendar granularity
   - Simple binary choice in settings
   - Default: OFF (delete supplemental events when reassigned)

3. ✅ **Confirmation Asymmetry**
   - "Take Over" requires confirmation (feels aggressive, prevents accidents)
   - "Give Away" no confirmation (your own choice, quick action)
   - "Assign to Me" no confirmation (claiming unassigned, quick action)

4. ✅ **No Time Restrictions**
   - Can reassign during event (15 minutes before start)
   - Can reassign after event (historical changes allowed)
   - No artificial cutoffs or locked states
   - Avoids complexity of managing restriction rules

5. ✅ **Real-Time Updates via WebSocket**
   - Assignment changes reflect immediately across all clients
   - No manual refresh needed
   - If Jennifer is viewing "My Events" and Tom takes event, it disappears instantly
   - Falls back to polling if WebSocket disconnects

6. ✅ **Full Access for New Members**
   - New parent joining Event Calendar sees ALL events (past, present, future)
   - Can take over any assignment immediately, regardless of when made
   - No tiered permissions based on join date
   - Membership = full access

7. ✅ **MVP: One Event at a Time**
   - No batch operations (select multiple → assign all)
   - Single-event assignment only
   - Batch operations deferred to Phase 2
   - Simpler implementation and testing

8. ✅ **Notifications Deferred**
   - Core functionality built first
   - Notification triggers identified but implementation deferred
   - Settings and preferences designed separately after core works
   - Focus on app functionality over notification complexity

---

## OVERVIEW

This document defines how parents transfer event assignments between each other, covering:
- Giving away your assignment to someone else
- Taking over an assignment from someone else
- Taking an unassigned event
- Settings for supplemental event retention
- Multi-parent scenarios (3+ parents)
- Co-parenting dynamics and edge cases

**Core Principle:** Keep it simple. Both parents can change assignments freely, with clear notifications and user-controlled cleanup preferences.

---

## CORE ASSIGNMENT SCENARIOS

### Scenario 1: Give Away Your Assignment

**Context:** You're assigned to an event but can't make it or want someone else to handle it.

**User Action:**
1. Open iOS app
2. Navigate to event (from "My Events" or any view)
3. Tap event block → Event detail screen
4. Tap "Give to Someone Else" button
5. Select parent from list
6. Confirm assignment

**Example:**
- Event: Emma - Soccer Practice (Wednesday 5:30 PM)
- Currently assigned to: Jennifer
- Jennifer gives to: Tom

---

### Scenario 2: Take Over Someone Else's Assignment

**Context:** Event is assigned to someone else, but you want/need to take it.

**User Action:**
1. Open iOS app
2. Navigate to event (from "Upcoming Events" tab)
3. Tap event block → Event detail screen
4. Tap "Take Over This Event" button
5. Confirm: "Take over from [Parent Name]?"
6. Confirm action

**Example:**
- Event: Emma - Soccer Practice (Wednesday 5:30 PM)
- Currently assigned to: Tom
- Jennifer takes it over

---

### Scenario 3: Assign to Yourself (Unassigned Event)

**Context:** Event has no assignment yet.

**User Action:**
1. Open iOS app
2. Navigate to "Unassigned Events" tab
3. Tap event block → Event detail screen
4. Tap "Assign to Me" button
5. Assignment confirmed immediately

**Example:**
- Event: Emma - Soccer Practice (Wednesday 5:30 PM)
- Currently: Unassigned
- Jennifer assigns to herself

---

## ASSIGNMENT UI DESIGN

### Event Detail Screen - Assignment Section

**State 1: Assigned to You**
```
┌─────────────────────────────────┐
│ ASSIGNMENT                      │
│                                 │
│ 🎯 Assigned to: You             │
│                                 │
│ [Give to Someone Else]          │
│                                 │
└─────────────────────────────────┘
```

**State 2: Assigned to Someone Else**
```
┌─────────────────────────────────┐
│ ASSIGNMENT                      │
│                                 │
│ 🎯 Assigned to: Tom Johnson     │
│                                 │
│ [Take Over This Event]          │
│                                 │
└─────────────────────────────────┘
```

**State 3: Unassigned**
```
┌─────────────────────────────────┐
│ ASSIGNMENT                      │
│                                 │
│ 🎯 Status: Unassigned           │
│                                 │
│ [Assign to Me] [Assign to...]   │
│                                 │
└─────────────────────────────────┘
```

---

### Give Away Assignment Modal

**Trigger:** User taps "Give to Someone Else"

```
┌─────────────────────────────────┐
│ Assign Event                    │
├─────────────────────────────────┤
│                                 │
│ Who should handle this event?   │
│                                 │
│ ○ Tom Johnson                   │
│                                 │
│ ○ Barbara Williams (Grandma)    │
│                                 │
├─────────────────────────────────┤
│                                 │
│ [Cancel]         [Assign Event] │
│                                 │
└─────────────────────────────────┘
```

**List shows:**
- All parent members of this Event Calendar
- Excludes current user (can't assign to yourself)
- Shows parent name (and relationship if noted)

**Confirmation:**
- No additional confirmation needed
- Action is immediately taken when "Assign Event" tapped
- Can be undone by taking it back

---

### Take Over Confirmation Modal

**Trigger:** User taps "Take Over This Event"

```
┌─────────────────────────────────┐
│ Take Over Event?                │
├─────────────────────────────────┤
│                                 │
│ You're about to take over       │
│ Emma's Soccer Practice from     │
│ Tom Johnson.                    │
│                                 │
│ Tom will be notified that you're│
│ now handling this event.        │
│                                 │
│ Event Details:                  │
│ Wednesday, Nov 20               │
│ 5:30 PM - 6:30 PM              │
│ Leave by: 4:45 PM (from your    │
│ home)                           │
│                                 │
├─────────────────────────────────┤
│                                 │
│ [Cancel]        [Take Over]     │
│                                 │
└─────────────────────────────────┘
```

**Shows:**
- Who you're taking it from
- Event details for context
- Your calculated departure time
- Explicit confirmation required

**Rationale for Confirmation:**
- Prevents accidental takeovers
- Shows user what they're committing to
- Makes the action deliberate

---

## SYSTEM BEHAVIOR: ASSIGNMENT TRANSFER

### Flow 1: Give Away Assignment (Jennifer → Tom)

**Initial State:**
- Event assigned to Jennifer
- Jennifer has 4 Google Calendar events (drive to, arrive early, main, drive home)
- Tom has 1 Google Calendar event (main event showing Jennifer assigned)

**User Action:** Jennifer assigns event to Tom

**System Actions:**

1. **Update Database:**
   - `event.assigned_to_user_id` = Tom's ID
   - `event.updated_at` = current timestamp

2. **Jennifer's Google Calendar:**
   - **Main Event:** Update description
     ```
     From: 🎯 Assigned to: Jennifer Smith
     To:   🎯 Assigned to: Tom Johnson
     ```
   - Remove notification (no longer her responsibility)
   
   - **Check Jennifer's Setting:** "Keep event details when reassigned"
   
   **If Setting = OFF (Delete supplemental events):**
   - Delete: 🚗 Drive to Emma's Soccer
   - Delete: ⏰ Emma's Soccer - Arrive Early
   - Delete: 🚗 Drive home from Emma's Soccer
   
   **If Setting = ON (Keep supplemental events):**
   - Update titles to indicate not her responsibility:
     - 🚗 (Tom's) Drive to Emma's Soccer
     - ⏰ (Tom's) Emma's Soccer - Arrive Early
     - 🚗 (Tom's) Drive home from Emma's Soccer
   - Update descriptions: "Tom Johnson is handling this event"
   - Change color to gray/muted (indicate informational only)
   - Remove all notifications from these events

3. **Tom's Google Calendar:**
   - **Main Event:** Update description
     ```
     Add: 🎯 Assigned to: Tom Johnson
     Add: 📍 Leave by: 4:45 PM
     Add: 🏠 Back home by: 7:00 PM
     Add: ⏰ Arrive 20 min early
     ```
   - Add notification: 10 min before his departure time (4:35 PM)
   
   - **Create Supplemental Events:**
   - Create: 🚗 Drive to Emma's Soccer (4:45-5:10 PM, from Tom's home)
   - Create: ⏰ Emma's Soccer - Arrive Early (5:10-5:30 PM)
   - Create: 🚗 Drive home from Emma's Soccer (6:30-7:00 PM, to Tom's home)

4. **Update App Feeds:**
   - **Jennifer's App:**
     - Event removed from "My Events" **immediately** (real-time via websocket)
     - Event appears in "Upcoming Events" showing Tom assigned
     - If Jennifer is actively viewing "My Events", event disappears from her screen in real-time
   
   - **Tom's App:**
     - Event appears in "My Events" **immediately** (real-time)
     - Event shows in "Upcoming Events" with him assigned
     - Event removed from "Unassigned Events" (if it was there)
     - If Tom has app open, changes reflect instantly without refresh

5. **Send Notifications:**
   - **To Tom (Push):**
     ```
     Jennifer assigned you to Emma's Soccer Practice
     Wednesday, Nov 20 at 5:30 PM
     Leave by 4:45 PM
     ```
   - **To Jennifer:** No notification (she initiated it)

6. **Other Parent Members (if any):**
   - Update their main event to show Tom assigned
   - No other changes (they don't have supplemental events anyway)

---

### Flow 2: Take Over Assignment (Tom → Jennifer)

**Initial State:**
- Event assigned to Tom
- Tom has 4 Google Calendar events
- Jennifer has 1 Google Calendar event (main event showing Tom assigned)

**User Action:** Jennifer takes over event from Tom

**System Actions:**

1. **Update Database:**
   - `event.assigned_to_user_id` = Jennifer's ID
   - `event.updated_at` = current timestamp

2. **Tom's Google Calendar:**
   - **Main Event:** Update description
     ```
     From: 🎯 Assigned to: Tom Johnson
     To:   🎯 Assigned to: Jennifer Smith
     ```
   - Remove notification
   
   - **Check Tom's Setting:** "Keep event details when reassigned"
   
   **If Setting = OFF:**
   - Delete all supplemental events
   
   **If Setting = ON:**
   - Keep supplemental events but mark as informational
   - Update titles: "(Jennifer's) Drive to Emma's Soccer" etc.
   - Update descriptions, change color, remove notifications

3. **Jennifer's Google Calendar:**
   - **Main Event:** Update description
     ```
     Add: 🎯 Assigned to: Jennifer Smith
     Add: 📍 Leave by: 4:30 PM (her drive time)
     Add: 🏠 Back home by: 7:15 PM
     ```
   - Add notification: 10 min before her departure (4:20 PM)
   
   - **Create Supplemental Events:**
   - Create: 🚗 Drive to Emma's Soccer (4:30-5:00 PM, from Jennifer's home)
   - Create: ⏰ Emma's Soccer - Arrive Early (5:00-5:30 PM)
   - Create: 🚗 Drive home from Emma's Soccer (6:30-7:15 PM, to Jennifer's home)

4. **Update App Feeds:**
   - **Jennifer's App:**
     - Event appears in "My Events"
     - Shows in "Upcoming Events" with her assigned
   
   - **Tom's App:**
     - Event removed from "My Events"
     - Event shows in "Upcoming Events" with Jennifer assigned

5. **Send Notifications:**
   - **To Tom (Push):**
     ```
     Jennifer took over Emma's Soccer Practice
     Wednesday, Nov 20 at 5:30 PM
     You're no longer assigned to this event
     
     [View Event] [Take It Back]
     ```
   
   - **To Jennifer:** No notification (she initiated it)

**Key Difference from Flow 1:**
- Notification to Tom explicitly states someone "took over" (not "assigned you")
- Notification includes "Take It Back" button for quick reversal

---

### Flow 3: Assign Unassigned Event (Jennifer assigns to herself)

**Initial State:**
- Event unassigned
- All parent members have main event only
- No supplemental events exist yet

**User Action:** Jennifer assigns event to herself

**System Actions:**

1. **Update Database:**
   - `event.assigned_to_user_id` = Jennifer's ID

2. **Jennifer's Google Calendar:**
   - **Main Event:** Update description (add assignment and times)
   - Add notification
   - **Create Supplemental Events** (same as Flow 2)

3. **Other Parents' Google Calendars:**
   - **Main Event:** Update description to show Jennifer assigned
   - No supplemental events created

4. **Update App Feeds:**
   - Event appears in Jennifer's "My Events"
   - Event removed from "Unassigned Events" for all parents
   - Event shows in everyone's "Upcoming Events" with Jennifer assigned

5. **Send Notifications:**
   - **To Jennifer:** Optional confirmation toast in app: "Event assigned to you"
   - **To Other Parents (Push):**
     ```
     Jennifer assigned herself to Emma's Soccer Practice
     Wednesday, Nov 20 at 5:30 PM
     ```

---

## SUPPLEMENTAL EVENT RETENTION SETTING

### Setting Location

**Path:** App Settings → Calendar Sync → Event Details

```
┌─────────────────────────────────┐
│ Calendar Sync                   │
├─────────────────────────────────┤
│                                 │
│ Google Calendar Integration     │
│                                 │
│ ☐ Keep event details when       │
│   reassigned to someone else    │
│                                 │
│ When an event you're assigned to│
│ is reassigned to another parent,│
│ keep the drive times and arrival│
│ reminders in your calendar for  │
│ reference.                      │
│                                 │
│ ℹ️ These events will be marked  │
│ as informational and won't have │
│ notifications.                  │
│                                 │
│ Default: Off (removes events    │
│ from your calendar)             │
│                                 │
└─────────────────────────────────┘
```

**Default:** Unchecked (OFF)

**Rationale for Default OFF:**
- Most users want clean calendar showing only their responsibilities
- Avoids calendar clutter
- Standard expectation: "Not my event anymore, don't need to see it"

---

### Setting Behavior Comparison

**Scenario:** Jennifer assigned to Emma's Soccer. Tom takes it over.

#### Jennifer's Setting = OFF (Default)

**Jennifer's Google Calendar BEFORE:**
```
4:30 PM | 🚗 Drive to Emma's Soccer
5:00 PM | ⏰ Emma's Soccer - Arrive Early
5:30 PM | Emma - Soccer Practice
6:30 PM | 🚗 Drive home from Emma's Soccer
```

**Jennifer's Google Calendar AFTER:**
```
5:30 PM | Emma - Soccer Practice
         | 🎯 Assigned to: Tom Johnson
```

**Result:** Clean calendar, only shows main event with Tom's assignment.

---

#### Jennifer's Setting = ON

**Jennifer's Google Calendar BEFORE:**
```
4:30 PM | 🚗 Drive to Emma's Soccer
5:00 PM | ⏰ Emma's Soccer - Arrive Early
5:30 PM | Emma - Soccer Practice
6:30 PM | 🚗 Drive home from Emma's Soccer
```

**Jennifer's Google Calendar AFTER:**
```
4:30 PM | 🚗 (Tom's) Drive to Emma's Soccer
         | ℹ️ Tom Johnson is handling this event
         | Color: Gray/muted
         
5:00 PM | ⏰ (Tom's) Emma's Soccer - Arrive Early
         | ℹ️ Tom Johnson is handling this event
         | Color: Gray/muted
         
5:30 PM | Emma - Soccer Practice
         | 🎯 Assigned to: Tom Johnson
         
6:30 PM | 🚗 (Tom's) Drive home from Emma's Soccer
         | ℹ️ Tom Johnson is handling this event
         | Color: Gray/muted
```

**Result:** Full timing visible for context/planning, but clearly marked as informational.

---

### Use Cases for Setting ON

**Use Case 1: Coordinating Around Other Parent's Schedule**
- Jennifer wants to see when Tom has Emma
- Helps avoid scheduling conflicts (e.g., she won't plan dinner during Emma's soccer)
- Can see full time commitment for family planning

**Use Case 2: Historical Context**
- Jennifer originally planned around this event
- Keeping it visible helps her remember why her schedule looks a certain way
- Useful for coordinating with work calendar

**Use Case 3: Backup Awareness**
- If Tom doesn't show up, Jennifer knows the timing details
- Can step in as backup without looking up information

**Use Case 4: Co-parenting with Minimal Communication**
- Jennifer and Tom don't talk much
- Jennifer wants visibility into Tom's commitments without asking
- Helps her plan her own schedule independently

---

### Use Cases for Setting OFF (Default)

**Use Case 1: Clean Calendar**
- Only want to see my own responsibilities
- Calendar clutter drives me crazy
- Trust other parent will handle it

**Use Case 2: Married/Collaborative Co-parents**
- Sarah and Mike share household
- Sarah handles Emma's activities
- Mike doesn't need those details in his calendar

**Use Case 3: Focus on My Tasks**
- Too many events overwhelms me
- Need clean separation: my events vs. theirs
- Can always check app if I need to see full schedule

---

## MULTI-PARENT SCENARIOS (3+ Parents)

### Setup: Event Calendar with 3 Parents

**Event Calendar:** Emma's Soccer
**Parent Members:**
- Jennifer (owner)
- Tom (co-parent, ex-husband)
- Barbara (Jennifer's mom, helps with pickups)

**Event:** Soccer Practice - Wednesday 5:30 PM

---

### Scenario A: Give Away with Multiple Members

**Initial State:** Event assigned to Jennifer

**Action:** Jennifer assigns to Barbara

**Result:**
- **Jennifer:** Loses supplemental events (per her setting)
- **Barbara:** Gets supplemental events (calculated from her home)
- **Tom:** Sees main event updated to show Barbara assigned

**Notifications:**
- Barbara: "Jennifer assigned you to Emma's Soccer"
- Tom: "Jennifer assigned Barbara to Emma's Soccer"
- Jennifer: No notification (she initiated)

---

### Scenario B: Take Over with Multiple Members

**Initial State:** Event assigned to Tom

**Action:** Barbara takes it over

**Result:**
- **Tom:** Loses supplemental events (per his setting), notified Barbara took over
- **Barbara:** Gets supplemental events
- **Jennifer:** Sees main event updated to show Barbara assigned

**Notifications:**
- Tom: "Barbara took over Emma's Soccer. You're no longer assigned. [Take It Back]"
- Jennifer: "Barbara took over Emma's Soccer from Tom"
- Barbara: No notification (she initiated)

---

### Scenario C: Multiple Members Viewing Event

**Current State:** Event assigned to Tom

**Jennifer's View (Event Detail):**
```
ASSIGNMENT
🎯 Assigned to: Tom Johnson

[Take Over This Event]
```

**Barbara's View (Event Detail):**
```
ASSIGNMENT
🎯 Assigned to: Tom Johnson

[Take Over This Event]
```

**Tom's View (Event Detail):**
```
ASSIGNMENT
🎯 Assigned to: You

[Give to Someone Else]
```

**Key Point:** All non-assigned parents see same "Take Over" option. First to act gets it.

---

### Scenario D: Sequential Reassignments

**Sequence:**
1. Jennifer → Tom (Jennifer gives away)
2. Tom → Barbara (Tom gives away)
3. Barbara → Jennifer (Barbara gives away)

**Each transfer follows standard flow:**
- Previous assignee loses supplemental events (per setting)
- New assignee gets supplemental events
- Notifications sent appropriately
- All parents see updated assignment in main event

**System handles this naturally** - no special logic needed for multiple hops.

---

### Edge Case 11: New Member Joins Event Calendar

**Scenario:**
- Event imported and assigned to Jennifer (2 weeks ago)
- Barbara joins Event Calendar today as new member
- Can Barbara see and take over this already-assigned event?

**Answer:** Yes

**System Behavior:**
- Barbara immediately sees ALL events in Event Calendar (past, present, future)
- Can view events in "Upcoming Events" tab
- Can tap any event (including those assigned to Jennifer or Tom)
- Can take over any assignment, regardless of when it was originally made
- Previous assignments and historical events are fully visible and actionable

**Rationale:**
- Once you're a member, you have full access to the Event Calendar
- No artificial restrictions based on join date
- Enables Barbara to help with any event, not just future ones
- Simpler system: membership = full access, no tiered permissions

---

## REAL-TIME UPDATES

### WebSocket Implementation

**Requirement:** Assignment changes must reflect immediately across all connected clients.

**User Experience:**
- Jennifer is viewing "My Events" on her phone
- Tom (on his phone) takes over one of Jennifer's events
- Jennifer's screen updates **immediately** - event disappears from her "My Events"
- No manual refresh required
- Seamless, real-time coordination

**Technical Approach:**
- WebSocket connection maintained while app is open
- Server broadcasts assignment changes to all affected parents
- Client receives update and re-renders affected feeds
- Optimistic updates on action (show change immediately, rollback if server rejects)

**Events That Trigger Real-Time Updates:**
- Event assignment changed
- Event created/imported from ICS
- Event deleted/cancelled
- Event time changed
- Event Calendar membership changed

**Affected Views:**
- "My Events" tab (add/remove events based on assignment)
- "Upcoming Events" tab (update assignment display)
- "Unassigned Events" tab (add/remove based on assignment status)
- Event detail screen (update assignment section)

**Graceful Degradation:**
- If WebSocket disconnects, fall back to polling (every 30 seconds)
- On app resume from background, sync latest state
- Show "Syncing..." indicator during reconnection

---

## EDGE CASES & ERROR HANDLING

### Edge Case 1: Simultaneous Reassignment

**Scenario:** Jennifer and Tom both try to take/reassign same event simultaneously

**Timeline:**
```
4:30:00.000 - Jennifer: "Take Over" → Sends to server
4:30:00.100 - Tom: "Take Over" → Sends to server
4:30:00.200 - Server processes Jennifer's request first
                Event.assigned_to_user_id = Jennifer
4:30:00.300 - Server processes Tom's request
                Event.assigned_to_user_id = Jennifer (already!)
                Tom's request: Changes to Tom
                Result: Tom gets it (last write wins)
```

**Result:** Last write wins (Tom gets the event)

**Notifications:**
- Jennifer gets: "Tom took over Emma's Soccer"
- Tom gets: No notification (he initiated)

**Rationale:**
- Simple to implement (no locking)
- Rare occurrence in practice
- Resolution is clear: whoever acted last has it
- Loser can take it back if they want

**Alternative (More Complex):**
- Implement optimistic locking
- Check if assignment hasn't changed since event detail loaded
- If changed: Show error "Event was just reassigned, refresh and try again"
- **Decision for MVP: Skip locking, use last write wins**

---

### Edge Case 2: Taking Your Own Assignment

**Scenario:** Jennifer assigned to event. Jennifer taps "Take Over This Event" (somehow)

**Prevention in UI:**
- If you're assigned, button shows "Give to Someone Else"
- "Take Over" button only shows if someone else is assigned
- Not possible to take your own assignment

**If Somehow Triggered:**
- Server checks: if (new_assignee == current_assignee) { return no-op }
- No changes made
- Optional: Show toast "You're already assigned to this event"

---

### Edge Case 3: Assigning to Yourself When Already Assigned

**Scenario:** In "Give to Someone Else" modal, user's own name appears in list (shouldn't happen)

**Prevention:**
- Filter out current user from parent list in modal
- Only show other parents

**If Somehow Selected:**
- Server treats as no-op
- No changes made

---

### Edge Case 4: Reassignment During Event

**Scenario:** It's 5:15 PM. Event is 5:30-6:30 PM. Tom is supposedly at event. Jennifer takes it over.

**System Behavior:**
- **Allowed** (no restriction)
- Transfer happens as normal
- Tom gets notification immediately
- Could happen if Tom didn't show up and Jennifer is covering

**Optional Warning in UI:**
```
⚠️ This event is happening soon (in 15 minutes).
Are you sure you want to take it over?

[Cancel] [Yes, Take Over]
```

**Threshold for Warning:** Event starts within 1 hour

---

### Edge Case 5: Reassignment After Event Completed

**Scenario:** Event was yesterday. Jennifer wants to reassign to Tom (maybe for record-keeping?)

**System Behavior:**
- **Allowed** (no restriction)
- Transfer happens as normal
- Historical assignments can be changed
- Useful for: "Tom actually handled it, update the record"

**Consideration:** Past events don't show in normal feeds, so this requires going to history/past events view.

---

### Edge Case 6: Event Cancelled After Reassignment

**Scenario:**
1. Jennifer assigned to event
2. Jennifer gives to Tom
3. Event cancelled in ICS feed

**System Behavior:**
- Standard cancellation flow applies
- Tom's events (main + supplemental) marked as cancelled or deleted
- Jennifer's main event marked as cancelled or deleted
- Both notified of cancellation

**No special handling needed** - cancellation logic independent of recent reassignments.

---

### Edge Case 7: Event Time Changes After Reassignment

**Scenario:**
1. Event at 5:30 PM, assigned to Tom
2. Event moves to 6:00 PM in ICS feed
3. Drive times need recalculation

**System Behavior:**
- Detect time change in ICS feed
- Recalculate departure/return times for Tom (assigned parent)
- Update Tom's supplemental events with new times
- Update main event for all parents
- Send notification: "Emma's Soccer moved to 6:00 PM. New departure time: 5:15 PM."

**Works same as before reassignment** - system knows Tom is assigned, recalculates for him.

---

### Edge Case 8: Parent Removed from Event Calendar During Assignment

**Scenario:**
1. Event assigned to Tom
2. Event Calendar owner (Jennifer) removes Tom as member
3. Tom loses access to entire Event Calendar

**System Behavior:**
- Remove Tom's membership from Event Calendar
- Automatically **unassign all events** that were assigned to Tom
- Events return to "Unassigned" status
- Delete Tom's Google Calendar events (main + supplemental)
- Notify Tom: "You've been removed from Emma's Soccer calendar"
- Other parents see events become unassigned, need reassignment

**This is destructive** - requires confirmation from owner before removing member.

---

### Edge Case 9: Setting Changed Mid-Assignment

**Scenario:**
1. Jennifer's setting = OFF
2. Event assigned to Jennifer
3. Jennifer changes setting to ON
4. Tom takes over event

**System Behavior:**
- At time of reassignment, check Jennifer's current setting
- Since now ON, keep her supplemental events as informational
- Setting change applies immediately to future reassignments

**Retroactive?** If Jennifer wants to see past events she gave away:
- Not retroactive by default
- Would need "Sync Calendar" button to re-apply setting to existing events
- **MVP: Setting only applies to future reassignments**

---

### Edge Case 10: Google Calendar Sync Failure During Reassignment

**Scenario:**
1. Jennifer gives event to Tom
2. Database updated successfully (Tom assigned)
3. Google Calendar API fails when creating Tom's supplemental events

**System Behavior:**
- Database: Event assigned to Tom (committed)
- Tom's sync status: "failed"
- Retry with exponential backoff
- Tom sees event in app (works fine)
- Tom's Google Calendar: Missing supplemental events (temporarily)
- After successful retry: Events appear in Tom's calendar
- If retry continues failing: Show error in app with "Retry Sync" button

**Key Point:** App functionality not dependent on Google Calendar sync success. Calendar is secondary.

---

## NOTIFICATION SPECIFICATIONS

### Notification Types

#### 1. Assignment Given to You
**Trigger:** Someone assigns event to you

**Content:**
```
Title: New assignment: Emma's Soccer Practice
Body: Jennifer assigned you to this event on Wednesday, Nov 20 at 5:30 PM. Leave by 4:45 PM.
Actions:
- [View Event] (opens app to event detail)
- [View in Calendar] (opens Google Calendar)
```

---

#### 2. Assignment Taken from You
**Trigger:** Someone takes over your assignment

**Content:**
```
Title: Emma's Soccer Practice reassigned
Body: Tom took over this event on Wednesday, Nov 20. You're no longer assigned.
Actions:
- [View Event] (opens app to event detail)
```

**Note:** No "Take It Back" quick action. User must open app to reverse if desired. This prevents toxic ping-pong battles between contentious co-parents.

---

#### 3. Assignment Change (You're Not Involved)
**Trigger:** Event you can see has assignment change, but you weren't assigned

**Content:**
```
Title: Emma's Soccer Practice assignment updated
Body: Barbara is now assigned to this event (was Tom).
Actions:
- [View Event] (opens app to event detail)
```

**When Sent:**
- To other parent members of Event Calendar
- Optional notification (can be disabled in settings)
- Useful for awareness but lower priority

---

#### 4. Self-Assignment Confirmation
**Trigger:** You assign unassigned event to yourself

**Content:**
- In-app toast only (not push notification)
- "Event assigned to you"
- Brief, immediate feedback

---

### Notification Settings

**Note:** Notification strategy and settings will be designed after core app functionality is complete. The notification triggers described in this document indicate when notifications SHOULD fire, but the specific implementation, settings UI, and user preferences will be defined in a separate notification specification.

**Notification triggers identified:**
- When event assigned to you
- When your assignment is taken over
- (Optional) When other parents' assignments change

---

## CO-PARENTING DYNAMICS ANALYSIS

### Scenario A: Contentious Co-Parents (Jennifer & Tom)

**Context:** Divorced, minimal communication, sometimes conflict over responsibilities

**Potential Issues:**

**Issue 1: Frequent "Taking" Wars**
- Jennifer doesn't trust Tom
- Keeps taking events from him
- Tom frustrated: "I was going to do it!"
- Solution: Notifications make actions visible, "Take It Back" button provides quick recourse

**Issue 2: Last-Minute Takeovers**
- Tom assigned, doesn't show up
- Jennifer forced to take over during event
- Creates resentment
- Solution: Assignment history visible (future feature: track reliability)

**Issue 3: Passive-Aggressive Assignment Dumping**
- Tom gives all events to Jennifer without discussion
- Jennifer overwhelmed
- Solution: She can give them back or reassign to others, notifications create transparency

**System Design Benefits for This Scenario:**
- ✅ No direct communication required (system mediates)
- ✅ All actions visible and traceable
- ✅ Quick recourse (take it back)
- ✅ Clear notifications prevent "I didn't know" excuses
- ❌ Can't prevent conflict, but system is neutral third party

---

### Scenario B: Collaborative Co-Parents (Sarah & Mike)

**Context:** Married, good communication, teamwork-oriented

**Usage Pattern:**

- Sarah does weekly planning, assigns most events
- Mike occasionally takes events when Sarah has conflicts
- Smooth, low-friction transfers
- Both appreciate automatic notifications

**System Design Benefits for This Scenario:**
- ✅ Quick, seamless transfers
- ✅ No coordination overhead
- ✅ Automatic calendar updates keep everyone in sync
- ✅ Can change assignments without discussion when obvious

---

### Scenario C: Multi-Parent with Helper (Jennifer, Tom, Barbara)

**Context:** Jennifer and Tom co-parent, Barbara (grandma) helps occasionally

**Usage Pattern:**

- Jennifer/Tom assign most events to themselves
- When both busy, assign to Barbara
- Barbara sometimes volunteers by taking unassigned events
- Three-way coordination complex, app simplifies

**System Design Benefits for This Scenario:**
- ✅ All three can independently act
- ✅ Clear visibility of who's handling what
- ✅ Barbara can help without needing to ask (takes unassigned)
- ✅ Notifications keep everyone informed

---

## SIMPLICITY VALIDATION

**Original Goal:** "Keep this simple and not overcomplicated"

**Design Decisions Made for Simplicity:**

1. ✅ **No Approval/Request System**
   - Direct assignment (no waiting for confirmation)
   - Faster, fewer steps
   - Trade-off: Potential for conflict, but no "Take It Back" prevents escalation

2. ✅ **No "Take It Back" Quick Action**
   - Removed from notifications to prevent toxic ping-pong battles
   - User must open app to reverse (requires deliberate action)
   - Reduces impulsive reactions

3. ✅ **Clear UI States**
   - Three distinct actions: "Give Away", "Take Over", "Assign to Me"
   - No ambiguity about what you're doing
   - Buttons show only valid actions for current state

4. ✅ **Single Setting (Not Multiple)**
   - One toggle for supplemental event retention (all-or-nothing)
   - Not separate settings for each event type, parent, or child
   - Trade-off: Not granular, but covers 95% of use cases

5. ✅ **Confirmation Asymmetry**
   - "Take Over" requires confirmation (prevents aggressive accidents)
   - "Give Away" no confirmation (your choice, quick)
   - Balance between safety and speed

6. ✅ **No Time Restrictions**
   - Can reassign anytime (during events, after events)
   - No cutoff logic to manage
   - No locked states or complex rules

7. ✅ **Last Write Wins (No Locking)**
   - No complex conflict resolution for simultaneous edits
   - Rare edge case, simple resolution
   - Trade-off: Simultaneous edits possible, but infrequent

8. ✅ **Real-Time Updates**
   - Assignment changes propagate immediately
   - No "sync" button needed
   - Works transparently via WebSocket

9. ✅ **Full Member Access**
   - New members see all events immediately
   - No tiered permissions or restricted views
   - Membership = full access

10. ✅ **One Event at a Time (MVP)**
    - No batch operations
    - Simpler to build and test
    - Can add later without architectural changes

**Complexity That Could Be Added (But Isn't for MVP):**
- ❌ Assignment requests/approvals
- ❌ "Take It Back" quick action from notifications
- ❌ Assignment notes/reasons
- ❌ Assignment history log
- ❌ Reliability scores
- ❌ Automatic assignment based on patterns
- ❌ Custody schedule integration for auto-assignment
- ❌ Conflict resolution UI for simultaneous edits
- ❌ Batch/bulk assignment operations
- ❌ Granular supplemental event retention settings
- ❌ Time-based assignment restrictions

**Decision: Keep these for Phase 2**

---

## ACCEPTANCE CRITERIA

### Assignment Transfer is Complete When:

**Core Functionality:**
1. ✅ User can give away their assignment to another parent (no confirmation)
2. ✅ User can take over assignment from another parent (with confirmation)
3. ✅ User can assign unassigned event to themselves (no confirmation)
4. ✅ Clear UI distinction between three actions
5. ✅ Confirmation modal shown for "Take Over" only
6. ✅ Immediate action for "Give Away" and "Assign to Me"

**Real-Time Updates:**
7. ✅ WebSocket connection established when app opens
8. ✅ Assignment changes broadcast to all affected parents
9. ✅ Feeds update immediately without manual refresh
10. ✅ Event disappears from assignee's "My Events" in real-time
11. ✅ Event appears in new assignee's "My Events" in real-time
12. ✅ Graceful fallback to polling if WebSocket fails

**System Behavior:**
13. ✅ Database updates on assignment change
14. ✅ Previous assignee's supplemental events handled per setting
15. ✅ New assignee's supplemental events created correctly
16. ✅ All parents' main events updated to show new assignment
17. ✅ Notification triggers identified (implementation deferred)

**Setting:**
18. ✅ Setting accessible in app settings
19. ✅ Default is OFF (delete supplemental events)
20. ✅ When ON, supplemental events marked as informational
21. ✅ Setting applied at time of reassignment
22. ✅ Single toggle (all-or-nothing, no granular control)

**Multi-Parent:**
23. ✅ Works correctly with 3+ parent members
24. ✅ All parents can independently reassign
25. ✅ New members can immediately take over any events

**No Time Restrictions:**
26. ✅ Can reassign during event (no cutoff)
27. ✅ Can reassign after event (historical changes allowed)
28. ✅ No locked states or artificial restrictions

**MVP Scope:**
29. ✅ One event at a time (no batch operations)
30. ✅ No "Take It Back" button in notifications

**Edge Cases:**
31. ✅ Simultaneous reassignments handled (last write wins)
32. ✅ Can't assign to yourself if already assigned
33. ✅ Works correctly when event times change
34. ✅ Gracefully handles Google Calendar sync failures

---

## FUTURE ENHANCEMENTS (Phase 2+)

**Assignment History:**
- Log all assignment changes
- Show timeline of who was assigned when
- "Tom has been assigned 3 times, always followed through"

**Assignment Requests:**
- "Request assignment from Tom" → Tom approves/denies
- For contentious relationships where automatic transfer causes conflict

**Assignment Notes:**
- "I'm taking this because Tom has a work conflict"
- Context for why reassignment happened
- Reduces misunderstandings

**Smart Assignment:**
- Based on custody schedule: "Tom's days with Emma"
- Based on work calendar: "Jennifer has meeting at event time"
- Based on past patterns: "Jennifer usually handles dance"

**Conflict Detection:**
- Before assigning, check if parent already assigned to overlapping event
- "Tom is already assigned to Jake's Basketball at this time"

**Bulk Reassignment:**
- **MVP:** One event at a time only
- **Phase 2:** Select multiple events → Reassign all to one parent
- **Phase 2:** "Assign all Emma's events this week to Tom"

**Rationale for MVP Limitation:**
- Simpler to build and test
- Single-event flow must work perfectly first
- Batch operations add complexity for conflict detection
- Can be added later without changing core architecture

---

*This specification defines the complete Event Assignment Transfer flow with emphasis on simplicity, clear co-parenting dynamics, and robust edge case handling. All details are locked down and ready for implementation.*
