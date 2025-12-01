# API Specification
## Koordi - RESTful API

**Version:** 1.0.0
**Base URL:** `https://api.koordie.com` (production)
**Base URL:** `http://localhost:3000` (development)

---

## TABLE OF CONTENTS

1. [Authentication](#authentication)
2. [Common Patterns](#common-patterns)
3. [Error Responses](#error-responses)
4. [API Endpoints](#api-endpoints)
   - [Utility Endpoints](#utility-endpoints)
   - [Authentication & User](#authentication--user-endpoints)
   - [Event Calendars](#event-calendar-endpoints)
   - [Event Calendar Members](#event-calendar-member-endpoints)
   - [Children](#children-endpoints)
   - [Events](#event-endpoints)
   - [Background Jobs](#background-job-endpoints)

---

## AUTHENTICATION

### Authorization Header
All API requests (except OAuth initiation) require JWT authentication:

```http
Authorization: Bearer <jwt_token>
```

### JWT Structure
```json
{
  "userId": "user-uuid",
  "email": "user@example.com",
  "iat": 1699564800,
  "exp": 1700169600
}
```

**Token Expiration:** 7 days (hardcoded in `src/utils/jwt.ts`)
**Refresh Strategy:** None - user must re-authenticate via Google OAuth when token expires

---

## COMMON PATTERNS

### Pagination

**Status:** NOT IMPLEMENTED

Pagination is not currently implemented. All list endpoints return complete result sets.

### Filtering

**Events Endpoint (`GET /api/events`) supports:**
- `calendar_id` - Filter by calendar UUID
- `start_date` - ISO 8601 date (events starting after)
- `end_date` - ISO 8601 date (events starting before)
- `unassigned` - "true" to show only unassigned events
- `assigned_to_me` - "true" to show events assigned to current user

**Note:** `child_id` filter is NOT implemented

---

## ERROR RESPONSES

### Actual Error Format

Most endpoints use a simple error format:
```json
{
  "error": "Human-readable error message"
}
```

Some endpoints (e.g., event assignment conflicts) return structured errors:
```json
{
  "error": "Event was modified by another user",
  "code": "CONCURRENT_MODIFICATION",
  "details": {
    "expected_version": 5,
    "actual_version": 6,
    "current_state": { ... }
  },
  "message": "The event has been updated since you last viewed it."
}
```

### HTTP Status Codes Used
- `200` OK - Successful request
- `201` Created - Resource created successfully
- `204` No Content - Successful delete
- `400` Bad Request - Invalid input or business rule violation
- `401` Unauthorized - Missing authentication token
- `403` Forbidden - Invalid or expired token
- `404` Not Found - Resource doesn't exist or access denied
- `409` Conflict - Concurrent modification (optimistic locking)
- `500` Internal Server Error - Server error

**Not Used:** `422` (no structured validation errors)

**Note:** `429` is used for invitation rate limiting. `503` is used for degraded health check status.

---

## API ENDPOINTS

---

## UTILITY ENDPOINTS

### GET /api

API info endpoint.

**Authentication:** None (public endpoint)

**Response:** `200 OK`
```json
{
  "message": "Koordi API",
  "version": "1.0.0",
  "documentation": "/api/docs"
}
```

---

### GET /api/health

Health check endpoint for monitoring and load balancers.

**Authentication:** None (public endpoint)

**Response:** `200 OK` (healthy) or `503 Service Unavailable` (degraded)
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600.5,
  "environment": "production",
  "checks": {
    "database_url": { "status": "ok" },
    "jwt_secret": { "status": "ok" },
    "encryption_key": { "status": "ok" },
    "redis_url": { "status": "ok" },
    "email": { "status": "warning", "message": "SMTP not fully configured - emails will be logged to console" },
    "database": { "status": "ok", "message": "Connected" }
  }
}
```

**Health Check Items:**
- `database_url`, `jwt_secret`, `encryption_key`, `redis_url`: Critical environment variables
- `email`: SMTP configuration (warning if not configured, not critical)
- `database`: Actual database connectivity test

---

## AUTHENTICATION & USER ENDPOINTS

### GET /api/auth/google

Initiate Google OAuth flow.

**Authentication:** None (public endpoint)

**Request Body:** None

**Response:** `200 OK`
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

**Notes:**
- Uses `prompt='consent'` to ensure refresh token is always returned
- Required scopes: userinfo.email, userinfo.profile, calendar, calendar.events

---

### GET /api/auth/google/callback

OAuth callback endpoint.

**Authentication:** None (public endpoint)

**Query Parameters:**
- `code` (required) - OAuth authorization code

**Response:** `302 Redirect`

Redirects to frontend with token in URL:
- Success: `{FRONTEND_URL}/auth/callback?token={jwt}&needs_setup=true` (if home address not set)
- Error: `{FRONTEND_URL}/auth/error?message={error_message}`

**Notes:**
- Auto-accepts any pending invitations for the user's email
- Checks if user needs setup (home address required)
- Sets `needs_setup=true` URL param if home address is missing

---

### GET /api/auth/me

Get current user profile and settings.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar_url": "https://...",
  "google_calendar_id": "primary",
  "home_address": "123 Main St, City, State 12345",
  "comfort_buffer_minutes": 5,
  "keep_supplemental_events": false,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Notes:**
- Sensitive data (google_refresh_token_enc, home_latitude, home_longitude) excluded from response

---

### POST /api/auth/logout

Logout endpoint (client should remove token).

**Authentication:** Required

**Request Body:** None

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

**Notes:**
- JWT-based auth means logout is handled client-side by removing the token
- This endpoint exists for API completeness but doesn't invalidate the token server-side
- No token blacklist is implemented

---

### PATCH /api/users/me

Update user profile.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "John Doe",
  "avatar_url": "https://..."
}
```

**Response:** `200 OK`
Returns updated user object (same format as GET /api/auth/me)

---

### PATCH /api/users/me/settings/address

Update home address.

**Authentication:** Required

**Request Body:**
```json
{
  "address": "123 Main St, City, State 12345",
  "latitude": 37.7749,
  "longitude": -122.4194
}
```

**Response:** `200 OK`
Returns updated user object (same format as GET /api/auth/me)

**Errors:**
- `400` - Address is required

---

### PATCH /api/users/me/settings/comfort-buffer

Update comfort buffer setting.

**Authentication:** Required

**Request Body:**
```json
{
  "comfort_buffer_minutes": 5
}
```

**Validation:**
- `comfort_buffer_minutes`: 0-60

**Response:** `200 OK`
Returns updated user object (same format as GET /api/auth/me)

**Errors:**
- `400` - Comfort buffer must be between 0 and 60 minutes

---

### PATCH /api/users/me/settings/retention

Update supplemental event retention setting.

**Authentication:** Required

**Request Body:**
```json
{
  "keep_supplemental_events": true
}
```

**Response:** `200 OK`
Returns updated user object (same format as GET /api/auth/me)

**Notes:**
- Triggers retroactive sync/unsync of all supplemental events in background
- When enabled: syncs supplemental events for non-assigned events to Google Calendar
- When disabled: removes supplemental events for non-assigned events from Google Calendar

**Errors:**
- `400` - keep_supplemental_events must be a boolean

---

### DELETE /api/users/me

Delete user account.

**Authentication:** Required

**Request Body:** None

**Response:** `200 OK`
```json
{
  "message": "Account deleted successfully"
}
```

---

## EVENT CALENDAR ENDPOINTS

### POST /api/calendars/validate-ics

Validate ICS feed URL before creating calendar.

**Authentication:** Required

**Request Body:**
```json
{
  "ics_url": "https://example.com/calendar.ics"
}
```

**Response:** `200 OK`
```json
{
  "valid": true,
  "calendar_name": "Soccer Team Schedule",
  "event_count": 24,
  "date_range": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  }
}
```

**Errors:**
- `400` - ics_url is required
- `500` - Failed to validate ICS feed

---

### POST /api/calendars

Create new Event Calendar.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Soccer - Spring 2024",
  "ics_url": "https://example.com/calendar.ics",
  "child_id": "child-uuid",
  "color": "#FF5733"
}
```

**Validation:**
- `name`: Required
- `ics_url`: Required, valid URL, must return valid ICS
- `child_id`: Required
- `color`: Optional, hex color

**Response:** `201 Created`
```json
{
  "id": "calendar-uuid",
  "name": "Soccer - Spring 2024",
  "ics_url": "https://example.com/calendar.ics",
  "child_id": "child-uuid",
  "owner_id": "user-uuid",
  "color": "#FF5733",
  "sync_enabled": true,
  "last_sync_status": "pending",
  "created_at": "2024-01-01T00:00:00Z",
  "initialSync": {
    "eventsAdded": 24,
    "eventsUpdated": 0,
    "eventsDeleted": 0
  }
}
```

**Notes:**
- Initial ICS sync is performed synchronously (up to 90 second timeout)
- If sync fails, calendar is automatically deleted and error returned
- Events are synced to owner's Google Calendar during creation

**Errors:**
- `400` - Missing required fields: name, ics_url, child_id
- `500` - Failed to sync calendar events

---

### GET /api/calendars

List all Event Calendars where user is owner or member.

**Authentication:** Required

**Query Parameters:** None

**Response:** `200 OK`
Returns array of calendars (format depends on service implementation)

---

### GET /api/calendars/:id

Get Event Calendar details.

**Authentication:** Required
**Authorization:** User must be owner or member

**Response:** `200 OK`
Returns calendar object (format depends on service implementation)

**Errors:**
- `404` - Calendar not found

---

### PATCH /api/calendars/:id

Update Event Calendar.

**Authentication:** Required
**Authorization:** User must be owner

**Request Body:**
```json
{
  "name": "Soccer - Updated Name",
  "ics_url": "https://example.com/updated.ics",
  "color": "#00FF00",
  "sync_enabled": true
}
```

**Response:** `200 OK`
Returns updated calendar object

**Errors:**
- `404` - Calendar not found or not the owner

---

### DELETE /api/calendars/:id

Delete Event Calendar (owner only, must remove all members first).

**Authentication:** Required
**Authorization:** User must be owner

**Request Body:** None

**Response:** `200 OK`
```json
{
  "message": "Calendar deleted successfully"
}
```

**Preconditions:**
- Calendar must have no accepted members (only owner remains)
- Remove all members before deleting calendar

**Errors:**
- `400` - Cannot delete calendar with multiple members
- `404` - Calendar not found or not the owner

---

### POST /api/calendars/:id/sync

Manually trigger ICS sync.

**Authentication:** Required
**Authorization:** User must be owner or member

**Response:** `200 OK`
```json
{
  "message": "Sync completed",
  "created": 5,
  "updated": 2,
  "deleted": 1
}
```

**Notes:**
- Syncs ICS feed to database AND Google Calendar for all members
- Runs synchronously (may take time for large calendars)
- Uses in-memory lock to prevent concurrent syncs for the same calendar

**Errors:**
- `404` - Calendar not found
- `409` - Sync already in progress for this calendar (returns `retryAfter: 5`)
- `500` - Failed to sync calendar

---

## EVENT CALENDAR MEMBER ENDPOINTS

### GET /api/family-members

Get all family members (users who share any calendar with current user).

**Authentication:** Required

**Response:** `200 OK`
Returns array of users with their calendar associations

---

### POST /api/event-calendars/:calendarId/invitations

Send invitation to join an Event Calendar.

**Authentication:** Required
**Authorization:** Any calendar member (not just owner)
**Rate Limit:** 10 invitations per 15 minutes per IP (via `invitationRateLimiter`)

**Request Body:**
```json
{
  "email": "jane@example.com"
}
```

**Validation:**
- Email must be valid format
- Cannot invite existing members or self

**Response:** `201 Created`
Returns membership/invitation object

**Behavior:**
- If invited email belongs to existing user: status = "accepted" (auto-added directly)
- If invited email is new user: status = "pending", invitation email sent
- Invitations expire after 30 days
- When existing user is added, their Google Calendar is immediately synced

**Errors:**
- `400` - Email is required / Invalid email format
- `400` - Various business rule violations (already member, etc.)

---

### POST /api/event-calendars/:calendarId/invitations/bulk

Send bulk invitations from a CSV file.

**Authentication:** Required
**Authorization:** Owner only

**Request:**
- Content-Type: `multipart/form-data`
- File field name: `file`
- File type: CSV (.csv)
- Max file size: 1 MB

**CSV Format:**
- One email per line, or comma-separated
- Example:
```csv
alice@example.com
bob@example.com,charlie@example.com
dave@example.com
```

**Response:** `200 OK`
```json
{
  "total": 4,
  "valid": 4,
  "invalid": 0,
  "success": 3,
  "failed": 1,
  "results": [
    {
      "email": "alice@example.com",
      "success": true
    },
    {
      "email": "dave@example.com",
      "success": false,
      "error": "This email is already a member"
    }
  ]
}
```

**Validation:**
- Each email is validated and deduplicated
- Invalid emails are reported in results
- Processing continues even if some emails fail
- Same restrictions as single invitation endpoint apply per email

**Errors:**
- `400` - CSV file is required
- `400` - No email addresses found in CSV file
- `400` - Only CSV files are allowed

---

### GET /api/event-calendars/:calendarId/members

List all members and pending invitations for an Event Calendar.

**Authentication:** Required
**Authorization:** User must be owner or member

**Response:** `200 OK`
```json
{
  "owner": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "avatar_url": "https://..."
  },
  "members": [
    {
      "id": "membership-uuid",
      "user_id": "user-uuid",
      "invited_email": "jane@example.com",
      "status": "accepted",
      "invited_at": "2024-01-01T00:00:00Z",
      "responded_at": "2024-01-02T00:00:00Z",
      "user": {
        "id": "user-uuid",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "avatar_url": "https://..."
      },
      "invited_by": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  ],
  "analytics": {
    "total": 5,
    "accepted": 3,
    "declined": 1,
    "pending": 1,
    "expired": 0
  }
}
```

**Analytics Explanation:**
- `total`: All memberships/invitations for this calendar
- `accepted`: Active members
- `declined`: Explicitly declined invitations
- `pending`: Active pending invitations (not expired)
- `expired`: Invitations that expired without response

---

### GET /api/invitations/pending

Get current user's pending invitations.

**Authentication:** Required

**Response:** `200 OK`
Returns array of pending invitations for the user's email

---

### POST /api/invitations/:token/accept

Accept invitation to Event Calendar.

**Authentication:** Required

**Request Body:** None

**Response:** `200 OK`
Returns updated membership object with event_calendar details

**Side Effects:**
- All existing calendar events are synced to the new member's Google Calendar
- Sync runs synchronously (up to 90 second timeout)

**Errors:**
- `400` - Invitation not found
- `400` - Invitation already accepted/declined
- `400` - This invitation has expired
- `400` - This invitation was sent to a different email address

---

### POST /api/invitations/:token/decline

Decline invitation to Event Calendar.

**Authentication:** Required

**Request Body:** None

**Response:** `200 OK`
Returns updated membership object with status "declined"

**Errors:**
- `400` - Invitation not found
- `400` - Invitation already accepted/declined
- `400` - This invitation has expired
- `400` - This invitation was sent to a different email address

---

### POST /api/invitations/:id/resend

Resend invitation email.

**Authentication:** Required
**Authorization:** Owner only (calendar owner)

**Response:** `200 OK`
Returns updated invitation object with new invited_at timestamp

**Errors:**
- `400` - Invitation not found
- `400` - Only the calendar owner can resend invitations
- `400` - Can only resend pending invitations

---

### DELETE /api/invitations/:id

Cancel pending invitation.

**Authentication:** Required
**Authorization:** Owner only (calendar owner)

**Response:** `204 No Content`

**Errors:**
- `400` - Invitation not found
- `400` - Only the calendar owner can cancel invitations
- `400` - Can only cancel pending invitations

---

### DELETE /api/memberships/:id

Remove member from Event Calendar.

**Authentication:** Required
**Authorization:** Owner only (calendar owner)

**Response:** `204 No Content`

**Side Effects:**
- All events reassigned from removed member to calendar owner
- All synced events deleted from removed member's Google Calendar
- Member loses access to all events
- WebSocket broadcasts: MEMBER_REMOVED, EVENT_ASSIGNED (for each reassigned event)

**Errors:**
- `400` - Membership not found
- `400` - Only the calendar owner can remove members
- `400` - Can only remove accepted members

---

## CHILDREN ENDPOINTS

### POST /api/children

Create new child.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Emma",
  "photo_url": "https://...",
  "date_of_birth": "2015-05-15"
}
```

**Validation:**
- `name`: Required
- `photo_url`: Optional
- `date_of_birth`: Optional

**Response:** `201 Created`
Returns created child object

**Errors:**
- `400` - Child name is required

---

### GET /api/children

List all accessible children.

**Authentication:** Required

**Response:** `200 OK`
Returns array of child objects

---

### GET /api/children/:id

Get child details.

**Authentication:** Required
**Authorization:** User must have access via Event Calendar membership

**Response:** `200 OK`
Returns child object

**Errors:**
- `404` - Child not found

---

### PATCH /api/children/:id

Update child information.

**Authentication:** Required
**Authorization:** User must have access via Event Calendar membership

**Request Body:**
```json
{
  "name": "Emma Rose",
  "photo_url": "https://...",
  "date_of_birth": "2015-05-15"
}
```

**Response:** `200 OK`
Returns updated child object

**Errors:**
- `404` - Child not found or access denied

---

### DELETE /api/children/:id

Delete child.

**Authentication:** Required
**Authorization:** User must have access via Event Calendar membership

**Request Body:** None

**Response:** `200 OK`
```json
{
  "message": "Child deleted successfully"
}
```

**Errors:**
- `400` - Cannot delete child with existing event calendars
- `404` - Child not found or access denied

---

## EVENT ENDPOINTS

### GET /api/events

List events with filtering.

**Authentication:** Required

**Query Parameters:**
- `calendar_id` (optional) - Filter by calendar
- `start_date` (optional) - Filter events starting after this date
- `end_date` (optional) - Filter events starting before this date
- `unassigned` (optional) - "true" to only show unassigned events
- `assigned_to_me` (optional) - "true" to only show events assigned to me

**Response:** `200 OK`
Returns array of event objects

---

### GET /api/events/:id

Get single event details.

**Authentication:** Required
**Authorization:** User must be member of event's Event Calendar

**Response:** `200 OK`
Returns event object

**Errors:**
- `404` - Event not found

---

### PATCH /api/events/:id/assign

Assign or reassign event to a parent.

**Authentication:** Required
**Authorization:** User must be member of event's Event Calendar

**Request Body:**
```json
{
  "assigned_to_user_id": "user-uuid",
  "expected_version": 5,
  "skip": false
}
```

**Notes:**
- Pass `null` for `assigned_to_user_id` to unassign
- `expected_version` is optional for optimistic locking (race condition protection)
- `skip` is optional: set to `true` to mark event as "Not Attending" (sets `is_skipped=true` and clears assignment)
- When `skip=true`, `assigned_to_user_id` is ignored and set to `null`

**Response:** `200 OK`
Returns updated event object

**Side Effects:**
- Previous assignee's supplemental events handled (based on retention setting)
- New assignee's supplemental events created (unless `skip=true`)
- Google Calendar updated for all members (title reflects assignment/skip status)
- WebSocket broadcast: EVENT_ASSIGNED or EVENT_UNASSIGNED (includes `is_skipped` in payload)
- When `skip=true`: supplemental events deleted, Google Calendar title updated to "🚫 Not Attending - [Title]"

**Errors:**
- `404` - Event not found or access denied
- `409` - Event was modified by another user (concurrent modification)

---

### GET /api/events/:id/conflicts

Check for scheduling conflicts if assigning event to a user.

**Authentication:** Required

**Query Parameters:**
- `assign_to_user_id` (required) - Check conflicts for this user

**Response:** `200 OK`
```json
{
  "conflicts": [...],
  "hasConflicts": true
}
```

**Errors:**
- `400` - assign_to_user_id is required
- `404` - Event not found or access denied

---

### POST /api/events/resolve-conflict

Resolve a conflict between two events.

**Authentication:** Required

**Request Body:**
```json
{
  "event1_id": "event-uuid-1",
  "event2_id": "event-uuid-2",
  "reason": "same_location",
  "assigned_user_id": "user-uuid"
}
```

**Behavior:**
- For `same_location` reason: Deletes return (drive-home) for event1 and departure (drive-to) for event2

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Conflict resolved"
}
```

**Side Effects:**
- Supplemental events deleted from Google Calendar
- WebSocket broadcast: CONFLICT_RESOLVED

**Errors:**
- `400` - event1_id, event2_id, reason, and assigned_user_id are required
- `404` - One or both events not found

---

## BACKGROUND JOB ENDPOINTS

These endpoints provide access to the Bull Queue job system for ICS sync operations.

### GET /api/jobs/stats

Get job queue statistics.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "waiting": 0,
  "active": 1,
  "completed": 150,
  "failed": 2,
  "delayed": 0,
  "total": 153
}
```

---

### GET /api/jobs/recent

Get recent jobs.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional) - Number of jobs to return (default: 10)

**Response:** `200 OK`
```json
[
  {
    "id": "job-123",
    "data": { "calendarId": "calendar-uuid" },
    "status": "completed",
    "timestamp": 1699564800000,
    "processedOn": 1699564801000,
    "finishedOn": 1699564805000,
    "returnvalue": { "eventsAdded": 5, "eventsUpdated": 2, "eventsDeleted": 0 }
  }
]
```

---

### POST /api/jobs/sync/calendar/:calendarId

Manually trigger sync for a specific calendar via job queue.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "message": "Sync job queued",
  "jobId": "job-123",
  "calendarId": "calendar-uuid"
}
```

**Notes:**
- This queues a background job, unlike `POST /api/calendars/:id/sync` which runs synchronously
- Useful for non-blocking sync operations

---

### POST /api/jobs/sync/all

Manually trigger sync for all calendars.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "message": "Sync job queued for all calendars",
  "jobId": "job-456"
}
```

---

### GET /api/jobs/:jobId

Get details of a specific job.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": "job-123",
  "data": { "calendarId": "calendar-uuid" },
  "status": "completed",
  "timestamp": 1699564800000,
  "processedOn": 1699564801000,
  "finishedOn": 1699564805000,
  "attemptsMade": 1,
  "returnvalue": { "eventsAdded": 5, "eventsUpdated": 2, "eventsDeleted": 0 },
  "failedReason": null
}
```

**Errors:**
- `404` - Job not found

---

## RATE LIMITS

**Status:** Only invitation rate limiting is implemented.

**Invitation Rate Limit:**
- 10 invitations per calendar per hour
- Key: per-calendar (not per-user or per-IP)
- Uses standard `RateLimit-*` headers (not legacy `X-RateLimit-*`)

**Rate Limit Exceeded Response:** `429 Too Many Requests`
```json
{
  "error": "Too many invitations sent",
  "message": "You have reached the maximum number of invitations (10) for this calendar in the last hour. Please try again later."
}
```

**Not Implemented:** General API rate limiting (anonymous/authenticated request limits) is not currently implemented.

---

## VERSIONING

API versioning via header (future):
```http
Accept: application/vnd.familyschedule.v1+json
```

For MVP, version is implicit (v1).

---

**End of API Specification**
