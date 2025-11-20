# API Specification
## Koordi - RESTful API

**Version:** 1.0.0
**Base URL:** `https://api.koordi.app` (production)
**Base URL:** `http://localhost:3000` (development)

---

## TABLE OF CONTENTS

1. [Authentication](#authentication)
2. [Common Patterns](#common-patterns)
3. [Error Responses](#error-responses)
4. [API Endpoints](#api-endpoints)
   - [Authentication & User](#authentication--user-endpoints)
   - [Event Calendars](#event-calendar-endpoints)
   - [Event Calendar Members](#event-calendar-member-endpoints)
   - [Children](#children-endpoints)
   - [Events](#event-endpoints)

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
  "sub": "user-uuid",
  "email": "user@example.com",
  "iat": 1699564800,
  "exp": 1699651200
}
```

**Token Expiration:** 24 hours
**Refresh Strategy:** Automatic refresh when < 1 hour remaining

---

## COMMON PATTERNS

### Pagination
List endpoints support pagination:

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 50, max: 100)

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

### Filtering
**Date Ranges:**
- `start_date` (ISO 8601)
- `end_date` (ISO 8601)

**Child Filter:**
- `child_id` (UUID)

**Assignment Filter:**
- `assigned_to` (UUID or "unassigned" or "me")

---

## ERROR RESPONSES

### Standard Error Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context"
    }
  }
}
```

### HTTP Status Codes
- `200` OK - Successful request
- `201` Created - Resource created successfully
- `400` Bad Request - Invalid input
- `401` Unauthorized - Missing or invalid authentication
- `403` Forbidden - Authenticated but not authorized
- `404` Not Found - Resource doesn't exist
- `409` Conflict - Resource conflict (duplicate, etc.)
- `422` Unprocessable Entity - Validation errors
- `429` Too Many Requests - Rate limit exceeded
- `500` Internal Server Error - Server error
- `503` Service Unavailable - External service failure

---

## API ENDPOINTS

---

## AUTHENTICATION & USER ENDPOINTS

### POST /api/auth/google/initiate

Initiate Google OAuth flow.

**Authentication:** None (public endpoint)

**Request Body:**
```json
{
  "invitation_token": "optional-invitation-uuid"
}
```

**Response:** `200 OK`
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "csrf-token-uuid"
}
```

**Errors:**
- `400` - Invalid invitation token

---

### GET /api/auth/google/callback

OAuth callback endpoint.

**Authentication:** None (public endpoint)

**Query Parameters:**
- `code` (required) - OAuth authorization code
- `state` (required) - CSRF token from initiate

**Response:** `200 OK`
```json
{
  "token": "jwt-token",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "profile_photo_url": "https://...",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "is_new_user": true
}
```

**Errors:**
- `400` - Invalid code or state
- `403` - CSRF validation failed

---

### GET /api/users/me

Get current user profile and settings.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "profile_photo_url": "https://...",
  "google_calendar_id": "primary",
  "default_home_address": "123 Main St, City, State 12345",
  "default_home_latitude": 37.7749,
  "default_home_longitude": -122.4194,
  "comfort_buffer_minutes": 5,
  "use_comfort_buffer": false,
  "supplemental_event_retention_on_reassign": false,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

---

### PATCH /api/users/me

Update user profile.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "John Doe",
  "profile_photo_url": "https://..."
}
```

**Response:** `200 OK`
```json
{
  "id": "user-uuid",
  "name": "John Doe",
  "profile_photo_url": "https://...",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

---

### PATCH /api/users/me/settings/address

Update default home address.

**Authentication:** Required

**Request Body:**
```json
{
  "place_id": "ChIJ...",
  "address": "123 Main St, City, State 12345",
  "latitude": 37.7749,
  "longitude": -122.4194
}
```

**Response:** `200 OK`
```json
{
  "default_home_address": "123 Main St, City, State 12345",
  "default_home_latitude": 37.7749,
  "default_home_longitude": -122.4194,
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `400` - Invalid place_id or address

---

### PATCH /api/users/me/settings/comfort-buffer

Update comfort buffer settings.

**Authentication:** Required

**Request Body:**
```json
{
  "use_comfort_buffer": true,
  "comfort_buffer_minutes": 5
}
```

**Validation:**
- `comfort_buffer_minutes`: 0-60, increments of 5

**Response:** `200 OK`
```json
{
  "use_comfort_buffer": true,
  "comfort_buffer_minutes": 5,
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `422` - Invalid comfort_buffer_minutes value

---

### PATCH /api/users/me/settings/retention

Update supplemental event retention setting.

**Authentication:** Required

**Request Body:**
```json
{
  "supplemental_event_retention_on_reassign": true
}
```

**Response:** `200 OK`
```json
{
  "supplemental_event_retention_on_reassign": true,
  "updated_at": "2024-01-01T00:00:00Z"
}
```

---

### DELETE /api/users/me

Delete user account (requires confirmation).

**Authentication:** Required

**Request Body:**
```json
{
  "confirmation": "DELETE"
}
```

**Response:** `204 No Content`

**Errors:**
- `400` - Invalid confirmation

---

## EVENT CALENDAR ENDPOINTS

### POST /api/event-calendars/validate-ics

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
- `400` - Invalid URL format
- `400` - ICS feed unreachable
- `400` - Invalid calendar format

---

### POST /api/event-calendars

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
- `name`: Required, 1-100 chars
- `ics_url`: Required, valid URL, must return valid ICS
- `child_id`: Required, user must have access to child
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
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `400` - Invalid ICS URL
- `404` - Child not found
- `409` - Duplicate ICS URL for this child

---

### GET /api/event-calendars

List all Event Calendars where user is a member.

**Authentication:** Required

**Query Parameters:**
- `child_id` (optional) - Filter by child

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "calendar-uuid",
      "name": "Soccer - Spring 2024",
      "child": {
        "id": "child-uuid",
        "name": "Emma",
        "photo_url": "https://..."
      },
      "owner_id": "user-uuid",
      "is_owner": true,
      "color": "#FF5733",
      "sync_enabled": true,
      "last_synced_at": "2024-01-01T12:00:00Z",
      "last_sync_status": "success",
      "event_count_upcoming": 12,
      "member_count": 2,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### GET /api/event-calendars/:id

Get Event Calendar details.

**Authentication:** Required
**Authorization:** User must be a member of this Event Calendar

**Response:** `200 OK`
```json
{
  "id": "calendar-uuid",
  "name": "Soccer - Spring 2024",
  "ics_url": "https://example.com/calendar.ics",
  "child": {
    "id": "child-uuid",
    "name": "Emma",
    "photo_url": "https://..."
  },
  "owner": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "is_owner": true,
  "color": "#FF5733",
  "sync_enabled": true,
  "last_synced_at": "2024-01-01T12:00:00Z",
  "last_sync_status": "success",
  "last_sync_error": null,
  "event_count_total": 48,
  "event_count_upcoming": 12,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `404` - Calendar not found
- `403` - User not a member

---

### PATCH /api/event-calendars/:id

Update Event Calendar.

**Authentication:** Required
**Authorization:** User must be owner

**Request Body:**
```json
{
  "name": "Soccer - Updated Name",
  "color": "#00FF00"
}
```

**Note:** ICS URL cannot be changed after creation

**Response:** `200 OK`
```json
{
  "id": "calendar-uuid",
  "name": "Soccer - Updated Name",
  "color": "#00FF00",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `404` - Calendar not found
- `403` - User not owner

---

### DELETE /api/event-calendars/:id

Delete Event Calendar (high friction - owner only).

**Authentication:** Required
**Authorization:** User must be owner

**Request Body:**
```json
{
  "confirmation": "DELETE"
}
```

**Response:** `204 No Content`

**Side Effects:**
- All events deleted from all members' Google Calendars
- All members removed
- Child remains (not deleted)

**Errors:**
- `404` - Calendar not found
- `403` - User not owner
- `400` - Invalid confirmation

---

### POST /api/event-calendars/:id/sync

Manually trigger sync (for immediate refresh).

**Authentication:** Required
**Authorization:** User must be a member

**Response:** `202 Accepted`
```json
{
  "message": "Sync job queued",
  "job_id": "job-uuid"
}
```

---

### GET /api/event-calendars/:id/sync-status

Get current sync status.

**Authentication:** Required
**Authorization:** User must be a member

**Response:** `200 OK`
```json
{
  "calendar_id": "calendar-uuid",
  "last_synced_at": "2024-01-01T12:00:00Z",
  "last_sync_status": "success",
  "last_sync_error": null,
  "sync_in_progress": false
}
```

---

## EVENT CALENDAR MEMBER ENDPOINTS

### POST /api/event-calendars/:id/invitations

Invite parent members to Event Calendar.

**Authentication:** Required
**Authorization:** Any member can invite

**Request Body:**
```json
{
  "invitations": [
    {
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  ]
}
```

**Validation:**
- Max 10 members per Event Calendar
- Email must be valid format
- Cannot invite owner's email
- Cannot invite existing members

**Response:** `201 Created`
```json
{
  "invitations": [
    {
      "id": "invitation-uuid",
      "email": "jane@example.com",
      "token": "secure-token-uuid",
      "status": "pending",
      "created_at": "2024-01-01T00:00:00Z",
      "invitation_url": "https://app.familyschedule.app/invitations/secure-token-uuid"
    }
  ]
}
```

**Errors:**
- `400` - Invalid email format
- `409` - User already member or invited
- `422` - Max members exceeded

---

### GET /api/event-calendars/:id/members

List all members of Event Calendar.

**Authentication:** Required
**Authorization:** User must be a member

**Response:** `200 OK`
```json
{
  "members": [
    {
      "user_id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "profile_photo_url": "https://...",
      "is_owner": true,
      "joined_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pending_invitations": [
    {
      "id": "invitation-uuid",
      "email": "jane@example.com",
      "invited_by": "John Doe",
      "status": "pending",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

### POST /api/invitations/:token/accept

Accept invitation to Event Calendar.

**Authentication:** Required

**Request Body:** None

**Response:** `200 OK`
```json
{
  "event_calendar": {
    "id": "calendar-uuid",
    "name": "Soccer - Spring 2024",
    "child": {
      "id": "child-uuid",
      "name": "Emma"
    }
  },
  "membership": {
    "user_id": "user-uuid",
    "joined_at": "2024-01-01T00:00:00Z"
  }
}
```

**Errors:**
- `404` - Invalid token
- `409` - Already accepted
- `403` - Email mismatch (must sign in with invited email)

---

### POST /api/invitations/:token/decline

Decline invitation to Event Calendar.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "message": "Invitation declined"
}
```

---

### POST /api/invitations/:id/resend

Resend invitation email.

**Authentication:** Required
**Authorization:** User must be a member of the Event Calendar

**Response:** `200 OK`
```json
{
  "message": "Invitation resent",
  "invitation_url": "https://app.familyschedule.app/invitations/secure-token-uuid"
}
```

---

### DELETE /api/invitations/:id

Cancel pending invitation.

**Authentication:** Required
**Authorization:** User must be a member of the Event Calendar

**Response:** `204 No Content`

---

### DELETE /api/event-calendars/:id/members/:user_id

Remove member from Event Calendar.

**Authentication:** Required
**Authorization:** Any member can remove others (except owner)

**Response:** `204 No Content`

**Side Effects:**
- All events deleted from removed member's Google Calendar
- Member loses access to all events

**Errors:**
- `403` - Cannot remove owner
- `404` - Member not found

---

### DELETE /api/event-calendars/:id/members/me

Leave Event Calendar (self-removal).

**Authentication:** Required

**Response:** `204 No Content`

**Errors:**
- `403` - Owner cannot leave (must delete calendar instead)

---

## CHILDREN ENDPOINTS

### POST /api/children

Create new child.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Emma",
  "photo": "base64-encoded-image",
  "date_of_birth": "2015-05-15"
}
```

**Validation:**
- `name`: Required, 1-50 chars, unique within accessible children
- `photo`: Optional, max 5MB, JPG/PNG/HEIC
- `date_of_birth`: Optional, cannot be future date

**Response:** `201 Created`
```json
{
  "id": "child-uuid",
  "name": "Emma",
  "photo_url": "https://...",
  "date_of_birth": "2015-05-15",
  "age": 8,
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `409` - Duplicate name
- `400` - Future date of birth

---

### GET /api/children

List all accessible children.

**Authentication:** Required

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "child-uuid",
      "name": "Emma",
      "photo_url": "https://...",
      "date_of_birth": "2015-05-15",
      "age": 8,
      "event_calendar_count": 3,
      "upcoming_events_count": 12
    }
  ]
}
```

---

### GET /api/children/:id

Get child details with associated Event Calendars.

**Authentication:** Required
**Authorization:** User must have access via Event Calendar membership

**Response:** `200 OK`
```json
{
  "id": "child-uuid",
  "name": "Emma",
  "photo_url": "https://...",
  "date_of_birth": "2015-05-15",
  "age": 8,
  "event_calendars": [
    {
      "id": "calendar-uuid",
      "name": "Soccer - Spring 2024",
      "upcoming_events_count": 12,
      "next_event": {
        "title": "Game vs. Blue Team",
        "start_time": "2024-01-15T17:00:00Z"
      }
    }
  ],
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `404` - Child not found
- `403` - No access to this child

---

### PATCH /api/children/:id

Update child information.

**Authentication:** Required
**Authorization:** Any parent with access can edit

**Request Body:**
```json
{
  "name": "Emma Rose",
  "photo": "base64-encoded-image",
  "date_of_birth": "2015-05-15"
}
```

**Response:** `200 OK`
```json
{
  "id": "child-uuid",
  "name": "Emma Rose",
  "photo_url": "https://...",
  "date_of_birth": "2015-05-15",
  "age": 8,
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `409` - Duplicate name
- `404` - Child not found

---

### DELETE /api/children/:id

Delete child (only if no Event Calendars exist).

**Authentication:** Required
**Authorization:** Any parent with access can delete

**Request Body:**
```json
{
  "confirmation": "DELETE"
}
```

**Response:** `204 No Content`

**Errors:**
- `409` - Child has Event Calendars (must delete calendars first)
- `400` - Invalid confirmation

---

## EVENT ENDPOINTS

### GET /api/events

List events with filtering and pagination.

**Authentication:** Required

**Query Parameters:**
- `child_id` (optional) - Filter by child
- `assigned_to` (optional) - "me", "unassigned", or user UUID
- `start_date` (optional) - ISO 8601 date
- `end_date` (optional) - ISO 8601 date
- `page` (default: 1)
- `limit` (default: 50, max: 100)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "event-uuid",
      "title": "Soccer Practice",
      "description": "Arrive 15 minutes early. Bring water bottle.",
      "location_address": "123 Field St, City, State",
      "location_latitude": 37.7749,
      "location_longitude": -122.4194,
      "start_time": "2024-01-15T17:00:00Z",
      "end_time": "2024-01-15T18:30:00Z",
      "all_day": false,
      "early_arrival_minutes": 15,
      "parsed_instructions": "Bring water bottle",
      "child": {
        "id": "child-uuid",
        "name": "Emma"
      },
      "event_calendar": {
        "id": "calendar-uuid",
        "name": "Soccer - Spring 2024",
        "color": "#FF5733"
      },
      "assigned_to": {
        "id": "user-uuid",
        "name": "John Doe"
      },
      "is_assigned_to_me": true,
      "departure_time": "2024-01-15T16:15:00Z",
      "return_home_time": "2024-01-15T19:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

---

### GET /api/events/:id

Get event details with timing breakdown.

**Authentication:** Required
**Authorization:** User must be member of event's Event Calendar

**Response:** `200 OK`
```json
{
  "id": "event-uuid",
  "title": "Soccer Practice",
  "description": "Arrive 15 minutes early. Bring water bottle.",
  "location_address": "123 Field St, City, State",
  "location_latitude": 37.7749,
  "location_longitude": -122.4194,
  "start_time": "2024-01-15T17:00:00Z",
  "end_time": "2024-01-15T18:30:00Z",
  "all_day": false,
  "early_arrival_minutes": 15,
  "parsed_instructions": "Bring water bottle",
  "parsed_items_to_bring": ["water bottle"],
  "child": {
    "id": "child-uuid",
    "name": "Emma",
    "photo_url": "https://..."
  },
  "event_calendar": {
    "id": "calendar-uuid",
    "name": "Soccer - Spring 2024",
    "color": "#FF5733"
  },
  "assigned_to": {
    "id": "user-uuid",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "is_assigned_to_me": true,
  "timing_for_me": {
    "departure_time": "2024-01-15T16:15:00Z",
    "drive_to_duration_minutes": 20,
    "early_arrival_time": "2024-01-15T16:35:00Z",
    "event_start_time": "2024-01-15T17:00:00Z",
    "event_end_time": "2024-01-15T18:30:00Z",
    "drive_home_duration_minutes": 20,
    "return_home_time": "2024-01-15T19:00:00Z",
    "total_time_commitment_minutes": 165
  },
  "supplemental_events": [
    {
      "id": "supp-uuid",
      "event_type": "departure",
      "title": "Leave for Soccer Practice",
      "start_time": "2024-01-15T16:15:00Z",
      "duration_minutes": 20
    },
    {
      "id": "supp-uuid",
      "event_type": "return",
      "title": "Return Home from Soccer Practice",
      "start_time": "2024-01-15T18:30:00Z",
      "duration_minutes": 20
    }
  ],
  "google_calendar_event_id": "google-event-id",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Errors:**
- `404` - Event not found
- `403` - No access to this event

---

### PATCH /api/events/:id/assign

Assign or reassign event to a parent.

**Authentication:** Required
**Authorization:** User must be member of event's Event Calendar

**Request Body:**
```json
{
  "assigned_to_user_id": "user-uuid"
}
```

**Note:** Pass `null` to unassign

**Response:** `200 OK`
```json
{
  "id": "event-uuid",
  "assigned_to": {
    "id": "user-uuid",
    "name": "Jane Doe"
  },
  "timing": {
    "departure_time": "2024-01-15T16:20:00Z",
    "return_home_time": "2024-01-15T19:05:00Z"
  },
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Side Effects:**
- Previous assignee's supplemental events deleted (based on retention setting)
- New assignee's supplemental events created
- Google Calendar updated for all members
- WebSocket broadcast to all members

**Errors:**
- `404` - Event or user not found
- `403` - Target user not a member of Event Calendar
- `400` - User has no home address (required for assignment)

---

### GET /api/events/:id/conflicts

Check for scheduling conflicts with this event.

**Authentication:** Required

**Query Parameters:**
- `assigned_to_user_id` (required) - Check conflicts for this user

**Response:** `200 OK`
```json
{
  "has_conflict": true,
  "conflicts": [
    {
      "event_id": "other-event-uuid",
      "title": "Basketball Practice",
      "time_commitment": {
        "start": "2024-01-15T16:00:00Z",
        "end": "2024-01-15T18:00:00Z"
      },
      "overlap_period": {
        "start": "2024-01-15T16:15:00Z",
        "end": "2024-01-15T18:00:00Z"
      }
    }
  ]
}
```

---

## RATE LIMITS

**Default Rate Limits:**
- Anonymous: 10 requests/minute
- Authenticated: 100 requests/minute
- Burst: 20 requests/second

**Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699564860
```

**Rate Limit Exceeded Response:** `429 Too Many Requests`
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 42 seconds.",
    "retry_after": 42
  }
}
```

---

## VERSIONING

API versioning via header (future):
```http
Accept: application/vnd.familyschedule.v1+json
```

For MVP, version is implicit (v1).

---

**End of API Specification**
