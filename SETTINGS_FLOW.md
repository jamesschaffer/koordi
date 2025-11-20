# Settings & Preferences Flow
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## OVERVIEW

This document defines all user-configurable settings and preferences in the app, organized by category. Settings are accessed from the main Settings screen and apply per-user (not shared across family members).

**Key Principles:**
- Each user has their own settings (not shared)
- Settings persist across sessions
- Changes take effect immediately
- Critical settings (like address changes) trigger recalculation of affected events
- Minimal settings for MVP - only what's necessary

---

## SETTINGS SCREEN STRUCTURE

### Main Settings Screen

**Location:** Tap "Settings" icon in app navigation

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Settings                            │
├─────────────────────────────────────┤
│ LOCATION                            │
│ Default Starting Address            │
│ [Current address]                 › │
│                                     │
├─────────────────────────────────────┤
│ TIMING                              │
│ Use Comfort Buffer                  │
│ [Toggle: ON/OFF]                    │
│                                     │
│ Comfort Buffer Duration             │
│ [15 minutes]                      › │
│ (only shown if toggle ON)           │
│                                     │
├─────────────────────────────────────┤
│ EVENTS                              │
│ Keep Supplemental Events After      │
│ Reassignment                        │
│ [Toggle: ON/OFF]                    │
│                                     │
├─────────────────────────────────────┤
│ EVENT CALENDARS                     │
│ Manage Event Calendars            › │
│                                     │
├─────────────────────────────────────┤
│ CHILDREN                            │
│ Manage Children                   › │
│                                     │
├─────────────────────────────────────┤
│ ACCOUNT                             │
│ Email Address                       │
│ [user@example.com]                › │
│                                     │
│ Google Calendar                     │
│ [Connected]                       › │
│                                     │
│ Privacy & Data                    › │
│                                     │
│ Delete Account                    › │
│                                     │
├─────────────────────────────────────┤
│ ABOUT                               │
│ Version 1.0.0                       │
│ Terms of Service                  › │
│ Privacy Policy                    › │
│ Help & Support                    › │
└─────────────────────────────────────┘
```

---

## LOCATION SETTINGS

### Default Starting Address

**Purpose:** Set the address used to calculate departure times for all events

**Entry Point:** Settings → Default Starting Address

---

### View/Edit Address Flow

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Default Starting Address            │
├─────────────────────────────────────┤
│ This address is used to calculate   │
│ when you need to leave for events.  │
│                                     │
│ Current Address:                    │
│ 123 Main St                         │
│ Baltimore, MD 21201                 │
│                                     │
│ [Edit Address]                      │
└─────────────────────────────────────┘
```

**User Taps "Edit Address":**

```
┌─────────────────────────────────────┐
│ Edit Starting Address               │
├─────────────────────────────────────┤
│ Enter new address:                  │
│                                     │
│ [Street Address            ]        │
│ [City                      ]        │
│ [State]  [ZIP Code]                 │
│                                     │
│ Or search:                          │
│ [Search for address        ]        │
│                                     │
│ [Cancel]        [Save]              │
└─────────────────────────────────────┘
```

**Validation:**
- Address must be valid and geocodable
- Use Google Places API for address search/autocomplete
- Show error if address cannot be found

**System Actions on Save:**
1. Geocode new address
2. Store new address with user record
3. Recalculate all supplemental events for events assigned to this user
4. Update Google Calendar supplemental events with new drive times
5. Show progress indicator if many events need updating

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Address Updated                  │
│                                     │
│ Recalculating drive times for 12    │
│ upcoming events...                  │
│                                     │
│ [Progress bar]                      │
└─────────────────────────────────────┘
```

**Note:** Each user has their own starting address. Co-parents can have different addresses, and each sees drive times calculated from their own location.

---

## TIMING SETTINGS

### Use Comfort Buffer

**Purpose:** Add extra padding time before calculated departure to account for getting ready, unexpected delays, etc.

**Entry Point:** Settings → Use Comfort Buffer toggle

**Default:** OFF

---

### Toggle Behavior

**When OFF:**
- Departure time = Drive time + Early arrival buffer
- No additional padding added

**When ON:**
- Shows "Comfort Buffer Duration" setting below toggle
- Departure time = Drive time + Early arrival buffer + Comfort buffer
- Applies to all events assigned to this user

**Example:**
```
Event starts: 5:30 PM
Early arrival needed: 30 min (arrive by 5:00 PM)
Drive time: 25 min

Without comfort buffer:
Leave by: 4:35 PM (5:00 PM - 25 min)

With 10 min comfort buffer:
Leave by: 4:25 PM (4:35 PM - 10 min)
```

**Real-Time Effect:**
- When toggled ON: All departure times shift earlier
- When toggled OFF: All departure times shift to calculated time
- Updates happen immediately
- Google Calendar supplemental events updated automatically

---

### Comfort Buffer Duration

**Entry Point:** Settings → Comfort Buffer Duration (only visible when Use Comfort Buffer is ON)

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Comfort Buffer Duration             │
├─────────────────────────────────────┤
│ Add extra time before departure to  │
│ account for getting ready and       │
│ unexpected delays.                  │
│                                     │
│ Current: 15 minutes                 │
│                                     │
│ 0 ────●───────────────── 60         │
│ min                         min     │
│                                     │
│ [Cancel]        [Save]              │
└─────────────────────────────────────┘
```

**Input Method:** Slider

**Range:** 0 to 60 minutes (in 5-minute increments)

**Default:** 15 minutes (when first enabled)

**System Actions on Save:**
1. Store new comfort buffer value
2. Recalculate all departure times for assigned events
3. Update Google Calendar supplemental events
4. Show progress if many events affected

**Visual Feedback:**
```
┌─────────────────────────────────────┐
│ ✅ Comfort Buffer Updated           │
│                                     │
│ Departure times adjusted for 12     │
│ upcoming events.                    │
└─────────────────────────────────────┘
```

---

## EVENT SETTINGS

### Keep Supplemental Events After Reassignment

**Purpose:** Control whether supplemental events (drive times, early arrival) remain in your calendar after you reassign an event to someone else

**Entry Point:** Settings → Keep Supplemental Events After Reassignment toggle

**Default:** OFF

---

### Toggle Behavior

**When OFF (Default):**
- You reassign event to someone else
- Your supplemental events are deleted from your Google Calendar
- Clean calendar - only shows events you're responsible for

**When ON:**
- You reassign event to someone else
- Your supplemental events remain in your Google Calendar for reference
- You can see timing even though not responsible
- Useful for: tracking schedule, knowing when others will be busy

**Example Scenario:**

Jennifer assigns Emma's Soccer to Tom.

**Jennifer's Calendar (Setting OFF):**
```
Before reassignment:
- 4:30 PM: 🚗 Drive to Emma's Soccer
- 5:00 PM: ⏰ Emma's Soccer - Arrive Early
- 5:30 PM: Emma - Soccer Practice
- 6:30 PM: 🚗 Drive home from Emma's Soccer

After reassignment:
- 5:30 PM: Emma - Soccer Practice (assigned to Tom)
[All supplemental events deleted]
```

**Jennifer's Calendar (Setting ON):**
```
Before reassignment:
- 4:30 PM: 🚗 Drive to Emma's Soccer
- 5:00 PM: ⏰ Emma's Soccer - Arrive Early
- 5:30 PM: Emma - Soccer Practice
- 6:30 PM: 🚗 Drive home from Emma's Soccer

After reassignment:
- 4:30 PM: 🚗 Drive to Emma's Soccer (grayed out/different color)
- 5:00 PM: ⏰ Emma's Soccer - Arrive Early (grayed out/different color)
- 5:30 PM: Emma - Soccer Practice (assigned to Tom)
- 6:30 PM: 🚗 Drive home from Emma's Soccer (grayed out/different color)
[Supplemental events kept but visually distinct as not your responsibility]
```

**Important Notes:**
- This setting ONLY applies to reassignment (when you give away an event)
- When Event Calendar is deleted: All events removed regardless of this setting
- When you're removed from Event Calendar: All events removed regardless of this setting
- Supplemental events shown in Google Calendar are clearly marked as "reference only" via styling/description

---

## EVENT CALENDAR MANAGEMENT

**Entry Point:** Settings → Manage Event Calendars

**Screen:** Opens Event Calendar Management screen (covered in [EVENT_CAL_MGMT.md](./EVENT_CAL_MGMT.md))

**Includes:**
- View all Event Calendars
- Add new Event Calendar
- View Event Calendar details
- Refresh Event Calendar
- Delete Event Calendar (owner only)

---

## CHILD MANAGEMENT

**Entry Point:** Settings → Manage Children

**Screen:** Opens Child Management screen (covered in [CHILD_MANAGEMENT_FLOW.md](./CHILD_MANAGEMENT_FLOW.md))

**Includes:**
- View all children
- Add new child
- Edit child details
- Delete child (if no Event Calendars)

---

## ACCOUNT SETTINGS

### Email Address

**Entry Point:** Settings → Email Address

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Email Address                       │
├─────────────────────────────────────┤
│ Current email:                      │
│ jennifer@example.com                │
│                                     │
│ This is your Google account email   │
│ used to sign in.                    │
│                                     │
│ [Change Email]                      │
└─────────────────────────────────────┘
```

---

### Change Email Flow

**Trigger:** User taps "Change Email"

**Step 1: Confirm Intent**

```
┌─────────────────────────────────────┐
│ Change Email Address?               │
│                                     │
│ Changing your email requires        │
│ signing out and signing back in     │
│ with a different Google account.    │
│                                     │
│ Your Event Calendars and assignments│
│ will be preserved.                  │
│                                     │
│ [Cancel]     [Continue]             │
└─────────────────────────────────────┘
```

**Step 2: Sign Out**

**System Actions:**
1. Save current session data
2. Disconnect Google Calendar temporarily
3. Sign user out

**Step 3: Sign In with New Account**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Sign In with New Google Account    │
│                                     │
│ [Sign in with Google]               │
└─────────────────────────────────────┘
```

**Step 4: Verify and Connect**

**System Actions:**
1. Authenticate with new Google account
2. Get new email address
3. Request Google Calendar permissions
4. Update user record with new email
5. Reconnect Google Calendar with new account
6. Sync all events to new Google Calendar

**Step 5: Notify Other Parents**

**System Actions:**
- All Event Calendar members notified via WebSocket
- Members see updated email address for this parent
- Email notifications sent to other members:

```
[Parent Name] Updated Email Address
[Parent Name] is now using [new-email@example.com]
on [App Name].
```

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Email Updated                    │
│                                     │
│ You're now signed in as:            │
│ [new-email@example.com]             │
│                                     │
│ Syncing events to your new          │
│ Google Calendar...                  │
└─────────────────────────────────────┘
```

**Important Notes:**
- All Event Calendar memberships preserved
- All event assignments preserved
- Events migrate to new Google Calendar
- Old Google Calendar no longer synced
- Pending invitations to old email remain valid (can still accept)

---

### Google Calendar Connection

**Entry Point:** Settings → Google Calendar

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Google Calendar                     │
├─────────────────────────────────────┤
│ Status: ✅ Connected                │
│                                     │
│ Account: jennifer@example.com       │
│ Last Sync: Nov 20, 3:45 PM          │
│                                     │
│ [Disconnect]                        │
│ [Reconnect]                         │
└─────────────────────────────────────┘
```

---

### Disconnect Google Calendar

**Trigger:** User taps "Disconnect"

**Confirmation:**
```
┌─────────────────────────────────────┐
│ ⚠️ Disconnect Google Calendar?      │
│                                     │
│ Disconnecting will remove all app   │
│ events from your Google Calendar.   │
│                                     │
│ You'll need to reconnect a calendar │
│ immediately to continue using the   │
│ app.                                │
│                                     │
│ [Cancel]     [Disconnect]           │
└─────────────────────────────────────┘
```

**System Actions:**
1. Delete all events from Google Calendar (main and supplemental)
2. Revoke Google Calendar API access
3. Mark user as "disconnected"

**Immediate Prompt to Reconnect:**
```
┌─────────────────────────────────────┐
│ Connect Calendar                    │
│                                     │
│ You need a connected calendar to    │
│ use [App Name].                     │
│                                     │
│ [Connect Google Calendar]           │
└─────────────────────────────────────┘
```

**User Must Reconnect:**
- App unusable until calendar reconnected
- Can reconnect same Google account
- Or connect different Google account (same as email change flow)

---

### Reconnect Google Calendar

**Trigger:** User taps "Reconnect"

**Use Cases:**
- Connection lost/expired
- Permissions revoked
- User manually disconnected and wants to reconnect

**Flow:**
1. Request Google Calendar permissions
2. Re-authenticate if needed
3. Create all events in Google Calendar
4. Update sync status

**Success:**
```
┌─────────────────────────────────────┐
│ ✅ Calendar Reconnected             │
│                                     │
│ Syncing 12 events to your calendar. │
└─────────────────────────────────────┘
```

---

### Privacy & Data

**Entry Point:** Settings → Privacy & Data

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Privacy & Data                      │
├─────────────────────────────────────┤
│ WHAT CO-PARENTS CAN SEE             │
│                                     │
│ Other parents on your Event         │
│ Calendars can see:                  │
│ • Your name and email               │
│ • Which events you're assigned to   │
│ • When you need to leave/arrive     │
│   (based on your starting address)  │
│                                     │
│ They cannot see:                    │
│ • Your personal calendar events     │
│ • Your exact location               │
│ • Event Calendars you're not a      │
│   member of                         │
│                                     │
├─────────────────────────────────────┤
│ ANALYTICS                           │
│                                     │
│ Share Usage Analytics               │
│ [Toggle: ON/OFF]                    │
│                                     │
│ Help us improve the app by sharing  │
│ anonymous usage data.               │
│                                     │
│ Crash reports are always sent to    │
│ help us fix bugs.                   │
│                                     │
├─────────────────────────────────────┤
│ [Privacy Policy]                    │
└─────────────────────────────────────┘
```

**Settings Available:**
- **Share Usage Analytics:** Toggle ON/OFF (default: ON)
  - When ON: Anonymized usage data sent (which features used, timing)
  - When OFF: No usage data sent
  - Crash reports always sent (no opt-out) for app stability

**Information Only (Not Configurable):**
- What co-parents can see
- What co-parents cannot see
- Link to full Privacy Policy

---

### Delete Account

**Entry Point:** Settings → Delete Account

**Trigger:** User taps "Delete Account"

**Step 1: Warning and Confirmation**

```
┌─────────────────────────────────────┐
│ ⚠️ Delete Account?                  │
│                                     │
│ This will permanently:              │
│ • Delete all your data              │
│ • Remove you from all Event         │
│   Calendars                         │
│ • Delete all events from your       │
│   Google Calendar                   │
│ • Unassign all events assigned to   │
│   you                               │
│                                     │
│ This cannot be undone.              │
│                                     │
│ Event Calendars you own will be     │
│ deleted (removing events for all    │
│ members).                           │
│                                     │
│ [Cancel]     [Continue]             │
└─────────────────────────────────────┘
```

**Step 2: Type Email to Confirm**

**If user owns any Event Calendars:**
```
┌─────────────────────────────────────┐
│ Confirm Account Deletion            │
│                                     │
│ You own 2 Event Calendars:          │
│ • Emma's Soccer League              │
│ • Jake's Basketball League          │
│                                     │
│ Deleting your account will DELETE   │
│ these calendars and remove all      │
│ events for all members.             │
│                                     │
│ Type your email to confirm:         │
│ [                          ]        │
│                                     │
│ [Cancel]     [Delete Account]       │
└─────────────────────────────────────┘
```

**If user doesn't own any Event Calendars:**
```
┌─────────────────────────────────────┐
│ Confirm Account Deletion            │
│                                     │
│ Type your email to confirm:         │
│ [jennifer@example.com      ]        │
│                                     │
│ [Cancel]     [Delete Account]       │
└─────────────────────────────────────┘
```

**Validation:** Email must exactly match user's email

**Step 3: Processing Deletion**

```
┌─────────────────────────────────────┐
│ Deleting Account...                 │
│ [Progress bar]                      │
│                                     │
│ This may take a moment.             │
└─────────────────────────────────────┘
```

**System Actions:**
1. If user owns Event Calendars: Delete all owned Event Calendars (see [EVENT_CAL_MGMT.md](./EVENT_CAL_MGMT.md) deletion process)
2. Remove user from all Event Calendar memberships
3. Unassign all events assigned to user
4. Delete all events from user's Google Calendar
5. Revoke Google Calendar access
6. Delete user account record
7. Notify all affected Event Calendar members
8. Sign user out

**Step 4: Confirmation**

```
┌─────────────────────────────────────┐
│ Account Deleted                     │
│                                     │
│ Your account has been permanently   │
│ deleted.                            │
│                                     │
│ [Close]                             │
└─────────────────────────────────────┘
```

**App State:** Returns to welcome/sign-in screen

**Real-Time Effects:**
- Other Event Calendar members see user removed immediately
- Events unassigned from deleted user appear in Unassigned feed
- If user owned Event Calendars: All members lose access to those calendars

---

## ABOUT SECTION

### Version

**Display Only:** Shows current app version number

**Location:** Settings → About → Version X.X.X

---

### Terms of Service

**Entry Point:** Settings → Terms of Service

**Screen:** Opens web view with Terms of Service

---

### Privacy Policy

**Entry Point:** Settings → Privacy Policy

**Screen:** Opens web view with Privacy Policy

---

### Help & Support

**Entry Point:** Settings → Help & Support

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Help & Support                      │
├─────────────────────────────────────┤
│ COMMON QUESTIONS                    │
│                                     │
│ How do I add an Event Calendar?   › │
│ How do I invite a co-parent?      › │
│ How do I change my address?       › │
│ Why aren't my events syncing?     › │
│                                     │
├─────────────────────────────────────┤
│ CONTACT SUPPORT                     │
│                                     │
│ Email: support@[app].com            │
│ [Send Email]                        │
│                                     │
│ FAQ & Documentation                 │
│ [View Help Center]                  │
└─────────────────────────────────────┘
```

---

## DISPLAY PREFERENCES

### Dark Mode

**Implementation:** Follows system setting automatically

**No User Control:** App theme matches iOS system appearance

**States:**
- System Light Mode → App Light Mode
- System Dark Mode → App Dark Mode
- Automatic switching when system changes

---

### Default Tab

**Behavior:** App always opens to "Upcoming Events" tab

**No User Control:** Fixed behavior for MVP

**Rationale:** Most common use case is checking upcoming events

---

## EDGE CASES & ERROR HANDLING

### Address Change Fails to Geocode

**Scenario:** User enters address that cannot be validated

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Address Not Found                │
│                                     │
│ We couldn't verify this address.    │
│ Please check and try again.         │
│                                     │
│ [Try Again]  [Cancel]               │
└─────────────────────────────────────┘
```

**User Options:**
- Try Again: Returns to address input
- Cancel: Keeps current address

---

### Comfort Buffer Change Affects Many Events

**Scenario:** User has 50+ assigned events when changing buffer

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Updating Departure Times...         │
│ [Progress bar: 45%]                 │
│                                     │
│ Updating 52 events.                 │
│ This may take a moment.             │
└─────────────────────────────────────┘
```

**System Action:**
- Process in batches
- Show progress
- Handle API rate limits
- Complete all updates before showing success

---

### Email Change with Pending Invitations

**Scenario:** User has pending invitations sent to old email

**Behavior:**
- Invitations to old email remain valid
- User can still accept them after email change
- System matches by user account, not email string

**Example:**
```
1. Jennifer invited as jennifer@example.com
2. User changes email to jennifer.smith@example.com
3. Invitation sent to jennifer@example.com still works
4. System recognizes user account regardless of email
```

---

### Google Calendar Reconnection Fails

**Scenario:** Permissions denied or authentication fails

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Connection Failed                │
│                                     │
│ Unable to connect to Google         │
│ Calendar. Please check permissions  │
│ and try again.                      │
│                                     │
│ [Retry]  [Cancel]                   │
└─────────────────────────────────────┘
```

**User Options:**
- Retry: Attempt connection again
- Cancel: Return to settings (app still unusable)

**App State:** Cannot use app until calendar connected

---

### Account Deletion with Network Failure

**Scenario:** Deletion process starts but network fails mid-way

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Deletion Incomplete              │
│                                     │
│ Account deletion started but        │
│ couldn't complete. Some data may    │
│ remain.                             │
│                                     │
│ Contact support for assistance.     │
│                                     │
│ [Contact Support]  [Close]          │
└─────────────────────────────────────┘
```

**System Action:**
- Log partial deletion for support team
- User remains signed in (can retry)
- Support team manually completes deletion

---

### Supplemental Event Retention Setting Change

**Scenario:** User toggles setting but has no current assignments

**Behavior:**
- Setting saved
- No immediate effect
- Applies to future reassignments

**No Retroactive Effect:**
- Setting does not affect past reassignments
- Only applies to future reassignments after setting changed

---

## TECHNICAL REQUIREMENTS

### Settings Data Model

**Database Fields (per user):**
- `user_id` (foreign key)
- `default_starting_address` (string, geocoded)
- `starting_address_lat` (decimal)
- `starting_address_lng` (decimal)
- `use_comfort_buffer` (boolean, default: false)
- `comfort_buffer_minutes` (integer, 0-60, default: 5)
- `keep_supplemental_events_on_reassignment` (boolean, default: false)
- `share_analytics` (boolean, default: true)
- `updated_at` (timestamp)

---

### Real-Time Updates

**Settings Changes Affecting Events:**
- Address change: Triggers recalculation of all supplemental events
- Comfort buffer toggle/change: Triggers recalculation of all departure times
- Both updates sent via WebSocket to user's devices

**Settings Not Affecting Others:**
- Supplemental event retention: Only affects this user
- Analytics preference: Only affects this user
- No WebSocket updates needed for other users

---

### API Endpoints

**Get Settings:**
- `GET /api/users/me/settings`
- Returns: User settings object

**Update Address:**
- `PATCH /api/users/me/settings/address`
- Body: `{ address, lat, lng }`
- Triggers: Recalculation of supplemental events

**Update Comfort Buffer:**
- `PATCH /api/users/me/settings/comfort-buffer`
- Body: `{ use_comfort_buffer, comfort_buffer_minutes }`
- Triggers: Recalculation of departure times

**Update Event Settings:**
- `PATCH /api/users/me/settings/events`
- Body: `{ keep_supplemental_events_on_reassignment }`

**Update Privacy Settings:**
- `PATCH /api/users/me/settings/privacy`
- Body: `{ share_analytics }`

**Delete Account:**
- `DELETE /api/users/me`
- Cascades: Deletes all owned Event Calendars, removes from memberships, deletes events

---

## SUCCESS CRITERIA

**Location Settings:**
1. ✅ Users can view current starting address
2. ✅ Users can update starting address
3. ✅ Address validated via geocoding
4. ✅ Address change triggers recalculation
5. ✅ Progress shown for many events
6. ✅ Each co-parent has independent address

**Timing Settings:**
7. ✅ Comfort buffer can be toggled on/off
8. ✅ Slider allows 0-60 minutes in 5-min increments
9. ✅ Changes apply immediately to all events
10. ✅ Departure times update in Google Calendar
11. ✅ Default behavior (no buffer) works correctly

**Event Settings:**
12. ✅ Supplemental event retention toggle works
13. ✅ Setting applies to future reassignments
14. ✅ Default (OFF) removes supplemental events
15. ✅ When ON, events remain with visual distinction

**Account Settings:**
16. ✅ Email can be changed via Google re-auth
17. ✅ Memberships preserved after email change
18. ✅ Google Calendar can be disconnected
19. ✅ Must reconnect calendar to continue using app
20. ✅ Account can be deleted with high friction
21. ✅ Deletion removes all data permanently
22. ✅ Owned Event Calendars deleted on account deletion

**Privacy & Data:**
23. ✅ Information shown about co-parent visibility
24. ✅ Analytics can be opted out
25. ✅ Crash reporting always enabled
26. ✅ Privacy policy accessible

**Display:**
27. ✅ Dark mode follows system setting
28. ✅ App opens to Upcoming Events tab
29. ✅ Version number displayed

**Edge Cases:**
30. ✅ Invalid addresses handled gracefully
31. ✅ Large event counts show progress
32. ✅ Pending invitations work after email change
33. ✅ Failed reconnections handled with retry
34. ✅ Partial account deletions logged for support

---

## FUTURE ENHANCEMENTS (Phase 2+)

**Advanced Timing:**
- Per-event-type comfort buffers
- Time-of-day based buffers (more time during rush hour)
- Automatic buffer learning based on user behavior

**Advanced Location:**
- Multiple saved addresses (home, work, grandparents)
- Temporary address override per event
- Current location detection for ad-hoc departures

**Notification Preferences:**
- In-app notification customization
- Per-Event-Calendar notification settings
- Digest mode (daily summary)
- Quiet hours

**Display Preferences:**
- Default tab selection
- Event sorting preferences
- Calendar view options
- Compact/expanded event cards

**Export & Backup:**
- Export event history
- Backup settings
- Transfer to new account

**Advanced Privacy:**
- Granular co-parent visibility controls
- Activity history viewing
- Data retention preferences

---

*This specification defines the complete Settings & Preferences flow with emphasis on per-user configuration, immediate effect of changes, and minimal MVP settings scope. All details are locked down and ready for implementation.*
