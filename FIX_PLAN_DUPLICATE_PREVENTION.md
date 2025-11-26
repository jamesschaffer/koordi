# Fix Plan: Prevent Google Calendar Duplicate Events

**Branch:** `fix/prevent-google-calendar-duplicates`
**Issue:** Multiple concurrent sync requests can create duplicate events in Google Calendar
**Root Cause:** Race condition between checking for existing sync and creating Google Calendar event

---

## Problem Analysis

### Current Flow (Vulnerable):
```
User clicks Sync (laptop)  →  POST /api/calendars/123/sync
User clicks Sync (phone)   →  POST /api/calendars/123/sync (100ms later)

Both requests:
1. Fetch existing syncs from DB → both find NONE
2. Call syncMainEventToAllMembers() in parallel
3. Both check existingSync → both see undefined
4. Both create event in Google Calendar → 2 events created
5. Both upsert to database → last one wins, first event ID lost
Result: 2 events in Google, 1 tracking record in DB (orphaned event)
```

### Why This Happens:
- **Concurrent requests** for same calendar (laptop + phone, or rapid refreshes)
- **Batch fetching optimization** fetches all sync records BEFORE parallel processing
- **Time window** between fetch and Google API call allows race condition
- **Upsert doesn't prevent** the duplicate Google API call, only prevents duplicate DB records

---

## Solution Strategy

### **Defense Layer 1: Request-Level Lock** (Primary Prevention)
Prevent multiple concurrent sync requests for the same calendar from executing simultaneously.

**File:** `backend/src/routes/eventCalendar.ts`
**Location:** `POST /:id/sync` endpoint (line 227)

**Implementation:**
```typescript
// Add at top of file
const syncLocks = new Map<string, Promise<any>>();

// Modify endpoint
router.post('/:id/sync', async (req: Request, res: Response) => {
  const calendarId = req.params.id;

  // Check if sync already in progress
  if (syncLocks.has(calendarId)) {
    return res.status(409).json({
      error: 'Sync already in progress for this calendar',
      retryAfter: 5 // seconds
    });
  }

  try {
    // Verify user access first (before creating lock)
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const calendar = await eventCalendarService.getEventCalendarById(calendarId, userId);
    if (!calendar) return res.status(404).json({ error: 'Calendar not found' });

    // Create lock promise
    const syncPromise = icsSyncService.syncCalendar(calendarId);
    syncLocks.set(calendarId, syncPromise);

    // Execute sync
    const result = await syncPromise;

    return res.json({
      message: 'Sync completed',
      created: result.eventsAdded,
      updated: result.eventsUpdated,
      deleted: result.eventsDeleted,
    });
  } catch (error: any) {
    console.error('Sync calendar error:', error);
    return res.status(500).json({ error: error.message || 'Failed to sync calendar' });
  } finally {
    // Always clean up lock
    syncLocks.delete(calendarId);
  }
});
```

**Benefits:**
- ✅ Prevents ALL concurrent syncs for same calendar
- ✅ Simple in-memory solution (no Redis needed for small app)
- ✅ Returns clear error to client (409 Conflict)
- ✅ Self-cleaning (lock removed in finally block)

**Limitations:**
- ⚠️  In-memory only (won't work across multiple server instances)
- ⚠️  Lost on server restart (acceptable - just means two requests could run)

---

### **Defense Layer 2: Idempotency Check** (Safety Net)
Before creating event in Google Calendar, check if one already exists with same ICS UID.

**File:** `backend/src/services/mainEventGoogleCalendarSync.ts`
**Location:** Before `calendar.events.insert()` call (around line 198)

**Implementation:**
```typescript
// CREATE new event (either no sync record existed, or we deleted a stale one above)
if (!existingSync) {
  console.log(`  Creating NEW Google Calendar event`);

  // ⭐ IDEMPOTENCY CHECK: Before creating, verify event doesn't already exist
  try {
    const existingEvents = await calendar.events.list({
      calendarId,
      privateExtendedProperty: `icsUid=${event.ics_uid}`,
      maxResults: 1,
    });

    if (existingEvents.data.items && existingEvents.data.items.length > 0) {
      const existingGoogleEvent = existingEvents.data.items[0];
      console.log(`  ⚠️  IDEMPOTENCY: Event already exists in Google Calendar with icsUid=${event.ics_uid}`);
      console.log(`  Using existing Google Event ID: ${existingGoogleEvent.id}`);
      return existingGoogleEvent.id!;
    }
  } catch (listError) {
    console.warn(`  Failed to check for existing Google Calendar event:`, listError);
    // Continue with creation if check fails
  }

  // Create new event for this user
  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        ...eventBody,
        // ⭐ ADD ICS UID as private extended property for future lookups
        extendedProperties: {
          private: {
            icsUid: event.ics_uid,
          },
        },
      },
    });
    // ... rest of existing code
  }
}
```

**Benefits:**
- ✅ Prevents duplicates even if Layer 1 fails
- ✅ Detects orphaned events from previous race conditions
- ✅ Uses ICS UID (already unique per event)
- ✅ No database schema changes needed

**Limitations:**
- ⚠️  Requires Google Calendar API call (slight performance hit)
- ⚠️  Only works if we add `extendedProperties` going forward (won't catch old events)

---

### **Defense Layer 3: Frontend User Feedback** (UX Improvement)
Handle 409 Conflict response gracefully and show user-friendly message.

**File:** `frontend/src/pages/Calendars.tsx`
**Location:** `syncCalendarMutation` onError handler (line 189)

**Implementation:**
```typescript
onError: (error: any) => {
  if (error.response?.status === 409) {
    toast.info('Sync already in progress', {
      description: 'Another sync is currently running for this calendar. Please wait.',
    });
  } else {
    toast.error('Failed to sync calendar', {
      description: error.message || 'Please try again',
    });
  }
},
```

**Benefits:**
- ✅ Clear feedback when sync is blocked
- ✅ Prevents user from clicking sync repeatedly
- ✅ Better UX than generic error

---

## Implementation Order

### Phase 1: Core Fixes (This PR)
1. ✅ Create branch `fix/prevent-google-calendar-duplicates`
2. 🔧 Implement Layer 1 (Request Lock) in `eventCalendar.ts`
3. 🔧 Implement Layer 2 (Idempotency Check) in `mainEventGoogleCalendarSync.ts`
4. 🔧 Add same idempotency check to `googleCalendarSyncService.ts` for supplemental events
5. 🔧 Implement Layer 3 (Frontend UX) in `Calendars.tsx`
6. ✅ Test locally with rapid sync clicks
7. ✅ Update `DUPLICATE_EVENTS_ANALYSIS.md` with "Fixed" status
8. ✅ Commit and push

### Phase 2: Future Enhancements (Optional, Later)
- Add Redis-based distributed lock if we scale to multiple servers
- Add cleanup job to find and remove orphaned Google Calendar events
- Add sync audit log to track patterns and detect issues

---

## Testing Strategy

### Manual Testing:
1. **Rapid Click Test:**
   - Load Calendars page
   - Click "Sync" button rapidly 5 times
   - Expected: First request succeeds, others get 409 response
   - Verify: Only 1 event per ICS UID in Google Calendar

2. **Multi-Device Test:**
   - Open app on laptop and phone
   - Click sync on both simultaneously
   - Expected: One gets 409 response
   - Verify: No duplicate events

3. **Idempotency Test:**
   - Manually create duplicate Google Calendar event with same extended property
   - Trigger sync
   - Expected: Uses existing event instead of creating another

### Verification:
```bash
# Check database for sync records
psql -h 104.198.219.130 -U koordie_app -d koordie
SELECT event_id, user_id, google_event_id, created_at
FROM user_google_event_syncs
WHERE event_id IN (SELECT id FROM events WHERE title LIKE 'KPC 2034%')
ORDER BY created_at DESC;

# Should see exactly ONE sync record per user per event
```

---

## Files to Modify

1. **backend/src/routes/eventCalendar.ts**
   - Add sync lock Map
   - Wrap sync in try/finally with lock management
   - Return 409 if lock exists

2. **backend/src/services/mainEventGoogleCalendarSync.ts**
   - Add idempotency check before `events.insert()`
   - Add `extendedProperties.private.icsUid` to event creation

3. **backend/src/services/googleCalendarSyncService.ts**
   - Add same idempotency check for supplemental events

4. **frontend/src/pages/Calendars.tsx**
   - Handle 409 status in onError with user-friendly toast

5. **DUPLICATE_EVENTS_ANALYSIS.md**
   - Add "Resolution" section documenting the fix

---

## Success Criteria

✅ Multiple concurrent sync requests return 409 (not duplicates)
✅ No duplicate events created in Google Calendar
✅ User sees clear feedback when sync is already running
✅ Existing events are properly reused (idempotency)
✅ No regression in normal sync flow

---

## Rollback Plan

If issues arise:
1. Revert commit with `git revert <commit-hash>`
2. Lock mechanism is isolated to endpoint, won't affect other code
3. Idempotency check is additive, can be disabled with feature flag if needed

---

## Notes

- This is a **defensive fix** - prevents future duplicates, doesn't clean existing ones
- The 3 duplicate events you manually cleaned were the symptom; this fixes the root cause
- In-memory lock is sufficient for current scale (single server instance)
- Can upgrade to Redis lock later if we scale horizontally
