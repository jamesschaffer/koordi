# Calendar Assignment & Invitation System Refactoring Plan

**Status**: Phase 1 Complete (5/5 fixes implemented)
**Last Updated**: 2025-11-22
**Commit**: a42e199 - "Fix race conditions in invitations and event assignments"

## Executive Summary

This document tracks the refactoring of Koordi's calendar invitation and event assignment systems to fix critical race conditions, improve reliability, and enhance user experience. The work is divided into 4 phases, with Phase 1 (Critical Fixes) now complete.

## Quick Reference

### Files Modified in Phase 1
- **Backend Database**: `prisma/schema.prisma`, `prisma/migrations/20251122090324_*/migration.sql`
- **Backend Routes**: `src/routes/invitations.ts`, `src/routes/event.ts`
- **Backend Services**: `src/services/invitationService.ts`, `src/services/eventService.ts`
- **Backend Errors**: `src/errors/ConcurrentModificationError.ts` (new)
- **Frontend API**: `frontend/src/lib/api-events.ts`
- **Frontend Pages**: `frontend/src/pages/Dashboard.tsx`

### Key Technical Decisions
- **Optimistic Locking**: Uses version field on Event table for concurrent modification detection
- **Database Constraints**: Partial unique index for pending invitations
- **Transactions**: Prisma transactions ensure atomic operations
- **WebSockets**: Real-time updates for member additions/removals

---

## Phase 1: Critical Fixes ✅ COMPLETE

**Objective**: Fix race conditions that could lead to data corruption or system instability

### Status: 5/5 Complete

#### 1. Database Constraint for Duplicate Invitations ✅
**Problem**: Two simultaneous invitation requests could create duplicate pending invitations for the same email to the same calendar.

**Solution Implemented**:
- Added partial unique index: `unique_pending_invitation`
- Constraint: `(event_calendar_id, invited_email) WHERE status = 'pending'`
- Migration: `20251122090324_add_unique_pending_invitation_constraint/migration.sql`

**Files Modified**:
- `backend/prisma/migrations/20251122090324_*/migration.sql`

**Testing**:
```bash
# Test in PostgreSQL console or Prisma Studio
# Attempt to create duplicate pending invitation - should fail with constraint violation
```

---

#### 2. Membership Check Bug Fix ✅
**Problem**: `sendInvitation()` only checked `invited_email` for existing membership, not `user_id`. If a user changed their email and was re-invited, they could be added as a duplicate member.

**Solution Implemented**:
- Added check for existing membership by `user_id` with status='accepted'
- Throws error: "This user is already a member of this calendar"

**Location**: `backend/src/services/invitationService.ts:185-198`

**Code**:
```typescript
// If user exists, check if they're already a member (by user_id, not just invited_email)
if (existingUser) {
  const existingMembership = await prisma.eventCalendarMembership.findFirst({
    where: {
      event_calendar_id: calendarId,
      user_id: existingUser.id,
      status: 'accepted',
    },
  });

  if (existingMembership) {
    throw new Error('This user is already a member of this calendar');
  }
}
```

**Testing**:
1. Create a calendar with User A
2. Invite User B (who accepts)
3. User B changes their email address
4. Try to invite User B's new email → Should fail with error

---

#### 3. Atomic Transactions for Member Removal ✅
**Problem**: `removeMember()` performed multiple database operations (delete supplemental events, reassign events, delete membership) without atomicity. If any step failed, database could be left in inconsistent state.

**Solution Implemented**:
- Wrapped all operations in `prisma.$transaction()`
- Ensures all-or-nothing execution

**Location**: `backend/src/services/invitationService.ts:639-669`

**Code Structure**:
```typescript
await prisma.$transaction(async (tx) => {
  // Step 1: Delete supplemental events for reassigned events
  await tx.supplementalEvent.deleteMany(...);

  // Step 2: Reassign events to calendar owner
  await tx.event.updateMany(...);

  // Step 3: Delete the membership
  await tx.eventCalendarMembership.delete(...);
});
```

**Testing**:
1. Create calendar with 2+ members
2. Assign events to non-owner member
3. Remove that member
4. Verify: Events reassigned to owner, supplemental events deleted, membership deleted atomically

---

#### 4. Member Limit Enforcement in Auto-Accept ✅
**Problem**: `autoAcceptPendingInvitations()` used `updateMany()` which didn't check member limits per calendar. Could exceed MAX_MEMBERS_PER_CALENDAR (10).

**Solution Implemented**:
- Changed from batch `updateMany()` to individual validation loop
- Checks current member count before accepting each invitation
- Skips invitations for calendars at capacity
- Logs skipped invitations for user awareness

**Location**: `backend/src/services/invitationService.ts:740-798`

**Code Structure**:
```typescript
for (const invitation of pendingInvitations) {
  const currentMemberCount = invitation.event_calendar.members.length;

  if (currentMemberCount >= MAX_MEMBERS_PER_CALENDAR) {
    console.log(`Skipped ${invitation.event_calendar.name}: at capacity`);
    continue;
  }

  await prisma.eventCalendarMembership.update({
    where: { id: invitation.id },
    data: { status: 'accepted', ... }
  });
}
```

**Testing**:
1. Create calendar with 10 members (at limit)
2. Invite a new user (creates pending invitation)
3. New user logs in (triggers auto-accept)
4. Verify: Invitation NOT auto-accepted, remains pending, logs show "at capacity"

---

#### 5. WebSocket Broadcasts for Member Additions ✅
**Problem**: When sending invitations, other calendar members weren't notified in real-time. Only the inviter saw the update.

**Solution Implemented**:
- Added WebSocket broadcasts in `POST /api/event-calendars/:calendarId/invitations`
- Emits `MEMBER_ADDED` when existing user auto-added
- Emits `INVITATION_RECEIVED` when pending invitation created

**Location**: `backend/src/routes/invitations.ts:68-86`

**Code**:
```typescript
const io = req.app.get('io');
if (io) {
  if (invitation.status === 'accepted') {
    emitToCalendar(io, calendarId, SocketEvent.MEMBER_ADDED, {
      calendar_id: calendarId,
      user_id: invitation.user_id,
      user_email: invitation.invited_email,
    });
  } else if (invitation.status === 'pending') {
    emitToCalendar(io, calendarId, SocketEvent.INVITATION_RECEIVED, {
      calendar_id: calendarId,
      invited_email: invitation.invited_email,
    });
  }
}
```

**Testing**:
1. Open 2 browser windows as 2 different calendar members
2. In Window 1: Invite a new user
3. In Window 2: Should see real-time update showing new invitation/member

---

#### 6. Optimistic Locking for Event Assignments ✅
**Problem**: Two users could simultaneously assign the same event to different people, causing the second assignment to overwrite the first without warning.

**Solution Implemented**:
- Added `version` field to `Event` table (defaults to 1)
- Modified `assignEvent()` to accept `expected_version` parameter
- Uses Prisma's atomic `where: { id, version }` for update
- Throws `ConcurrentModificationError` if version mismatch
- Returns HTTP 409 Conflict with current event state

**Files Modified**:
- `backend/prisma/schema.prisma` - Added `version` field
- `backend/src/errors/ConcurrentModificationError.ts` - New error class
- `backend/src/services/eventService.ts` - Optimistic locking logic
- `backend/src/routes/event.ts` - HTTP 409 error handling
- `frontend/src/lib/api-events.ts` - Added `expected_version` parameter
- `frontend/src/pages/Dashboard.tsx` - Version conflict dialog

**Location**: `backend/src/services/eventService.ts:182-264`

**Code Flow**:
```typescript
// 1. Pre-check version (fail fast)
if (expectedVersion !== undefined && event.version !== expectedVersion) {
  throw new ConcurrentModificationError(...);
}

// 2. Atomic update with version check
const updatedEvent = await prisma.event.update({
  where: {
    id: eventId,
    version: versionForUpdate, // Only update if version matches
  },
  data: {
    assigned_to_user_id: assignToUserId,
    version: { increment: 1 }, // Atomic increment
  },
});
```

**Frontend Handling**:
- Shows alert dialog: "Event was modified by another user"
- Displays current assignment state
- Offers "Refresh Events" button to get latest data

**Testing**:
1. Open 2 browser windows as 2 different users
2. Both view same unassigned event (version=1)
3. User A assigns to themselves → Success (version→2)
4. User B tries to assign to themselves → HTTP 409 with error dialog
5. User B refreshes and sees User A's assignment

**Documentation**: See `docs/refactoring/R3-optimistic-locking.md` for detailed implementation

---

## Phase 2: Frontend Improvements (NOT STARTED)

**Objective**: Enhance UI/UX for calendar management and invitations

### Tasks

#### 1. Invitation Status Indicators
**Current State**: No visual indicator of pending invitations in calendar list

**Proposed Solution**:
- Add badge showing count of pending invitations on calendar cards
- Example: "Oak Ridge U10 Soccer (2 pending)"
- Badge should be clickable to open members dialog

**Implementation**:
- Modify `frontend/src/pages/Calendars.tsx`
- Add count to calendar API response
- Use shadcn/ui Badge component

---

#### 2. Resend Invitation UI
**Current State**: Can only resend invitations via API, no UI button

**Proposed Solution**:
- Add "Resend" button next to pending invitations in members dialog
- Show toast notification on success
- Disable button if recently sent (< 5 minutes ago)

**Implementation**:
- Add `last_sent_at` timestamp to `event_calendar_memberships` table
- Update `frontend/src/components/MembersDialog.tsx`
- Call `POST /api/invitations/:id/resend` endpoint

---

#### 3. Optimistic UI Updates for Member Actions
**Current State**: UI updates only after API response (feels slow)

**Proposed Solution**:
- Use React Query's `optimisticUpdate` for:
  - Adding members
  - Removing members
  - Accepting/declining invitations
- Rollback on error

**Implementation**:
- Update mutation hooks in `frontend/src/pages/Calendars.tsx`
- Add `onMutate`, `onError`, `onSettled` callbacks

---

#### 4. Member Limit Warning
**Current State**: No warning when approaching member limit (10)

**Proposed Solution**:
- Show warning when 8+ members: "Almost at capacity (8/10 members)"
- Disable "Add Member" button at 10 members
- Show helpful message: "Remove a member to add more"

**Implementation**:
- Add check in `frontend/src/components/MembersDialog.tsx`
- Use Alert component from shadcn/ui

---

## Phase 3: API & Backend Enhancements (NOT STARTED)

**Objective**: Improve API reliability, performance, and developer experience

### Tasks

#### 1. Rate Limiting for Invitations
**Current State**: No rate limiting on invitation sends

**Proposed Solution**:
- Limit to 10 invitations per calendar per hour
- Use `express-rate-limit` middleware
- Store in Redis if available, otherwise in-memory

**Implementation**:
- Create `src/middleware/rateLimiter.ts`
- Apply to `POST /api/event-calendars/:calendarId/invitations`
- Return HTTP 429 with `Retry-After` header

---

#### 2. Invitation Expiry
**Current State**: Invitations never expire

**Proposed Solution**:
- Invitations expire after 30 days
- Add `expires_at` column to `event_calendar_memberships`
- Background job to clean up expired invitations

**Implementation**:
- Migration: Add `expires_at TIMESTAMPTZ` column
- Set `expires_at = created_at + interval '30 days'` on creation
- Modify `acceptInvitation()` to check expiry
- Add cron job to delete expired invitations

---

#### 3. Invitation Analytics
**Current State**: No tracking of invitation metrics

**Proposed Solution**:
- Track: sent, accepted, declined, expired counts per calendar
- Add to calendar settings page

**Implementation**:
- Add aggregation query in `getCalendarMembers()`
- Display in `frontend/src/pages/CalendarSettings.tsx`

---

#### 4. Bulk Invitation Import
**Current State**: Can only invite one email at a time

**Proposed Solution**:
- Allow CSV upload with emails
- Parse, validate, and send invitations in bulk
- Show progress indicator

**Implementation**:
- New endpoint: `POST /api/event-calendars/:calendarId/invitations/bulk`
- Use `multer` for file upload
- Process with rate limiting (1 invitation/second)

---

## Phase 4: Testing & Documentation (NOT STARTED)

**Objective**: Ensure reliability through comprehensive testing and documentation

### Tasks

#### 1. Integration Tests for Invitation Flow
**Current State**: No tests for invitation system

**Proposed Solution**:
- Test scenarios:
  - Send invitation to new user
  - Send invitation to existing user
  - Accept/decline invitation
  - Resend invitation
  - Cancel invitation
  - Member limit enforcement
  - Duplicate invitation prevention

**Implementation**:
- Create `src/services/__tests__/invitationService.test.ts`
- Use Jest + Prisma mock
- Aim for 80%+ coverage

---

#### 2. E2E Tests for Calendar Collaboration
**Current State**: No E2E tests

**Proposed Solution**:
- Test multi-user workflows:
  - User A creates calendar, invites User B
  - User B accepts, both see same calendar
  - User A assigns event to User B
  - User B sees assignment in real-time
  - Optimistic locking prevents conflicts

**Implementation**:
- Use Playwright for E2E tests
- Create `tests/e2e/calendar-collaboration.spec.ts`

---

#### 3. API Documentation
**Current State**: No formal API docs

**Proposed Solution**:
- Document all invitation/member endpoints with OpenAPI/Swagger
- Include request/response examples
- Document error codes

**Implementation**:
- Use `swagger-jsdoc` + `swagger-ui-express`
- Serve docs at `/api/docs`

---

#### 4. Migration Guide
**Current State**: No guide for updating existing calendars

**Proposed Solution**:
- Document breaking changes (optimistic locking version field)
- Migration steps for existing data
- Rollback procedures

**Implementation**:
- Create `docs/MIGRATION_GUIDE.md`

---

## Known Issues & Limitations

### Current Limitations
1. **Member Limit (10)**: Hardcoded in `invitationService.ts`. Consider making configurable per plan tier.
2. **Email Validation**: Basic regex only. Consider using email verification service.
3. **Invitation Links**: Currently require user to be logged in. Consider magic link authentication.

### Deferred Issues
1. **Invitation Templates**: Custom email templates per calendar (future enhancement)
2. **Role-Based Invitations**: Member vs Admin roles (future enhancement)
3. **Invitation Notifications**: Push notifications for mobile apps (future enhancement)

---

## Technical Context

### Database Schema Changes
```sql
-- Events table (Phase 1)
ALTER TABLE events ADD COLUMN version INTEGER DEFAULT 1;

-- Unique constraint for pending invitations (Phase 1)
CREATE UNIQUE INDEX unique_pending_invitation
ON event_calendar_memberships (event_calendar_id, invited_email)
WHERE status = 'pending';

-- Future: Invitation expiry (Phase 3)
-- ALTER TABLE event_calendar_memberships ADD COLUMN expires_at TIMESTAMPTZ;
```

### WebSocket Events
```typescript
// Phase 1 - Implemented
SocketEvent.MEMBER_ADDED      // When member joins calendar
SocketEvent.INVITATION_RECEIVED // When invitation sent
SocketEvent.MEMBER_REMOVED    // When member removed (existing)
SocketEvent.EVENT_ASSIGNED    // When event assigned (existing)

// Future events (Phase 2)
// SocketEvent.INVITATION_ACCEPTED
// SocketEvent.INVITATION_DECLINED
```

### API Endpoints Reference
```
Invitations & Members:
POST   /api/event-calendars/:calendarId/invitations  - Send invitation
GET    /api/event-calendars/:calendarId/members      - List members + pending
GET    /api/invitations/pending                      - Current user's invitations
POST   /api/invitations/:token/accept                - Accept invitation
POST   /api/invitations/:token/decline               - Decline invitation
POST   /api/invitations/:id/resend                   - Resend invitation email
DELETE /api/invitations/:id                          - Cancel pending invitation
DELETE /api/memberships/:id                          - Remove member

Event Assignment:
PATCH  /api/events/:id/assign                        - Assign/unassign event (with optimistic locking)
GET    /api/events/:id/conflicts                     - Check assignment conflicts
```

---

## Testing Strategy

### Manual Testing Checklist (Phase 1)

Run these tests after any changes to invitation or assignment code:

#### Race Condition Tests
- [ ] Duplicate invitation prevention (try creating same invitation twice rapidly)
- [ ] Member limit enforcement (fill calendar to 10, try auto-accept 11th)
- [ ] Concurrent event assignment (2 users assign same event simultaneously)
- [ ] Member removal atomicity (remove member with assigned events, verify no orphans)

#### Integration Tests
- [ ] Send invitation to new user → Pending invitation created
- [ ] Send invitation to existing user → Auto-accepted
- [ ] Accept invitation → User added to calendar
- [ ] Decline invitation → Invitation removed
- [ ] Remove member with events → Events reassigned to owner
- [ ] WebSocket updates → All members see changes in real-time

#### Edge Cases
- [ ] Invite user who changed email → Duplicate member check works
- [ ] Calendar at member limit → Auto-accept skips
- [ ] Stale event version → Assignment fails with HTTP 409
- [ ] Transaction rollback → Database remains consistent after error

### Automated Testing (Phase 4)
- Integration tests: `npm test` (when implemented)
- E2E tests: `npm run test:e2e` (when implemented)

---

## Next Steps

### Immediate Actions (Next Session)

1. **Test Phase 1 Implementation**
   - [ ] Run manual testing checklist above
   - [ ] Verify WebSocket events work in multi-user scenario
   - [ ] Test optimistic locking with concurrent assignments
   - [ ] Verify member limit enforcement with auto-accept

2. **Bug Fixes (if any found)**
   - [ ] Address any issues from testing
   - [ ] Update this document with findings

3. **Begin Phase 2**
   - [ ] Implement invitation status indicators (Quick win)
   - [ ] Add member limit warning (Quick win)

### Long-Term Roadmap

**Sprint 1** (This sprint - Phase 1 complete):
- ✅ Fix critical race conditions
- ✅ Implement optimistic locking
- ✅ Add WebSocket broadcasts

**Sprint 2** (Next sprint - Phase 2):
- [ ] Frontend UI improvements
- [ ] Optimistic UI updates
- [ ] Better error messaging

**Sprint 3** (Phase 3):
- [ ] API enhancements (rate limiting, expiry)
- [ ] Performance optimizations
- [ ] Analytics

**Sprint 4** (Phase 4):
- [ ] Comprehensive test suite
- [ ] Documentation
- [ ] Migration guides

---

## References

### Related Documents
- `docs/DEVELOPMENT_PLAN.md` - Overall project roadmap
- `docs/refactoring/R3-optimistic-locking.md` - Detailed optimistic locking implementation
- `docs/API.md` - API endpoint documentation (if exists)

### Key Code Locations
- Invitation Service: `backend/src/services/invitationService.ts`
- Event Service: `backend/src/services/eventService.ts`
- Invitation Routes: `backend/src/routes/invitations.ts`
- Event Routes: `backend/src/routes/event.ts`
- Members Dialog: `frontend/src/components/MembersDialog.tsx`
- Dashboard: `frontend/src/pages/Dashboard.tsx`

### External Resources
- Prisma Transactions: https://www.prisma.io/docs/concepts/components/prisma-client/transactions
- Optimistic Locking Pattern: https://en.wikipedia.org/wiki/Optimistic_concurrency_control
- Socket.IO Rooms: https://socket.io/docs/v4/rooms/

---

## Change Log

### 2025-11-22 - Phase 1 Complete
- Implemented all 5 critical fixes
- Added optimistic locking (6th fix)
- Committed: a42e199
- Created this refactoring plan document

---

**Document Owner**: Development Team
**Review Frequency**: After each phase completion
**Last Reviewed**: 2025-11-22
