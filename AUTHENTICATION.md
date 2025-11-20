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
     │  GET /api/auth/google/initiate              │
     │                                              │
     │  2. Return Google OAuth URL                 │
     ◄─────────────────────────────────────────────┤
     │  { "authUrl": "https://accounts.google..." } │
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
     │                                              │  { access_token, refresh_token, id_token }
     │                                              │
     │                                              │  6. Verify ID token
     │                                              │  7. Create/update User record
     │                                              │  8. Encrypt & store refresh_token
     │                                              │  9. Generate JWT
     │                                              │
     │  10. Return JWT + user data                 │
     ◄─────────────────────────────────────────────┤
     │  { "token": "eyJhbG...", "user": {...} }    │
     │                                              │
     │  11. Store JWT in memory/storage            │
     │                                              │
     └─────────────────────────────────────────────┘
```

### Sequence Details

#### Step 1: Initiate OAuth

**Client Request:**
```http
GET /api/auth/google/initiate HTTP/1.1
Host: api.koordi.app
```

**Backend Implementation:**
```typescript
// src/routes/auth.ts
import { Router } from 'express';
import { google } from 'googleapis';

const router = Router();

router.get('/google/initiate', (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar', // For calendar sync
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    scope: scopes,
    prompt: 'consent', // Force consent screen to get refresh token
  });

  res.json({ authUrl });
});
```

**Client Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=...&access_type=offline&prompt=consent"
}
```

#### Step 2-4: User Authorization at Google

Client redirects user to `authUrl`. User logs into Google, grants permissions. Google redirects back to:

```
https://api.koordi.app/api/auth/google/callback?code=4/0AY0e-g7...&scope=email+profile+calendar
```

#### Step 5-10: Token Exchange and JWT Generation

**Backend Implementation:**
```typescript
// src/routes/auth.ts
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../utils/encryption';

const prisma = new PrismaClient();

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;

  try {
    // 5. Exchange authorization code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // 6. Verify ID token and extract user info
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload?.email;
    const name = payload?.name;
    const avatarUrl = payload?.picture;

    if (!email) {
      throw new Error('No email in Google ID token');
    }

    // 7. Create or update user
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: name || email.split('@')[0],
        avatar_url: avatarUrl,
        google_refresh_token_enc: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : undefined,
      },
      create: {
        email,
        name: name || email.split('@')[0],
        avatar_url: avatarUrl,
        google_refresh_token_enc: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : undefined,
      },
    });

    // 9. Generate JWT for app authentication
    const jwtToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: '7d', // 7 days
        issuer: 'koordi',
        audience: 'koordi-users',
      }
    );

    // 10. Return JWT and user data
    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});
```

---

## JWT STRUCTURE

### JWT Payload Schema

```json
{
  "sub": "user-uuid-here",
  "email": "user@example.com",
  "iat": 1699564800,
  "exp": 1700169600,
  "iss": "koordi",
  "aud": "koordi-users"
}
```

**Field Descriptions:**
- `sub` (Subject): User UUID (primary key)
- `email`: User email (for display/logging)
- `iat` (Issued At): Unix timestamp when token was created
- `exp` (Expiration): Unix timestamp when token expires (7 days from `iat`)
- `iss` (Issuer): Application identifier
- `aud` (Audience): Intended recipients (validates token is for this app)

### JWT Signing Configuration

```typescript
// src/utils/jwt.ts
import jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '7d',
    issuer: 'koordi',
    audience: 'koordi-users',
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_SECRET!, {
    issuer: 'koordi',
    audience: 'koordi-users',
  }) as JwtPayload;
}
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

**Option 1: Silent Refresh Before Expiration**

```typescript
// src/lib/auth-client.ts
class AuthClient {
  private refreshTimer: NodeJS.Timeout | null = null;

  setToken(token: string) {
    this.token = token;
    this.scheduleRefresh(token);
  }

  private scheduleRefresh(token: string) {
    // Decode token to get expiration
    const decoded = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = decoded.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const refreshAt = expiresAt - 60 * 60 * 1000; // Refresh 1 hour before expiry

    const delay = refreshAt - now;

    if (delay > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken();
      }, delay);
    }
  }

  async refreshToken() {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });

      const { token } = await response.json();
      this.setToken(token);
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearToken();
      // Redirect to login
      window.location.href = '/login';
    }
  }
}
```

**Backend Refresh Endpoint:**

```typescript
// src/routes/auth.ts
router.post('/refresh', authenticateJWT, async (req, res) => {
  // User is already authenticated via middleware
  const user = req.user!;

  // Generate new JWT
  const newToken = generateToken({
    sub: user.id,
    email: user.email,
  });

  res.json({ token: newToken });
});
```

**Option 2: Refresh on 401 Response**

```typescript
// src/lib/auth-client.ts
async fetch(url: string, options: RequestInit = {}) {
  let response = await this.makeRequest(url, options);

  // If 401, try refreshing token once
  if (response.status === 401 && !options.headers?.['X-Retry-After-Refresh']) {
    await this.refreshToken();

    // Retry with new token
    response = await this.makeRequest(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-Retry-After-Refresh': 'true', // Prevent infinite loops
      },
    });
  }

  return response;
}
```

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
| | View | ✅ (owner) | ✅ | ❌ |
| | Update | ✅ (owner) | ✅ | ❌ |
| | Delete | ✅ (owner only) | ❌ | ❌ |
| | Sync | ✅ (owner) | ✅ | ❌ |
| **Members** | Invite | ✅ (owner) | ✅ | ❌ |
| | Remove | ✅ (owner) | ✅ (remove others) | ❌ |
| | Leave | ✅ | ✅ | ❌ |
| **Child** | Create | ✅ | ✅ | ✅ |
| | View | ✅ (via calendar) | ✅ (via calendar) | ❌ |
| | Update | ✅ (via calendar) | ✅ (via calendar) | ❌ |
| | Delete | ✅ (via calendar) | ✅ (via calendar) | ❌ |
| **Event** | View | ✅ (if member) | ✅ (if member) | ❌ |
| | Assign | ✅ (if member) | ✅ (if member) | ❌ |
| | Reassign | ✅ (if member) | ✅ (if member) | ❌ |

### Key Permission Rules

1. **Event Calendar Ownership:**
   - Only the original creator (owner_id) can delete calendars
   - Members have full CRUD access to child and event data
   - Members can invite/remove other members

2. **Child Access:**
   - No direct ownership
   - Access granted implicitly via Event Calendar membership
   - Multiple parents can manage same child through shared calendars

3. **Event Assignment:**
   - Only members of the Event Calendar can assign/reassign events
   - Can assign to self or any other member
   - No restriction on who can assign to whom

4. **Invitations:**
   - Any member can invite new parents
   - Any member can remove other members (except owner cannot be removed)
   - Members can leave calendars voluntarily

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

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32-byte key

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16); // Initialization vector
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return: IV:AuthTag:EncryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
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
- [ ] Google OAuth 2.0 client configured with Client ID, Secret, Redirect URI
- [ ] JWT generation with proper signing and expiration
- [ ] JWT verification middleware (`authenticateJWT`)
- [ ] Token encryption utilities for Google refresh tokens
- [ ] Authorization helpers (`isCalendarMember`, `isCalendarOwner`, etc.)
- [ ] Calendar membership/ownership middleware
- [ ] Token refresh endpoint (`POST /api/auth/refresh`)
- [ ] Error handling for auth failures
- [ ] Rate limiting on auth endpoints
- [ ] Security headers (Helmet, CORS)

### Frontend Implementation
- [ ] Auth client with in-memory token storage
- [ ] OAuth flow initiated on "Sign in with Google" click
- [ ] Token storage and retrieval
- [ ] Automatic token refresh (before expiration or on 401)
- [ ] Request interceptor to attach Authorization header
- [ ] Redirect to login on authentication failure
- [ ] Protected route wrapper component

### Security
- [ ] JWT_SECRET environment variable set (256-bit minimum)
- [ ] ENCRYPTION_KEY environment variable set (256-bit)
- [ ] Google OAuth credentials stored securely
- [ ] Refresh tokens encrypted in database
- [ ] CORS properly configured for production domain
- [ ] Rate limiting active on auth endpoints
- [ ] Security headers configured (CSP, HSTS)

### Testing
- [ ] Unit tests for JWT generation/verification
- [ ] Unit tests for encryption/decryption
- [ ] Integration tests for auth routes
- [ ] Integration tests for protected endpoints
- [ ] E2E tests for complete OAuth flow
- [ ] Test cases for permission edge cases

---

**Next Steps:** Proceed to [CONFIGURATION.md](./CONFIGURATION.md) for environment variable and configuration documentation.
