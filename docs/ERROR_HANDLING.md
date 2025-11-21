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

## ERROR HANDLING MIDDLEWARE

### Global Error Handler

```typescript
// src/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  errorCode?: string;
  details?: any;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Generate request ID if not present
  const requestId = req.headers['x-request-id'] as string || generateRequestId();

  // Default to 500 Internal Server Error
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'SYSTEM_INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';
  let details = err.details;

  // JWT Errors
  if (err instanceof jwt.TokenExpiredError) {
    statusCode = 401;
    errorCode = 'AUTH_EXPIRED_TOKEN';
    message = 'Your session has expired. Please log in again';
  } else if (err instanceof jwt.JsonWebTokenError) {
    statusCode = 401;
    errorCode = 'AUTH_INVALID_TOKEN';
    message = 'Session invalid. Please log in again';
  }

  // Prisma Errors
  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        errorCode = 'VALIDATION_DUPLICATE';
        message = `A record with this ${err.meta?.target} already exists`;
        break;
      case 'P2025': // Record not found
        statusCode = 404;
        errorCode = 'RESOURCE_NOT_FOUND';
        message = 'Resource not found';
        break;
      case 'P2003': // Foreign key constraint violation
        statusCode = 400;
        errorCode = 'VALIDATION_INVALID_REFERENCE';
        message = 'Invalid reference to related resource';
        break;
      default:
        statusCode = 500;
        errorCode = 'SYSTEM_DATABASE_ERROR';
        message = 'A database error occurred';
    }
  }

  // Validation Errors (from Joi, Zod, etc.)
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Invalid input data';
    details = err.details;
  }

  // Log error (different levels based on status code)
  if (statusCode >= 500) {
    logger.error('Server error', {
      requestId,
      errorCode,
      statusCode,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  } else if (statusCode >= 400) {
    logger.warn('Client error', {
      requestId,
      errorCode,
      statusCode,
      message,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  }

  // Send error response
  const response: any = {
    error: errorCode,
    message,
    timestamp: new Date().toISOString(),
    path: req.path,
    requestId,
  };

  // Include details in development only
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }

  // Include stack trace in development only
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
```

### Custom Error Classes

```typescript
// src/utils/errors.ts

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends AppError {
  constructor(errorCode: string, message: string) {
    super(401, errorCode, message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(errorCode: string, message: string) {
    super(403, errorCode, message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(errorCode: string, message: string) {
    super(404, errorCode, message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(errorCode: string, message: string) {
    super(409, errorCode, message);
    this.name = 'ConflictError';
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

### Log Levels

| Level | Usage | Examples |
|-------|-------|----------|
| **error** | Unrecoverable errors | Database connection lost, external service down |
| **warn** | Recoverable errors, unexpected states | Rate limit hit, Google API quota warning |
| **info** | Important business events | User login, calendar created, event assigned |
| **debug** | Detailed diagnostic info | SQL queries, API request/response bodies |

### Winston Logger Configuration

```typescript
// src/utils/logger.ts
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  process.env.LOG_FORMAT === 'json'
    ? winston.format.json()
    : winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta) : ''
        }`;
      })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? winston.format.combine(winston.format.colorize(), logFormat)
        : logFormat,
    }),

    // File output (error logs)
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),

    // File output (combined logs)
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Production: send to external service (e.g., Datadog, CloudWatch)
if (process.env.NODE_ENV === 'production') {
  // Example: Add Datadog transport
  // logger.add(new DatadogTransport({ apiKey: process.env.DATADOG_API_KEY }));
}

export default logger;
```

### Structured Logging Examples

```typescript
// src/services/event-service.ts
import logger from '../utils/logger';

export async function assignEvent(eventId: string, userId: string) {
  logger.info('Assigning event', {
    eventId,
    userId,
    action: 'event_assignment',
  });

  try {
    const event = await prisma.event.update({
      where: { id: eventId },
      data: { assigned_to_user_id: userId },
    });

    logger.info('Event assigned successfully', {
      eventId,
      userId,
      action: 'event_assignment_success',
    });

    return event;
  } catch (error) {
    logger.error('Event assignment failed', {
      eventId,
      userId,
      action: 'event_assignment_failed',
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
```

### Request Logging Middleware

```typescript
// src/middleware/request-logger.ts
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    userId: req.user?.id,
    ip: req.ip,
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
    });
  });

  next();
}
```

---

## MONITORING & ALERTING

### Health Check Endpoint

```typescript
// src/routes/health.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import redis from '../lib/redis';

const router = Router();
const prisma = new PrismaClient();

router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: 'unknown',
      redis: 'unknown',
    },
  };

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = 'ok';
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'degraded';
  }

  // Redis check
  try {
    await redis.ping();
    health.checks.redis = 'ok';
  } catch (error) {
    health.checks.redis = 'error';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;
```

### Sentry Integration

```typescript
// src/app.ts
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1, // Sample 10% of transactions
    beforeSend(event, hint) {
      // Filter sensitive data
      if (event.request?.headers) {
        delete event.request.headers.authorization;
      }
      return event;
    },
  });

  // Request handler (must be first middleware)
  app.use(Sentry.Handlers.requestHandler());

  // Tracing handler
  app.use(Sentry.Handlers.tracingHandler());

  // Error handler (must be after all routes)
  app.use(Sentry.Handlers.errorHandler());
}
```

### Custom Metrics (Prometheus)

```typescript
// src/utils/metrics.ts
import prometheus from 'prom-client';

const register = new prometheus.Registry();

// Request duration histogram
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Active connections gauge
const activeConnections = new prometheus.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

// Event assignment counter
const eventAssignments = new prometheus.Counter({
  name: 'event_assignments_total',
  help: 'Total number of event assignments',
  labelNames: ['status'],
  registers: [register],
});

export { register, httpRequestDuration, activeConnections, eventAssignments };

// Metrics endpoint
// src/routes/metrics.ts
import { Router } from 'express';
import { register } from '../utils/metrics';

const router = Router();

router.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export default router;
```

### Alert Configuration (Example)

```yaml
# alerts.yml (for Prometheus Alertmanager)
groups:
  - name: koordi_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/sec"

      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database is down"

      - alert: SlowRequests
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "95th percentile response time > 2s"
```

---

## CLIENT-SIDE ERROR HANDLING

### API Client Error Handling

```typescript
// frontend/src/lib/api-client.ts
import { authClient } from './auth-client';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<any> {
  try {
    const response = await authClient.fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      if (!response.ok) {
        throw new ApiError(
          response.status,
          'UNKNOWN_ERROR',
          `HTTP ${response.status}: ${response.statusText}`
        );
      }
      return null; // 204 No Content
    }

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error || 'UNKNOWN_ERROR',
        data.message || 'An error occurred',
        data.details
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network errors
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }
}
```

### React Error Boundary

```typescript
// frontend/src/components/ErrorBoundary.tsx
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React error boundary caught:', error, errorInfo);

    // Send to error tracking service
    if (window.Sentry) {
      window.Sentry.captureException(error, { extra: errorInfo });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>We're sorry for the inconvenience. Please try refreshing the page.</p>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Toast Notifications for Errors

```typescript
// frontend/src/lib/error-toast.ts
import { toast } from 'react-hot-toast';
import { ApiError } from './api-client';

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.errorCode) {
      case 'AUTH_EXPIRED_TOKEN':
        toast.error('Your session has expired. Please log in again.');
        // Redirect to login
        window.location.href = '/login';
        break;

      case 'AUTH_NOT_CALENDAR_MEMBER':
        toast.error("You don't have access to this calendar.");
        break;

      case 'CALENDAR_SYNC_FAILED':
        toast.error('Calendar sync failed. We\'ll retry automatically.');
        break;

      default:
        toast.error(error.message || 'An error occurred');
    }
  } else {
    toast.error('An unexpected error occurred');
  }
}

// Usage in React component:
const assignEvent = useMutation({
  mutationFn: (data) => apiRequest('/api/events/assign', { method: 'POST', body: data }),
  onError: handleApiError,
});
```

---

## TESTING ERROR SCENARIOS

### Unit Tests for Error Handlers

```typescript
// tests/middleware/error-handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Request, Response } from 'express';
import { errorHandler } from '../../src/middleware/error-handler';
import { NotFoundError, AuthenticationError } from '../../src/utils/errors';

describe('Error Handler Middleware', () => {
  it('should handle NotFoundError with 404 status', () => {
    const req = { path: '/api/events/123', method: 'GET' } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    const error = new NotFoundError('EVENT_NOT_FOUND', 'Event not found');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found',
      })
    );
  });

  it('should handle JWT expired error', () => {
    const req = { path: '/api/events', method: 'GET' } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    const error = new jwt.TokenExpiredError('jwt expired', new Date());

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'AUTH_EXPIRED_TOKEN',
      })
    );
  });
});
```

### Integration Tests for Error Responses

```typescript
// tests/routes/events.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

describe('Events API Error Handling', () => {
  it('should return 401 for missing token', async () => {
    const response = await request(app).get('/api/events');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_MISSING_TOKEN');
  });

  it('should return 404 for non-existent event', async () => {
    const token = generateTestToken();
    const response = await request(app)
      .get('/api/events/non-existent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('EVENT_NOT_FOUND');
  });

  it('should return 403 for unauthorized access', async () => {
    const token = generateTestToken({ userId: 'user-without-access' });
    const response = await request(app)
      .get('/api/events/protected-event-id')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_NOT_CALENDAR_MEMBER');
  });
});
```

---

## SUMMARY CHECKLIST

### Backend Error Handling
- [ ] Standard error response format implemented
- [ ] Error code taxonomy defined for all domains
- [ ] Custom error classes created (AppError, NotFoundError, etc.)
- [ ] Global error handler middleware configured
- [ ] Async error wrapper utility implemented
- [ ] HTTP status codes mapped correctly
- [ ] Prisma errors handled with meaningful messages
- [ ] JWT errors handled with session expiry messages

### Logging
- [ ] Winston logger configured with levels (error, warn, info, debug)
- [ ] Log format set (JSON for production, pretty for development)
- [ ] Structured logging with context (userId, requestId, etc.)
- [ ] Request logging middleware configured
- [ ] Log rotation configured (file size, max files)
- [ ] Sensitive data filtered from logs

### Monitoring
- [ ] Health check endpoint implemented (/health)
- [ ] Sentry integration configured (if using)
- [ ] Custom metrics configured (Prometheus, if using)
- [ ] Alert rules defined (high error rate, database down, etc.)

### Client-Side
- [ ] API client with error handling
- [ ] React Error Boundary component
- [ ] Toast notifications for errors
- [ ] User-friendly error messages
- [ ] Network error handling
- [ ] Session expiry redirects

### Testing
- [ ] Unit tests for error handlers
- [ ] Integration tests for error responses
- [ ] Error scenario tests (401, 403, 404, 500)
- [ ] Validation error tests

---

**Next Steps:** Proceed to [WEBSOCKET_SPECIFICATION.md](./WEBSOCKET_SPECIFICATION.md) for real-time event updates documentation.
