// IMPORTANT: Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import eventCalendarRoutes from './routes/eventCalendar';
import childRoutes from './routes/child';
import eventRoutes from './routes/event';
import jobRoutes from './routes/jobs';
import invitationRoutes from './routes/invitations';
import './workers/icsSync.worker'; // Initialize worker
import { initializeScheduler } from './jobs/scheduler';
import { initializeSocketServer } from './config/socket';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json());

// API routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Koordi API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calendars', eventCalendarRoutes);
app.use('/api/children', childRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api', invitationRoutes);

// Initialize Socket.IO
const io = initializeSocketServer(httpServer);

// Make io accessible to routes
app.set('io', io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 WebSocket server initialized`);

  // Initialize background job scheduler
  initializeScheduler();
});

export default app;
export { io };
