# Authentication & Authorization
## Koordi

**Strategy:** OAuth 2.0 (Google) + JWT for app sessions
**Token Storage:** Encrypted refresh tokens in database
**Session Management:** Stateless JWT with refresh mechanism

---

## TABLE OF CONTENTS
1. [Authentication Flow](#authentication-flow)
2. [JWT Structure](#jwt-structure)
3. [Token Management](#token-management)
4. [Authorization & Permissions](#authorization--permissions)
5. [Middleware Implementation](#middleware-implementation)
6. [Security Considerations](#security-considerations)
7. [Error Handling](#error-handling)
8. [Testing Authentication](#testing-authentication)

---

## AUTHENTICATION FLOW

### Google OAuth 2.0 Flow (Initial Login)

```
┌─────────┐                                    ┌──────────┐
│ Client  │                                    │  Backend │
│ (React) │                                    │ (Node.js)│
└────┬────┘                                    └────┬─────┘
     │                                              │
     │  1. Click "Sign in with Google"             │
     ├─────────────────────────────────────────────►
     │  GET /api/auth/google                       │
     │                                              │
     │  2. Return Google OAuth URL                 │
     ◄─────────────────────────────────────────────┤
     │  { "url": "https://accounts.google..." }    │
     │                                              │
     │  3. Redirect user to Google                 │
     ├──────────────────┐                          │
     │                  │                          │
     │  [User logs in  │                          │
     │   at Google]    │                          │
     │                  │                          │
     │  4. Google redirects to callback            │
     ├─────────────────────────────────────────────►
     │  GET /api/auth/google/callback?code=xyz     │
     │                                              │
     │                                              │  5. Exchange code for tokens
     │                                              ├──────────────────►
     │                                              │  Google Token API
     │                                              ◄──────────────────┤
     │                                              │  { access_token, refresh_token }
     │                                              │
     │                                              │  6. Get user profile via oauth2 API
     │                                              │  7. Create/update User record
     │                                              │  8. Encrypt & store refresh_token
     │                                              │  9. Auto-accept pending invitations
     │                                              │  10. Generate JWT
     │                                              │
     │  11. Redirect to frontend with JWT          │
     ◄─────────────────────────────────────────────┤
     │  302 Redirect to /auth/callback?token=...   │
     │                                              │
     │  12. Frontend extracts token from URL       │
     │                                              │
     └─────────────────────────────────────────────┘
```

### Sequence Details

#### Step 1: Initiate OAuth

**Client Request:**
```http
GET /api/auth/google HTTP/1.1
Host: api.koordi.app
```

**Backend Implementation:**
```typescript
// src/routes/auth.ts
import { Router } from 'express';
import { google } from 'googleapis';

const router = Router();

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

router.get('/google', (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Always use 'consent' to ensure we get a refresh token
  // This is critical for Google Calendar sync to work
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  res.json({ url: authUrl });
});
```

**Client Response:**
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=...&access_type=offline&prompt=consent"
}
```

#### Step 2-4: User Authorization at Google

Client redirects user to `authUrl`. User logs into Google, grants permissions. Google redirects back to:

```
https://api.koordi.app/api/auth/google/callback?code=4/0AY0e-g7...&scope=email+profile+calendar
```

#### Step 5-10: Token Exchange and JWT Generation

**Actual Backend Implementation (`src/routes/auth.ts`):**

```typescript
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    // 5. Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // 6. Get user profile via oauth2.userinfo API
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.email || !profile.name) {
      return res.status(400).json({ error: 'Failed to get user profile' });
    }

    // 7. Get primary calendar ID
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { data: calendarList } = await calendar.calendarList.list();
    const primaryCalendar = calendarList.items?.find((cal) => cal.primary);

    // 8. Create or update user via findOrCreateUser service
    const user = await findOrCreateUser(
      { id: profile.id, email: profile.email, name: profile.name, picture: profile.picture },
      tokens.refresh_token!,
      primaryCalendar!.id,
    );

    // 9. Auto-accept any pending invitations for this email
    await autoAcceptPendingInvitations(user.id, user.email);

    // 10. Generate JWT with userId and email
    const token = generateToken({ userId: user.id, email: user.email });

    // 11. Check if user needs profile setup (home address required)
    const needsSetup = !user.home_address || !user.home_latitude || !user.home_longitude;

    // 12. Redirect to frontend with token (NOT JSON response)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const setupParam = needsSetup ? '&needs_setup=true' : '';
    res.redirect(`${frontendUrl}/auth/callback?token=${token}${setupParam}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/error?message=Authentication failed`);
  }
});
```

**Key Implementation Notes:**
- Redirects to frontend with token in URL query param (NOT JSON response)
- Auto-accepts pending invitations during login
- Includes `needs_setup=true` flag if user has no home address
- On error, redirects to `/auth/error` with message

---

## JWT STRUCTURE

### JWT Payload Schema

**Actual implementation from `src/utils/jwt.ts`:**

```typescript
export interface JWTPayload {
  userId: string;
  email: string;
}
```

```json
{
  "userId": "user-uuid-here",
  "email": "user@example.com",
  "iat": 1699564800,
  "exp": 1700169600
}
```

**Field Descriptions:**
- `userId`: User UUID (primary key) - **Note: NOT `sub`**
- `email`: User email (for display/logging)
- `iat` (Issued At): Unix timestamp when token was created (auto-added by jsonwebtoken)
- `exp` (Expiration): Unix timestamp when token expires (7 days from `iat`)

### JWT Signing Configuration

```typescript
// src/utils/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d'; // 7 days

export interface JWTPayload {
  userId: string;
  email: string;
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
};
```

### Environment Variables

```env
JWT_SECRET="your-256-bit-secret-key-here-change-in-production"
JWT_EXPIRES_IN="7d"
```

**Security Notes:**
- JWT_SECRET must be at least 256 bits (32 characters)
- Use cryptographically random string (e.g., `openssl rand -base64 32`)
- Never commit secrets to version control
- Rotate secrets periodically in production

---

## TOKEN MANAGEMENT

### Token Storage (Client)

**Recommended Approach: Memory + Refresh Pattern**

```typescript
// src/lib/auth-client.ts
class AuthClient {
  private token: string | null = null;

  // Store token in memory only (not localStorage for security)
  setToken(token: string) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  clearToken() {
    this.token = null;
  }

  // Attach token to requests
  async fetch(url: string, options: RequestInit = {}) {
    const headers = {
      ...options.headers,
      Authorization: this.token ? `Bearer ${this.token}` : '',
    };

    return fetch(url, { ...options, headers });
  }
}

export const authClient = new AuthClient();
```

**Alternative: Secure Cookie (for SSR apps)**

```typescript
// Backend sets HttpOnly cookie
res.cookie('auth_token', jwtToken, {
  httpOnly: true, // Not accessible via JavaScript
  secure: true, // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

### Token Refresh Flow

**Status:** NO REFRESH ENDPOINT IMPLEMENTED

The current implementation does not have a token refresh endpoint. JWTs are valid for 7 days and users must re-authenticate via Google OAuth when the token expires.

**Current Behavior:**
- JWT expires after 7 days
- User is redirected to Google OAuth to obtain a new token
- No silent refresh mechanism

**Not Implemented:**
- `POST /api/auth/refresh` endpoint
- Automatic token refresh before expiration
- Refresh on 401 response

### Google Token Refresh (Background Job)

Google refresh tokens are long-lived but need periodic refresh for calendar sync.

```typescript
// src/jobs/refresh-google-tokens.ts
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { decrypt, encrypt } from '../utils/encryption';

const prisma = new PrismaClient();

export async function refreshGoogleTokensJob() {
  // Find users with Google Calendar sync enabled
  const users = await prisma.user.findMany({
    where: {
      google_calendar_sync_enabled: true,
      google_refresh_token_enc: { not: null },
    },
  });

  for (const user of users) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      // Decrypt refresh token
      const refreshToken = decrypt(user.google_refresh_token_enc!);
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      // Refresh access token
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update stored refresh token if Google issued a new one
      if (credentials.refresh_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            google_refresh_token_enc: encrypt(credentials.refresh_token),
          },
        });
      }

      console.log(`Refreshed Google token for user ${user.email}`);
    } catch (error) {
      console.error(`Failed to refresh Google token for user ${user.email}:`, error);
      // Optionally disable sync or notify user
    }
  }
}
```

---

## AUTHORIZATION & PERMISSIONS

### Permission Matrix

| Resource | Action | Owner | Member | Non-Member |
|----------|--------|-------|--------|------------|
| **User Profile** | View Own | ✅ | ✅ | ✅ |
| | Update Own | ✅ | ✅ | ✅ |
| | Delete Own | ✅ | ✅ | ✅ |
| | View Other | ❌ | ❌ | ❌ |
| **Event Calendar** | Create | ✅ | ✅ | ✅ |
| | View | ✅ | ✅ | ❌ |
| | Update | ✅ (owner only) | ❌ | ❌ |
| | Delete | ✅ (owner only) | ❌ | ❌ |
| | Sync | ✅ | ✅ | ❌ |
| **Members** | Invite | ✅ | ✅ | ❌ |
| | Remove Others | ✅ | ✅ | ❌ |
| | Remove Self | ❌ (MVP) | ✅ | ❌ |
| | Resend Invitation | ✅ | ✅ | ❌ |
| | Cancel Invitation | ✅ | ✅ | ❌ |
| **Child** | Create | ✅ | ✅ | ✅ |
| | View | ✅ (via calendar) | ✅ (via calendar) | ❌ |
| | Update | ✅ (via calendar) | ✅ (via calendar) | ❌ |
| | Delete | ✅ (via calendar) | ✅ (via calendar) | ❌ |
| **Event** | View | ✅ (if member) | ✅ (if member) | ❌ |
| | Assign | ✅ (if member) | ✅ (if member) | ❌ |
| | Reassign | ✅ (if member) | ✅ (if member) | ❌ |

### Key Permission Rules

1. **Event Calendar Ownership:**
   - Only the owner can update calendar settings (name, color, ics_url)
   - Only the owner can delete calendars
   - Owner tracked in `EventCalendar.owner_id`

2. **Member Management:**
   - **Any member** can invite new members (not just owner)
   - **Any member** can remove other members (not just owner)
   - Owner cannot leave calendar (must delete instead)
   - Members can leave calendar at any time

3. **Child Access:**
   - No direct ownership
   - Access granted implicitly via Event Calendar membership
   - Multiple parents can manage same child through shared calendars

4. **Event Assignment:**
   - Any member of the Event Calendar can assign/reassign events
   - Can assign to self or any other member
   - No restriction on who can assign to whom
   - Supports optimistic locking to prevent race conditions

5. **Invitations:**
   - **Any member** can send invitations
   - **Any member** can remove other members
   - Invitations expire after 30 days
   - Auto-accepted when invitee already has an account

### Authorization Helper Functions

```typescript
// src/utils/authorization.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Check if user is a member of an Event Calendar
 */
export async function isCalendarMember(
  userId: string,
  calendarId: string
): Promise<boolean> {
  const membership = await prisma.eventCalendarMembership.findFirst({
    where: {
      event_calendar_id: calendarId,
      user_id: userId,
      status: 'accepted',
    },
  });

  return !!membership;
}

/**
 * Check if user is the owner of an Event Calendar
 */
export async function isCalendarOwner(
  userId: string,
  calendarId: string
): Promise<boolean> {
  const calendar = await prisma.eventCalendar.findFirst({
    where: {
      id: calendarId,
      owner_id: userId,
    },
  });

  return !!calendar;
}

/**
 * Check if user can access a child (via any Event Calendar)
 */
export async function canAccessChild(
  userId: string,
  childId: string
): Promise<boolean> {
  const calendars = await prisma.eventCalendar.findMany({
    where: {
      child_id: childId,
      members: {
        some: {
          user_id: userId,
          status: 'accepted',
        },
      },
    },
  });

  return calendars.length > 0;
}

/**
 * Check if user can access an event (via Event Calendar membership)
 */
export async function canAccessEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      event_calendar: {
        members: {
          some: {
            user_id: userId,
            status: 'accepted',
          },
        },
      },
    },
  });

  return !!event;
}

/**
 * Get all Event Calendar IDs the user is a member of
 */
export async function getUserCalendarIds(userId: string): Promise<string[]> {
  const memberships = await prisma.eventCalendarMembership.findMany({
    where: {
      user_id: userId,
      status: 'accepted',
    },
    select: {
      event_calendar_id: true,
    },
  });

  return memberships.map((m) => m.event_calendar_id);
}
```

---

## MIDDLEWARE IMPLEMENTATION

### JWT Authentication Middleware

```typescript
// src/middleware/authenticate.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export async function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const payload = verifyToken(token);

    // Verify user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    } else {
      console.error('JWT verification error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  }
}
```

### Calendar Membership Middleware

```typescript
// src/middleware/calendar-access.ts
import { Request, Response, NextFunction } from 'express';
import { isCalendarMember } from '../utils/authorization';

export function requireCalendarMembership(idParam = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const calendarId = req.params[idParam];
    const userId = req.user!.id;

    const isMember = await isCalendarMember(userId, calendarId);

    if (!isMember) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this calendar.' });
    }

    next();
  };
}
```

### Calendar Ownership Middleware

```typescript
// src/middleware/calendar-access.ts
export function requireCalendarOwnership(idParam = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const calendarId = req.params[idParam];
    const userId = req.user!.id;

    const isOwner = await isCalendarOwner(userId, calendarId);

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied. Only the calendar owner can perform this action.' });
    }

    next();
  };
}
```

### Usage Example

```typescript
// src/routes/event-calendars.ts
import { Router } from 'express';
import { authenticateJWT } from '../middleware/authenticate';
import { requireCalendarMembership, requireCalendarOwnership } from '../middleware/calendar-access';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

// View calendar (requires membership)
router.get('/:id', requireCalendarMembership(), async (req, res) => {
  // User is authenticated and verified as member
  const calendar = await prisma.eventCalendar.findUnique({
    where: { id: req.params.id },
  });
  res.json(calendar);
});

// Delete calendar (requires ownership)
router.delete('/:id', requireCalendarOwnership(), async (req, res) => {
  // User is authenticated and verified as owner
  await prisma.eventCalendar.delete({
    where: { id: req.params.id },
  });
  res.status(204).send();
});

export default router;
```

---

## SECURITY CONSIDERATIONS

### Token Encryption (Google Refresh Tokens)

```typescript
// src/utils/encryption.ts
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export function isEncryptionConfigured(): boolean {
  return ENCRYPTION_KEY.length === 64 && /^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY);
}

export function encrypt(text: string): string {
  if (!isEncryptionConfigured()) {
    throw new Error('ENCRYPTION_KEY not properly configured');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return: IV:EncryptedData
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!isEncryptionConfigured()) {
    throw new Error('ENCRYPTION_KEY not properly configured');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encryptedData = parts[1];

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv
  );

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Generate Encryption Key:**
```bash
# Generate 256-bit (32-byte) key
openssl rand -hex 32
```

**Environment Variable:**
```env
ENCRYPTION_KEY="your-64-character-hex-string-here"
```

### CORS Configuration

```typescript
// src/app.ts
import cors from 'cors';

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### Rate Limiting

```typescript
// src/middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

// Auth endpoints: 5 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts. Please try again later.',
});

// API endpoints: 100 requests per 15 minutes per user
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: 'Too many requests. Please try again later.',
});
```

**Usage:**
```typescript
// src/routes/auth.ts
router.post('/google/initiate', authLimiter, initiateGoogleAuth);

// src/app.ts
app.use('/api', authenticateJWT, apiLimiter);
```

### Security Headers

```typescript
// src/app.ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

---

## ERROR HANDLING

### Authentication Error Codes

| HTTP Status | Error Code | Description | User Message |
|-------------|-----------|-------------|--------------|
| 401 | `AUTH_MISSING_TOKEN` | No Authorization header | "Please log in to continue" |
| 401 | `AUTH_INVALID_TOKEN` | Malformed JWT | "Session invalid. Please log in again" |
| 401 | `AUTH_EXPIRED_TOKEN` | JWT expired | "Session expired. Please log in again" |
| 401 | `AUTH_USER_NOT_FOUND` | User deleted | "Account not found. Please contact support" |
| 403 | `AUTH_INSUFFICIENT_PERMISSIONS` | User lacks permissions | "You don't have permission to access this resource" |
| 403 | `AUTH_NOT_CALENDAR_MEMBER` | Not a member of calendar | "You are not a member of this calendar" |
| 403 | `AUTH_NOT_CALENDAR_OWNER` | Not the owner | "Only the calendar owner can perform this action" |
| 429 | `AUTH_RATE_LIMIT_EXCEEDED` | Too many requests | "Too many attempts. Please try again later" |

### Error Response Format

```typescript
// Standard error response
interface ErrorResponse {
  error: string; // Error code
  message: string; // User-friendly message
  details?: any; // Optional additional context (development only)
}
```

**Example:**
```json
{
  "error": "AUTH_EXPIRED_TOKEN",
  "message": "Session expired. Please log in again"
}
```

### Error Handler Middleware

```typescript
// src/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  // JWT errors
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'AUTH_EXPIRED_TOKEN',
      message: 'Session expired. Please log in again',
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'AUTH_INVALID_TOKEN',
      message: 'Session invalid. Please log in again',
    });
  }

  // Generic server error
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}
```

---

## TESTING AUTHENTICATION

### Unit Tests (Vitest)

```typescript
// tests/utils/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from '../../src/utils/jwt';

describe('JWT Utilities', () => {
  it('should generate and verify valid token', () => {
    const payload = { sub: 'user-123', email: 'test@example.com' };
    const token = generateToken(payload);

    const verified = verifyToken(token);
    expect(verified.sub).toBe('user-123');
    expect(verified.email).toBe('test@example.com');
  });

  it('should reject expired token', async () => {
    // Generate token with 1ms expiry
    const token = jwt.sign(
      { sub: 'user-123' },
      process.env.JWT_SECRET!,
      { expiresIn: '1ms' }
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(() => verifyToken(token)).toThrow('jwt expired');
  });

  it('should reject tampered token', () => {
    const token = generateToken({ sub: 'user-123', email: 'test@example.com' });
    const tampered = token.slice(0, -5) + 'xxxxx';

    expect(() => verifyToken(tampered)).toThrow('invalid signature');
  });
});
```

### Integration Tests (Supertest)

```typescript
// tests/routes/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Authentication Routes', () => {
  beforeEach(async () => {
    // Clear test database
    await prisma.user.deleteMany();
  });

  it('GET /api/auth/google/initiate should return auth URL', async () => {
    const response = await request(app).get('/api/auth/google/initiate');

    expect(response.status).toBe(200);
    expect(response.body.authUrl).toContain('accounts.google.com');
    expect(response.body.authUrl).toContain('scope=');
  });

  it('GET /api/users/me should require authentication', async () => {
    const response = await request(app).get('/api/users/me');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_MISSING_TOKEN');
  });

  it('GET /api/users/me should return user with valid token', async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
      },
    });

    // Generate token
    const token = generateToken({ sub: user.id, email: user.email });

    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('test@example.com');
  });
});
```

### E2E Tests (Playwright)

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should complete Google OAuth flow', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:5173/login');

    // Click "Sign in with Google"
    await page.click('button:has-text("Sign in with Google")');

    // Wait for redirect to Google (in test, mock this)
    // For actual E2E, use test Google account

    // After successful auth, should redirect to dashboard
    await expect(page).toHaveURL('http://localhost:5173/dashboard');

    // Verify user is logged in
    await expect(page.locator('text=Welcome')).toBeVisible();
  });

  test('should redirect to login when accessing protected route', async ({ page }) => {
    // Try accessing dashboard without auth
    await page.goto('http://localhost:5173/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should persist session across page reloads', async ({ page, context }) => {
    // Log in (mock or real flow)
    await page.goto('http://localhost:5173/login');
    // ... login flow ...

    // Reload page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL('http://localhost:5173/dashboard');
  });
});
```

---

## SUMMARY CHECKLIST

### Backend Implementation
- [x] Google OAuth 2.0 client configured with Client ID, Secret, Redirect URI
- [x] JWT generation with proper signing and 7-day expiration
- [x] JWT verification middleware (`authenticateToken`)
- [x] Token encryption utilities for Google refresh tokens (AES-256-CBC)
- [x] Authorization checks via calendar membership queries
- [x] Auto-accept pending invitations on login
- [x] Redirect to frontend with token after OAuth callback
- [x] `needs_setup` flag for users without home address
- [ ] Token refresh endpoint (`POST /api/auth/refresh`) - NOT IMPLEMENTED
- [ ] Calendar membership middleware - inline in routes
- [ ] Rate limiting on auth endpoints - NOT IMPLEMENTED
- [ ] Security headers (Helmet) - NOT IMPLEMENTED

### Frontend Implementation
- [x] OAuth flow initiated via Google button
- [x] Token storage via React Context (AuthContext)
- [x] Token extracted from URL after OAuth callback
- [x] Authorization header attached to API requests
- [x] Redirect to login on authentication failure
- [x] Protected routes via PrivateRoute component
- [ ] Automatic token refresh - NOT IMPLEMENTED (re-auth required)

### Security
- [x] JWT_SECRET environment variable
- [x] ENCRYPTION_KEY environment variable (64-char hex)
- [x] Google OAuth credentials via environment variables
- [x] Refresh tokens encrypted in database
- [x] CORS configured via FRONTEND_URL environment variable
- [ ] Rate limiting on auth endpoints - NOT IMPLEMENTED
- [ ] Security headers (Helmet, CSP, HSTS) - NOT IMPLEMENTED

### Testing
- [ ] Unit tests for JWT generation/verification - NOT IMPLEMENTED
- [ ] Unit tests for encryption/decryption - NOT IMPLEMENTED
- [ ] Integration tests for auth routes - NOT IMPLEMENTED
- [ ] E2E tests for OAuth flow - NOT IMPLEMENTED

---

**Next Steps:** Proceed to [CONFIGURATION.md](./CONFIGURATION.md) for environment variable and configuration documentation.
