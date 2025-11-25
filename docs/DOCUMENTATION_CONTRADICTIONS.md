# Documentation Contradictions Report
**Date:** 2025-11-23
**Updated:** 2025-11-25
**Purpose:** Track contradictions between documentation and code implementation

---

## STATUS: RESOLVED

All documentation contradictions identified on 2025-11-23 have been resolved in the documentation update on 2025-11-25.

---

## Resolved Items

### 1. ✅ Invitation Permission
- **Issue:** API_SPECIFICATION.md said "Any member can invite"
- **Code:** Only calendar owner can send invitations
- **Resolution:** Updated API_SPECIFICATION.md to say "Owner only"

### 2. ✅ API Endpoint Paths - Member Removal
- **Issue:** Documentation showed `/api/event-calendars/:id/members/:user_id`
- **Code:** Uses `DELETE /api/memberships/:id`
- **Resolution:** Updated API_SPECIFICATION.md with correct endpoint

### 3. ⚠️ Invitation Email Expiry Text (CODE FIX NEEDED)
- **Issue:** Email says "7 days" but code implements 30-day expiry
- **Status:** Documentation updated; email template fix still needed
- **File to fix:** `backend/src/services/emailService.ts` lines 92 and 114

### 4. ✅ Missing Self-Removal Endpoint
- **Issue:** `/api/event-calendars/:id/members/me` was documented but doesn't exist
- **Resolution:** Removed from API_SPECIFICATION.md

### 5. ✅ Member Removal Permission
- **Issue:** Documentation said "Any member can remove others"
- **Code:** Only calendar owner can remove members
- **Resolution:** Updated API_SPECIFICATION.md to say "Owner only"

---

## Additional Corrections Made (2025-11-25)

### Route Base Paths
- Changed `/api/event-calendars` to `/api/calendars` throughout (matches actual routes)
- Changed `/api/users/me` to `/api/auth/me` for user profile endpoint

### Authentication Endpoints
- Changed `POST /api/auth/google/initiate` to `GET /api/auth/google`
- Updated OAuth callback to show redirect behavior instead of JSON response

### User Settings
- Updated field names to match code (`avatar_url`, `home_address`, `keep_supplemental_events`, etc.)
- Removed `use_comfort_buffer` (doesn't exist in code)
- Removed confirmation requirement from `DELETE /api/users/me`

### Calendar Operations
- Updated delete calendar to require all members removed first
- Updated sync endpoint to show synchronous response format

### Event Operations
- Added `POST /api/events/resolve-conflict` endpoint
- Added optimistic locking (`expected_version`) to assignment endpoint

---

## Remaining Code Fix

One item requires a code change (not documentation):

**Email Template Expiry Text:**
```
File: backend/src/services/emailService.ts
Lines: 92, 114
Change: "Link expires in 7 days" → "Link expires in 30 days"
```

---

**Last Updated:** 2025-11-25
**Documentation Status:** Current with codebase
**Pending Code Fixes:** 1 item (email template)
