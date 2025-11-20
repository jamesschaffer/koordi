# Event Changes from ICS Flow
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## OVERVIEW

This document defines how the system handles changes to events in source ICS calendars: new events added, existing events updated (time, location, description), and events deleted. All changes are detected automatically through periodic polling and applied without user intervention.

**Key Principles:**
- Changes detected automatically via polling (every 4 hours)
- Users see changes reflected passively - no special in-app notifications
- Google Calendar handles all user notifications for event changes
- Assignments preserved through updates when possible
- Supplemental events (drive times, early arrival) recalculated automatically when event details change
- Real-time updates via WebSocket ensure all users see changes immediately

---

## AUTOMATIC SYNC PROCESS

### Background Polling

**Frequency:** Every 4 hours (configurable)

**Process:**
1. System fetches all active Event Calendar ICS feeds
2. For each calendar:
   - Fetch current ICS feed content
   - Parse events from feed
   - Compare with events in database
   - Identify: new events, modified events, deleted events
3. Apply changes:
   - Create new events
   - Update modified events
   - Delete removed events
4. Update Google Calendars for all affected members
5. Send WebSocket updates to connected clients

**User Experience:** Completely passive - changes appear automatically

---

## NEW EVENTS ADDED

### Detection

**Trigger:** ICS feed contains event not present in database (matched by UID)

**System Actions:**
1. Parse new event details:
   - Title, date, time, location, description
   - Extract early arrival requirements, special instructions
2. Create main event in database (status: unassigned)
3. Create main event in all Event Calendar members' Google Calendars
4. Do NOT create supplemental events (no one assigned yet)
5. Send WebSocket updates

**User Experience:**

**All Event Calendar Members:**
- New event appears in "Unassigned Events" feed
- Event shows in Google Calendar
- Google Calendar may send notification (based on user's Google Calendar settings)
- Event available for assignment

**Example:**
```
League adds new game to ICS feed
↓
Next sync detects new event
↓
"Emma - Soccer Game" appears in app
- Shows in Unassigned Events tab
- Shows in Google Calendar (unassigned)
- Available for parent to assign to themselves
```

**No Special Notification:** Users discover new events organically when checking calendar or app

---

## EVENT TIME CHANGES

### Detection

**Trigger:** Existing event's date/time changes in ICS feed

**Examples:**
- Game moved from 5:30 PM to 6:00 PM
- Practice moved to different day
- Event duration changes

**System Actions:**
1. Detect time change (compare with database)
2. Update main event in database
3. Update main event in all members' Google Calendars
4. **If event is assigned:**
   - Recalculate supplemental events based on new time
   - Update departure time (drive time may change due to traffic patterns)
   - Update "arrive early" event time
   - Update "drive home" event time
   - Update all supplemental events in assigned parent's Google Calendar
5. Send WebSocket updates

**User Experience:**

**Assigned Parent:**
- Event time updates in Google Calendar
- Google Calendar sends "Event updated" notification (standard Google behavior)
- Supplemental events update automatically to match new time
- New departure time calculated (may be different if traffic patterns change)

**Other Members:**
- Main event updates in their Google Calendar
- Google Calendar sends "Event updated" notification

**Example:**
```
Before: Soccer Practice - Wednesday 5:30 PM
League changes to: Soccer Practice - Wednesday 6:00 PM

Jennifer (assigned):
- Google Calendar shows updated time
- Gets Google notification: "Event updated: Emma - Soccer Practice"
- Departure time recalculated: Leave by 5:05 PM (was 4:35 PM)
- Drive time events adjust automatically

Tom (not assigned):
- Google Calendar shows updated time  
- Gets Google notification: "Event updated: Emma - Soccer Practice"
- No supplemental events (not assigned)
```

**Significant Time Changes:**
- If event moves to completely different time (morning to evening), drive time may significantly change due to traffic
- System automatically recalculates with current traffic patterns for new time

---

## EVENT LOCATION CHANGES

### Detection

**Trigger:** Event location/address changes in ICS feed

**Examples:**
- Field changed from "Field A" to "Field B" (different addresses)
- Venue changed entirely
- Location added to previously location-less event

**System Actions:**
1. Detect location change
2. Update main event in database
3. Update main event in all members' Google Calendars
4. **If event is assigned:**
   - Geocode new location
   - Recalculate drive time TO event
   - Recalculate drive time FROM event back home
   - Update departure time
   - Update return home time
   - Update all supplemental events in assigned parent's Google Calendar
5. Send WebSocket updates

**User Experience:**

**Assigned Parent:**
- Event location updates in Google Calendar
- Google Calendar sends "Event updated" notification
- Departure time recalculated based on new location
- Return home time recalculated
- All drive time events update automatically

**Other Members:**
- Location updates in their Google Calendar
- Google Calendar sends "Event updated" notification

**Example:**
```
Before: Soccer Practice at Riverside Park (25 min drive)
League changes to: Soccer Practice at Central Stadium (40 min drive)

Jennifer (assigned):
- Google Calendar shows new location
- Gets Google notification: "Event updated: Emma - Soccer Practice"
- Departure time recalculated: Leave by 4:20 PM (was 4:35 PM - needs to leave earlier)
- Drive home time updates: Back home by 7:10 PM (was 6:55 PM)
```

---

## EVENT DESCRIPTION CHANGES

### Detection

**Trigger:** Event description text changes in ICS feed

**Examples:**
- Early arrival requirement added or changed: "Arrive 30 min early" → "Arrive 45 min early"
- Special instructions updated: "Wear blue jersey" → "Wear white jersey"
- Items to bring changed: "Bring water" → "Bring water and snack for team"

**System Actions:**
1. Detect description change
2. Re-parse description for:
   - Early arrival requirements
   - Special instructions
   - Items to bring
   - Contact information
3. Update parsed data in database
4. Update main event description in all members' Google Calendars
5. **If early arrival requirement changed AND event is assigned:**
   - Recalculate "arrive early" supplemental event
   - Adjust departure time accordingly
   - Update supplemental events in assigned parent's Google Calendar
6. Send WebSocket updates

**User Experience:**

**All Members:**
- Updated description/instructions visible in Google Calendar
- Google Calendar sends "Event updated" notification
- App shows updated special instructions in event detail

**Assigned Parent (if early arrival changed):**
- Departure time recalculated if early arrival buffer changed
- Supplemental events update automatically

**Example:**
```
Before: "Arrive 20 minutes early for warm-ups. Wear blue jersey."
League changes to: "Arrive 45 minutes early for team meeting. Wear white jersey."

Jennifer (assigned):
- Early arrival requirement increased by 25 minutes
- Departure time recalculated: Leave by 4:10 PM (was 4:35 PM)
- "Arrive early" event extends: 4:45 PM - 5:30 PM (was 5:10 PM - 5:30 PM)
- App shows updated instruction: "Wear white jersey"
```

---

## EVENT DELETED FROM ICS

### Detection

**Trigger:** Event present in database but missing from ICS feed (matched by UID)

**Reason:** Activity coordinator canceled event and removed from calendar

**System Actions:**
1. Detect event deletion
2. Delete main event from database
3. Delete main event from all members' Google Calendars
4. **If event was assigned:**
   - Delete all supplemental events from assigned parent's Google Calendar
   - Clear assignment record
5. Send WebSocket updates

**User Experience:**

**All Members:**
- Event disappears from Google Calendar
- Google Calendar sends "Event canceled" notification (standard Google behavior)
- Event disappears from app feeds

**Assigned Parent:**
- Gets cancellation notification from Google Calendar
- Supplemental events (drive times) deleted automatically
- Event no longer in "My Events" feed

**Example:**
```
League cancels Saturday game due to weather
↓
Event removed from ICS feed
↓
Next sync detects deletion
↓
Event deleted from everyone's calendar

Jennifer (was assigned):
- Google Calendar notification: "Event canceled: Emma - Soccer Game"
- All 4 events deleted (drive to, arrive early, main, drive home)
- Event disappears from "My Events" feed

Tom (not assigned):
- Google Calendar notification: "Event canceled: Emma - Soccer Game"
- Main event deleted
```

**Critical:** This is why automatic polling is important - parents need to know about cancellations promptly

---

## MULTIPLE EVENTS CHANGE SIMULTANEOUSLY

### Scenario

**Examples:**
- League reschedules entire season (20+ games change times)
- Tournament added with 5+ games at once
- Venue changes affect multiple events
- League cancels multiple events

**System Actions:**
1. Detect all changes in single sync cycle
2. Process all changes as batch:
   - New events created
   - Updated events modified
   - Deleted events removed
3. Update Google Calendars in batch
4. Send single WebSocket update with all changes

**User Experience:**

**Google Calendar Notifications:**
- Users receive multiple notification emails from Google Calendar
- One email per changed event (Google's standard behavior)
- Emails may arrive in quick succession or batched by Google

**In App:**
- Multiple events appear/update/disappear simultaneously
- Changes reflected in real-time via WebSocket
- No special summary or notification in app
- Users process changes via their normal Google Calendar workflow

**No Special Handling in MVP:**
- Accept that users may get multiple emails from Google
- Users already familiar with Google Calendar's notification behavior
- Source ICS calendar's managing application (league software) may also send notifications
- We rely on Google Calendar as primary notification channel

---

## EDGE CASES & USER EXPERIENCE

### Event Updated While User Viewing

**Scenario:** User viewing event detail screen when event is updated by sync

**User Experience:**
- WebSocket update received
- Event detail screen updates in real-time
- No disruptive modal or redirect
- User sees updated information immediately

**Example:**
```
Jennifer viewing "Emma - Soccer Practice" detail
↓
Sync updates event time: 5:30 PM → 6:00 PM
↓
Screen updates:
- Event time changes
- Departure time updates
- "Leave by" time adjusts
All without losing her place
```

---

### Event Deleted While User Viewing

**Scenario:** User viewing event detail when event is deleted from ICS

**User Experience:**
- WebSocket update received
- Modal appears over detail screen:

```
┌─────────────────────────────────────┐
│ Event Canceled                      │
│                                     │
│ This event has been removed by      │
│ the activity coordinator.           │
│                                     │
│ [Return to Events]                  │
└─────────────────────────────────────┘
```

**User Action:** Tap button to return to event feed

---

### Event Assigned When Updated

**Scenario:** Parent A assigns event to themselves, then event time changes in ICS

**System Behavior:**
- Assignment preserved
- Supplemental events recalculated for new time
- Parent A still assigned, sees updated times

**Example:**
```
10:00 AM - Jennifer assigns Emma's Soccer to herself
10:15 AM - League changes game time in ICS
12:00 PM - Sync detects time change
12:01 PM - Jennifer's supplemental events update
         - Assignment remains: Jennifer still responsible
         - New departure time calculated
```

**Key Point:** Assignments survive through event updates

---

### Event Assignment Transfer During Sync

**Scenario:** Parent A reassigns to Parent B at same moment sync updates event

**System Behavior:**
- Race condition possible
- Last write wins (assignment or sync update)
- WebSocket ensures all users see final state
- Both operations succeed, final state is consistent

**Mitigation:** Optimistic locking or transaction handling at database level (technical implementation detail)

---

### Sync Failure During Multi-Event Update

**Scenario:** Sync detects 20 event changes, but API fails mid-update

**System Behavior:**
- Partial updates possible (some events updated, some not)
- Next sync cycle will detect and apply remaining changes
- System is eventually consistent
- Retry logic handles temporary failures

**User Experience:**
- Some events update immediately
- Others update on next successful sync
- Appears as slight delay, not failure
- No user action required

---

### Unassigned Event Updated

**Scenario:** Event sits unassigned, then time/location changes

**System Behavior:**
- Main event updates in all members' calendars
- No supplemental events to update (not assigned)
- Event remains unassigned after update

**User Experience:**
- All members see updated time/location in Google Calendar
- Event still shows in "Unassigned Events" feed
- Available for assignment with new details

---

### Assigned Event Becomes Virtual (Location Removed)

**Scenario:** Event had location, now shows as virtual/online meeting

**System Behavior:**
- Detect location removed
- Delete supplemental events (no drive time for virtual event)
- Keep main event with assignment

**User Experience:**

**Assigned Parent:**
- Drive time events deleted from Google Calendar
- Main event remains (still their responsibility)
- No "Leave by" time shown in app (virtual event)

---

## ASSIGNMENT PRESERVATION RULES

### When Assignments Are Preserved

**Preserved Through:**
- Time changes
- Location changes
- Description changes
- Date changes (event rescheduled)
- Title changes (minor wording updates)

**Logic:** If event UID remains same, assignment preserved

---

### When Assignments Are Cleared

**Cleared When:**
- Event deleted from ICS (no event to assign)
- Event Calendar deleted (all events removed)
- Parent member removed from Event Calendar

**Not Cleared When:**
- Event details change
- Event time changes significantly
- Event location changes

---

## SYNC STATUS VISIBILITY

### In Event Calendars List

**Normal Sync:**
```
⚽ Emma's Soccer League
Owner: You
24 events • Last synced 2 hours ago
```

**Sync Failed:**
```
⚽ Emma's Soccer League
Owner: You  
24 events • ⚠️ Sync Failed
Last synced 2 days ago
```

---

### In Event Calendar Detail

**Normal Sync:**
```
SYNC STATUS
✅ Active
Last synced: 2 hours ago
Next sync: in 2 hours

[Refresh Now]
```

**Sync Failed:**
```
SYNC STATUS
⚠️ Sync Failed
Last synced: 2 days ago
Last attempt: 10 minutes ago

Unable to reach calendar feed.
The URL may have changed or the 
server may be down.

[Retry Now]
[Get Help]
```

---

## REAL-TIME UPDATES

### WebSocket Updates

**When Changes Detected:**
1. Sync completes with changes
2. WebSocket message sent to all Event Calendar members
3. Message includes: event IDs affected, change types
4. Connected clients update immediately

**Update Types:**
- `event_created` - New event added
- `event_updated` - Event details changed
- `event_deleted` - Event removed

**User Experience:**
- Changes appear immediately in app (if open)
- No refresh required
- Seamless, real-time coordination
- All parents see same information simultaneously

---

## TECHNICAL CONSIDERATIONS (NOT USER FLOWS)

The following are architectural and technical implementation questions that need to be addressed separately from user flows:

### 1. ICS Change Detection Strategy

**Question:** How do we efficiently detect what changed in an ICS feed?

**Considerations:**
- Compare UID + LAST-MODIFIED timestamp?
- Hash entire event and compare?
- Store previous ICS feed and diff?
- What if UID changes but event clearly the same?
- How handle events with no UID?
- Performance with large calendars (100+ events)

**Decision Needed:** Optimal strategy for change detection

---

### 2. Massive Change Handling

**Question:** How do we handle 50+ events changing at once without overwhelming users?

**Scenarios:**
- League reschedules entire season
- Tournament added (10+ games)
- Venue changes affect many events

**Considerations:**
- Batch processing of updates
- Rate limiting API calls
- Notification consolidation (if we ever add in-app notifications)
- Performance impact on Google Calendar API
- User experience with many Google Calendar emails

**Decision Needed:** 
- Batching strategy for updates
- Notification throttling/summarization approach (future)
- API rate limit handling

---

### 3. Sync Scheduling & Staggering

**Question:** How do we efficiently poll multiple Event Calendars?

**Considerations:**
- Don't poll all calendars simultaneously
- Stagger requests over 4-hour window
- Prioritize calendars with upcoming events
- Handle API rate limits
- Retry strategy for failed syncs

**Decision Needed:**
- Staggering algorithm
- Priority rules
- Backoff strategy for failures

---

### 4. Conflict Resolution

**Question:** What happens when sync update conflicts with user action?

**Scenarios:**
- User assigning event as sync updates it
- User editing event details as sync changes them
- Multiple syncs detecting different states

**Considerations:**
- Optimistic locking
- Last-write-wins vs. merge strategies
- Transaction isolation levels
- Eventual consistency guarantees

**Decision Needed:**
- Conflict resolution strategy
- Consistency model

---

### 5. Event Matching & Identity

**Question:** How do we know ICS event "A" is same as database event "B"?

**Considerations:**
- Primary match: UID field in ICS
- Fallback: Title + date + time + location?
- What if UID missing or changes?
- What if all details match but UID different?
- Duplicate detection

**Decision Needed:**
- Matching algorithm
- Fallback strategies
- Confidence thresholds

---

### 6. Partial Sync Failures

**Question:** How do we handle when some events update but others fail?

**Considerations:**
- Transaction vs. eventual consistency
- Rollback strategy or continue?
- User visibility of partial state
- Recovery mechanism

**Decision Needed:**
- Error handling approach
- Retry strategy
- State management

---

## SUCCESS CRITERIA

**Automatic Sync:**
1. ✅ System polls ICS feeds every 4 hours
2. ✅ New events created automatically (unassigned)
3. ✅ Event updates applied automatically
4. ✅ Deleted events removed from all calendars
5. ✅ Changes reflected in real-time via WebSocket
6. ✅ No user intervention required

**Event Updates:**
7. ✅ Time changes update supplemental events
8. ✅ Location changes recalculate drive times
9. ✅ Description changes re-parse instructions
10. ✅ Assignments preserved through updates
11. ✅ Google Calendar events update automatically

**User Experience:**
12. ✅ Changes appear passively (no special notifications)
13. ✅ Google Calendar handles all user notifications
14. ✅ Event detail screen updates in real-time
15. ✅ Deleted events show cancellation modal
16. ✅ All members see same information simultaneously

**Edge Cases:**
17. ✅ Updates during viewing handled gracefully
18. ✅ Deletions during viewing show clear message
19. ✅ Assignment during update preserves assignment
20. ✅ Unassigned events update without issues
21. ✅ Virtual event conversion removes drive times
22. ✅ Multiple simultaneous changes processed correctly

**Sync Status:**
23. ✅ Sync status visible in Event Calendar list
24. ✅ Sync failures clearly indicated
25. ✅ Last sync time displayed
26. ✅ Manual refresh available

---

## FUTURE ENHANCEMENTS (Phase 2+)

**Smart Notifications:**
- In-app notifications for critical changes (cancellations, time changes for assigned events)
- Consolidated change summary for multiple events
- Notification preferences (which changes to be notified about)

**Change History:**
- View history of event changes
- "What changed?" comparison view
- Audit log for troubleshooting

**Predictive Updates:**
- Detect patterns in changes (e.g., league always changes times on Thursdays)
- Proactive warnings about likely changes
- Confidence scores on event stability

**Advanced Sync:**
- Smart polling frequency (more frequent near event times)
- Priority sync for assigned events
- Webhook support (if ICS source supports it)

**User Control:**
- Freeze event from updates (if user has edited locally)
- Selective sync (pause specific Event Calendars)
- Manual conflict resolution UI

---

*This specification defines the complete Event Changes from ICS flow with emphasis on automatic, passive updates, Google Calendar notification reliance, and assignment preservation. Technical implementation questions are identified separately for architectural decision-making. All user-facing details are locked down and ready for implementation.*
