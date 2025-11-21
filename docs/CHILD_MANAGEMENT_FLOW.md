# Child Management Flow
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## OVERVIEW

This document defines how users manage children in the system: adding additional children after onboarding, editing child details, viewing child information, and deleting children.

**Key Principles:**
- Children are simple profile objects (name, photo, DOB)
- Any parent member can manage children
- Children serve as grouping mechanism for Event Calendars
- Multiple Event Calendars can be associated with one child
- Children cannot be deleted if Event Calendars exist (must delete calendars first)
- Children can exist without Event Calendars (if calendars deleted or haven't been added yet)

---

## CHILD OBJECT STRUCTURE

### Data Fields

**Required:**
- Name (e.g., "Emma")

**Optional:**
- Photo (profile image)
- Date of Birth
- Created date (auto-generated)
- Last modified date (auto-generated)

**Relationships:**
- Associated Event Calendars (one-to-many)
- Can be linked to multiple Event Calendars
- Event Calendars must have exactly one child

---

## ADDING CHILDREN

### Entry Points

**During Onboarding:**
- Covered in onboarding flow (Step 3: Child Profile Setup)
- Creates first child when adding first Event Calendar

**After Onboarding:**

**Option 1: From Dashboard**
- Floating "+" button → "Add Child"

**Option 2: From Settings**
- Settings → Children → "Add Child" button

**Option 3: When Adding Event Calendar**
- Add Event Calendar flow → "Select or Create Child" → "Create New Child"

---

### Add Child Flow

**Step 1: Enter Name**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Add Child                           │
├─────────────────────────────────────┤
│ Name *                              │
│ [Emma                     ]         │
│                                     │
│ Photo (optional)                    │
│ [○ Select Photo]                    │
│                                     │
│ Date of Birth (optional)            │
│ [MM/DD/YYYY          ]              │
│                                     │
│ [Cancel]        [Add Child]         │
└─────────────────────────────────────┘
```

**Validation:**
- Name: Required, 1-50 characters
- Photo: Optional, standard image picker
- DOB: Optional, date picker

**System Actions:**
1. Validate name uniqueness (within family)
2. If duplicate: "You already have a child named Emma. Use a different name or add a middle initial."
3. Create child record
4. Associate with current family/parent members

---

**Step 2: Success**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ✅ Child Added                      │
│                                     │
│ Emma has been added to your family. │
│ You can now add Event Calendars     │
│ for Emma.                           │
│                                     │
│ [Add Event Calendar]  [Done]        │
└─────────────────────────────────────┘
```

**User Options:**
- **Add Event Calendar:** Proceeds directly to Add Event Calendar flow with Emma pre-selected
- **Done:** Returns to previous screen (Dashboard or Settings)

**Real-Time Updates:**
- All parent members see new child immediately via WebSocket
- Child appears in child filter dropdown
- Child appears in Settings → Children list

---

## VIEWING CHILD DETAILS

### Entry Point

**From Settings:**
- Settings → Children → Tap child name

**From Dashboard:**
- Tap child name in filter dropdown (if we add this feature)

---

### Child Detail Screen

**Display Information:**

```
┌─────────────────────────────────────┐
│ [Photo]    Emma                     │
│            Age: 8 (if DOB provided) │
├─────────────────────────────────────┤
│ EVENT CALENDARS (3)                 │
│                                     │
│ ⚽️ Soccer League                    │
│    24 upcoming events               │
│    Next: Nov 20, 5:30 PM            │
│                                     │
│ 💃 Dance Studio                     │
│    12 upcoming events               │
│    Next: Nov 22, 4:00 PM            │
│                                     │
│ 🏫 School Events                    │
│    8 upcoming events                │
│    Next: Nov 21, 3:00 PM            │
├─────────────────────────────────────┤
│ [Edit Child]                        │
│ [Add Event Calendar]                │
│ [Delete Child]                      │
└─────────────────────────────────────┘
```

**Information Shown:**
- Child photo (if set)
- Child name
- Age (calculated from DOB if provided)
- List of associated Event Calendars with summary stats
- Action buttons

**Available Actions:**
- Edit Child (opens edit screen)
- Add Event Calendar (opens Add Event Calendar flow with this child pre-selected)
- Delete Child (only available if no Event Calendars exist)

---

## EDITING CHILDREN

### Entry Point

**From Child Detail Screen:**
- Tap "Edit Child"

**From Settings:**
- Settings → Children → Swipe left on child → "Edit"

---

### Edit Child Flow

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Edit Child                          │
├─────────────────────────────────────┤
│ Name *                              │
│ [Emma                     ]         │
│                                     │
│ Photo                               │
│ [Current photo thumbnail]           │
│ [Change Photo]  [Remove Photo]      │
│                                     │
│ Date of Birth                       │
│ [05/15/2017          ]              │
│                                     │
│ [Cancel]        [Save Changes]      │
└─────────────────────────────────────┘
```

**Editable Fields:**
- Name (required)
- Photo (add, change, or remove)
- Date of Birth (add or change)

**Validation:**
- Name: Required, 1-50 characters
- Name uniqueness checked (excluding current child)
- Photo: Standard image picker
- DOB: Date picker, cannot be future date

---

### Save Changes

**System Actions:**
1. Update child record in database
2. If name changed: Update all Event Calendar associations
3. Send WebSocket updates to all parent members

**Real-Time Updates:**
- All parent members see updated child info immediately
- Updated name appears in filter dropdowns
- Updated name appears in Event Calendar associations
- Updated name appears in all event assignments

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Changes Saved                    │
│                                     │
│ Emma's information has been updated.│
└─────────────────────────────────────┘
```

---

## DELETING CHILDREN

### Prerequisites

**Check for Event Calendars:**
- System checks if child has any associated Event Calendars
- If YES: Deletion prevented
- If NO: Deletion allowed with confirmation

---

### Scenario A: Child Has Event Calendars (Prevention)

**Trigger:** User taps "Delete Child" for child with Event Calendars

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Cannot Delete Child              │
│                                     │
│ Emma has 3 Event Calendars:         │
│ • Soccer League                     │
│ • Dance Studio                      │
│ • School Events                     │
│                                     │
│ Delete these calendars first,       │
│ then you can delete Emma.           │
│                                     │
│ [View Calendars]  [Cancel]          │
└─────────────────────────────────────┘
```

**User Options:**
- **View Calendars:** Opens Settings → Event Calendars filtered to Emma's calendars
- **Cancel:** Returns to previous screen

**Deletion Blocked:** No way to proceed without first deleting Event Calendars

---

### Scenario B: Child Has No Event Calendars (Allowed)

**Trigger:** User taps "Delete Child" for child with no Event Calendars

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Delete Emma?                        │
│                                     │
│ Emma has no Event Calendars and     │
│ can be safely deleted.              │
│                                     │
│ This action cannot be undone.       │
│                                     │
│ [Cancel]     [Delete]               │
└─────────────────────────────────────┘
```

**User Confirms Deletion:**

**System Actions:**
1. Delete child record from database
2. Remove from all parent members' views
3. Send WebSocket updates

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Child Deleted                    │
│                                     │
│ Emma has been removed.              │
└─────────────────────────────────────┘
```

**Real-Time Updates:**
- Child removed from all parent members' Settings → Children list
- Child removed from filter dropdowns
- Child removed from Dashboard views

---

## WHO CAN MANAGE CHILDREN

### Permissions

**Any Parent Member Can:**
- Add new children
- Edit any child (name, photo, DOB)
- Delete children (if no Event Calendars exist)
- View all children

**No Special Permissions Required:**
- Unlike Event Calendars (which have owners), children are shared equally
- All parent members have full management rights
- No concept of "child owner"

**Rationale:**
- Children are simple profile objects with minimal data
- Low risk of destructive actions
- Enables any parent to keep info current
- Deletion is prevented when Event Calendars exist (the real valuable data)

---

## CHILD FILTER (ACROSS APP)

### Filter Behavior

**Location:** Top of Dashboard and Event Feed screens

**Display:**
```
┌─────────────────────────────────────┐
│ [All Kids ▼]                        │
├─────────────────────────────────────┤
│ Unassigned | Upcoming | My Events   │
└─────────────────────────────────────┘
```

**Dropdown Options:**
- All Kids (default)
- Emma
- Jake
- [any other children]

**When Filter Applied:**
- Shows only events associated with selected child's Event Calendars
- Filter persists across tabs
- Filter state saved per user
- Filter indicator shown: "Showing Emma's Events"

**Clear Filter:**
- Select "All Kids" from dropdown
- Or tap "X" on filter indicator

---

## EDGE CASES & ERROR HANDLING

### Duplicate Child Names

**Scenario:** User tries to add child with name that already exists

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Name Already Exists              │
│                                     │
│ You already have a child named Emma.│
│ Use a different name or add a       │
│ middle initial (e.g., "Emma R.").   │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

**System Action:** Prevent creation, user must choose different name

**Note:** This only applies within the same family. Different families can have children with the same name.

---

### Empty Child (No Calendars, No Activity)

**Scenario:** Child exists but has no Event Calendars and no historical activity

**Behavior:**
- Child remains in system (no auto-cleanup)
- Appears in Settings → Children list
- Shows "No Event Calendars" on detail screen
- Can be deleted easily (no prevention)
- No harm in leaving orphaned

**Rationale:**
- User may plan to add calendars later
- May be placeholder for future child
- Cleanup is manual and optional

---

### Editing While Other Parent Viewing

**Scenario:** Parent A edits child name while Parent B is viewing that child's detail screen

**Parent B's Screen:**
- WebSocket update received
- Child name updates in real-time
- Screen remains on same child
- No disruptive modal or redirect

**Example:**
```
Before: Viewing "Emma" detail screen
Parent A renames Emma → "Emma Rose"
After: Screen now shows "Emma Rose" detail
```

---

### Deletion While Other Parent Viewing

**Scenario:** Parent A deletes child while Parent B is viewing that child's detail screen

**Parent B's Screen:**
- WebSocket update received
- Modal appears:

```
┌─────────────────────────────────────┐
│ Child Removed                       │
│                                     │
│ [Parent A] deleted Emma.            │
│                                     │
│ [Return to Settings]                │
└─────────────────────────────────────┘
```

**System Action:** Redirect to Settings → Children list

---

### Adding Child When Inviting New Parent

**Scenario:** When adding Event Calendar and inviting new parent member, child is created as part of that flow

**Behavior:**
- Child creation happens during Event Calendar setup
- New parent sees child immediately upon joining
- Child is associated with their family/parent group
- No separate "add child" action needed for initial calendar

**Note:** Covered in onboarding flow, but important to note child creation can happen via multiple paths

---

### Photo Upload Failures

**Scenario:** User selects photo but upload fails

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Photo Upload Failed              │
│                                     │
│ Unable to upload photo.             │
│ Check your connection and try again.│
│                                     │
│ [Retry]  [Continue Without Photo]   │
└─────────────────────────────────────┘
```

**User Options:**
- Retry upload
- Continue without photo (save child with other info)

---

### DOB Future Date

**Scenario:** User enters future date for Date of Birth

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Invalid Date                     │
│                                     │
│ Date of birth cannot be in the      │
│ future. Please enter a valid date.  │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

**System Action:** Prevent saving, user must correct date

---

## TECHNICAL REQUIREMENTS

### Child Data Model

**Database Fields:**
- `id` (UUID, primary key)
- `name` (string, required, 1-50 chars)
- `photo_url` (string, optional, S3 or similar)
- `date_of_birth` (date, optional)
- `created_at` (timestamp, auto)
- `updated_at` (timestamp, auto)

**Relationships:**
- One-to-many with Event Calendars
- Many-to-many with parent members (via Event Calendar membership - parents who share Event Calendars can access the child)

---

### Validation Rules

**Name:**
- Required
- 1-50 characters
- Unique within family
- Trimmed of leading/trailing whitespace
- Cannot be only whitespace

**Photo:**
- Optional
- Max file size: 5MB
- Supported formats: JPG, PNG, HEIC
- Auto-resize to 512x512 for storage

**Date of Birth:**
- Optional
- Cannot be future date
- Standard date format: MM/DD/YYYY

---

### Real-Time Updates

**WebSocket Events:**
- `child_created` - New child added
- `child_updated` - Child details changed (name, photo, DOB)
- `child_deleted` - Child removed

**Subscriptions:**
- All parent members subscribed to family's child events
- Updates push immediately to all connected clients

---

### API Endpoints

**Create Child:**
- `POST /api/children`
- Body: `{ name, photo, date_of_birth (optional) }`
- Returns: Child object

**Update Child:**
- `PATCH /api/children/:id`
- Body: `{ name, photo, date_of_birth }`
- Returns: Updated child object

**Delete Child:**
- `DELETE /api/children/:id`
- Checks: Must have zero associated Event Calendars
- Returns: Success confirmation

**Get Children:**
- `GET /api/children`
- Returns: Array of all children in family

**Get Child Details:**
- `GET /api/children/:id`
- Returns: Child object with associated Event Calendars

---

## SUCCESS CRITERIA

**Adding Children:**
1. ✅ Any parent member can add child
2. ✅ Name is required
3. ✅ Photo and DOB are optional
4. ✅ Duplicate names prevented
5. ✅ Success confirmation shown
6. ✅ Child appears immediately for all parents
7. ✅ Child available in filter dropdown
8. ✅ Can proceed directly to add Event Calendar

**Editing Children:**
9. ✅ Any parent member can edit any child
10. ✅ Can change name, photo, DOB
11. ✅ Name uniqueness enforced (excluding current child)
12. ✅ Changes save successfully
13. ✅ Changes appear immediately for all parents
14. ✅ Updated names reflected everywhere (filters, calendars, events)

**Viewing Children:**
15. ✅ Child detail screen shows complete info
16. ✅ Associated Event Calendars listed with stats
17. ✅ Age calculated from DOB if provided
18. ✅ Photo displayed if set
19. ✅ Action buttons available and functional

**Deleting Children:**
20. ✅ Deletion prevented if Event Calendars exist
21. ✅ Clear error message explaining why
22. ✅ Option to view calendars that need deletion
23. ✅ Deletion allowed if no Event Calendars
24. ✅ Simple confirmation (not high-friction)
25. ✅ Child removed from all parents' views immediately
26. ✅ Cannot be undone

**Permissions:**
27. ✅ All parent members have equal management rights
28. ✅ No special owner permissions needed
29. ✅ Actions sync in real-time across all parents

**Edge Cases:**
30. ✅ Duplicate names prevented with clear error
31. ✅ Empty children (no calendars) handled gracefully
32. ✅ Editing while other parent viewing updates smoothly
33. ✅ Deletion while other parent viewing handled with modal
34. ✅ Photo upload failures handled with retry option
35. ✅ Future DOB prevented with clear error
36. ✅ Child filter works correctly across all screens

---

## FUTURE ENHANCEMENTS (Phase 2+)

**Extended Child Info:**
- Age/grade level
- School name
- Allergies/medical notes
- Emergency contacts
- Coach/teacher names

**Child Photos:**
- Multiple photos (gallery)
- Auto-update from Google Photos
- Share photos with co-parent

**Child Activity History:**
- View past events
- Attendance tracking
- Stats (punctuality, assignments handled)

**Bulk Child Operations:**
- Import multiple children at once
- Export child data
- Archive/deactivate children

**Child Permissions:**
- Restrict certain parents to certain children
- Useful for blended families
- "John can only see his bio kids' calendars"

**Child Templates:**
- Pre-configure common setups
- "Elementary School Child" template with typical calendars

---

*This specification defines the complete Child Management flow with emphasis on simplicity, equal parent permissions, Event Calendar dependency checking, and real-time updates. All details are locked down and ready for implementation.*
