# Error Handling & Logging
## Koordi

**Purpose:** Standardized error handling, logging, and monitoring strategies
**Goal:** Consistent error responses, comprehensive logging, proactive monitoring

---

## TABLE OF CONTENTS
1. [Error Response Format](#error-response-format)
2. [Error Code Taxonomy](#error-code-taxonomy)
3. [HTTP Status Code Mapping](#http-status-code-mapping)
4. [Error Handling Middleware](#error-handling-middleware)
5. [Logging Strategy](#logging-strategy)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Client-Side Error Handling](#client-side-error-handling)
8. [Testing Error Scenarios](#testing-error-scenarios)

---

## ERROR RESPONSE FORMAT

### Standard Error Response Schema

All API errors return a consistent JSON structure:

```typescript
interface ErrorResponse {
  error: string;           // Machine-readable error code (e.g., "AUTH_EXPIRED_TOKEN")
  message: string;         // Human-readable message for end users
  details?: any;           // Additional context (development only)
  timestamp?: string;      // ISO 8601 timestamp
  path?: string;           // Request path that caused error
  requestId?: string;      // Unique request ID for tracing
}
```

### Example Error Responses

**Authentication Error:**
```json
{
  "error": "AUTH_EXPIRED_TOKEN",
  "message": "Your session has expired. Please log in again.",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/events",
  "requestId": "req_abc123xyz"
}
```

**Validation Error:**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": {
    "fields": {
      "email": "Invalid email format",
      "name": "Name must be at least 2 characters"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/users/me",
  "requestId": "req_def456uvw"
}
```

**Resource Not Found:**
```json
{
  "error": "EVENT_NOT_FOUND",
  "message": "The requested event could not be found",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/events/abc-123",
  "requestId": "req_ghi789rst"
}
```

---

## ERROR CODE TAXONOMY

### Naming Convention

Error codes follow this pattern:
```
<DOMAIN>_<SPECIFIC_ERROR>
```

Examples:
- `AUTH_MISSING_TOKEN`
- `EVENT_NOT_FOUND`
- `CALENDAR_SYNC_FAILED`

### Complete Error Code Reference

#### Authentication Errors (AUTH_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `AUTH_MISSING_TOKEN` | 401 | No Authorization header | "Please log in to continue" |
| `AUTH_INVALID_TOKEN` | 401 | Malformed JWT | "Session invalid. Please log in again" |
| `AUTH_EXPIRED_TOKEN` | 401 | JWT expired | "Your session has expired. Please log in again" |
| `AUTH_USER_NOT_FOUND` | 401 | User no longer exists | "Account not found. Please contact support" |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | User lacks permissions | "You don't have permission to perform this action" |
| `AUTH_NOT_CALENDAR_MEMBER` | 403 | Not a member of calendar | "You are not a member of this calendar" |
| `AUTH_NOT_CALENDAR_OWNER` | 403 | Not the calendar owner | "Only the calendar owner can perform this action" |
| `AUTH_RATE_LIMIT_EXCEEDED` | 429 | Too many requests | "Too many attempts. Please try again later" |

#### User Errors (USER_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `USER_NOT_FOUND` | 404 | User doesn't exist | "User not found" |
| `USER_ALREADY_EXISTS` | 409 | Email already registered | "An account with this email already exists" |
| `USER_INVALID_EMAIL` | 400 | Invalid email format | "Please provide a valid email address" |
| `USER_UPDATE_FAILED` | 500 | Database update failed | "Failed to update profile. Please try again" |

#### Calendar Errors (CALENDAR_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `CALENDAR_NOT_FOUND` | 404 | Calendar doesn't exist | "Calendar not found" |
| `CALENDAR_INVALID_ICS_URL` | 400 | Invalid ICS feed URL | "Please provide a valid calendar URL" |
| `CALENDAR_ICS_UNREACHABLE` | 400 | ICS feed not accessible | "Unable to access calendar feed. Please check the URL" |
| `CALENDAR_ICS_PARSE_ERROR` | 400 | ICS parsing failed | "Calendar feed format is invalid" |
| `CALENDAR_SYNC_FAILED` | 500 | Sync job failed | "Calendar sync failed. We'll retry automatically" |
| `CALENDAR_ALREADY_EXISTS` | 409 | Duplicate ICS URL | "This calendar is already added" |
| `CALENDAR_DELETE_FAILED` | 500 | Deletion failed | "Failed to delete calendar. Please try again" |

#### Event Errors (EVENT_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `EVENT_NOT_FOUND` | 404 | Event doesn't exist | "Event not found" |
| `EVENT_ASSIGNMENT_FAILED` | 500 | Assignment failed | "Failed to assign event. Please try again" |
| `EVENT_CONFLICT_DETECTED` | 409 | Scheduling conflict | "This event conflicts with another event" |
| `EVENT_INVALID_DATE_RANGE` | 400 | Invalid date range | "End time must be after start time" |

#### Child Errors (CHILD_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `CHILD_NOT_FOUND` | 404 | Child doesn't exist | "Child not found" |
| `CHILD_NO_ACCESS` | 403 | User can't access child | "You don't have access to this child" |
| `CHILD_CREATE_FAILED` | 500 | Creation failed | "Failed to create child profile. Please try again" |
| `CHILD_HAS_CALENDARS` | 409 | Cannot delete child with calendars | "Remove all calendars for this child before deleting" |

#### Invitation Errors (INVITATION_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `INVITATION_NOT_FOUND` | 404 | Invalid token | "This invitation is invalid or has been canceled" |
| `INVITATION_ALREADY_ACCEPTED` | 409 | Already accepted | "This invitation has already been accepted" |
| `INVITATION_ALREADY_DECLINED` | 409 | Already declined | "This invitation has already been declined" |
| `INVITATION_SEND_FAILED` | 500 | Email send failed | "Failed to send invitation. Please try again" |

#### Google Integration Errors (GOOGLE_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `GOOGLE_OAUTH_FAILED` | 500 | OAuth exchange failed | "Google login failed. Please try again" |
| `GOOGLE_CALENDAR_SYNC_FAILED` | 500 | Calendar sync failed | "Failed to sync with Google Calendar. We'll retry automatically" |
| `GOOGLE_MAPS_GEOCODE_FAILED` | 500 | Geocoding failed | "Unable to find location. Please check the address" |
| `GOOGLE_MAPS_DIRECTIONS_FAILED` | 500 | Directions API failed | "Unable to calculate directions. Please try again" |
| `GOOGLE_CALENDAR_UNAUTHORIZED` | 401 | Calendar access revoked | "Please reconnect your Google Calendar" |

#### Validation Errors (VALIDATION_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `VALIDATION_ERROR` | 400 | Generic validation failure | "Invalid input data" |
| `VALIDATION_REQUIRED_FIELD` | 400 | Missing required field | "Required field is missing" |
| `VALIDATION_INVALID_FORMAT` | 400 | Invalid format | "Invalid format for field" |
| `VALIDATION_OUT_OF_RANGE` | 400 | Value out of range | "Value must be between X and Y" |

#### System Errors (SYSTEM_*)

| Code | HTTP Status | Description | User Message |
|------|-------------|-------------|--------------|
| `SYSTEM_DATABASE_ERROR` | 500 | Database failure | "A system error occurred. Please try again" |
| `SYSTEM_REDIS_ERROR` | 500 | Redis failure | "A system error occurred. Please try again" |
| `SYSTEM_INTERNAL_ERROR` | 500 | Unexpected error | "An unexpected error occurred. Please try again" |
| `SYSTEM_SERVICE_UNAVAILABLE` | 503 | Service down | "Service temporarily unavailable. Please try again later" |

---

## HTTP STATUS CODE MAPPING

### Status Code Usage Guidelines

| Status Code | Usage | Example Scenarios |
|-------------|-------|-------------------|
| **200 OK** | Successful GET, PATCH | Get events, update profile |
| **201 Created** | Successful POST | Create calendar, invite member |
| **204 No Content** | Successful DELETE | Delete calendar, remove member |
| **400 Bad Request** | Invalid input, validation failure | Invalid email, malformed JSON |
| **401 Unauthorized** | Authentication failure | Missing token, expired token |
| **403 Forbidden** | Authorization failure | Not calendar owner, insufficient permissions |
| **404 Not Found** | Resource doesn't exist | Event not found, user not found |
| **409 Conflict** | Resource conflict | Duplicate calendar, scheduling conflict |
| **429 Too Many Requests** | Rate limit exceeded | Too many login attempts |
| **500 Internal Server Error** | Server error | Database failure, unexpected exception |
| **503 Service Unavailable** | Service down | Maintenance mode, external service down |

---

## ERROR HANDLING IMPLEMENTATION

### Current Approach: Inline Error Handling

**Status:** NO GLOBAL ERROR HANDLER MIDDLEWARE

Errors are currently handled inline within each route using try/catch blocks:

```typescript
// Actual pattern in src/routes/event.ts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = await eventService.getEventById(req.params.id, userId);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});
```

### Concurrent Modification Handling

The event assignment route handles optimistic locking failures:

```typescript
// src/routes/event.ts - PATCH /api/events/:id/assign
router.patch('/:id/assign', async (req: Request, res: Response) => {
  try {
    const event = await eventService.assignEvent(
      req.params.id,
      userId,
      assigned_to_user_id,
      expected_version
    );
    res.json(event);
  } catch (error: any) {
    // Handle concurrent modification (optimistic locking failure)
    if (error instanceof ConcurrentModificationError) {
      return res.status(409).json({
        error: 'Event was modified by another user',
        code: 'CONCURRENT_MODIFICATION',
        details: {
          expected_version: error.expectedVersion,
          actual_version: error.actualVersion,
          current_state: error.currentState,
        },
        message: 'The event has been updated since you last viewed it.',
      });
    }
    res.status(500).json({ error: 'Failed to assign event' });
  }
});
```

### Error Response Helper Functions

The `src/utils/errors.ts` provides helper functions:

```typescript
// Create a safe error response for API responses
export function createErrorResponse(error: Error) {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(process.env.NODE_ENV !== 'production' && { context: error.context }),
      },
      statusCode: error.statusCode,
    };
  }

  // Don't leak internal error details in production
  return {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An internal server error occurred'
        : error.message,
    },
    statusCode: 500,
  };
}

// Helper to determine if an error is operational (expected)
export function isOperationalError(error: Error): boolean {
  return error instanceof AppError;
}

// Format error for logging
export function formatErrorForLogging(error: Error): Record<string, any> {
  const baseLog = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (error instanceof AppError) {
    return {
      ...baseLog,
      code: error.code,
      statusCode: error.statusCode,
      context: error.context,
      isOperational: true,
    };
  }

  return { ...baseLog, isOperational: false };
}
```

**Note:** There is no global error handler middleware using `app.use((err, req, res, next) => ...)`. Each route handles errors individually.

### Custom Error Classes

```typescript
// src/utils/errors.ts

/**
 * Base application error with context
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFIGURATION_ERROR', 500, context);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'DATABASE_ERROR', 500, context);
  }
}

export class ExternalAPIError extends AppError {
  constructor(
    message: string,
    public readonly service: string,
    statusCode: number = 502,
    context?: Record<string, any>
  ) {
    super(message, 'EXTERNAL_API_ERROR', statusCode, { ...context, service });
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AUTHENTICATION_ERROR', 401, context);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, context?: Record<string, any>) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, { ...context, resource, identifier });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFLICT', 409, context);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, retryAfter?: number, context?: Record<string, any>) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { ...context, retryAfter });
  }
}

export class EncryptionError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'ENCRYPTION_ERROR', 500, context);
  }
}
```

### Concurrent Modification Error

A separate error class for optimistic locking:

```typescript
// src/errors/ConcurrentModificationError.ts
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

### Usage Example

```typescript
// src/routes/events.ts
import { NotFoundError, AuthorizationError } from '../utils/errors';

router.get('/:id', authenticateJWT, async (req, res, next) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
    });

    if (!event) {
      throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found');
    }

    // Check authorization
    const hasAccess = await canAccessEvent(req.user!.id, event.id);
    if (!hasAccess) {
      throw new AuthorizationError(
        'AUTH_NOT_CALENDAR_MEMBER',
        'You are not a member of this calendar'
      );
    }

    res.json(event);
  } catch (error) {
    next(error); // Pass to error handler middleware
  }
});
```

### Async Error Wrapper

```typescript
// src/utils/async-handler.ts
import { Request, Response, NextFunction } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage:
router.get('/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) {
    throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found');
  }
  res.json(event);
}));
```

---

## LOGGING STRATEGY

### Current Implementation: Console Logging

**Status:** NO STRUCTURED LOGGING LIBRARY

The application uses `console.log`, `console.error`, and `console.warn` directly throughout the codebase, often with emoji prefixes for visual distinction:

```typescript
// Actual logging patterns used in the codebase
console.log(`🔄 Job ${job.id} has started processing`);
console.log(`✅ Job ${job.id} completed:`, result);
console.error(`❌ Job ${job.id} failed:`, err.message);
console.warn(`⚠️  Job ${job.id} has stalled`);

// Route error logging
console.error('Get events error:', error);
console.error('Assign event error:', error);

// Service logging
console.log(`[GET /api/events] Request from user: ${userEmail} (${userId})`);
console.log(`[GET /api/events] Filters:`, JSON.stringify(filters));
```

### Log Prefixes Used

| Emoji | Usage |
|-------|-------|
| `🔄` | Processing started |
| `✅` | Success |
| `❌` | Error |
| `⚠️` | Warning/stalled |
| `⏳` | Waiting |
| `🚀` | Server startup |
| `📊` | Health check |
| `🔧` | Configuration/environment |
| `🔌` | WebSocket |
| `📅` | Scheduler |
| `✓` | Validation passed |

### Not Implemented

- Winston or other structured logging library
- Configurable log levels
- File-based logging
- Request logging middleware
- Structured JSON logs for production
- Log aggregation service integration

---

## MONITORING & ALERTING

### Health Check Endpoint

A basic health check endpoint is implemented:

```typescript
// src/index.ts
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});
```

**Limitations:**
- Does not check database connectivity
- Does not check Redis connectivity
- Does not check external API availability
- Always returns 200 OK (no degraded status)

### Not Implemented

- Sentry error tracking integration
- Prometheus metrics
- Custom application metrics
- Alert rules
- External monitoring service integration

---

## CLIENT-SIDE ERROR HANDLING

### Toast Notifications with Sonner

The frontend uses **Sonner** (`toast` from `sonner`) for error notifications, handled inline in React Query mutation callbacks:

```typescript
// Actual pattern from frontend/src/pages/Calendars.tsx
import { toast } from 'sonner';

const createCalendarMutation = useMutation({
  mutationFn: async (data: CreateCalendarData) => {
    const response = await fetch(`${API_URL}/calendars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create calendar');
    return response.json();
  },
  onSuccess: () => {
    toast.success('Calendar created successfully');
    queryClient.invalidateQueries({ queryKey: ['calendars'] });
  },
  onError: (error) => {
    toast.error('Failed to create calendar', {
      description: error instanceof Error ? error.message : 'Unknown error',
    });
  },
});
```

### Common Error Toast Patterns

```typescript
// Validation errors
toast.error('Please enter an ICS URL');
toast.error('Please enter a name');
toast.error('Please enter an email address');

// API errors with descriptions
toast.error('Failed to create calendar', {
  description: error instanceof Error ? error.message : 'Unknown error',
});

toast.error('Failed to validate ICS feed', {
  description: 'Please check the URL and try again',
});

// File size validation
toast.error('Photo must be less than 5MB');
```

### Not Implemented

- **React Error Boundary component** - No global error boundary exists
- **Centralized API client** with error handling - Each component handles fetch inline
- **Custom ApiError class** - Raw Error objects used
- **Session expiry redirects** - Not automatically handled
- **Error tracking integration** (Sentry) - Not implemented on frontend

---

## TESTING ERROR SCENARIOS

**Status:** NO AUTOMATED TESTS

There are no automated tests for error handling scenarios in the current codebase.

---

## SUMMARY CHECKLIST

### Backend Error Handling
- [x] Custom error classes created (`AppError`, `NotFoundError`, `ValidationError`, etc.)
- [x] Error response helper functions (`createErrorResponse`, `formatErrorForLogging`)
- [x] `ConcurrentModificationError` for optimistic locking
- [x] HTTP status codes used correctly in routes
- [ ] Standard error response format (varies by route)
- [ ] Global error handler middleware
- [ ] Async error wrapper utility
- [ ] Systematic Prisma error handling
- [ ] Systematic JWT error handling

### Logging
- [x] Console logging with emoji prefixes
- [ ] Winston or structured logging library
- [ ] Configurable log levels
- [ ] File-based logging
- [ ] Request logging middleware
- [ ] Structured JSON logs for production

### Monitoring
- [x] Basic health check endpoint (`/api/health`)
- [ ] Health check with database/Redis verification
- [ ] Sentry integration
- [ ] Prometheus metrics
- [ ] Alert rules

### Client-Side
- [x] Toast notifications for errors (Sonner)
- [x] User-friendly error messages
- [ ] React Error Boundary component
- [ ] Centralized API client with error handling
- [ ] Custom ApiError class
- [ ] Session expiry redirects
- [ ] Sentry integration

### Testing
- [ ] Unit tests for error handlers
- [ ] Integration tests for error responses
- [ ] Error scenario tests

---

**Next Steps:** Proceed to [WEBSOCKET_SPECIFICATION.md](./WEBSOCKET_SPECIFICATION.md) for real-time event updates documentation.
