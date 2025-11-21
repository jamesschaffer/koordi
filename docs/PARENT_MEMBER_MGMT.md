# Parent Member Management Flow
## Family Scheduling iOS Application - FINAL SPECIFICATION

---

## OVERVIEW

This document defines how users manage parent members on Event Calendars: inviting new members, accepting/declining invitations, viewing member lists, and removing members.

**Key Principles:**
- Any existing parent member can invite others to an Event Calendar
- Any parent member can remove others, or leave themselves
- Removal deletes all events from removed member's Google Calendar
- Invitations valid forever (no expiration)
- Invitations can be resent or canceled
- Partial membership supported (can be member of some Event Calendars but not others for same child)
- Ownership transfer deferred to Phase 2

---

## PARENT MEMBER STRUCTURE

### Membership Levels

**Owner:**
- Created the Event Calendar
- Has all member permissions
- Can delete the Event Calendar (high friction)
- Cannot be removed by others
- Can remove themselves (transfers ownership first - Phase 2)

**Member:**
- Invited and accepted invitation
- Can view all events from Event Calendar
- Can assign/reassign events to themselves
- Can invite other members
- Can remove other members
- Can remove themselves (leave calendar)

**Invited (Pending):**
- Has been sent invitation
- Hasn't accepted yet
- Cannot see events or access calendar
- Invitation can be resent or canceled

---

## INVITING PARENT MEMBERS

### Entry Points

**During Event Calendar Creation:**
- Covered in onboarding flow (Step 5: Add Parent Members)
- Add members when first creating Event Calendar

**After Event Calendar Creation:**

**Option 1: From Event Calendar Detail**
- Settings → Event Calendars → [Calendar Name] → "Manage Members" → "Invite Parent"

**Option 2: From Member List**
- Settings → Event Calendars → [Calendar Name] → Tap "Members" section → "Invite Parent"

---

### Invite Parent Flow

**Step 1: Enter Email**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Invite Parent to Emma's Soccer      │
├─────────────────────────────────────┤
│ Email Address                       │
│ [tom@example.com          ]         │
│                                     │
│ [Cancel]        [Send Invite]       │
└─────────────────────────────────────┘
```

**Validation:**
- Email format validated
- Check if already a member (prevent duplicates)
- Check if invitation already pending (offer to resend)

---

**Step 2A: New Invitation**

**If email not already invited or member:**

**System Actions:**
1. Create invitation record
2. Generate invitation token
3. Send invitation email with:
   - Event Calendar name
   - Child name
   - Inviter name
   - Accept link with token
   - Calendar preview (upcoming events)

**Email Template:**
```
Subject: You've been invited to Emma's Soccer League

Hi!

[Inviter name] has invited you to join Emma's Soccer League 
on [App Name].

This calendar has 24 upcoming events including:
- Soccer Practice - Nov 20, 5:30 PM
- Soccer Game - Nov 22, 6:00 PM
- ...

Accept this invitation to:
• View all events with automatic departure times
• Assign events to yourself
• Coordinate with other parents

[Accept Invitation Button]

Or copy this link: https://app.com/invite/[token]

Questions? Reply to this email.
```

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Invitation Sent                  │
│                                     │
│ Invitation sent to tom@example.com  │
│ They'll receive an email to join.   │
└─────────────────────────────────────┘
```

**Real-Time Updates:**
- All existing members see pending invitation in member list
- Invitation shows in Settings → Event Calendars → [Calendar] → Members as "Pending"

---

**Step 2B: Already Pending**

**If invitation already sent but not accepted:**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Invitation Already Sent             │
│                                     │
│ tom@example.com was invited on      │
│ Nov 15 but hasn't accepted yet.     │
│                                     │
│ [Resend Invitation]  [Cancel]       │
└─────────────────────────────────────┘
```

**User Options:**
- **Resend Invitation:** Sends new invitation email
- **Cancel:** Returns to previous screen

---

**Step 2C: Already a Member**

**If email belongs to existing member:**

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Already a Member                    │
│                                     │
│ tom@example.com is already a member │
│ of Emma's Soccer League.            │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

**System Action:** Prevent duplicate, user must try different email

---

## ACCEPTING INVITATIONS

### Entry Point

**From Email Link:**
- User clicks "Accept Invitation" in email
- Opens app (or app store if not installed)
- Token validated

---

### Accept Invitation Flow

**Step 1: View Invitation Details**

**If user not logged in:**
- Prompted to sign in with Google (or create account)
- After sign-in, proceeds to invitation details

**If user logged in:**
- Directly shows invitation details

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Invitation to Emma's Soccer League  │
├─────────────────────────────────────┤
│ [Inviter name] invited you to join  │
│ this Event Calendar for Emma.       │
│                                     │
│ UPCOMING EVENTS (24)                │
│ • Soccer Practice - Nov 20, 5:30 PM │
│ • Soccer Game - Nov 22, 6:00 PM     │
│ • Soccer Practice - Nov 25, 5:30 PM │
│ ...                                 │
│                                     │
│ By accepting, you'll be able to:    │
│ • View all events                   │
│ • Assign events to yourself         │
│ • Get automatic departure times     │
│ • Coordinate with other members     │
│                                     │
│ CURRENT MEMBERS                     │
│ • [Inviter name] (Owner)            │
│ • [Other member names]              │
│                                     │
│ [Decline]        [Accept]           │
└─────────────────────────────────────┘
```

---

**Step 2A: User Accepts**

**System Actions:**
1. Add user as parent member to Event Calendar
2. Create main events in user's Google Calendar (all existing events, unassigned)
3. Update invitation status to "Accepted"
4. Send WebSocket updates to all existing members
5. Notify inviter (push notification and/or email)

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Joined Emma's Soccer League      │
│                                     │
│ You can now view events and assign  │
│ them to yourself.                   │
│                                     │
│ [View Events]  [Done]               │
└─────────────────────────────────────┘
```

**User Options:**
- **View Events:** Opens event feed filtered to this Event Calendar
- **Done:** Returns to Dashboard

**Real-Time Updates:**
- All existing members see new member in member list immediately
- Inviter receives notification: "[New member name] joined Emma's Soccer League"

---

**Step 2B: User Declines**

**Confirmation:**
```
┌─────────────────────────────────────┐
│ Decline Invitation?                 │
│                                     │
│ Are you sure you want to decline    │
│ this invitation to Emma's Soccer?   │
│                                     │
│ [Cancel]     [Decline]              │
└─────────────────────────────────────┘
```

**System Actions:**
1. Update invitation status to "Declined"
2. Notify inviter (optional push notification)
3. Remove invitation from user's pending list

**Message:**
```
┌─────────────────────────────────────┐
│ Invitation Declined                 │
│                                     │
│ You won't receive further reminders │
│ about this invitation.              │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

**Real-Time Updates:**
- Invitation removed from pending list for all members
- Inviter sees "Declined" status (if they check)

---

## VIEWING PARENT MEMBERS

### Entry Point

**From Event Calendar Detail:**
- Settings → Event Calendars → [Calendar Name] → "Members" section

---

### Member List Screen

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Emma's Soccer League - Members      │
├─────────────────────────────────────┤
│ OWNER                               │
│                                     │
│ 👤 [Owner Name]                     │
│    [owner@example.com]              │
│    Joined: Nov 1, 2024              │
│                                     │
├─────────────────────────────────────┤
│ MEMBERS (2)                         │
│                                     │
│ 👤 [Member Name]                    │
│    [member@example.com]             │
│    Joined: Nov 5, 2024              │
│    [Remove]                         │
│                                     │
│ 👤 You                              │
│    [your@example.com]               │
│    Joined: Nov 10, 2024             │
│    [Leave Calendar]                 │
│                                     │
├─────────────────────────────────────┤
│ PENDING INVITATIONS (1)             │
│                                     │
│ 📧 [pending@example.com]            │
│    Invited: Nov 15, 2024            │
│    [Resend]  [Cancel]               │
│                                     │
├─────────────────────────────────────┤
│ [Invite Parent]                     │
└─────────────────────────────────────┘
```

**Information Shown:**
- Owner (always listed first, cannot be removed by others)
- Active members (with join date and remove option)
- Current user (with "Leave Calendar" option)
- Pending invitations (with resend/cancel options)
- Invite button at bottom

---

## REMOVING PARENT MEMBERS

### Scenario A: Removing Another Member

**Trigger:** User taps "Remove" next to another member's name

**Confirmation:**
```
┌─────────────────────────────────────┐
│ Remove [Member Name]?               │
│                                     │
│ This will:                          │
│ • Remove all events from their      │
│   Google Calendar                   │
│ • Unassign any events assigned to   │
│   them                              │
│ • Remove their access to this       │
│   Event Calendar                    │
│                                     │
│ They can be re-invited later.       │
│                                     │
│ [Cancel]     [Remove]               │
└─────────────────────────────────────┘
```

**System Actions:**
1. Check if member has any assigned events
2. If YES: Unassign all their events (set to unassigned)
3. Delete all main events from their Google Calendar
4. Delete all supplemental events from their Google Calendar
5. Remove member record from Event Calendar
6. Send WebSocket updates to all remaining members
7. Notify removed member (push notification and/or email)

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Member Removed                   │
│                                     │
│ [Member Name] has been removed from │
│ Emma's Soccer League.               │
│                                     │
│ 3 events were unassigned and are    │
│ now available for reassignment.     │
└─────────────────────────────────────┘
```

**Real-Time Updates:**
- Member immediately loses access to Event Calendar
- Member's view updates: Event Calendar disappears from their list
- All events removed from their Google Calendar
- All remaining members see updated member list
- Unassigned events appear in everyone's "Unassigned" feed

**Notification to Removed Member:**
```
Removed from Emma's Soccer League
[Remover name] removed you from Emma's Soccer League.
All events have been removed from your calendar.
```

---

### Scenario B: Leaving Calendar (Self-Removal)

**Trigger:** User taps "Leave Calendar" next to their own name

**Confirmation:**
```
┌─────────────────────────────────────┐
│ Leave Emma's Soccer League?         │
│                                     │
│ This will:                          │
│ • Remove all events from your       │
│   Google Calendar                   │
│ • Unassign any events you're        │
│   handling                          │
│ • Remove your access to this        │
│   Event Calendar                    │
│                                     │
│ You'll need to be re-invited to     │
│ join again.                         │
│                                     │
│ [Cancel]     [Leave]                │
└─────────────────────────────────────┘
```

**System Actions:**
1. Check if user has any assigned events
2. If YES: Unassign all their events
3. Delete all events from their Google Calendar
4. Remove user from Event Calendar members
5. Send WebSocket updates to remaining members
6. Notify remaining members (owner receives notification)

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Left Emma's Soccer League        │
│                                     │
│ You've been removed from this       │
│ Event Calendar. All events have     │
│ been removed from your calendar.    │
└─────────────────────────────────────┘
```

**Real-Time Updates:**
- Event Calendar disappears from user's list
- All events removed from their Google Calendar
- Remaining members see updated member list
- Unassigned events appear in remaining members' feeds

**Notification to Remaining Members:**
```
[User name] left Emma's Soccer League
3 events are now unassigned and need to be reassigned.
```

---

### Scenario C: Owner Attempts to Leave (MVP: Prevented)

**Trigger:** Owner taps "Leave Calendar"

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Cannot Leave as Owner               │
│                                     │
│ You're the owner of this Event      │
│ Calendar and cannot leave.          │
│                                     │
│ To remove this calendar, delete it  │
│ from Settings.                      │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

**System Action:** Prevent leaving, must delete calendar instead

**Note:** Ownership transfer is Phase 2, so MVP prevents owner from leaving

---

## MANAGING INVITATIONS

### Resending Invitations

**Trigger:** User taps "Resend" next to pending invitation

**System Actions:**
1. Generate new invitation token (old token remains valid)
2. Update invitation timestamp
3. Send new invitation email

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Invitation Resent                │
│                                     │
│ New invitation sent to              │
│ [email@example.com]                 │
└─────────────────────────────────────┘
```

**Note:** Invitations never expire, so old links still work

---

### Canceling Invitations

**Trigger:** User taps "Cancel" next to pending invitation

**Confirmation:**
```
┌─────────────────────────────────────┐
│ Cancel Invitation?                  │
│                                     │
│ This will invalidate the invitation │
│ sent to [email@example.com].        │
│                                     │
│ [Cancel]     [Confirm]              │
└─────────────────────────────────────┘
```

**System Actions:**
1. Invalidate invitation token
2. Remove invitation record
3. Send WebSocket updates to all members

**Success Message:**
```
┌─────────────────────────────────────┐
│ ✅ Invitation Canceled              │
│                                     │
│ Invitation to [email@example.com]   │
│ has been canceled.                  │
└─────────────────────────────────────┘
```

**Real-Time Updates:**
- Invitation removed from all members' pending lists
- If invited user clicks old link: "This invitation has been canceled"

---

## PARTIAL MEMBERSHIP

### How It Works

**Scenario:** Emma has three Event Calendars:
- Soccer League
- Dance Studio
- School Events

**Jennifer's Membership:**
- Member of "Soccer League" ✅
- Member of "Dance Studio" ✅
- NOT member of "School Events" ❌

**Jennifer's View:**
- Sees events from Soccer and Dance
- Does NOT see events from School
- Can assign Soccer and Dance events to herself
- Cannot see or assign School events
- Can be invited to School events later

**Tom's Membership:**
- Member of "Soccer League" ✅
- NOT member of "Dance Studio" ❌
- Member of "School Events" ✅

**Tom's View:**
- Sees events from Soccer and School only
- Can assign those events to himself
- Cannot see Dance events at all

**Key Principle:**
- Membership is per Event Calendar, not per child
- Allows flexible access control
- Useful for:
  - Separated parents with different involvement levels
  - Grandparents who only help with certain activities
  - Blended families with step-parent boundaries

---

## EDGE CASES & ERROR HANDLING

### Invalid Invitation Token

**Scenario:** User clicks invitation link but token is invalid or canceled

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Invalid Invitation               │
│                                     │
│ This invitation link is not valid.  │
│ It may have been canceled or        │
│ expired.                            │
│                                     │
│ Contact the person who invited you  │
│ to send a new invitation.           │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

---

### Removing Member with Many Assigned Events

**Scenario:** Member has 20+ assigned events

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Remove [Member Name]?               │
│                                     │
│ [Member Name] is assigned to 24     │
│ events. These will be unassigned    │
│ and need to be reassigned.          │
│                                     │
│ This will:                          │
│ • Remove all 24 events from their   │
│   Google Calendar                   │
│ • Make 24 events available for      │
│   reassignment                      │
│ • Remove their access to this       │
│   Event Calendar                    │
│                                     │
│ [Cancel]     [Remove]               │
└─────────────────────────────────────┘
```

**System Actions:**
- Process all unassignments in batch
- Delete all events from Google Calendar
- Show progress if large number of events

**Progress Indicator (if needed):**
```
┌─────────────────────────────────────┐
│ Removing Member...                  │
│ [Progress bar: 45%]                 │
│                                     │
│ Unassigning events and removing     │
│ from calendar...                    │
└─────────────────────────────────────┘
```

---

### Removing Last Non-Owner Member

**Scenario:** Owner is only member left after removal

**Behavior:**
- Removal proceeds normally
- Owner remains as sole member
- Owner can still use Event Calendar
- Owner can invite new members anytime

**No Special Warning:** This is a valid state

---

### Member Removal While Viewing Events

**Scenario:** Tom is viewing event detail screen when Jennifer removes him

**Tom's Screen:**
- WebSocket update received
- Modal appears:

```
┌─────────────────────────────────────┐
│ Removed from Event Calendar         │
│                                     │
│ [Remover name] removed you from     │
│ Emma's Soccer League.               │
│                                     │
│ All events have been removed from   │
│ your calendar.                      │
│                                     │
│ [Return to Dashboard]               │
└─────────────────────────────────────┘
```

**System Action:** Redirect to Dashboard, Event Calendar no longer accessible

---

### Accepting Invitation for Already-Member Email

**Scenario:** User A invites user B, but user B's email already belongs to another account that's a member

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Already a Member                    │
│                                     │
│ This account is already a member of │
│ Emma's Soccer League.               │
│                                     │
│ [View Calendar]                     │
└─────────────────────────────────────┘
```

**System Action:** Mark invitation as already fulfilled, redirect to calendar

---

### Self-Invitation

**Scenario:** User tries to invite their own email address

**Screen Display:**
```
┌─────────────────────────────────────┐
│ Cannot Invite Yourself              │
│                                     │
│ You're already a member of this     │
│ Event Calendar.                     │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

---

### Failed Event Deletion During Removal

**Scenario:** Google Calendar API fails when deleting events during member removal

**Screen Display:**
```
┌─────────────────────────────────────┐
│ ⚠️ Removal Incomplete               │
│                                     │
│ [Member Name] was removed from the  │
│ Event Calendar, but some events may │
│ not have been deleted from their    │
│ Google Calendar.                    │
│                                     │
│ They should manually delete any     │
│ remaining events.                   │
│                                     │
│ [OK]                                │
└─────────────────────────────────────┘
```

**System Actions:**
- Log error for debugging
- Member still removed from Event Calendar
- Manual cleanup required (support escalation if needed)

---

### Re-Inviting Previously Removed Member

**Scenario:** Jennifer was removed, now being re-invited

**Behavior:**
- Treated as completely new invitation
- No historical data preserved
- No previous assignments restored
- Clean slate

**Note:** This is intentional - removal is destructive

---

## TECHNICAL REQUIREMENTS

### Parent Member Data Model

**Database Fields:**
- `id` (UUID, primary key)
- `event_calendar_id` (foreign key)
- `user_id` (foreign key)
- `role` (enum: 'owner' or 'member')
- `joined_at` (timestamp)
- `invited_by` (foreign key to user, nullable)

**Invitation Model:**
- `id` (UUID, primary key)
- `event_calendar_id` (foreign key)
- `email` (string)
- `token` (UUID, unique)
- `invited_by` (foreign key to user)
- `invited_at` (timestamp)
- `status` (enum: 'pending', 'accepted', 'declined', 'canceled')

---

### Permissions Matrix

| Action | Owner | Member | Non-Member |
|--------|-------|--------|------------|
| View events | ✅ | ✅ | ❌ |
| Assign events | ✅ | ✅ | ❌ |
| Invite members | ✅ | ✅ | ❌ |
| Remove others | ✅ | ✅ | ❌ |
| Remove self | ❌ (MVP) | ✅ | N/A |
| Delete calendar | ✅ | ❌ | ❌ |
| Resend invitation | ✅ | ✅ | ❌ |
| Cancel invitation | ✅ | ✅ | ❌ |

---

### Real-Time Updates

**WebSocket Events:**
- `member_invited` - New invitation sent
- `member_joined` - Member accepted invitation
- `member_removed` - Member removed (by self or others)
- `invitation_canceled` - Pending invitation canceled
- `invitation_declined` - Invitation declined

**Subscriptions:**
- All Event Calendar members subscribed to member events
- Updates push immediately to all connected clients

---

### API Endpoints

**Invite Member:**
- `POST /api/event-calendars/:id/invitations`
- Body: `{ email }`
- Returns: Invitation object

**Accept Invitation:**
- `POST /api/invitations/:token/accept`
- Returns: Member object, creates Google Calendar events

**Decline Invitation:**
- `POST /api/invitations/:token/decline`
- Returns: Success confirmation

**Remove Member:**
- `DELETE /api/event-calendars/:id/members/:user_id`
- Deletes Google Calendar events, unassigns events
- Returns: Success confirmation

**Leave Calendar:**
- `DELETE /api/event-calendars/:id/members/me`
- Deletes Google Calendar events, unassigns events
- Returns: Success confirmation

**Resend Invitation:**
- `POST /api/invitations/:id/resend`
- Returns: New invitation sent confirmation

**Cancel Invitation:**
- `DELETE /api/invitations/:id`
- Returns: Success confirmation

**Get Members:**
- `GET /api/event-calendars/:id/members`
- Returns: Array of members and pending invitations

---

## SUCCESS CRITERIA

**Inviting Members:**
1. ✅ Any existing member can invite new members
2. ✅ Email validated before sending
3. ✅ Duplicate prevention works correctly
4. ✅ Invitation email sent successfully
5. ✅ Pending invitation visible to all members
6. ✅ Can resend invitation anytime
7. ✅ Can cancel invitation before acceptance

**Accepting Invitations:**
8. ✅ Invitation link works correctly
9. ✅ Token validation works
10. ✅ Preview shows calendar details
11. ✅ Acceptance creates all events in Google Calendar
12. ✅ New member sees all events immediately
13. ✅ Existing members notified of new member
14. ✅ Can decline invitation with confirmation

**Viewing Members:**
15. ✅ Member list shows all current members
16. ✅ Owner clearly indicated
17. ✅ Pending invitations shown separately
18. ✅ Join dates displayed
19. ✅ Current user identified ("You")

**Removing Members:**
20. ✅ Any member can remove others
21. ✅ Confirmation modal shows impact clearly
22. ✅ Events count shown in confirmation
23. ✅ All events deleted from removed member's Google Calendar
24. ✅ All supplemental events deleted too
25. ✅ Assigned events unassigned successfully
26. ✅ Removed member loses access immediately
27. ✅ Remaining members see updated member list
28. ✅ Removed member notified

**Leaving Calendar:**
29. ✅ Members can leave calendar themselves
30. ✅ Confirmation shows impact
31. ✅ All events removed from their Google Calendar
32. ✅ Their assigned events unassigned
33. ✅ Remaining members notified
34. ✅ Owner prevented from leaving (MVP)

**Partial Membership:**
35. ✅ Members can belong to some Event Calendars but not others for same child
36. ✅ Access control per Event Calendar works correctly
37. ✅ Members only see events from their Event Calendars
38. ✅ Can be invited to additional Event Calendars independently

**Edge Cases:**
39. ✅ Invalid tokens handled with clear error
40. ✅ Large event counts handled efficiently during removal
41. ✅ Last non-owner member removal works correctly
42. ✅ Concurrent viewing during removal handled gracefully
43. ✅ Duplicate emails prevented
44. ✅ Self-invitation prevented
45. ✅ Failed Google Calendar deletions handled
46. ✅ Re-inviting previously removed members works correctly

---

## FUTURE ENHANCEMENTS (Phase 2+)

**Ownership Transfer:**
- Owner can designate new owner
- Useful if primary coordinator changes
- New owner gains delete permissions
- Previous owner becomes regular member

**Role-Based Permissions:**
- "Observer" role (view only, cannot assign)
- "Admin" role (can remove owner)
- Custom permission sets

**Invitation Templates:**
- Pre-written invitation messages
- Personalized invitation text
- Invitation preferences

**Bulk Member Management:**
- Invite multiple emails at once
- Import members from contacts
- Remove multiple members

**Member Activity Tracking:**
- Last active timestamp
- Assignment history
- Reliability metrics

**Invitation Expiration:**
- Optional expiration dates
- Automatic cleanup of old invitations
- Reminder emails

**Member Notifications:**
- Control notification preferences per member
- "Notify me when [member] assigns/unassigns"
- Daily digest option

---

*This specification defines the complete Parent Member Management flow with emphasis on flexible permissions, partial membership support, and destructive member removal. All details are locked down and ready for implementation.*
