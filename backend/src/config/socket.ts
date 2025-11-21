import { Server as SocketServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyToken } from '../utils/jwt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedSocket extends SocketServer {
  userId?: string;
  email?: string;
}

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

    // Join user to all their Event Calendar rooms
    try {
      const calendars = await prisma.eventCalendarMembership.findMany({
        where: { user_id: userId },
        select: { event_calendar_id: true },
      });

      calendars.forEach((membership) => {
        socket.join(`calendar:${membership.event_calendar_id}`);
      });

      console.log(
        `📅 User ${email} joined ${calendars.length} calendar room(s)`,
      );
    } catch (error) {
      console.error('Error joining calendar rooms:', error);
    }

    // Handle manual room joining (when user accepts invitation)
    socket.on('join:calendar', (calendarId: string) => {
      socket.join(`calendar:${calendarId}`);
      console.log(`📅 User ${email} manually joined calendar:${calendarId}`);
    });

    // Handle room leaving (when user leaves calendar)
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

// Event types for type safety
export enum SocketEvent {
  // Event assignment events
  EVENT_ASSIGNED = 'event:assigned',
  EVENT_UNASSIGNED = 'event:unassigned',

  // Event CRUD events
  EVENT_CREATED = 'event:created',
  EVENT_UPDATED = 'event:updated',
  EVENT_DELETED = 'event:deleted',

  // Calendar sync events
  CALENDAR_SYNCED = 'calendar:synced',
  CALENDAR_SYNC_FAILED = 'calendar:sync_failed',

  // Member events
  MEMBER_ADDED = 'member:added',
  MEMBER_REMOVED = 'member:removed',
  INVITATION_RECEIVED = 'invitation:received',
}

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
