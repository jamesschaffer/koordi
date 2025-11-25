# Event Calendar Management Flow
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## OVERVIEW

This document defines how users manage Event Calendars throughout their lifecycle: adding additional calendars after onboarding, viewing calendar details, manually refreshing, handling sync failures, and deleting calendars.

**Key Principles:**
- ICS URLs are locked after creation (cannot be edited)
- Only calendar owner can delete Event Calendar
- Deletion requires high friction (destructive action)
- Manual refresh available for immediate sync
- Automatic periodic polling ensures calendars stay synchronized
- Failed syncs preserve existing events until resolved

---

## EVENT CALENDAR LIFECYCLE

### States

**Active:**
- ICS feed syncing successfully
- Events importing normally
- Displayed in app

**Sync Failed:**
- ICS feed unreachable or returning errors
- Existing events preserved
- Error indicator shown
- Manual retry available

**Deleted:**
- Event Calendar removed
- All events deleted from all parents' Google Calendars
- Cannot be recovered (must re-add)

---

## ADDING ADDITIONAL EVENT CALENDARS

### Entry Points

**From Dashboard:**
- Floating "+" button (bottom right)
- Taps "+" → "Add Event Calendar"

**From Settings:**
- Settings → Event Calendars → "Add Event Calendar"

**From Child Detail:**
- View child → "Add Calendar for [Child Name]"

---

### Add Calendar Flow

**Identical to onboarding flow (Steps 3-5):**

1. **Enter ICS URL**
   - Paste URL
   - Validate format
   - Test fetch calendar

2. **Name Calendar**
   - Input: "Emma's Dance Class"
   - Validate uniqueness (within same child)

3. **Select or Create Child**
   - Dropdown shows existing children
   - Or create new child
   - If existing child selected: optionally pre-select parents from other calendars

4. **Add Parent Members**
   - Select from existing parents or add new emails
   - Send invitations
   - Owner automatically added as member

5. **Preview & Confirm**
   - Shows upcoming events from ICS
   - Confirms calendar will be added
   - User taps "Add Calendar"

6. **Success**
   - Calendar added
   - Events begin importing
   - All parent members notified

---

## VIEWING EVENT CALENDAR DETAILS

### Entry Point

**From Settings:**
- Settings → Event Calendars → Tap calendar name

---

### Calendar Detail Screen

**Display Information:**

```
┌─────────────────────────────────────┐
│ Emma's Soccer League                │
│ ⚽️ (calendar icon/emoji)            │
├─────────────────────────────────────┤
│ Associated Child: Emma              │
│ Owner: You                          │
│ Members: You, Tom                   │
├─────────────────────────────────────┤
│ ICS Feed:                           │
│ https://league.com/cal/emma.ics     │
│ (not editable - locked)             │
├─────────────────────────────────────┤
│ Last Synced: Nov 18, 2:30 PM        │
│ Status: ✅ Active                   │
│                                     │
│ [Refresh Now]                       │
├─────────────────────────────────────┤
│ Events: 24 upcoming                 │
│ Next Event: Nov 20, 5:30 PM         │
├─────────────────────────────────────┤
│ [View All Events]                   │
│ [Manage Members]                    │
│ [Delete Calendar]                   │
└─────────────────────────────────────┘
```

**Available Actions:**
- Refresh Now (manual sync)
- View All Events (filtered list of events from this calendar)
- Manage Members (add/remove parent members)
- Delete Calendar (owner only, high friction)

---

## MANUAL REFRESH

### Trigger

User taps "Refresh Now" on Calendar Detail screen

---

### Flow

**Step 1: Initiate Refresh**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Refreshing Emma's Soccer League...  │
│ [Loading spinner]                   │
└─────────────────────────────────────┘
```

**System Actions:**
1. Fetch ICS feed from URL
2. Parse events
3. Compare with existing events in database
4. Identify: new events, changed events, deleted events

---

**Step 2A: Successful Refresh**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ✅ Refresh Complete                 │
│                                     │
│ 2 new events added                  │
│ 1 event updated                     │
│ 1 event removed                     │
│                                     │
│ Last Synced: Just now               │
└─────────────────────────────────────┘
```

**System Actions:**
1. **New Events:** Create events in all parent members' Google Calendars (unassigned)
2. **Changed Events:** Update existing events (preserve assignments)
3. **Deleted Events:** Remove from all Google Calendars
4. Update "Last Synced" timestamp
5. Send WebSocket updates to all connected users

**User Returns to Calendar Detail Screen:**
- Updated sync timestamp shown
- Changes reflected in event count

---

**Step 2B: Failed Refresh**

**Scenario:** ICS feed unreachable, invalid, or returns error

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Refresh Failed                   │
│                                     │
│ Unable to connect to calendar feed. │
│ Existing events are preserved.      │
│                                     │
│ [Retry]     [Cancel]                │
└─────────────────────────────────────┘
```

**System Actions:**
1. Log error with details
2. Preserve existing events (do not delete)
3. Mark calendar status as "Sync Failed"
4. Show error indicator on Calendar Detail screen

**User Options:**
- **Retry:** Immediately attempt refresh again
- **Cancel:** Return to Calendar Detail with error shown

---

## AUTOMATIC PERIODIC SYNC

### Background Process

**Frequency:** Every 15 minutes (configurable)

**Process:**
1. System fetches all active Event Calendar ICS feeds
2. For each calendar:
   - Fetch ICS feed
   - Parse events
   - Compare with database
   - Apply changes (new, updated, deleted)
   - Update Google Calendars for all members
3. Log sync results
4. Update "Last Synced" timestamps

**Error Handling:**
- Failed syncs logged but do not affect existing events
- Retry on next scheduled poll
- Users notified in app if calendar has failed multiple consecutive syncs

**Events Automatically Handled:**
- **New events:** Added to all members' calendars (unassigned)
- **Time changes:** Updated in place (assignments preserved)
- **Cancellations:** Removed from all calendars
- **Location changes:** Updated in events

---

## SYNC FAILURE HANDLING

### Failed Sync Indicator

**On Calendar Detail Screen:**
```
┌─────────────────────────────────────┐
│ Emma's Soccer League                │
│ ⚽️                                   │
├─────────────────────────────────────┤
│ Status: ⚠️ Sync Failed              │
│ Last Successful Sync: Nov 15, 3 PM  │
│                                     │
│ Unable to reach calendar feed.      │
│ Existing events are preserved.      │
│                                     │
│ [Retry Now]                         │
└─────────────────────────────────────┘
```

**On Dashboard/Settings List:**
```
📅 Emma's Soccer League  ⚠️
   Last synced: Nov 15, 3 PM
```

---

### Extended Failure

**Scenario:** Calendar has failed to sync for 7+ days

**User Notification:**
- In-app banner on dashboard
- Push notification (if enabled)
- Email to owner

**Message:**
```
⚠️ Sync Issue
Emma's Soccer League hasn't synced since Nov 15.
Existing events are still visible, but new events may be missing.
Check the ICS feed URL or contact the calendar provider.
[View Details]
```

**Preserved Functionality:**
- Existing events remain visible
- Users can still assign and manage existing events
- Assignments work normally
- No events automatically deleted

**Resolution:**
- User taps "Retry Now" and sync succeeds
- Or user contacts calendar provider to fix feed
- Or user deletes and re-adds calendar with new URL

---

## DELETING EVENT CALENDAR

### Prerequisites

**Only calendar owner can delete:**
- If owner tries to delete: proceeds with flow below
- If non-owner tries: "Only the calendar owner can delete this calendar. Contact [owner name] to request removal."

---

### Deletion Flow

**Step 1: Initiate Deletion**

**Trigger:** Owner taps "Delete Calendar" on Calendar Detail screen

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Delete Calendar?                 │
│                                     │
│ This will permanently delete:       │
│ • 24 upcoming events                │
│ • All event assignments             │
│                                     │
│ Events will be removed from:        │
│ • Your Google Calendar              │
│ • Tom's Google Calendar             │
│                                     │
│ This cannot be undone.              │
│                                     │
│ [Cancel]     [Delete]               │
└─────────────────────────────────────┘
```

**High Friction:** User must explicitly understand impact before proceeding

---

**Step 2: Confirm Deletion**

**Trigger:** User taps "Delete"

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Type calendar name to confirm:      │
│                                     │
│ [ Emma's Soccer League ]            │
│                                     │
│ Type exactly: Emma's Soccer League  │
│                                     │
│ [Cancel]     [Confirm Delete]       │
└─────────────────────────────────────┘
```

**Validation:**
- Input must exactly match calendar name (case-sensitive)
- "Confirm Delete" button disabled until match
- Forces user to slow down and confirm intent

---

**Step 3: Deletion In Progress**

**Trigger:** User completes name confirmation and taps "Confirm Delete"

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Deleting Emma's Soccer League...    │
│ [Progress bar]                      │
│                                     │
│ Removing events from calendars...   │
└─────────────────────────────────────┘
```

**System Actions:**
1. Delete all events from owner's Google Calendar
2. Delete all events from all member Google Calendars
3. Remove Event Calendar from database
4. Remove calendar from all parent members' views
5. Send WebSocket updates to all connected members

**Processing Time:**
- Small calendars (<50 events): 2-5 seconds
- Large calendars (100+ events): 10-20 seconds

---

**Step 4: Deletion Complete**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ✅ Calendar Deleted                 │
│                                     │
│ Emma's Soccer League and all        │
│ associated events have been removed.│
│                                     │
│ [Return to Settings]                │
└─────────────────────────────────────┘
```

**User Returns to:** Settings → Event Calendars list (deleted calendar no longer shown)

---

**Step 5: Other Members Notified**

**Real-Time Update via WebSocket:**
- Calendar immediately disappears from their Settings → Event Calendars
- All events from that calendar disappear from their feeds
- If viewing an event from deleted calendar: screen shows "This event has been removed"

**Push Notification (Optional):**
```
Calendar Removed
[Owner name] deleted Emma's Soccer League.
All events have been removed from your calendar.
```

---

## EDGE CASES & ERROR HANDLING

### Duplicate ICS URLs

**Scenario:** User tries to add Event Calendar with URL already used in another calendar

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Calendar Already Added           │
│                                     │
│ This ICS feed is already being used │
│ by "Emma's Soccer League"           │
│                                     │
│ [View Existing Calendar] [Cancel]   │
└─────────────────────────────────────┘
```

**System Action:** Prevent duplicate, direct user to existing calendar

---

### Empty Calendar

**Scenario:** ICS feed has no events

**Screen Display (on preview during add):**
```
┌─────────────────────────────────────┐
│ No events found in this calendar.   │
│ You can still add it - events may   │
│ be added later.                     │
│                                     │
│ [Cancel]     [Add Anyway]           │
└─────────────────────────────────────┘
```

**System Action:** Allow adding empty calendar, will populate on future syncs

---

### Deletion While Other Parent Viewing

**Scenario:** Owner deletes calendar while co-parent is viewing event from that calendar

**Co-parent's Screen:**
- WebSocket update received
- Modal appears over event detail:

```
┌─────────────────────────────────────┐
│ Event Removed                       │
│                                     │
│ This event was deleted when         │
│ [owner name] removed the calendar.  │
│                                     │
│ [Return to Dashboard]               │
└─────────────────────────────────────┘
```

---

### Failed Deletion

**Scenario:** Google Calendar API fails during bulk event deletion

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Deletion Failed                  │
│                                     │
│ Unable to complete deletion.        │
│ Some events may not have been       │
│ removed from calendars.             │
│                                     │
│ [Retry]     [Cancel]                │
└─────────────────────────────────────┘
```

**System Action:**
- Log which events/calendars failed
- Retry mechanism
- If retry fails: manual cleanup required (support escalation)

---

### Re-adding Deleted Calendar

**Scenario:** User deletes calendar, then adds it back with same ICS URL

**System Action:**
- Treated as completely new calendar
- No historical data preserved
- All events imported as new
- Assignments start fresh (all unassigned)

---

### Large Calendar Deletion

**Scenario:** Calendar has 100+ events

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Deleting Emma's Soccer League...    │
│ [Progress bar: 45%]                 │
│                                     │
│ Removing 156 events...              │
│ This may take a moment.             │
└─────────────────────────────────────┘
```

**System Action:**
- Show progress indicator
- Process in batches to avoid API rate limits
- Estimated time displayed

---

## TECHNICAL REQUIREMENTS

### ICS Polling
- Scheduled job every 15 minutes
- Fetch all active Event Calendar feeds
- Compare events, apply changes
- Update Google Calendars
- Log sync results

### Manual Refresh
- On-demand fetch triggered by user
- Same comparison logic as automatic sync
- Immediate feedback to user

### Deletion
- Batch delete from Google Calendar API
- Transaction-like behavior (all or nothing when possible)
- WebSocket updates to all members
- Comprehensive logging

### Error Handling
- Failed syncs preserve existing events
- Automatic retry on next poll
- User notifications for extended failures
- Graceful degradation

---

## SUCCESS CRITERIA

**Adding Calendar:**
1. ✅ User can add multiple Event Calendars
2. ✅ ICS URL validated on entry
3. ✅ Calendar previewed before adding
4. ✅ Events imported correctly
5. ✅ All members added successfully

**Viewing Details:**
6. ✅ Calendar information displayed accurately
7. ✅ ICS URL shown but not editable
8. ✅ Sync status clear
9. ✅ Member list current

**Manual Refresh:**
10. ✅ Refresh completes within 10 seconds (small calendar)
11. ✅ New events appear immediately
12. ✅ Changed events updated correctly
13. ✅ Deleted events removed
14. ✅ Success message shown
15. ✅ Last synced timestamp updated

**Automatic Sync:**
16. ✅ Polls every 15 minutes
17. ✅ All calendars synced successfully
18. ✅ Events updated automatically
19. ✅ No user intervention required
20. ✅ Failures logged and handled

**Sync Failures:**
21. ✅ Error indicator shown clearly
22. ✅ Existing events preserved
23. ✅ Retry available
24. ✅ Extended failure notifications sent
25. ✅ User understands impact
26. ✅ Events remain functional
27. ✅ Resolution path clear
28. ✅ Automatic retry on next poll
29. ✅ Recovery handled gracefully when sync succeeds

**Deletion:**
30. ✅ Only owner can delete Event Calendar
31. ✅ High friction: Initial confirmation modal
32. ✅ High friction: Must type calendar name
33. ✅ Shows impact (number of events, affected parents)
34. ✅ Progress indicator during deletion
35. ✅ All events removed from all Google Calendars
36. ✅ All parent members see calendar removed (real-time)
37. ✅ Confirmation message shown after deletion
38. ✅ Cannot undo deletion

**Edge Cases:**
39. ✅ Duplicate ICS URLs prevented with clear error
40. ✅ Empty calendars (0 events) handled gracefully
41. ✅ Deletion while other parent viewing handled
42. ✅ Failed deletion handled with retry
43. ✅ Re-adding deleted calendar works correctly
44. ✅ Large calendars (100+ events) handled efficiently

---

## FUTURE ENHANCEMENTS (Phase 2+)

**Edit ICS URL:**
- Allow owner to update ICS URL if it changes
- Validate new URL before saving
- Maintain existing events and assignments

**Transfer Ownership:**
- Owner can designate new owner
- Useful if primary coordinator changes
- New owner gains delete permissions

**Calendar Archiving:**
- Instead of deletion, archive old calendars
- Keep events for historical reference
- Don't sync new events
- Can unarchive if needed

**Sync History:**
- Log of all sync attempts
- Shows what changed each time
- Useful for debugging

**Smart Sync Scheduling:**
- More frequent polling near event times
- Less frequent for distant events
- Adaptive based on calendar activity

**Batch Calendar Operations:**
- Add multiple calendars at once
- Delete multiple calendars
- Bulk refresh

**Calendar Sharing Link:**
- Generate share link for Event Calendar
- Anyone with link can join as member
- Easier than email invitations

---

*This specification defines the complete Event Calendar Management flow with emphasis on locked ICS URLs, high-friction owner-only deletion, manual refresh capability, and robust sync failure handling. All details are locked down and ready for implementation.*
