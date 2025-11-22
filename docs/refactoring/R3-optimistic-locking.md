# R3: Optimistic Locking for Event Assignment

**Status**: ✅ Completed
**Priority**: P1 (High - Critical for Race Condition Prevention)
**Completion Date**: 2025-11-22

## Problem Solved

Prevents race conditions when multiple users attempt to assign the same event simultaneously, which could cause:

- **Lost updates**: Second assignment overwrites first without awareness
- **Orphaned supplemental events**: Drive time events from first assignment not cleaned up
- **Google Calendar sync inconsistencies**: Events synced for wrong users
- **Bypassed conflict detection**: Simultaneous assignments skip conflict checks

### Example Race Condition (Before Fix)

```
Time 0: Event "Soccer Practice" is unassigned (version 1)
Time 1: User A reads event (version 1) and starts assignment
Time 2: User B reads event (version 1) and starts assignment
Time 3: User A writes assignment → Event assigned to User A
Time 4: User B writes assignment → Event assigned to User B (OVERWRITES A)
Result: User A's supplemental events orphaned, User B's assignment succeeds silently
```

## Solution: Optimistic Locking with Version Field

Added atomic version checking to prevent concurrent modifications:

1. **Version field** added to Event model (defaults to 1)
2. **Version pre-check** in assignEvent() for fail-fast behavior
3. **Atomic check-and-set** using Prisma's composite where clause
4. **Version increment** on every successful assignment
5. **HTTP 409 Conflict** response when version mismatch detected

### How It Works (After Fix)

```
Time 0: Event "Soccer Practice" is unassigned (version 1)
Time 1: User A reads event (version 1) and starts assignment
Time 2: User B reads event (version 1) and starts assignment
Time 3: User A writes with version check → SUCCESS (version 1→2)
Time 4: User B writes with version check → FAILS (expected v1, found v2)
Result: User A's assignment succeeds, User B gets 409 error with retry guidance
```

## Changes Made

### 1. Database Schema

**File**: `/backend/prisma/schema.prisma`

Added `version` field to Event model:

```prisma
model Event {
  // ... existing fields
  version               Int       @default(1) // Optimistic locking: increments on each assignment change
  // ... rest of model
}
```

**Migration**: Applied via `npx prisma db push`

- All existing events automatically set to `version = 1`
- New events default to `version = 1`

### 2. Backend Error Class

**File**: `/backend/src/errors/ConcurrentModificationError.ts` (NEW)

```typescript
export class ConcurrentModificationError extends Error {
  constructor(
    public resourceType: string,
    public resourceId: string,
    public expectedVersion: number,
    public actualVersion: number,
    public currentState?: any
  ) {
    super(
      `${resourceType} ${resourceId} was modified by another user. ` +
      `Expected version ${expectedVersion}, but found ${actualVersion}`
    );
    this.name = 'ConcurrentModificationError';
  }
}
```

### 3. Backend Service Layer

**File**: `/backend/src/services/eventService.ts`

**Updated function signature**:
```typescript
export const assignEvent = async (
  eventId: string,
  userId: string,
  assignToUserId: string | null,
  expectedVersion?: number  // NEW - optional for backward compatibility
) => {
  // ... implementation
}
```

**Key implementation details**:

1. **Pre-check for fail-fast** (lines 197-211):
```typescript
if (expectedVersion !== undefined && event.version !== expectedVersion) {
  throw new ConcurrentModificationError(
    'Event',
    eventId,
    expectedVersion,
    event.version,
    {
      id: event.id,
      title: event.title,
      assigned_to_user_id: event.assigned_to_user_id,
      assigned_to: event.assigned_to,
    }
  );
}
```

2. **Atomic update with version check** (lines 220-244):
```typescript
const updatedEvent = await prisma.event.update({
  where: {
    id: eventId,
    version: versionForUpdate, // Atomic: only update if version matches
  },
  data: {
    assigned_to_user_id: assignToUserId,
    version: { increment: 1 }, // Atomic version increment
  },
  // ... includes
});
```

### 4. Backend Route Handler

**File**: `/backend/src/routes/event.ts`

**Updated endpoint documentation**:
```typescript
/**
 * PATCH /api/events/:id/assign
 * Body: {
 *   assigned_to_user_id: string | null,
 *   expected_version?: number  // NEW
 * }
 */
```

**Error handling** (lines 136-147):
```typescript
if (error instanceof ConcurrentModificationError) {
  return res.status(409).json({  // HTTP 409 Conflict
    error: 'Event was modified by another user',
    code: 'CONCURRENT_MODIFICATION',
    details: {
      expected_version: error.expectedVersion,
      actual_version: error.actualVersion,
      current_state: error.currentState,
    },
    message: 'The event has been updated since you last viewed it. Please refresh and try again.',
  });
}
```

### 5. Tests

**File**: `/backend/src/services/__tests__/eventService.race-conditions.test.ts` (NEW)

**Test coverage**:
- ✅ Concurrent assignment attempts (first wins, second fails)
- ✅ Error provides retry guidance with current state
- ✅ Concurrent reassignment (A→B vs A→C)
- ✅ Version increments on each successful assignment
- ✅ Assignment without version (backward compatibility)
- ✅ Pre-check fails fast with wrong version

**All tests passing** (6/6)

## API Changes

### Request Format

#### Before
```json
POST /api/events/:id/assign
{
  "assigned_to_user_id": "user-uuid"
}
```

#### After
```json
POST /api/events/:id/assign
{
  "assigned_to_user_id": "user-uuid",
  "expected_version": 3  // OPTIONAL - for race protection
}
```

### Response Format (Success - No Change)

HTTP 200 OK
```json
{
  "id": "event-uuid",
  "title": "Soccer Practice",
  "assigned_to_user_id": "user-uuid",
  "version": 4,  // NEW field in response
  // ... rest of event
}
```

### New Error Response (HTTP 409 Conflict)

```json
{
  "error": "Event was modified by another user",
  "code": "CONCURRENT_MODIFICATION",
  "details": {
    "expected_version": 3,
    "actual_version": 5,
    "current_state": {
      "id": "event-uuid",
      "title": "Soccer Practice",
      "assigned_to_user_id": "other-user-uuid",
      "assigned_to": {
        "id": "other-user-uuid",
        "name": "Jane Doe",
        "email": "jane@example.com"
      }
    }
  },
  "message": "The event has been updated since you last viewed it. Please refresh and try again."
}
```

## UX Flow

### Happy Path (No Conflict)
1. User views event list (receives events with `version` field)
2. User clicks "Assign to Me" on an event (version 3)
3. Frontend sends: `{ assigned_to_user_id: "user-123", expected_version: 3 }`
4. Backend updates successfully (version 3→4)
5. Frontend receives updated event with `version: 4`

### Conflict Path (Race Condition Detected)
1. User A and User B both view event (version 3)
2. User A clicks "Assign to Me"
   - Frontend sends: `{ assigned_to_user_id: "user-A", expected_version: 3 }`
   - Backend updates successfully (version 3→4)
3. User B clicks "Assign to Me"
   - Frontend sends: `{ assigned_to_user_id: "user-B", expected_version: 3 }`
   - Backend returns **HTTP 409 Conflict**
   - Frontend shows dialog: "Event was modified by another user"
   - Dialog shows: "Currently assigned to: User A"
   - User B clicks "Refresh Events" to see latest state

## Backward Compatibility

### Old Clients (Without `expected_version`)
- Still work! Assignment succeeds normally
- No race protection, but doesn't break
- Version still increments in database

### New Clients (With `expected_version`)
- Full race protection
- Optimistic locking enforced
- User-friendly error messages on conflict

## Testing

### Unit Tests
- Location: `/backend/src/services/__tests__/eventService.race-conditions.test.ts`
- Run: `npm test -- eventService.race-conditions.test.ts`
- Status: ✅ 6/6 passing

### Manual Testing Scenarios

#### Test 1: Simultaneous Assignment
1. Open Dashboard in Chrome and Firefox
2. Same event visible in both (e.g., version 1, unassigned)
3. **Chrome**: Click "Assign to Me"
4. **Firefox**: Immediately click "Assign to Me"
5. **Expected**: One succeeds, other shows "Event was modified" dialog

#### Test 2: Version Incrementation
1. Assign event to User A
2. Check database: `SELECT version FROM events WHERE id='...'` → should be 2
3. Reassign to User B
4. Check database again → should be 3

#### Test 3: API Test with curl
```bash
# Get event (note version number)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/events/EVENT_ID

# Try to assign with old version (should get 409)
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assigned_to_user_id":"USER_ID","expected_version":1}' \
  http://localhost:3000/api/events/EVENT_ID/assign
```

## Performance Impact

- **Database**: Minimal - version field is indexed, atomic increment is fast
- **API**: Negligible - one additional WHERE condition in update query
- **Network**: +4 bytes per event (int field)

## Monitoring & Metrics

Track these metrics to measure effectiveness:

```sql
-- Count 409 responses (indicates race conditions being caught)
SELECT COUNT(*) FROM api_logs
WHERE endpoint LIKE '%/events/%/assign'
  AND status_code = 409
  AND created_at > NOW() - INTERVAL '24 hours';
```

Expected:
- **Week 1**: Higher 409 count (users learning new behavior)
- **Week 2+**: Lower count as users adapt to refresh prompts

## Related Issues Fixed

This implementation addresses audit findings:
- ✅ **Issue 13**: Race conditions in simultaneous assignments
- ✅ **Issue 10** (partial): Consistent error handling for concurrency failures

### 6. Frontend Implementation

**File**: `/frontend/src/lib/api-events.ts`

**TypeScript Interface Updates**:

```typescript
// Event interface - added version field (line 24)
export interface Event {
  // ... existing fields
  version: number; // For optimistic locking
  // ... rest of interface
}

// New ConcurrentModificationError interface (lines 43-61)
export interface ConcurrentModificationError {
  error: string;
  code: 'CONCURRENT_MODIFICATION';
  details: {
    expected_version: number;
    actual_version: number;
    current_state: {
      id: string;
      title: string;
      assigned_to_user_id?: string;
      assigned_to?: {
        id: string;
        name: string;
        email: string;
      };
    };
  };
  message: string;
}

// Updated assignEvent function (lines 97-112)
export const assignEvent = (
  id: string,
  assignedToUserId: string | null,
  expectedVersion: number,  // NEW - required parameter
  token: string
) =>
  apiClient.patch<Event>(
    `/events/${id}/assign`,
    {
      assigned_to_user_id: assignedToUserId,
      expected_version: expectedVersion,  // NEW - sent to backend
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
```

**File**: `/frontend/src/pages/Dashboard.tsx`

**Key Changes**:

1. **Import ConcurrentModificationError type** (line 4):
```typescript
import type { Event, ConcurrentModificationError } from '../lib/api-events';
```

2. **Import AlertDialog component** (lines 14-23):
```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
```

3. **Added version conflict state** (lines 44-49):
```typescript
const [versionConflict, setVersionConflict] = useState<{
  eventId: string;
  eventTitle: string;
  currentState: ConcurrentModificationError['details']['current_state'];
} | null>(null);
```

4. **Updated assignMutation** (lines 70-102):
```typescript
const assignMutation = useMutation({
  mutationFn: ({ eventId, userId, expectedVersion }: {
    eventId: string;
    userId: string | null;
    expectedVersion: number;
  }) =>
    assignEvent(eventId, userId, expectedVersion, token),
  onError: (error: any) => {
    // Handle concurrent modification (HTTP 409)
    if (error.response?.status === 409 && error.response?.data?.code === 'CONCURRENT_MODIFICATION') {
      const conflictData = error.response.data as ConcurrentModificationError;
      setVersionConflict({
        eventId: conflictData.details.current_state.id,
        eventTitle: conflictData.details.current_state.title,
        currentState: conflictData.details.current_state,
      });
    } else {
      toast({ /* regular error handling */ });
    }
  },
});
```

5. **Updated handleAssign function** (lines 134-170):
```typescript
const handleAssign = async (eventId: string, userId: string | null) => {
  // Find the event to get its version
  const event = events?.find((e) => e.id === eventId);
  if (!event) {
    toast({ title: 'Error', description: 'Event not found', variant: 'destructive' });
    return;
  }

  // ... conflict check logic ...

  // Pass expectedVersion with mutation
  assignMutation.mutate({ eventId, userId, expectedVersion: event.version });
};
```

6. **Added Version Conflict Dialog** (lines 602-646):
```typescript
<AlertDialog open={!!versionConflict} onOpenChange={() => setVersionConflict(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        Event Was Modified
      </AlertDialogTitle>
      <AlertDialogDescription className="space-y-3">
        <p>The event "{versionConflict?.eventTitle}" has been modified...</p>
        {versionConflict?.currentState.assigned_to ? (
          <div className="p-3 bg-muted rounded-md">
            <p className="font-medium text-sm text-foreground mb-1">Current Assignment:</p>
            <p className="text-sm">
              Assigned to: <span className="font-medium">{versionConflict.currentState.assigned_to.name}</span>
              {' '}({versionConflict.currentState.assigned_to.email})
            </p>
          </div>
        ) : (
          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm">The event is currently <span className="font-medium">unassigned</span>.</p>
          </div>
        )}
        <p className="text-sm">Please refresh the event list to see the latest changes and try again.</p>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => {
        setVersionConflict(null);
        queryClient.invalidateQueries({ queryKey: ['events'] });
      }}>
        Refresh Events
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Future Enhancements

### Short-term
- [x] Add version field to frontend TypeScript types
- [x] Implement conflict resolution dialog in Dashboard.tsx
- [ ] Add retry logic with exponential backoff

### Long-term
- [ ] Extend optimistic locking to calendar settings
- [ ] Add version field to other mutable resources (calendars, children)
- [ ] Implement WebSocket notifications for real-time conflict prevention

## Rollback Plan

If issues arise:

1. **Remove frontend version checks** (backward compatible)
2. **Keep database version field** (doesn't hurt to have it)
3. **Keep backend logic** (still works without `expected_version`)

Database rollback (if needed):
```sql
ALTER TABLE events DROP COLUMN version;
```

## References

- [Prisma Optimistic Locking](https://www.prisma.io/docs/concepts/components/prisma-client/advanced-type-safety/operating-against-partial-structures-of-model-types#optimistic-concurrency-control)
- [HTTP 409 Conflict Status](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/409)
- [Martin Fowler - Optimistic Offline Lock](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html)
