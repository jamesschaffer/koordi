# WebSocket Specification
## Koordi - Real-Time Updates

**Purpose:** Complete specification for WebSocket-based real-time event updates
**Technology:** Socket.io (server and client)
**Protocol:** WebSocket with fallback to long-polling

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [Connection Flow](#connection-flow)
3. [Room Architecture](#room-architecture)
4. [Event Types & Payloads](#event-types--payloads)
5. [Server Implementation](#server-implementation)
6. [Client Implementation](#client-implementation)
7. [Error Handling](#error-handling)
8. [Security](#security)
9. [Testing](#testing)

---

## OVERVIEW

### Purpose

WebSocket connections enable real-time synchronization across all users who share an Event Calendar:
- Event assignments/reassignments
- Calendar sync completions
- New events added from ICS sync
- Event modifications (time, location changes)
- Member additions/removals

### Key Design Decisions

1. **Room-Based Architecture:** One Socket.io room per Event Calendar
2. **JWT Authentication:** Clients authenticate via JWT token
3. **Auto-Reconnection:** Client automatically reconnects on disconnection
4. **Event Idempotency:** Clients handle duplicate events gracefully
5. **Fallback Support:** Long-polling for environments blocking WebSockets

---

## CONNECTION FLOW

### Initial Connection Sequence

```
┌─────────┐                                    ┌──────────┐
│ Client  │                                    │  Server  │
└────┬────┘                                    └────┬─────┘
     │                                              │
     │  1. Connect with JWT token                  │
     ├─────────────────────────────────────────────►
     │  io.connect(url, { auth: { token: jwt } })  │
     │                                              │
     │  2. Server validates JWT                    │
     │                                              ├──────────┐
     │                                              │ Verify   │
     │                                              │ token    │
     │                                              ◄──────────┘
     │                                              │
     │  3. Connection accepted                     │
     ◄─────────────────────────────────────────────┤
     │  socket.id = "abc123"                       │
     │                                              │
     │  4. Client joins calendar rooms             │
     ├─────────────────────────────────────────────►
     │  emit('join_calendars')                     │
     │                                              │
     │                                              │  5. Query user's calendars
     │                                              ├──────────────────►
     │                                              │   Database
     │                                              ◄──────────────────┤
     │                                              │  [cal1, cal2, ...]
     │                                              │
     │                                              │  6. Join rooms
     │                                              ├──────────┐
     │                                              │ socket.  │
     │                                              │ join()   │
     │                                              ◄──────────┘
     │                                              │
     │  7. Confirmation with room list             │
     ◄─────────────────────────────────────────────┤
     │  emit('calendars_joined', [cal1, cal2])     │
     │                                              │
     │  8. Client ready to receive events          │
     │                                              │
     └──────────────────────────────────────────────┘
```

### Disconnection & Reconnection

```
┌─────────┐                                    ┌──────────┐
│ Client  │                                    │  Server  │
└────┬────┘                                    └────┬─────┘
     │                                              │
     │  Connection lost (network issue)            │
     │  ╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳╳    │
     │                                              │
     │  Client attempts reconnection (exponential backoff)
     ├──────────┐                                  │
     │ Retry #1 │                                  │
     ◄──────────┘                                  │
     │                                              │
     │  Reconnect with same JWT                    │
     ├─────────────────────────────────────────────►
     │                                              │
     │  Connection restored                        │
     ◄─────────────────────────────────────────────┤
     │                                              │
     │  Rejoin calendar rooms                      │
     ├─────────────────────────────────────────────►
     │  emit('join_calendars')                     │
     │                                              │
     │  Confirmation                               │
     ◄─────────────────────────────────────────────┤
     │                                              │
     └──────────────────────────────────────────────┘
```

---

## ROOM ARCHITECTURE

### Room Naming Convention

```
calendar:<calendar_id>
```

Examples:
- `calendar:abc-123-def-456`
- `calendar:xyz-789-uvw-012`

### Room Membership Rules

1. **Auto-Join:** When user connects, they automatically join all calendars they have access to
2. **Dynamic Join:** When user accepts invitation, they join the new calendar room
3. **Dynamic Leave:** When user leaves calendar or is removed, they leave the room
4. **Owner Special Case:** Calendar owner is always in the room until calendar is deleted

### Room Operations

```typescript
// Join room
socket.join(`calendar:${calendarId}`);

// Leave room
socket.leave(`calendar:${calendarId}`);

// Emit to room (broadcast to all members)
io.to(`calendar:${calendarId}`).emit('event_assigned', payload);

// Emit to room except sender
socket.to(`calendar:${calendarId}`).emit('event_assigned', payload);
```

---

## EVENT TYPES & PAYLOADS

### Client → Server Events

#### 1. join_calendars

**Purpose:** Client requests to join all their accessible calendar rooms

**Payload:** None (server reads from authenticated user)

```typescript
socket.emit('join_calendars');
```

**Server Response:** `calendars_joined` event

---

#### 2. join_calendar

**Purpose:** Join a specific calendar room (e.g., after accepting invitation)

**Payload:**
```typescript
{
  calendar_id: string;
}
```

**Example:**
```typescript
socket.emit('join_calendar', { calendar_id: 'abc-123' });
```

---

#### 3. leave_calendar

**Purpose:** Leave a specific calendar room

**Payload:**
```typescript
{
  calendar_id: string;
}
```

**Example:**
```typescript
socket.emit('leave_calendar', { calendar_id: 'abc-123' });
```

---

### Server → Client Events

#### 1. calendars_joined

**Purpose:** Confirmation that client has joined calendar rooms

**Payload:**
```typescript
{
  calendar_ids: string[];
}
```

**Example:**
```typescript
{
  "calendar_ids": ["abc-123", "def-456"]
}
```

---

#### 2. event_created

**Purpose:** New event created (from ICS sync or manual creation)

**Payload:**
```typescript
{
  calendar_id: string;
  event: {
    id: string;
    event_calendar_id: string;
    title: string;
    description: string | null;
    location: string | null;
    start_time: string; // ISO 8601
    end_time: string;
    is_all_day: boolean;
    assigned_to_user_id: string | null;
    created_at: string;
  };
  actor: {
    id: string;
    name: string;
  } | null; // null for system-generated events
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "event": {
    "id": "event-789",
    "event_calendar_id": "abc-123",
    "title": "Soccer Practice",
    "description": null,
    "location": "Lincoln Field",
    "start_time": "2024-03-20T16:00:00.000Z",
    "end_time": "2024-03-20T17:30:00.000Z",
    "is_all_day": false,
    "assigned_to_user_id": null,
    "created_at": "2024-01-15T10:00:00.000Z"
  },
  "actor": null
}
```

---

#### 3. event_updated

**Purpose:** Event details modified (time, location, etc.)

**Payload:**
```typescript
{
  calendar_id: string;
  event: {
    id: string;
    // ... full event object with updated fields
  };
  changes: {
    field: string;
    old_value: any;
    new_value: any;
  }[];
  actor: {
    id: string;
    name: string;
  } | null;
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "event": { /* full event object */ },
  "changes": [
    {
      "field": "start_time",
      "old_value": "2024-03-20T16:00:00.000Z",
      "new_value": "2024-03-20T17:00:00.000Z"
    }
  ],
  "actor": null
}
```

---

#### 4. event_assigned

**Purpose:** Event assigned or reassigned to a user

**Payload:**
```typescript
{
  calendar_id: string;
  event_id: string;
  assigned_to: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null; // null if unassigned
  previous_assigned_to: {
    id: string;
    name: string;
  } | null;
  actor: {
    id: string;
    name: string;
  };
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "event_id": "event-789",
  "assigned_to": {
    "id": "user-456",
    "name": "Jane Parent",
    "avatar_url": "https://..."
  },
  "previous_assigned_to": null,
  "actor": {
    "id": "user-456",
    "name": "Jane Parent"
  }
}
```

---

#### 5. event_deleted

**Purpose:** Event removed (deleted from ICS feed or manually)

**Payload:**
```typescript
{
  calendar_id: string;
  event_id: string;
  actor: {
    id: string;
    name: string;
  } | null;
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "event_id": "event-789",
  "actor": null
}
```

---

#### 6. calendar_synced

**Purpose:** Calendar sync completed

**Payload:**
```typescript
{
  calendar_id: string;
  status: 'success' | 'error';
  events_added: number;
  events_updated: number;
  events_deleted: number;
  synced_at: string; // ISO 8601
  error_message?: string; // if status === 'error'
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "status": "success",
  "events_added": 5,
  "events_updated": 2,
  "events_deleted": 1,
  "synced_at": "2024-01-15T10:30:00.000Z"
}
```

---

#### 7. member_added

**Purpose:** New member added to calendar

**Payload:**
```typescript
{
  calendar_id: string;
  member: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
  actor: {
    id: string;
    name: string;
  };
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "member": {
    "id": "user-999",
    "name": "John Parent",
    "email": "john@example.com",
    "avatar_url": null
  },
  "actor": {
    "id": "user-456",
    "name": "Jane Parent"
  }
}
```

---

#### 8. member_removed

**Purpose:** Member removed from calendar

**Payload:**
```typescript
{
  calendar_id: string;
  member_id: string;
  member_name: string;
  actor: {
    id: string;
    name: string;
  };
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "member_id": "user-999",
  "member_name": "John Parent",
  "actor": {
    "id": "user-456",
    "name": "Jane Parent"
  }
}
```

---

#### 9. calendar_updated

**Purpose:** Calendar metadata updated (name, color)

**Payload:**
```typescript
{
  calendar_id: string;
  changes: {
    field: string;
    old_value: any;
    new_value: any;
  }[];
  actor: {
    id: string;
    name: string;
  };
}
```

**Example:**
```typescript
{
  "calendar_id": "abc-123",
  "changes": [
    {
      "field": "name",
      "old_value": "Soccer - Spring 2024",
      "new_value": "Soccer - Spring Season"
    }
  ],
  "actor": {
    "id": "user-456",
    "name": "Jane Parent"
  }
}
```

---

#### 10. error

**Purpose:** Error occurred during WebSocket operation

**Payload:**
```typescript
{
  error_code: string;
  message: string;
}
```

**Example:**
```typescript
{
  "error_code": "CALENDAR_NOT_FOUND",
  "message": "Calendar not found or you don't have access"
}
```

---

## SERVER IMPLEMENTATION

### Socket.io Server Setup

```typescript
// src/socket/index.ts
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export function initializeSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication error: Missing token'));
    }

    try {
      const payload = verifyToken(token);

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, name: true },
      });

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Attach user to socket
      socket.data.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication failed', { error });
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info('Socket connected', { socketId: socket.id, userId: user.id });

    // Handle join_calendars
    socket.on('join_calendars', async () => {
      try {
        // Get all calendars user is a member of
        const memberships = await prisma.eventCalendarMembership.findMany({
          where: {
            user_id: user.id,
            status: 'accepted',
          },
          select: {
            event_calendar_id: true,
          },
        });

        const calendarIds = memberships.map((m) => m.event_calendar_id);

        // Join rooms
        for (const calendarId of calendarIds) {
          socket.join(`calendar:${calendarId}`);
        }

        logger.info('User joined calendar rooms', {
          userId: user.id,
          calendarCount: calendarIds.length,
        });

        // Confirm to client
        socket.emit('calendars_joined', { calendar_ids: calendarIds });
      } catch (error) {
        logger.error('Failed to join calendars', { userId: user.id, error });
        socket.emit('error', {
          error_code: 'JOIN_CALENDARS_FAILED',
          message: 'Failed to join calendar rooms',
        });
      }
    });

    // Handle join_calendar
    socket.on('join_calendar', async ({ calendar_id }) => {
      try {
        // Verify user has access
        const membership = await prisma.eventCalendarMembership.findFirst({
          where: {
            event_calendar_id: calendar_id,
            user_id: user.id,
            status: 'accepted',
          },
        });

        if (!membership) {
          socket.emit('error', {
            error_code: 'CALENDAR_ACCESS_DENIED',
            message: 'You do not have access to this calendar',
          });
          return;
        }

        socket.join(`calendar:${calendar_id}`);
        logger.info('User joined calendar room', { userId: user.id, calendarId: calendar_id });
      } catch (error) {
        logger.error('Failed to join calendar', { userId: user.id, calendarId: calendar_id, error });
        socket.emit('error', {
          error_code: 'JOIN_CALENDAR_FAILED',
          message: 'Failed to join calendar room',
        });
      }
    });

    // Handle leave_calendar
    socket.on('leave_calendar', ({ calendar_id }) => {
      socket.leave(`calendar:${calendar_id}`);
      logger.info('User left calendar room', { userId: user.id, calendarId: calendar_id });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { socketId: socket.id, userId: user.id, reason });
    });
  });

  return io;
}
```

### Broadcasting Events from Backend

```typescript
// src/services/event-service.ts
import { getSocketServer } from '../socket';

export async function assignEvent(eventId: string, userId: string, actorId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      event_calendar: { select: { id: true } },
      assigned_to: { select: { id: true, name: true, avatar_url: true } },
    },
  });

  if (!event) {
    throw new NotFoundError('EVENT_NOT_FOUND', 'Event not found');
  }

  const previousAssignedTo = event.assigned_to;

  // Update assignment
  const updatedEvent = await prisma.event.update({
    where: { id: eventId },
    data: { assigned_to_user_id: userId },
    include: {
      assigned_to: { select: { id: true, name: true, avatar_url: true } },
    },
  });

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, name: true },
  });

  // Broadcast to WebSocket room
  const io = getSocketServer();
  io.to(`calendar:${event.event_calendar.id}`).emit('event_assigned', {
    calendar_id: event.event_calendar.id,
    event_id: eventId,
    assigned_to: updatedEvent.assigned_to,
    previous_assigned_to: previousAssignedTo,
    actor,
  });

  return updatedEvent;
}
```

---

## CLIENT IMPLEMENTATION

### Socket.io Client Setup

```typescript
// frontend/src/lib/socket-client.ts
import { io, Socket } from 'socket.io-client';
import { authClient } from './auth-client';

class SocketClient {
  private socket: Socket | null = null;

  connect() {
    const token = authClient.getToken();

    if (!token) {
      console.error('Cannot connect socket: No auth token');
      return;
    }

    this.socket = io(import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:3000', {
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.socket?.emit('join_calendars');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('calendars_joined', ({ calendar_ids }) => {
      console.log('Joined calendar rooms:', calendar_ids);
    });

    this.socket.on('error', ({ error_code, message }) => {
      console.error('Socket error:', error_code, message);
    });
  }

  on(event: string, handler: (...args: any[]) => void) {
    this.socket?.on(event, handler);
  }

  off(event: string, handler?: (...args: any[]) => void) {
    this.socket?.off(event, handler);
  }

  emit(event: string, data?: any) {
    this.socket?.emit(event, data);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketClient = new SocketClient();
```

### React Hook for WebSocket Events

```typescript
// frontend/src/hooks/useSocketEvent.ts
import { useEffect } from 'react';
import { socketClient } from '../lib/socket-client';

export function useSocketEvent<T = any>(
  event: string,
  handler: (data: T) => void
) {
  useEffect(() => {
    socketClient.on(event, handler);

    return () => {
      socketClient.off(event, handler);
    };
  }, [event, handler]);
}
```

### React Query Integration

```typescript
// frontend/src/hooks/useEvents.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocketEvent } from './useSocketEvent';
import { apiRequest } from '../lib/api-client';

export function useEvents(calendarId: string) {
  const queryClient = useQueryClient();

  // Fetch events
  const query = useQuery({
    queryKey: ['events', calendarId],
    queryFn: () => apiRequest(`/api/events?calendar_id=${calendarId}`),
  });

  // Listen for event_created
  useSocketEvent('event_created', (data) => {
    if (data.calendar_id === calendarId) {
      queryClient.invalidateQueries({ queryKey: ['events', calendarId] });
    }
  });

  // Listen for event_assigned
  useSocketEvent('event_assigned', (data) => {
    if (data.calendar_id === calendarId) {
      // Optimistic update
      queryClient.setQueryData(['events', calendarId], (oldData: any[]) => {
        return oldData.map((event) =>
          event.id === data.event_id
            ? { ...event, assigned_to: data.assigned_to }
            : event
        );
      });
    }
  });

  // Listen for event_deleted
  useSocketEvent('event_deleted', (data) => {
    if (data.calendar_id === calendarId) {
      queryClient.setQueryData(['events', calendarId], (oldData: any[]) => {
        return oldData.filter((event) => event.id !== data.event_id);
      });
    }
  });

  return query;
}
```

---

## ERROR HANDLING

### Connection Errors

```typescript
// frontend/src/lib/socket-client.ts
this.socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error.message);

  if (error.message.includes('Authentication error')) {
    // Token invalid, redirect to login
    authClient.clearToken();
    window.location.href = '/login';
  }
});

this.socket.on('reconnect_failed', () => {
  console.error('Socket reconnection failed after max attempts');
  // Show user notification
  toast.error('Unable to connect to real-time updates. Please refresh the page.');
});
```

### Server-Side Error Broadcasting

```typescript
// src/socket/index.ts
socket.on('join_calendar', async ({ calendar_id }) => {
  try {
    // ... validation logic
  } catch (error) {
    logger.error('Join calendar error', { error, userId: user.id, calendarId: calendar_id });
    socket.emit('error', {
      error_code: 'JOIN_CALENDAR_FAILED',
      message: 'Failed to join calendar',
    });
  }
});
```

---

## SECURITY

### Authentication

- **JWT Required:** All connections must provide valid JWT token
- **Token Verification:** Server validates token before accepting connection
- **User Context:** User info attached to socket session for authorization checks

### Authorization

- **Room Access Control:** Users can only join rooms for calendars they have access to
- **Membership Verification:** Server checks EventCalendarMembership table before joining room
- **Event Filtering:** Clients only receive events for calendars they're members of

### Rate Limiting

```typescript
// src/socket/index.ts
import rateLimit from 'socket.io-rate-limiter';

io.use(rateLimit({
  tokensPerInterval: 100,
  interval: 'minute',
  fireImmediately: true,
}));
```

### Input Validation

```typescript
// Validate calendar_id format
socket.on('join_calendar', async ({ calendar_id }) => {
  if (!calendar_id || typeof calendar_id !== 'string') {
    socket.emit('error', {
      error_code: 'INVALID_CALENDAR_ID',
      message: 'Invalid calendar ID format',
    });
    return;
  }

  // ... rest of logic
});
```

---

## TESTING

### Unit Tests (Server)

```typescript
// tests/socket/auth.test.ts
import { describe, it, expect } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';

describe('Socket Authentication', () => {
  it('should reject connection without token', (done) => {
    const httpServer = createServer();
    const io = new Server(httpServer);

    // ... setup auth middleware

    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      const client = Client(`http://localhost:${port}`);

      client.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication error');
        client.close();
        io.close();
        httpServer.close();
        done();
      });
    });
  });

  it('should accept connection with valid token', (done) => {
    // ... test implementation
  });
});
```

### Integration Tests

```typescript
// tests/socket/events.test.ts
describe('Event Broadcasting', () => {
  it('should broadcast event_assigned to all calendar members', async () => {
    // Create test calendar with 2 members
    // Connect 2 socket clients
    // Assign event via API
    // Verify both clients receive event_assigned event
  });
});
```

### E2E Tests

```typescript
// e2e/realtime.spec.ts
import { test, expect } from '@playwright/test';

test('should see real-time event assignment', async ({ page, context }) => {
  // Open 2 browser tabs
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  // Login both tabs as different users
  // ... login flow

  // Page 1: Assign event
  await page1.click('[data-testid="assign-event"]');

  // Page 2: Verify event appears assigned
  await expect(page2.locator('[data-testid="assigned-badge"]')).toBeVisible();
});
```

---

## SUMMARY CHECKLIST

### Server Implementation
- [ ] Socket.io server initialized with CORS configuration
- [ ] JWT authentication middleware configured
- [ ] User authentication on connection
- [ ] Room join/leave handlers implemented
- [ ] Event broadcasting from backend services
- [ ] Error handling and logging
- [ ] Rate limiting configured
- [ ] Input validation for all events

### Client Implementation
- [ ] Socket.io client configured with auth token
- [ ] Auto-reconnection enabled
- [ ] Event handlers for all event types
- [ ] React hooks for WebSocket events
- [ ] React Query integration for cache updates
- [ ] Connection error handling
- [ ] User notifications for disconnections

### Event Types
- [ ] event_created
- [ ] event_updated
- [ ] event_assigned
- [ ] event_deleted
- [ ] calendar_synced
- [ ] member_added
- [ ] member_removed
- [ ] calendar_updated
- [ ] error

### Security
- [ ] JWT authentication required
- [ ] Room access control implemented
- [ ] Membership verification before room join
- [ ] Input validation
- [ ] Rate limiting

### Testing
- [ ] Unit tests for authentication
- [ ] Unit tests for room operations
- [ ] Integration tests for event broadcasting
- [ ] E2E tests for real-time updates

---

**Next Steps:** Proceed to [BACKGROUND_JOBS.md](./BACKGROUND_JOBS.md) for background job specifications.
