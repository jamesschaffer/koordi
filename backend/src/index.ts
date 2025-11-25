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
app.get('/api/health', async (req, res) => {
  const checks: Record<string, { status: string; message?: string }> = {};
  let allHealthy = true;

  // Check critical environment variables
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'REDIS_URL',
  ];

  const emailEnvVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];

  requiredEnvVars.forEach((varName) => {
    if (process.env[varName]) {
      checks[varName.toLowerCase()] = { status: 'ok' };
    } else {
      checks[varName.toLowerCase()] = { status: 'error', message: 'Not configured' };
      allHealthy = false;
    }
  });

  // Check email configuration (warning, not critical)
  const emailConfigured = emailEnvVars.every((varName) => process.env[varName]);
  if (emailConfigured) {
    checks.email = { status: 'ok', message: 'SMTP configured' };
  } else {
    checks.email = { status: 'warning', message: 'SMTP not fully configured - emails will be logged to console' };
  }

  // Quick database connectivity check
  try {
    const { prisma } = await import('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', message: 'Connected' };
  } catch (error: any) {
    checks.database = { status: 'error', message: error.message };
    allHealthy = false;
  }

  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    checks,
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
