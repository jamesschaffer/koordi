# Conflict Detection & Resolution Flow
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## OVERVIEW

This document defines how the app detects scheduling conflicts, displays them to users, and supports resolution. Conflicts occur when a single parent is assigned to overlapping events and cannot physically be in two places at once.

**Core Principle:** Warn users about conflicts but never prevent assignment. Users may have valid reasons for accepting conflicts (e.g., backup plans, carpools, delegating to others).

---

## WHAT CONSTITUTES A CONFLICT

### Conflict Definition

**A conflict exists when:**
- **Same parent** is assigned to two events
- **Total time commitment overlaps** (not just event times)
- Total time = Leave home → Drive to event → Early arrival → Event → Drive home

**Key Point:** Conflicts are based on the FULL time commitment including supplemental events (drive times and early arrival), not just the main event times.

---

### Conflict Examples

#### Example 1: Clear Overlap - CONFLICT ⚠️

**Events:**
- Emma's Soccer Practice
  - Event time: 5:30 PM - 6:30 PM
  - Leave by: 4:30 PM
  - Back home: 7:15 PM
  - **Total commitment: 4:30 PM - 7:15 PM**

- Jake's Basketball Practice
  - Event time: 6:00 PM - 7:00 PM
  - Leave by: 5:20 PM
  - Back home: 7:45 PM
  - **Total commitment: 5:20 PM - 7:45 PM**

**Both assigned to Jennifer**

**Conflict:** YES
- Overlap period: 5:20 PM - 7:15 PM
- Jennifer cannot be at Emma's soccer and also leave for Jake's basketball

---

#### Example 2: Sequential Events with Insufficient Gap - CONFLICT ⚠️

**Events:**
- Emma's Soccer Practice
  - Event time: 5:30 PM - 6:30 PM
  - Back home: 7:00 PM

- Jake's Piano Lesson
  - Event time: 7:00 PM - 7:45 PM
  - Leave by: 6:50 PM

**Both assigned to Jennifer**

**Conflict:** YES
- Jennifer arrives home from soccer at 7:00 PM
- Needs to leave for piano at 6:50 PM
- Gap is negative (needs to leave 10 minutes before arriving home)

---

#### Example 3: Different Parents - NO CONFLICT ✓

**Events:**
- Emma's Soccer (4:30 PM - 7:15 PM) → Assigned to Jennifer
- Jake's Basketball (5:20 PM - 7:45 PM) → Assigned to Tom

**Conflict:** NO
- Different parents handling different children
- Both can execute their assignments simultaneously
- No conflict exists

---

#### Example 4: Same Child, Different Parents - NO CONFLICT ✓

**Events:**
- Emma's Soccer (5:30 PM - 6:30 PM) → Assigned to Jennifer
- Emma's Dance (7:00 PM - 8:00 PM) → Assigned to Tom

**Conflict:** NO
- Emma can only be at one event, but that's a parenting coordination issue
- From system's perspective: different parents, no scheduling conflict
- Each parent can fulfill their assigned responsibility

**Note:** The app doesn't prevent illogical assignments (Emma in two places). It only detects scheduling impossibilities for individual parents.

---

#### Example 5: Adequate Gap - NO CONFLICT ✓

**Events:**
- Emma's Soccer Practice
  - Event time: 5:30 PM - 6:30 PM
  - Back home: 7:00 PM

- Jake's Piano Lesson
  - Event time: 7:30 PM - 8:15 PM
  - Leave by: 7:15 PM

**Both assigned to Jennifer**

**Conflict:** NO
- Jennifer arrives home at 7:00 PM
- Needs to leave again at 7:15 PM
- 15-minute gap is sufficient
- Sequential but feasible

---

## WHEN CONFLICTS ARE DETECTED

### Detection Trigger 1: At Assignment (Real-Time)

**Scenario:** User attempts to assign an event to themselves (or give to another parent)

**Process:**
1. User selects assignment action
2. **Before** confirming assignment, system checks for conflicts
3. Compares new event's total time commitment against all existing assignments for that parent
4. If conflict detected → Show warning modal
5. User decides: Cancel or Assign Anyway

**Example Flow:**
- Jennifer opens unassigned event: Jake's Basketball (5:20 PM - 7:45 PM)
- Taps "Assign to Me"
- System checks: Jennifer already assigned to Emma's Soccer (4:30 PM - 7:15 PM)
- **Conflict detected** → Show warning modal
- Jennifer can cancel or proceed with assignment

---

### Detection Trigger 2: Background Monitoring (Continuous)

**Scenario:** Events change in ICS feed, or existing assignments shift

**Process:**
1. System continuously monitors all assigned events
2. When event time changes in ICS feed:
   - Recalculate total time commitment (new drive times, etc.)
   - Check if new timing creates conflicts with other assignments
3. When new events imported from ICS:
   - If auto-assigned (future feature), check for conflicts
4. Update conflict indicators in real-time via WebSocket

**Example Scenario:**
- Jennifer assigned to Emma's Soccer (5:30 PM) and Jake's Basketball (6:30 PM)
- No conflict initially (adequate gap)
- ICS feed updates: Soccer now ends at 7:00 PM (ran long)
- System recalculates: Soccer now 4:30 PM - 7:30 PM
- **New conflict detected** with Basketball (5:20 PM - 7:45 PM)
- Conflict appears in Jennifer's "My Events" feed
- Badge updates: "My Events ⚠️ 1"

**Note:** Continuous monitoring details (ICS feed polling) are covered in "Event Changes from ICS" flow. This flow focuses on conflict detection logic.

---

## CONFLICT WARNING MODAL (At Assignment)

### Modal Display

**Trigger:** User attempts assignment that creates conflict

**Modal Structure:**

```
┌─────────────────────────────────┐
│ ⚠️ Conflict Detected            │
├─────────────────────────────────┤
│                                 │
│ Assigning this event to         │
│ [Parent Name] creates a         │
│ scheduling conflict.            │
│                                 │
│ Conflicts with:                 │
│ Emma - Soccer Practice          │
│ Wednesday, Nov 20               │
│ 4:30 PM - 7:15 PM (total time)  │
│                                 │
│ Overlap period:                 │
│ 5:20 PM - 7:15 PM               │
│                                 │
│ You can assign anyway if you    │
│ have a backup plan.             │
│                                 │
├─────────────────────────────────┤
│                                 │
│ [Cancel]      [Assign Anyway]   │
│                                 │
└─────────────────────────────────┘
```

---

### Modal Content Details

**Title:** "⚠️ Conflict Detected"

**Message:**
```
Assigning this event to [Parent Name] creates a 
scheduling conflict.
```

**Conflicting Event Info:**
- Event title (Child - Activity)
- Date
- **Total time commitment** (leave by → back home)

**Overlap Period:**
- Start and end times of the overlap
- Shows exactly when the conflict occurs

**Helpful Context:**
- "You can assign anyway if you have a backup plan."
- Acknowledges user may have valid reasons

**Actions:**
- **Cancel:** Dismisses modal, returns to previous screen, assignment not made
- **Assign Anyway:** Proceeds with assignment despite conflict, modal closes

---

### Modal Behavior

**Single Conflict:**
- Shows one conflicting event
- Clear, focused information

**Multiple Conflicts:**
- Shows first conflicting event only
- Message: "Conflicts with Emma - Soccer Practice **and 1 other event**"
- User can still assign
- All conflicts visible in feed after assignment

**Rationale:** Keep modal simple. Full conflict picture visible in feed.

---

### When Modal Appears

**Assignment to Self:**
- "Assign to Me" from Unassigned Events
- "Assign to Me" from Upcoming Events

**Assignment to Another Parent:**
- "Give to Someone Else" → Select Tom
- System checks Tom's existing assignments
- If conflict with Tom's schedule → Show modal about **Tom's conflict**

**Take Over:**
- "Take Over This Event" (taking from another parent)
- System checks YOUR existing assignments
- If conflict with your schedule → Show modal

---

## CONFLICT DISPLAY IN FEEDS

### Conflict Block Structure

**Inserted between conflicting event cards in chronological order**

```
┌─────────────────────────────────┐
│ Emma - Soccer Practice          │
│ Wednesday, Nov 20               │
│ 5:30 PM - 6:30 PM              │
│ 📍 Leave by: 4:30 PM           │
│ 🏠 Back home: 7:15 PM          │
│ 🎯 Assigned to: You            │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ ⚠️ SCHEDULING CONFLICT          │
│                                 │
│ You're assigned to both events  │
│ with overlapping times. You     │
│ can't be in two places at once. │
│                                 │
│ Consider reassigning one event  │
│ to another parent.              │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Jake - Basketball Practice      │
│ Wednesday, Nov 20               │
│ 6:00 PM - 7:00 PM              │
│ 📍 Leave by: 5:20 PM           │
│ 🏠 Back home: 7:45 PM          │
│ 🎯 Assigned to: You            │
└─────────────────────────────────┘
```

---

### Conflict Block Content

**Title:** "⚠️ SCHEDULING CONFLICT"

**Message Variations:**

**Standard Overlap:**
```
You're assigned to both events with overlapping times. 
You can't be in two places at once.

Consider reassigning one event to another parent.
```

**Sequential Conflict (Insufficient Gap):**
```
You need to leave for this event before returning 
from the previous one.

Consider reassigning one event to another parent.
```

**Multiple Event Conflict:**
```
You're assigned to 3 overlapping events on this day.

Consider reassigning some events to other parents.
```

**Key Characteristics:**
- Friendly but clear tone
- States the problem plainly
- Suggests resolution approach (reassign)
- No action buttons (user navigates to event detail to reassign)

---

### Conflict Block Placement

**Rule:** Conflict blocks appear **between** the conflicting events in chronological order

**Example with 3 conflicts:**
```
Event A (4:00 PM - 5:00 PM)
[Conflict Block: A ↔ B]
Event B (4:30 PM - 6:00 PM)
[Conflict Block: B ↔ C]
Event C (5:30 PM - 7:00 PM)
```

**If events are not adjacent in feed:**
- Conflict block appears after the earlier event
- References the later conflicting event by name

---

### Conflict Block Color/Styling

**Visual Design:**
- Background: Light red/orange (#FFF3E0 or similar)
- Border: Red/orange (#FF9800)
- Icon: ⚠️ warning triangle
- Text: Dark gray/black for readability
- No shadow (flat design)
- Slightly smaller font than event cards
- Clear visual distinction from event cards

---

## CONFLICT DISPLAY BY TAB

### "My Events" Tab

**Shows:** All conflicts involving YOUR assignments

**Behavior:**
- Conflict blocks inserted between YOUR conflicting events
- Only shows conflicts where you're assigned to both events
- If you have 5 events but only 2 conflict, only one conflict block appears

**Badge Indicator:**
```
My Events ⚠️ 3
```
- Number indicates count of conflicts (not events)
- Badge only appears if conflicts exist
- Updates in real-time as conflicts are resolved

---

### "Upcoming Events" Tab

**Shows:** Conflicts involving YOU only (not conflicts between other parents)

**Scenario A: Your Conflicts**
- Emma's Soccer (You) 5:30 PM
- Jake's Basketball (You) 6:00 PM
- **Conflict block shown** (you're assigned to both)

**Scenario B: Others' Conflicts**
- Emma's Soccer (Tom) 5:30 PM
- Jake's Basketball (Tom) 6:00 PM
- **No conflict block shown** (not your problem)

**Scenario C: Mixed Assignments**
- Emma's Soccer (You) 5:30 PM
- Jake's Basketball (Tom) 6:00 PM
- **No conflict block** (different parents)

**Badge:** No conflict badge on "Upcoming Events" tab

**Rationale:**
- This tab shows full picture for planning
- Conflicts only highlighted for YOUR schedule
- Keeps focus on actionable information

---

### "Unassigned Events" Tab

**Shows:** No conflict warnings

**Rationale:**
- Events have no assignment yet
- No supplemental events created (no drive times calculated)
- Can't determine if conflict exists without knowing who's assigned
- Conflicts detected at moment of assignment (warning modal)

**Badge:** No conflict badge on "Unassigned Events" tab

---

## CONFLICT RESOLUTION

### Resolution Approach: User-Driven

**System Behavior:**
- Detects and displays conflicts
- Warns at assignment
- Does NOT prevent conflicting assignments
- Does NOT auto-resolve conflicts
- Does NOT suggest specific solutions (beyond "consider reassigning")

**User Resolution:**
- User must manually resolve conflicts
- Typical resolution: Reassign one of the conflicting events to another parent
- Alternative: Accept conflict (have backup plan, delegate to helper, carpool, etc.)

---

### Resolution Flow

**Step 1: Identify Conflict**
- User sees conflict block in "My Events"
- Badge shows: "My Events ⚠️ 3"

**Step 2: Review Details**
- Tap one of the conflicting events
- Event detail screen opens
- Shows full timing information

**Step 3: Reassign Event**
- Tap "Give to Someone Else"
- Select different parent
- Confirm assignment

**Step 4: Conflict Resolves**
- System recalculates
- Conflict block disappears (real-time)
- Badge updates: "My Events ⚠️ 2" (if other conflicts remain)

**Alternative Resolution:**
- User reassigns BOTH events to different parents
- Or takes no action (accepts conflict)

---

### No Quick Actions in Conflict Block

**Decision:** Conflict blocks are informational only (no buttons)

**Rationale:**
1. **Simplicity:** Users already know how to reassign (tap event → reassign)
2. **Choice:** User should choose which event to reassign (not system's decision)
3. **Context:** User needs to see full event details before reassigning
4. **Consistency:** Reassignment always happens through event detail screen

**User Journey:**
- See conflict block → Tap event card → Review details → Reassign
- Clear, consistent path

---

## MULTI-CONFLICT SCENARIOS

### Scenario 1: Chain of Conflicts

**Setup:**
- Event A: 4:00 PM - 5:30 PM (You)
- Event B: 5:00 PM - 6:30 PM (You)
- Event C: 6:00 PM - 7:30 PM (You)

**Conflicts:**
- A conflicts with B
- B conflicts with C
- (A might not directly conflict with C if gap sufficient)

**Display:**
```
Event A
[Conflict: A ↔ B]
Event B
[Conflict: B ↔ C]
Event C
```

**Badge:** "My Events ⚠️ 2" (two conflict blocks)

---

### Scenario 2: Multiple Same-Day Conflicts (Non-Sequential)

**Setup:**
- Event A: 8:00 AM - 10:00 AM (You)
- Event B: 9:00 AM - 11:00 AM (You)
- Event C: 2:00 PM - 4:00 PM (You)
- Event D: 3:00 PM - 5:00 PM (You)

**Conflicts:**
- A conflicts with B (morning)
- C conflicts with D (afternoon)
- Two separate conflict clusters

**Display:**
```
Event A
[Conflict: A ↔ B]
Event B

[Gap in timeline - no conflict]

Event C
[Conflict: C ↔ D]
Event D
```

**Badge:** "My Events ⚠️ 2"

---

### Scenario 3: Three-Way Conflict

**Setup:**
- Event A: 4:00 PM - 6:00 PM (You)
- Event B: 5:00 PM - 7:00 PM (You)
- Event C: 5:30 PM - 7:30 PM (You)

**All three overlap during 5:30-6:00 PM**

**Display:**
```
Event A
[Conflict: A ↔ B and C]
Event B
[Conflict: B ↔ C]
Event C
```

**Conflict Block Message:**
```
You're assigned to 3 overlapping events during this time. 
You can't be in multiple places at once.

Consider reassigning some events to other parents.
```

**Badge:** "My Events ⚠️ 2" (two conflict blocks, even though 3 events)

---

## EDGE CASES & ERROR HANDLING

### Edge Case 1: Conflict Appears Then Disappears (Real-Time)

**Scenario:**
- Jennifer has conflict between Emma's Soccer and Jake's Basketball
- Tom (on his phone) takes over Jake's Basketball
- Jennifer's conflict immediately resolves

**System Behavior:**
1. Tom takes over Jake's Basketball
2. WebSocket broadcasts change to Jennifer's device
3. Jake's Basketball disappears from Jennifer's "My Events"
4. Conflict block immediately disappears
5. Badge updates: "My Events ⚠️ 0" → No badge shown

**User Experience:**
- Jennifer sees conflict resolve in real-time
- No manual refresh needed
- Seamless coordination

---

### Edge Case 2: Event Time Changes Creating New Conflict

**Scenario:**
- Jennifer assigned to Emma's Soccer (5:30 PM - 6:30 PM)
- Jennifer assigned to Jake's Basketball (7:00 PM - 8:00 PM)
- No conflict initially (adequate gap)
- ICS feed updates: Soccer now 5:30 PM - 7:30 PM
- **New conflict created**

**System Behavior:**
1. Detect time change in ICS polling
2. Recalculate drive times and total commitment
3. Check for new conflicts
4. Insert conflict block in Jennifer's feed
5. Update badge: "My Events ⚠️ 1"
6. Send notification: "⚠️ Emma's Soccer time changed - now conflicts with Jake's Basketball" (notification implementation deferred)

---

### Edge Case 3: Event Time Changes Resolving Conflict

**Scenario:**
- Jennifer has conflict between two events
- ICS feed updates: Event A now ends earlier
- Conflict resolved by time change

**System Behavior:**
1. Detect time change
2. Recalculate
3. Conflict no longer exists
4. Remove conflict block from feed (real-time)
5. Update badge
6. Optional notification: "✓ Conflict resolved: Emma's Soccer time changed"

---

### Edge Case 4: Assignment Warning for Another Parent's Conflict

**Scenario:**
- Jennifer tries to assign Jake's Basketball to Tom
- Tom already assigned to Emma's Soccer at overlapping time
- Creates conflict for Tom, not Jennifer

**Modal Display:**
```
⚠️ Conflict Detected

Assigning this event to Tom Johnson creates a 
scheduling conflict for him.

Conflicts with:
Emma - Soccer Practice
Wednesday, Nov 20
4:30 PM - 7:15 PM (total time)

You can assign anyway if Tom has a backup plan.

[Cancel]  [Assign Anyway]
```

**Key Difference:** Modal clearly states conflict is for Tom, not you

---

### Edge Case 5: Reassignment Creates Conflict for New Assignee

**Scenario:**
- Event assigned to Jennifer (no conflict)
- Tom takes over the event
- Event conflicts with Tom's existing assignments

**Flow:**
1. Tom taps "Take Over This Event"
2. System checks Tom's schedule
3. Conflict detected
4. **Warning modal appears:**
   ```
   ⚠️ Conflict Detected
   
   Taking over this event creates a scheduling 
   conflict with your existing assignments.
   
   Conflicts with:
   Jake - Piano Lesson
   Wednesday, Nov 20
   6:00 PM - 7:30 PM
   
   [Cancel]  [Take Over Anyway]
   ```
5. Tom decides to proceed or cancel

---

### Edge Case 6: Bulk Conflicts (5+ Events)

**Scenario:** Parent assigned to 7 overlapping events (extreme case)

**Display:**
- Multiple conflict blocks in feed
- Badge: "My Events ⚠️ 6" (or max badge display)
- Each conflict shown individually
- No special "bulk conflict" UI

**System Performance:**
- Conflict detection algorithm must be efficient
- Should handle 20+ events per day gracefully
- Real-time updates must remain fast

---

### Edge Case 7: User Ignores Conflicts

**Scenario:** User sees conflicts but takes no action

**System Behavior:**
- Conflicts remain visible indefinitely
- No escalation or forcing of resolution
- User may have valid reasons (backup plans, carpools, helpers)
- System respects user autonomy

**No Nagging:**
- No repeat warnings
- No notification spam
- Badge persists until resolved, but non-intrusive

---

### Edge Case 8: Conflict with Very Small Overlap

**Scenario:**
- Event A: 4:30 PM - 5:35 PM
- Event B: 5:30 PM - 6:30 PM
- Overlap: 5 minutes

**System Behavior:**
- Still flagged as conflict (any overlap = conflict)
- Conflict block displayed
- User might reasonably proceed (5 minutes often negotiable)

**Rationale:** Better to over-warn than under-warn. User can assess if 5-minute conflict is acceptable.

---

## CONFLICT DETECTION ALGORITHM

### High-Level Logic

**For each parent:**
1. Get all events assigned to parent
2. Sort by leave time (start of total commitment)
3. For each event pair (A, B) where A before B:
   - If A's "back home time" > B's "leave by time":
     - **Conflict detected**
     - Calculate overlap: (B's leave time) to (A's back home time)
     - Store conflict relationship: A ↔ B

**Output:** List of conflict pairs for each parent

---

### Pseudocode

```python
def detect_conflicts(user_id):
    # Get all events assigned to user with supplemental event times
    events = get_assigned_events(user_id)
    
    # Sort by leave time (start of total commitment)
    events.sort(key=lambda e: e.leave_by_time)
    
    conflicts = []
    
    for i in range(len(events)):
        for j in range(i + 1, len(events)):
            event_a = events[i]
            event_b = events[j]
            
            # Check if A's commitment overlaps with B's commitment
            if event_a.back_home_time > event_b.leave_by_time:
                overlap_start = event_b.leave_by_time
                overlap_end = min(event_a.back_home_time, event_b.back_home_time)
                
                conflicts.append({
                    'event_a': event_a,
                    'event_b': event_b,
                    'overlap_start': overlap_start,
                    'overlap_end': overlap_end
                })
    
    return conflicts
```

---

### Performance Considerations

**Optimization:**
- Only check events within reasonable time window (e.g., 30 days forward)
- Cache conflict calculations
- Invalidate cache only when:
  - Assignment changes
  - Event times change
  - Drive times recalculated

**Scalability:**
- Algorithm is O(n²) per parent, but n is typically small (<50 events per month)
- Run conflict detection asynchronously
- Update UI via WebSocket when conflicts detected/resolved

---

## NOTIFICATION TRIGGERS (IMPLEMENTATION DEFERRED)

While notification implementation is deferred, these are the triggers identified for future work:

**Trigger 1: New Conflict Detected (Background)**
- Notification: "⚠️ Scheduling conflict detected: Emma's Soccer overlaps with Jake's Basketball"
- Only if user is not currently in app

**Trigger 2: Conflict Resolved**
- Notification: "✓ Conflict resolved: Events no longer overlap"
- Optional (can be disabled)

**Trigger 3: Event Change Creates Conflict**
- Notification: "⚠️ Emma's Soccer time changed - now conflicts with Jake's Basketball"
- Important for awareness

---

## ACCEPTANCE CRITERIA

### Conflict Detection is Complete When:

**Detection Logic:**
1. ✅ System correctly identifies conflicts based on total time commitment
2. ✅ System checks for conflicts at assignment time
3. ✅ System continuously monitors for conflicts in background
4. ✅ Conflicts detected when ICS events change times
5. ✅ Only same parent, overlapping time = conflict
6. ✅ Different parents, overlapping time = not conflict

**Warning Modal:**
7. ✅ Modal appears when assigning event creates conflict
8. ✅ Modal shows conflicting event details
9. ✅ Modal shows overlap period
10. ✅ User can cancel or proceed with "Assign Anyway"
11. ✅ Modal works for self-assignment and assigning to others
12. ✅ Modal works for "Take Over" conflicts

**Feed Display:**
13. ✅ Conflict blocks appear between conflicting events
14. ✅ Conflict blocks show friendly, clear messaging
15. ✅ Conflict blocks appear in "My Events" tab
16. ✅ Conflict blocks appear in "Upcoming Events" only for your conflicts
17. ✅ No conflict blocks in "Unassigned Events" tab
18. ✅ Multiple conflict blocks shown for multiple conflicts

**Badge Indicator:**
19. ✅ "My Events" tab shows conflict count badge
20. ✅ Badge format: "My Events ⚠️ 3"
21. ✅ Badge disappears when no conflicts
22. ✅ Badge updates in real-time as conflicts resolve

**Real-Time Updates:**
23. ✅ Conflict blocks appear/disappear in real-time via WebSocket
24. ✅ Badge updates in real-time
25. ✅ Works when other parent resolves your conflict

**Resolution:**
26. ✅ User can reassign event to resolve conflict
27. ✅ Conflict block disappears when resolved
28. ✅ No forced resolution (user can ignore conflicts)
29. ✅ No action buttons in conflict blocks

**Edge Cases:**
30. ✅ Handles chain of conflicts correctly
31. ✅ Handles multiple same-day conflicts
32. ✅ Handles three-way conflicts
33. ✅ Handles event time changes creating/resolving conflicts
34. ✅ Handles assignment creating conflict for other parent
35. ✅ Handles very small overlaps (1-5 minutes)

---

## FUTURE ENHANCEMENTS (Phase 2+)

**Smart Conflict Resolution:**
- Suggest which event to reassign based on patterns
- "Tom is usually free at this time - assign to Tom?"
- Automatic reassignment proposals

**Conflict Prediction:**
- "Adding this event will create 3 conflicts"
- Show before importing full season schedule

**Work Calendar Integration:**
- Detect conflicts with work meetings
- "This event conflicts with your 4 PM work meeting"

**Advanced Conflict Types:**
- Same child, different parents (Emma can't be in two places)
- Custody schedule violations (event on non-custody day)
- Travel time between locations (not just event times)

**Conflict History:**
- Track how often conflicts occur
- Identify problematic time slots
- Suggest better scheduling patterns

**Quick Resolution Actions:**
- "Reassign to..." button directly in conflict block
- One-tap resolution options

---

*This specification defines the complete Conflict Detection & Resolution flow with emphasis on clear warning, transparent display, and user-driven resolution. All details are locked down and ready for implementation.*
