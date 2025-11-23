# Documentation Contradictions Report
**Date:** 2025-11-23
**Purpose:** Identify and resolve contradictions between documentation and actual code implementation

---

## CRITICAL Contradictions Requiring User Decision

### 1. Invitation Permission - Who Can Send Invitations?

**CONTRADICTION:**
- **API_SPECIFICATION.md says** (line 597): "**Authorization:** Any member can invite"
- **Code implements** (invitationService.ts:144-146):
  ```typescript
  if (calendar.owner_id !== invitedByUserId) {
    throw new Error('Only the calendar owner can send invitations');
  }
  ```

**Source of Truth:** CODE restricts to owner only

**Impact:** HIGH - This is a significant functional difference that affects user permissions

**User Decision Needed:**
- **Option A:** Update documentation to match code (only owner can invite)
- **Option B:** Update code to allow any member to invite (requires code change)

**Recommendation:** Verify intended design. If owner-only is intentional, update API docs.

---

### 2. API Endpoint Paths - Member Removal

**CONTRADICTION:**
- **API_SPECIFICATION.md documents** (lines 847, 866):
  - `DELETE /api/event-calendars/:id/members/:user_id`
  - `DELETE /api/event-calendars/:id/members/me`
- **Code implements** (invitations.ts:345):
  - `DELETE /api/memberships/:id`

**Source of Truth:** CODE uses `/api/memberships/:id`

**Impact:** CRITICAL - API consumers using documented endpoints will get 404 errors

**User Decision Needed:**
- **Option A:** Update API documentation to reflect actual endpoint `/api/memberships/:id`
- **Option B:** Change backend route to match documentation (requires route change + frontend updates)

**Recommendation:** Update documentation to match code. The `/memberships/:id` pattern is simpler and already implemented.

**Note:** No `DELETE /api/event-calendars/:id/members/me` endpoint exists in the code.

---

### 3. Invitation Email Expiry Text

**CONTRADICTION:**
- **Email template says** (emailService.ts:92, 114):
  ```html
  Link expires in 7 days.
  ```
- **Code implements** (invitationService.ts:254):
  ```typescript
  expiryDate.setDate(expiryDate.getDate() + 30); // Expire in 30 days
  ```

**Source of Truth:** CODE implements 30-day expiry

**Impact:** HIGH - Users receive misleading information

**User Decision Needed:**
- **Option A:** Update email template to say "Link expires in 30 days"
- **Option B:** Change code to 7-day expiry (requires migration + testing)

**Recommendation:** Update email template to match 30-day implementation. This is less disruptive.

**Files to Update:**
- `backend/src/services/emailService.ts` lines 92 and 114

---

## Documentation Inaccuracies (No Contradiction, Just Wrong/Missing Info)

### 4. Missing DELETE /api/event-calendars/:id/members/me Endpoint

**Issue:** API_SPECIFICATION.md documents a self-removal endpoint that doesn't exist

**Documentation** (line 866): `DELETE /api/event-calendars/:id/members/me`

**Reality:** This endpoint is not implemented in the code

**Impact:** MEDIUM - Feature gap

**User Decision Needed:**
- **Option A:** Remove from API documentation (feature not implemented)
- **Option B:** Implement the endpoint (requires backend work)

**Recommendation:** Remove from documentation until implemented. Current workaround is `DELETE /api/memberships/:id` with the user's own membership ID.

---

### 5. Member Removal Permission - Who Can Remove Members?

**CONTRADICTION:**
- **API_SPECIFICATION.md says** (line 852): "**Authorization:** Any member can remove others (except owner)"
- **Code implements** (invitationService.ts:634-636):
  ```typescript
  if (membership.event_calendar.owner_id !== userId) {
    throw new Error('Only the calendar owner can remove members');
  }
  ```

**Source of Truth:** CODE restricts to owner only

**Impact:** HIGH - Same as contradiction #1, this affects user permissions

**User Decision Needed:**
- **Option A:** Update documentation to match code (only owner can remove members)
- **Option B:** Update code to allow any member to remove others (requires code change)

**Recommendation:** Update documentation to match code. Owner-only removal provides better control.

---

## Summary

### Contradictions Found
- ✅ 4 critical contradictions identified
- ✅ 1 documentation inaccuracy identified
- ✅ All items verified against source code

### Recommended Actions (in priority order)

1. **Fix email template** (Quick Fix - 2 minutes)
   - Change "7 days" to "30 days" in `emailService.ts`

2. **Update API documentation** (15 minutes)
   - Change member removal endpoints from `/api/event-calendars/:id/members/*` to `/api/memberships/:id`
   - Update invitation authorization from "Any member" to "Owner only"
   - Remove non-existent `/api/event-calendars/:id/members/me` endpoint

3. **Verify removeMember authorization** (5 minutes)
   - Check who can actually call removeMember()
   - Update docs if needed

---

## Files Requiring Updates

### To Fix Contradictions:

1. **backend/src/services/emailService.ts**
   - Line 92: Change "Link expires in 7 days" → "Link expires in 30 days"
   - Line 114: Change "Link expires in 7 days" → "Link expires in 30 days"

2. **docs/API_SPECIFICATION.md**
   - Line 597: Change "**Authorization:** Any member can invite" → "**Authorization:** Owner only"
   - Line 852: Change "**Authorization:** Any member can remove others" → "**Authorization:** Owner only"
   - Lines 847-863: Replace `DELETE /api/event-calendars/:id/members/:user_id` section with correct endpoint `DELETE /api/memberships/:id`
   - Lines 866-875: Remove `DELETE /api/event-calendars/:id/members/me` section (not implemented)

---

## Next Steps

**USER INPUT REQUIRED:**

Please review contradictions #1, #2, #3, and #5 above and confirm the approach:

1. **Invitation permissions** - Confirm owner-only is correct, or should any member be able to invite?
2. **API endpoint paths** - Confirm we should update docs to match `/api/memberships/:id`
3. **Email expiry text** - Confirm we should update to 30 days
4. **Member removal permissions** - Confirm owner-only is correct, or should any member be able to remove others?

Once confirmed, I will:
1. Fix the email template (7 days → 30 days)
2. Update API_SPECIFICATION.md with correct endpoints and permissions
3. Update REFACTORING_PLAN.md if needed
4. Update PRODUCTION_AUDIT.md if needed
5. Ensure all documentation is consistent with actual code

---

**Report Generated:** 2025-11-23
**Code as Source of Truth:** Yes
**Pending User Decisions:** 3 items
