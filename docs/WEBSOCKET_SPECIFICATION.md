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
4. [Event Types](#event-types)
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
     │  io(url, { auth: { token } })               │
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
     │                                              │  4. AUTO: Query user's calendars
     │                                              ├──────────────────►
     │                                              │   Database
     │                                              ◄──────────────────┤
     │                                              │  [cal1, cal2, ...]
     │                                              │
     │                                              │  5. AUTO: Join rooms
     │                                              ├──────────┐
     │                                              │ user:{userId}
     │                                              │ calendar:{calId}
     │                                              ◄──────────┘
     │                                              │
     │  6. Client ready to receive events          │
     │     (no explicit join required)             │
     │                                              │
     └──────────────────────────────────────────────┘
```

**Note:** Unlike the original design, room joining happens **automatically** on connection. The server queries the user's calendar memberships and joins them to all appropriate rooms without requiring a `join_calendars` event from the client.

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

Two types of rooms:

```
user:<user_id>        # Personal room for user-specific notifications
calendar:<calendar_id> # Calendar room for all calendar members
```

Examples:
- `user:abc-123-def-456`
- `calendar:xyz-789-uvw-012`

### Room Membership Rules

1. **Auto-Join on Connect:** Server automatically joins user to:
   - Their personal room (`user:{userId}`)
   - All calendar rooms they're members of
2. **Dynamic Join:** Client can emit `join:calendar` when accepting an invitation
3. **Dynamic Leave:** Client can emit `leave:calendar` when leaving a calendar
4. **Owner Special Case:** Calendar owner is always in the room until calendar is deleted

### Room Operations

```typescript
// Auto-join on connection (server-side)
socket.join(`user:${userId}`);
socket.join(`calendar:${calendarId}`);

// Manual join after invitation acceptance (client-side)
socket.on('join:calendar', (calendarId: string) => {
  socket.join(`calendar:${calendarId}`);
});

// Manual leave (client-side)
socket.on('leave:calendar', (calendarId: string) => {
  socket.leave(`calendar:${calendarId}`);
});

// Helper functions for emitting (server-side)
import { emitToCalendar, emitToUser, SocketEvent } from '../config/socket';

emitToCalendar(io, calendarId, SocketEvent.EVENT_ASSIGNED, payload);
emitToUser(io, userId, SocketEvent.INVITATION_RECEIVED, payload);
```

---

## EVENT TYPES

### Event Naming Convention

All events use colon-separated naming:
```
category:action
```

### SocketEvent Enum

```typescript
// src/config/socket.ts
export enum SocketEvent {
  // Event assignment events
  EVENT_ASSIGNED = 'event:assigned',
  EVENT_UNASSIGNED = 'event:unassigned',

  // Event CRUD events
  EVENT_CREATED = 'event:created',
  EVENT_UPDATED = 'event:updated',
  EVENT_DELETED = 'event:deleted',

  // Conflict resolution events
  CONFLICT_RESOLVED = 'conflict:resolved',

  // Calendar sync events
  CALENDAR_SYNCED = 'calendar:synced',
  CALENDAR_SYNC_FAILED = 'calendar:sync_failed',

  // Member events
  MEMBER_ADDED = 'member:added',
  MEMBER_REMOVED = 'member:removed',
  INVITATION_RECEIVED = 'invitation:received',
}
```

### Client → Server Events

#### join:calendar

**Purpose:** Join a specific calendar room (e.g., after accepting invitation)

```typescript
socket.emit('join:calendar', calendarId);
```

#### leave:calendar

**Purpose:** Leave a specific calendar room

```typescript
socket.emit('leave:calendar', calendarId);
```

**Note:** There is no `join_calendars` event. Room joining happens automatically on connection.

---

### Server → Client Events

#### event:assigned

**Purpose:** Event assigned to a user

**Payload:**
```typescript
{
  event_id: string;
  event_title: string;
  assigned_to_user_id: string;
  start_time: string;
  end_time: string;
  event_calendar_id: string;
}
```

#### event:unassigned

**Purpose:** Event unassigned from a user

**Payload:** Same as `event:assigned`

#### event:created

**Purpose:** New event created (from ICS sync)

**Payload:**
```typescript
{
  event_id: string;
  event_title: string;
  event_calendar_id: string;
}
```

#### event:updated

**Purpose:** Event details modified

**Payload:**
```typescript
{
  event_id: string;
  event_title: string;
  event_calendar_id: string;
}
```

#### event:deleted

**Purpose:** Event removed

**Payload:**
```typescript
{
  event_id: string;
  event_title: string;
  event_calendar_id: string;
}
```

#### conflict:resolved

**Purpose:** Two events at the same location have been linked (supplemental events shared)

**Payload:**
```typescript
{
  event1_id: string;
  event2_id: string;
  reason: 'same_location' | 'other';
}
```

#### calendar:synced

**Purpose:** Calendar sync completed successfully

**Payload:**
```typescript
{
  calendar_id: string;
  calendar_name: string;
  events_created: number;
  events_updated: number;
  events_deleted: number;
}
```

#### calendar:sync_failed

**Purpose:** Calendar sync failed

**Payload:**
```typescript
{
  calendar_id: string;
  calendar_name: string;
  error: string;
}
```

#### member:added

**Purpose:** New member added to calendar

**Payload:**
```typescript
{
  calendar_id: string;
  user_email: string;
  user_name: string;
}
```

#### member:removed

**Purpose:** Member removed from calendar

**Payload:**
```typescript
{
  calendar_id: string;
  user_name: string;
}
```

#### invitation:received

**Purpose:** User received a calendar invitation

**Payload:**
```typescript
{
  calendar_name: string;
  inviter_name: string;
}
```

---

## SERVER IMPLEMENTATION

### Socket.io Server Setup

```typescript
// src/config/socket.ts
import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../lib/prisma';

export function initializeSocketServer(httpServer: HTTPServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = verifyToken(token);
      if (!decoded || typeof decoded === 'string') {
        return next(new Error('Invalid token'));
      }

      // Attach user info to socket
      (socket as any).userId = decoded.userId;
      (socket as any).email = decoded.email;

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', async (socket) => {
    const userId = (socket as any).userId;
    const email = (socket as any).email;

    console.log(`✅ WebSocket connected: User ${email} (${userId})`);

    // Join user to their personal room
    socket.join(`user:${userId}`);

    // AUTO-JOIN: Join user to all their Event Calendar rooms
    try {
      const calendars = await prisma.eventCalendarMembership.findMany({
        where: { user_id: userId },
        select: { event_calendar_id: true },
      });

      calendars.forEach((membership) => {
        socket.join(`calendar:${membership.event_calendar_id}`);
      });

      console.log(`📅 User ${email} joined ${calendars.length} calendar room(s)`);
    } catch (error) {
      console.error('Error joining calendar rooms:', error);
    }

    // Manual room joining (after accepting invitation)
    socket.on('join:calendar', (calendarId: string) => {
      socket.join(`calendar:${calendarId}`);
      console.log(`📅 User ${email} manually joined calendar:${calendarId}`);
    });

    // Manual room leaving
    socket.on('leave:calendar', (calendarId: string) => {
      socket.leave(`calendar:${calendarId}`);
      console.log(`📅 User ${email} left calendar:${calendarId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ WebSocket disconnected: User ${email} (${userId})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`⚠️ Socket error for user ${email}:`, error);
    });
  });

  return io;
}
```

### Helper Functions for Emitting

```typescript
// src/config/socket.ts (continued)

// Helper function to emit events to a calendar room
export function emitToCalendar(
  io: SocketServer,
  calendarId: string,
  event: SocketEvent,
  data: any,
) {
  io.to(`calendar:${calendarId}`).emit(event, data);
  console.log(`📡 Emitted ${event} to calendar:${calendarId}`);
}

// Helper function to emit events to a specific user
export function emitToUser(
  io: SocketServer,
  userId: string,
  event: SocketEvent,
  data: any,
) {
  io.to(`user:${userId}`).emit(event, data);
  console.log(`📡 Emitted ${event} to user:${userId}`);
}
```

### Broadcasting Events from Routes

```typescript
// src/routes/event.ts
import { SocketEvent, emitToCalendar } from '../config/socket';

router.patch('/:id/assign', authenticate, async (req, res) => {
  // ... assignment logic ...

  // Determine which event to emit
  const socketEvent = newAssigneeId
    ? SocketEvent.EVENT_ASSIGNED
    : SocketEvent.EVENT_UNASSIGNED;

  // Broadcast to WebSocket room
  emitToCalendar(req.app.get('io'), event.event_calendar_id, socketEvent, {
    event_id: event.id,
    event_title: event.title,
    assigned_to_user_id: newAssigneeId,
    start_time: event.start_time,
    end_time: event.end_time,
    event_calendar_id: event.event_calendar_id,
  });

  res.json({ event: updatedEvent });
});
```

---

## CLIENT IMPLEMENTATION

### Socket Context Provider

```typescript
// frontend/src/contexts/SocketContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Only connect if user is authenticated
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // Don't reconnect if already connected
    if (socket?.connected) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      path: '/socket.io',
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log(`❌ WebSocket disconnected: ${reason}`);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('⚠️ WebSocket connection error:', error.message);
      setIsConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 WebSocket reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
```

### Socket Events Hook

```typescript
// frontend/src/hooks/useSocketEvents.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../contexts/SocketContext';
import { toast } from 'sonner';

// Socket event types (must match backend)
export const SocketEvent = {
  EVENT_ASSIGNED: 'event:assigned',
  EVENT_UNASSIGNED: 'event:unassigned',
  EVENT_CREATED: 'event:created',
  EVENT_UPDATED: 'event:updated',
  EVENT_DELETED: 'event:deleted',
  CONFLICT_RESOLVED: 'conflict:resolved',
  CALENDAR_SYNCED: 'calendar:synced',
  CALENDAR_SYNC_FAILED: 'calendar:sync_failed',
  MEMBER_ADDED: 'member:added',
  MEMBER_REMOVED: 'member:removed',
  INVITATION_RECEIVED: 'invitation:received',
};

export function useSocketEvents() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Event Assignment
    socket.on(SocketEvent.EVENT_ASSIGNED, (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', data.event_id] });
      toast.success(`Event assigned: ${data.event_title}`);
    });

    // Event Unassignment
    socket.on(SocketEvent.EVENT_UNASSIGNED, (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.info(`Event unassigned: ${data.event_title}`);
    });

    // Calendar Synced
    socket.on(SocketEvent.CALENDAR_SYNCED, (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['calendars'] });

      const changes = [];
      if (data.events_created > 0) changes.push(`${data.events_created} created`);
      if (data.events_updated > 0) changes.push(`${data.events_updated} updated`);
      if (data.events_deleted > 0) changes.push(`${data.events_deleted} deleted`);

      if (changes.length > 0) {
        toast.success(`Calendar "${data.calendar_name}" synced`, {
          description: changes.join(', '),
        });
      }
    });

    // Member Added
    socket.on(SocketEvent.MEMBER_ADDED, (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      toast.success('New member joined', {
        description: `${data.user_name} joined the calendar`,
      });
    });

    // Invitation Received
    socket.on(SocketEvent.INVITATION_RECEIVED, (data) => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      toast.info('New invitation received', {
        description: `You've been invited to join ${data.calendar_name}`,
      });
    });

    // Conflict Resolved
    socket.on(SocketEvent.CONFLICT_RESOLVED, (data) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    });

    // Cleanup listeners on unmount
    return () => {
      Object.values(SocketEvent).forEach((event) => {
        socket.off(event);
      });
    };
  }, [socket, isConnected, queryClient]);
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
- [x] Socket.io server initialized with CORS configuration (`src/config/socket.ts`)
- [x] JWT authentication middleware configured
- [x] User info attached to socket on connection
- [x] Auto-join to personal and calendar rooms on connection
- [x] Manual `join:calendar` and `leave:calendar` handlers
- [x] Helper functions (`emitToCalendar`, `emitToUser`)
- [x] Console logging for debugging
- [ ] Rate limiting (not implemented)
- [ ] Input validation for client events (not implemented)

### Client Implementation
- [x] Socket.io client via React Context (`SocketContext.tsx`)
- [x] Auth token passed on connection
- [x] Auto-reconnection with configurable attempts
- [x] Event handlers hook (`useSocketEvents.ts`)
- [x] React Query cache invalidation on events
- [x] Toast notifications via `sonner`
- [x] Connection state tracking (`isConnected`)

### Implemented Event Types
- [x] `event:assigned`
- [x] `event:unassigned`
- [x] `event:created`
- [x] `event:updated`
- [x] `event:deleted`
- [x] `conflict:resolved`
- [x] `calendar:synced`
- [x] `calendar:sync_failed`
- [x] `member:added`
- [x] `member:removed`
- [x] `invitation:received`

### Security
- [x] JWT authentication required for connection
- [x] Auto-join based on database memberships
- [ ] Explicit access verification on manual join (not implemented - trusts client)
- [ ] Rate limiting (not implemented)

### Not Yet Implemented
- [ ] Unit tests for authentication
- [ ] Unit tests for room operations
- [ ] Integration tests for event broadcasting
- [ ] E2E tests for real-time updates
- [ ] `calendar:updated` event for calendar metadata changes

---

**Next Steps:** Proceed to [BACKGROUND_JOBS.md](./BACKGROUND_JOBS.md) for background job specifications.
