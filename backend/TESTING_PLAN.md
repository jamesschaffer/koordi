# Systematic End-to-End Testing Plan

This document outlines the systematic testing approach for validating the Koordi application after Phase 4 refactoring.

## Quick Reset Command

Before each test run, reset your account:

```bash
cd backend
npx ts-node src/scripts/resetUserAccount.ts james@jamesschaffer.com
```

This takes < 1 second and completely resets your account to simulate first-time setup.

---

## Phase 1: Fresh Account Setup

**Goal**: Verify first-time user experience and initial setup flow.

### Steps:
1. **Login**
   - Navigate to http://localhost:5173
   - Click "Sign in with Google"
   - Verify OAuth flow completes successfully
   - Verify you land on Setup page (not Dashboard)

2. **Complete Setup**
   - Enter home address in autocomplete field
   - Verify address suggestions appear
   - Select an address
   - Click "Complete Setup"
   - Verify redirect to Dashboard

3. **Verify Dashboard State**
   - Dashboard should show empty state
   - "No events" message should appear
   - No errors in browser console
   - Backend should return 200 for `/api/events`

**Expected Results**:
- No 500 errors
- User redirected to Dashboard after setup
- Home address saved in database
- Empty dashboard displays correctly

**Rollback**: Run reset script before next phase

---

## Phase 2: Calendar Import

**Goal**: Verify ICS feed import and event synchronization.

### Steps:
1. **Add Child**
   - Navigate to Children page
   - Click "Add Child"
   - Enter name: "Xander"
   - Upload photo (optional)
   - Enter date of birth
   - Save child
   - Verify child appears in list

2. **Add Calendar**
   - Navigate to Dashboard
   - Click "Add Calendar"
   - Enter calendar name: "Towson United"
   - Enter ICS URL: `[your test ICS feed URL]`
   - Select child: "Xander"
   - Choose color
   - Save calendar
   - Verify calendar appears in list

3. **Wait for Initial Sync**
   - Check calendar card for sync status
   - Wait for "last synced" timestamp to update
   - Verify events appear on Dashboard
   - Check event details (title, location, time)

4. **Verify Event Details**
   - Click on an event
   - Verify all fields display correctly
   - Verify child name shows
   - Verify calendar name shows
   - Close modal

**Expected Results**:
- Child created successfully
- Calendar syncs within 30 seconds
- Events appear on Dashboard timeline
- No duplicate events
- No errors in console

**Rollback**: Run reset script before next phase

---

## Phase 3: Event Assignment & Google Calendar Sync

**Goal**: Verify event assignment, supplemental event generation, and Google Calendar synchronization.

### Prerequisites:
- Complete Phase 1 & 2
- Have at least 3 events in calendar with different dates

### Steps:
1. **Enable Google Calendar Sync**
   - Navigate to Settings
   - Toggle "Enable Google Calendar Sync"
   - Verify OAuth flow opens
   - Complete authentication
   - Verify toggle shows enabled
   - Check browser console for errors

2. **Assign First Event**
   - Click on an event
   - Click "Assign to Me"
   - Verify assignment badge appears
   - Verify event color changes
   - Check Google Calendar for event

3. **Verify Supplemental Events Created**
   - Check if departure drive time appears before event
   - Check if arrival buffer appears before event
   - Check if return drive time appears after event
   - Verify timing calculations are correct
   - Verify Google Calendar shows all 4 events (1 main + 3 supplemental)

4. **Assign Second Event (Conflict Check)**
   - Find an event that conflicts with first event
   - Click "Assign to Me"
   - Verify conflict warning appears
   - Verify warning shows overlapping events
   - Proceed with assignment
   - Verify both events assigned

5. **Verify Google Calendar Sync**
   - Open Google Calendar in browser
   - Verify all assigned events appear
   - Verify supplemental events appear (if opted in)
   - Verify event descriptions include child name
   - Verify event descriptions include calendar name

**Expected Results**:
- Google Calendar sync enables successfully
- Events sync to Google Calendar within 5 seconds
- Supplemental events created with correct times
- Conflict detection works
- All events have correct metadata in descriptions

**Rollback**: Run reset script before next phase

---

## Phase 4: Multi-User Features (Invitation System)

**Goal**: Verify calendar sharing and multi-user event visibility.

### Prerequisites:
- Complete Phase 1-3
- Have a second email account for testing (use Gmail + alias: `james+test@jamesschaffer.com`)

### Steps:
1. **Send Invitation**
   - Navigate to Calendar settings
   - Click "Invite Member"
   - Enter email: `james+test@jamesschaffer.com`
   - Send invitation
   - Verify invitation appears as "pending"

2. **Accept Invitation (Second Account)**
   - Open browser in incognito mode
   - Navigate to invitation link from email
   - Sign in with second account
   - Accept invitation
   - Verify calendar appears in second user's dashboard

3. **Verify Multi-User Event Visibility**
   - Second user should see all events from shared calendar
   - Events should show child name and calendar name
   - Second user should NOT see supplemental events (unless they enable sync)

4. **Assign Event as Second User**
   - Second user assigns an event
   - Verify event syncs to second user's Google Calendar
   - Verify event does NOT appear in first user's calendar
   - Verify supplemental events created for second user

5. **Conflict Detection Between Users**
   - Second user assigns event that overlaps with first user's assignment
   - Verify NO conflict warning (users can assign same events)
   - Verify both users have independent supplemental events

**Expected Results**:
- Invitation system works end-to-end
- Both users see main events from calendar
- Assignments are user-specific
- Supplemental events are user-specific
- No cross-user event pollution

**Rollback**: Run reset script before next phase

---

## Phase 5: Edge Cases & Error Handling

**Goal**: Verify edge cases, error handling, and data integrity.

### Steps:
1. **Reassign Event**
   - User 1 assigns event
   - Verify supplemental events created
   - Unassign event
   - Verify supplemental events deleted from Google Calendar
   - Verify sync records cleaned up in database

2. **Delete Calendar**
   - Delete calendar with assigned events
   - Verify all events deleted from database
   - Verify all supplemental events deleted
   - Verify all sync records deleted
   - Verify Google Calendar events removed

3. **Disable Google Calendar Sync**
   - Assign events with sync enabled
   - Disable Google Calendar sync
   - Verify events remain in local database
   - Verify future assignments don't sync

4. **Re-enable Google Calendar Sync**
   - Re-enable sync
   - Verify existing assigned events sync to calendar
   - Verify supplemental events recreated

5. **Test Comfort Buffer Changes**
   - Navigate to Settings
   - Change comfort buffer from 5 to 15 minutes
   - Reassign event
   - Verify new buffer time applied to supplemental events

6. **Test "Keep Supplemental Events" Toggle**
   - Enable "Keep supplemental events on reassignment"
   - Assign event to User 1
   - Reassign to User 2
   - Verify User 1's supplemental events remain in Google Calendar
   - Disable toggle
   - Reassign event
   - Verify User 1's supplemental events deleted

7. **Invalid ICS Feed**
   - Add calendar with invalid URL
   - Verify error message displays
   - Verify sync status shows "error"
   - Verify error details logged

8. **OAuth Token Expiration** (simulation)
   - Manually set `google_refresh_token_enc` to null in database
   - Try to assign event
   - Verify error handling
   - Verify user prompted to re-authenticate

**Expected Results**:
- All edge cases handled gracefully
- No orphaned data in database
- No orphaned events in Google Calendar
- Error messages clear and actionable
- No console errors

---

## Success Criteria

All phases must pass with:
- Zero 500 errors
- Zero console errors
- Zero orphaned data in database
- Zero orphaned events in Google Calendar
- All user flows complete as expected

## Known Issues to Watch For

Based on previous sessions:
1. OAuth flow not saving refresh token
2. Prisma client caching old schema
3. Port conflicts from multiple nodemon instances
4. Supplemental events not deleting on reassignment
5. Google Calendar sync delays

## Debugging Tips

If any test fails:
1. Check browser console for frontend errors
2. Check backend logs for API errors
3. Run `npx prisma studio` to inspect database state
4. Check Google Calendar for orphaned events
5. Verify environment variables loaded correctly
6. Restart backend if Prisma client seems stale

---

## Quick Reference Commands

```bash
# Reset account
npx ts-node src/scripts/resetUserAccount.ts james@jamesschaffer.com

# Check user credentials
npx ts-node src/scripts/checkUserCredentials.ts

# Start backend
npm run dev

# Start frontend
cd ../frontend && npm run dev

# View database
npx prisma studio

# Run migrations
npx prisma db push
npx prisma generate

# Kill stuck processes
pkill -9 -f "nodemon|ts-node"
lsof -ti:3000 | xargs kill -9
```
