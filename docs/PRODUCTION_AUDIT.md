# Production Audit Report
**Date:** 2025-11-23
**Auditor:** Claude Code
**Scope:** Entire codebase (backend + frontend + infrastructure)
**Purpose:** Identify production blockers and deployment readiness issues

---

## Executive Summary

This audit identified **5 CRITICAL**, **8 HIGH**, **8 MEDIUM**, and **5 LOW** priority issues that should be addressed before production deployment. The most critical issues involve security configuration (JWT/encryption secrets), error handling, and documentation mismatches.

**Overall Status:** ⚠️ **NOT PRODUCTION READY** - Critical issues must be resolved first.

---

## CRITICAL Issues (🔴 Must Fix Before Production)

### 1. JWT_SECRET has Weak Fallback
**File:** `backend/src/utils/jwt.ts:3`
**Issue:** JWT secret defaults to `'your-secret-key'` if environment variable is missing
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
```
**Impact:** If JWT_SECRET is not set in production, all tokens can be easily forged, compromising authentication entirely.
**Fix:** Throw error if JWT_SECRET is not set or has insufficient entropy
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long');
}
```

---

### 2. ENCRYPTION_KEY Only Warns, Doesn't Fail
**File:** `backend/src/utils/encryption.ts:7-9`
**Issue:** Missing or invalid ENCRYPTION_KEY only logs a warning but allows app to start
```typescript
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.warn('Warning: ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}
```
**Impact:** Google refresh tokens stored in database cannot be decrypted, breaking Google Calendar sync for all users. App appears to work but silently fails.
**Fix:** Throw error on startup if encryption key is missing or invalid
```typescript
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
}
```

---

### 3. Invitation Email Says "7 Days" But Actual Expiry is 30 Days
**File:** `backend/src/services/emailService.ts:92`
**Issue:** Email template incorrectly states invitations expire in 7 days
```typescript
<p style="font-size: 12px; color: #6b7280; margin: 5px 0;">
  Link expires in 7 days.
</p>
```
**Actual Behavior:** Invitations expire after 30 days (Phase 3 implementation)
**Impact:** User confusion, potential support burden, loss of trust
**Fix:** Update email template to say "Link expires in 30 days"

---

### 4. No Global Error Handler in Express
**File:** `backend/src/index.ts`
**Issue:** No error handling middleware to catch unhandled route errors or async errors
**Impact:** Unhandled errors crash the server or expose stack traces to clients
**Fix:** Add global error handler middleware before starting server
```typescript
// After all routes
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});
```

---

### 5. Missing Environment Variable Validation on Startup
**File:** `backend/src/index.ts`
**Issue:** No validation of required environment variables on startup
**Impact:** App starts successfully but fails at runtime when missing config is accessed (e.g., GOOGLE_CLIENT_ID, DATABASE_URL, REDIS_URL)
**Fix:** Add startup validation function
```typescript
function validateRequiredEnv() {
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'GOOGLE_MAPS_API_KEY',
    'FRONTEND_URL'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Call before starting server
validateRequiredEnv();
```

---

## HIGH Priority Issues (🟠 Should Fix Before Production)

### 6. No Request Body Size Limits
**File:** `backend/src/index.ts:31`
**Issue:** `express.json()` middleware has no size limit
**Impact:** Potential DoS attack via large payloads, memory exhaustion
**Fix:** Add size limit
```typescript
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

---

### 7. CORS Only Allows Single Origin
**File:** `backend/src/index.ts:26-29`
**Issue:** CORS only allows one FRONTEND_URL
**Impact:** Cannot support multiple domains (www vs non-www, staging vs production)
**Fix:** Support array of allowed origins
```typescript
const allowedOrigins = process.env.FRONTEND_URL?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

---

### 8. Health Check Doesn't Verify Database/Redis Connectivity
**File:** `backend/src/index.ts:34-41`
**Issue:** `/api/health` endpoint only returns OK without checking dependencies
**Impact:** Load balancer may route traffic to unhealthy instances
**Fix:** Add database and Redis connection checks
```typescript
app.get('/api/health', async (req, res) => {
  const health: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  };

  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    health.database = 'connected';
  } catch (error) {
    health.database = 'disconnected';
    health.status = 'degraded';
  }

  try {
    // Check Redis
    const redis = await import('./config/queue');
    await redis.icsSyncQueue.client.ping();
    health.redis = 'connected';
  } catch (error) {
    health.redis = 'disconnected';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

### 9. Socket.io Creates Redundant PrismaClient Instance
**File:** `backend/src/config/socket.ts:6`
**Issue:** Creates new `PrismaClient()` instead of reusing singleton
**Impact:** Multiple database connection pools, connection exhaustion
**Fix:** Import shared Prisma instance
```typescript
import { prisma } from '../prismaClient'; // Create shared singleton
```

---

### 10. No Graceful Shutdown Handling
**File:** `backend/src/index.ts`
**Issue:** Server doesn't handle SIGTERM/SIGINT signals for graceful shutdown
**Impact:** In-flight requests interrupted during deployment, potential data corruption
**Fix:** Add graceful shutdown
```typescript
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
    prisma.$disconnect();
    process.exit(0);
  });
});
```

---

### 11. Missing Atomic Transactions for Multi-Step Operations
**File:** Multiple service files
**Issue:** Operations like `sendInvitation()` and `acceptInvitation()` don't use transactions
**Impact:** Partial failures can leave data in inconsistent state
**Fix:** Wrap multi-step operations in Prisma transactions
```typescript
await prisma.$transaction(async (tx) => {
  // Multiple operations here
});
```

---

### 12. No Database Connection Pool Configuration
**File:** `backend/prisma/schema.prisma:10-12`
**Issue:** DATABASE_URL doesn't specify connection pool limits
**Impact:** Default limits may be too low for production traffic
**Fix:** Add connection pool parameters to DATABASE_URL
```
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public&connection_limit=20&pool_timeout=10"
```

---

### 13. SMTP Configuration Not Documented
**File:** `backend/.env.example`
**Issue:** Missing SMTP environment variables in .env.example
**Impact:** Email service won't work in production without proper configuration
**Fix:** Add to .env.example:
```bash
# SMTP Configuration (Production)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your_sendgrid_api_key
EMAIL_FROM=noreply@koordi.app
```

---

## MEDIUM Priority Issues (🟡 Fix Soon After Launch)

### 14. Console.log Instead of Structured Logging
**Files:** All service files
**Issue:** Using `console.log()` and `console.error()` instead of structured logging
**Impact:** Difficult to search, filter, and analyze logs in production
**Recommendation:** Implement Winston or Pino for structured logging with log levels

---

### 15. No Request ID Tracking
**Issue:** No request correlation IDs for distributed tracing
**Impact:** Difficult to trace requests across services and debug issues
**Recommendation:** Add `express-request-id` middleware

---

### 16. Rate Limiting Only on Invitations Endpoint
**File:** Only `backend/src/routes/invitations.ts:68` has rate limiting
**Issue:** Other endpoints (auth, events, calendars) are unprotected
**Impact:** Vulnerable to brute force, DoS attacks
**Recommendation:** Add global rate limiting with `express-rate-limit`

---

### 17. No Query Result Pagination Enforcement
**Files:** Multiple GET endpoints
**Issue:** Endpoints like GET /api/events don't enforce max page size
**Impact:** Users can request unlimited results, causing performance issues
**Recommendation:** Enforce max limit (e.g., 100) in all paginated endpoints

---

### 18. Error Messages May Expose Internal Details
**Files:** Multiple route handlers
**Issue:** Some error messages return database errors or stack traces
**Impact:** Information disclosure vulnerability
**Recommendation:** Sanitize error messages in production

---

### 19. Missing Database Indexes
**File:** `backend/prisma/schema.prisma`
**Issue:** No composite indexes for common query patterns
**Examples:**
- EventCalendarMembership: `[event_calendar_id, status]`
- Event: `[event_calendar_id, start_time]`
**Impact:** Slow queries on large datasets
**Recommendation:** Add composite indexes based on query analysis

---

### 20. No Monitoring/Observability Setup
**Issue:** No APM, error tracking, or metrics collection
**Impact:** Blind to production issues, slow incident response
**Recommendation:** Integrate Sentry, Datadog, or New Relic

---

### 21. WebSocket Reconnection Strategy Not Documented
**File:** Frontend WebSocket implementation
**Issue:** Unclear if automatic reconnection is implemented
**Impact:** Users may lose real-time updates after connection drop
**Recommendation:** Document reconnection logic and implement exponential backoff

---

## LOW Priority Issues (🟢 Nice to Have)

### 22. TypeScript Strict Mode Not Enabled
**Files:** `tsconfig.json` files
**Issue:** TypeScript strict mode not enforced
**Recommendation:** Enable `"strict": true` for better type safety

---

### 23. No Helmet CSP Configuration
**File:** `backend/src/index.ts:24`
**Issue:** Helmet middleware used but no Content Security Policy configured
**Recommendation:** Add CSP headers for XSS protection

---

### 24. No Compression Middleware
**Issue:** Response bodies not compressed
**Impact:** Larger payloads, slower response times
**Recommendation:** Add `compression` middleware

---

### 25. Test Coverage Unknown
**Issue:** No test coverage reports in CI/CD
**Recommendation:** Add `vitest --coverage` to CI pipeline

---

### 26. No API Documentation UI
**Issue:** API_SPECIFICATION.md exists but no interactive docs (Swagger/Redoc)
**Recommendation:** Generate OpenAPI spec from code or create Swagger UI

---

## Security Checklist

- [x] .env files not committed to git (verified in .gitignore)
- [x] Passwords/tokens encrypted in database (using AES-256-CBC)
- [x] JWT authentication implemented
- [x] Helmet middleware for security headers
- [ ] Input validation on all endpoints (partial)
- [ ] SQL injection protection (using Prisma ORM - safe)
- [x] XSS protection via Helmet
- [ ] CSRF protection (not needed for stateless JWT API)
- [x] CORS configured
- [ ] Rate limiting (only on invitations endpoint)
- [ ] Environment secrets validation on startup

---

## Database Checklist

- [x] Prisma migrations exist
- [x] Indexes on foreign keys
- [ ] Composite indexes for common queries
- [ ] Connection pooling configured
- [x] Cascading deletes defined
- [ ] Database backups strategy (not documented)
- [ ] Transaction usage for multi-step operations

---

## Infrastructure Checklist (Not Yet Addressed)

- [ ] Production DATABASE_URL configured
- [ ] Redis instance provisioned
- [ ] Environment variables set in hosting platform
- [ ] SMTP service configured (SendGrid/AWS SES)
- [ ] Domain and SSL certificates
- [ ] CDN for static assets
- [ ] Load balancer configuration
- [ ] Auto-scaling rules
- [ ] Log aggregation service
- [ ] Error tracking service (Sentry)
- [ ] Uptime monitoring
- [ ] Database backup schedule

---

## Recommendations by Priority

### Before Launch (Critical/High)
1. Fix JWT_SECRET and ENCRYPTION_KEY validation
2. Fix invitation email expiry text (7 days → 30 days)
3. Add global error handler
4. Add environment variable validation on startup
5. Add request body size limits
6. Fix CORS to support multiple origins
7. Enhance health check endpoint
8. Fix Socket.io PrismaClient singleton
9. Add graceful shutdown handling
10. Add SMTP configuration to .env.example

### First Week Post-Launch (Medium)
11. Implement structured logging (Winston/Pino)
12. Add request ID tracking
13. Add global rate limiting
14. Enforce pagination limits
15. Add composite database indexes
16. Set up monitoring/observability (Sentry)

### Future Improvements (Low)
17. Enable TypeScript strict mode
18. Add API documentation UI (Swagger)
19. Add compression middleware
20. Configure Helmet CSP

---

## Next Steps

1. ✅ Production audit complete
2. ⏳ Create production checklist document (Task 4)
3. ⏳ Address critical security issues
4. ⏳ Set up production infrastructure
5. ⏳ Deploy to staging environment
6. ⏳ Load testing and performance tuning
7. ⏳ Production deployment

---

**Audit Completed:** 2025-11-23
**Status:** Comprehensive audit complete. Critical issues identified and documented.
