# Configuration Guide
## Koordi

**Purpose:** Comprehensive guide to all environment variables and configuration options
**File Location:** `.env` (local, not committed) and `.env.example` (template)

---

## TABLE OF CONTENTS
1. [Overview](#overview)
2. [Required Variables](#required-variables)
3. [Optional Variables](#optional-variables)
4. [Environment-Specific Configuration](#environment-specific-configuration)
5. [Third-Party Service Setup](#third-party-service-setup)
6. [Security Best Practices](#security-best-practices)
7. [Configuration Validation](#configuration-validation)

---

## OVERVIEW

### Configuration File Structure

```
/CalendarApp
├── .env                    # Local configuration (DO NOT COMMIT)
├── .env.example            # Template with all variables
├── .env.development        # Development defaults (optional)
├── .env.staging            # Staging configuration (optional)
└── .env.production         # Production secrets (stored in hosting platform)
```

### Loading Environment Variables

**Backend (Node.js):**

Environment variables are loaded via `dotenv` at the top of `src/index.ts` before any other imports:

```typescript
// src/index.ts
// IMPORTANT: Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();
```

Variables are accessed directly via `process.env` throughout the codebase:

```typescript
// src/index.ts
const PORT = process.env.PORT || 3000;
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// src/utils/jwt.ts
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// src/utils/encryption.ts
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
```

**Note:** There is no centralized config object or Joi-based validation. The `ENCRYPTION_KEY` is validated at module load time in `src/utils/encryption.ts`.

**Frontend (Vite):**

Variables prefixed with `VITE_` are accessed via `import.meta.env`:

```typescript
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
```

**Frontend .env.example:**
```env
VITE_API_URL=http://localhost:3000/api
VITE_GOOGLE_MAPS_API_KEY=your_maps_api_key_here
```

**Note:** WebSocket connections use the same URL as the API (no separate `VITE_WEBSOCKET_URL`).

---

## REQUIRED VARIABLES

These variables MUST be set for the application to function.

### 1. NODE_ENV
**Purpose:** Defines the runtime environment
**Values:** `development` | `staging` | `production`
**Default:** `development`

```env
NODE_ENV=development
```

**Impact:**
- `development`: Enables debug logging, detailed errors, hot reload
- `staging`: Production-like with verbose logging
- `production`: Optimized, minimal logging, strict security

---

### 2. DATABASE_URL
**Purpose:** PostgreSQL connection string
**Format:** `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?params`

```env
# Development
DATABASE_URL="postgresql://koordi_user:dev_password_123@localhost:5432/koordi_dev?schema=public"

# Production (with connection pooling)
DATABASE_URL="postgresql://user:pass@prod-db.aws.com:5432/koordi?schema=public&connection_limit=10&pool_timeout=30&sslmode=require"
```

**Parameters:**
- `schema=public` - PostgreSQL schema (default: public)
- `connection_limit=N` - Max connections per process (default: unlimited, recommend 10)
- `pool_timeout=N` - Connection acquisition timeout in seconds (default: 10)
- `sslmode=require` - Enforce SSL/TLS (production only)

**Setup:** See [DATABASE_SETUP.md](./DATABASE_SETUP.md)

---

### 3. JWT_SECRET
**Purpose:** Secret key for signing JSON Web Tokens
**Requirements:** Minimum 256 bits (32 characters), cryptographically random

```env
JWT_SECRET="8f7d6e5c4b3a2918f7d6e5c4b3a2918f"
```

**Generate:**
```bash
# Base64 encoded 256-bit key
openssl rand -base64 32

# Hex encoded 256-bit key
openssl rand -hex 32
```

**Security:**
- Rotate every 90 days in production
- Store in secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Never commit to version control

---

### 4. ENCRYPTION_KEY
**Purpose:** AES-256-CBC key for encrypting Google refresh tokens in database
**Requirements:** 64 hex characters (32 bytes)

```env
ENCRYPTION_KEY="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
```

**Generate:**
```bash
openssl rand -hex 32
```

**Security:**
- NEVER change after data is encrypted (tokens will be unrecoverable)
- Store in secrets manager
- Rotate requires re-encrypting all existing tokens

---

### 5. GOOGLE_CLIENT_ID
**Purpose:** OAuth 2.0 Client ID from Google Cloud Console
**Format:** `<project-id>.apps.googleusercontent.com`

```env
GOOGLE_CLIENT_ID="123456789-abcdefg.apps.googleusercontent.com"
```

**Setup:** See [Third-Party Service Setup](#third-party-service-setup) below

---

### 6. GOOGLE_CLIENT_SECRET
**Purpose:** OAuth 2.0 Client Secret from Google Cloud Console

```env
GOOGLE_CLIENT_SECRET="GOCSPX-abc123def456ghi789"
```

**Security:**
- Treat as highly sensitive
- Rotate if compromised
- Store in secrets manager

---

### 7. GOOGLE_REDIRECT_URI
**Purpose:** OAuth callback URL (must match Google Cloud Console configuration)

```env
# Development
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

# Production
GOOGLE_REDIRECT_URI="https://api.koordi.app/api/auth/google/callback"
```

**Requirements:**
- Must use HTTPS in production (HTTP only allowed for localhost)
- Must be added to "Authorized redirect URIs" in Google Cloud Console

---

### 8. GOOGLE_MAPS_API_KEY
**Purpose:** API key for Google Maps Platform (Geocoding, Directions, Distance Matrix)

```env
GOOGLE_MAPS_API_KEY="AIzaSyAbc123Def456Ghi789Jkl012Mno345"
```

**Required APIs:**
1. Geocoding API (convert addresses to lat/lng)
2. Directions API (calculate drive routes)
3. Distance Matrix API (calculate drive times with traffic)

**Setup:** See [Third-Party Service Setup](#third-party-service-setup) below

---

### 9. REDIS_URL
**Purpose:** Redis connection string for caching and job queue

```env
# Development (local)
REDIS_URL="redis://localhost:6379"

# Production (with password)
REDIS_URL="redis://:password@redis.example.com:6379"

# Production (AWS ElastiCache)
REDIS_URL="redis://master.abc123.cache.amazonaws.com:6379"
```

**Usage:**
- Caching geocoding results (24-hour TTL)
- Bull Queue for background jobs (ICS sync, traffic updates)
- WebSocket room management (optional)

---

## OPTIONAL VARIABLES

These variables enable additional features but are not required for core functionality.

### Server Configuration

#### PORT
**Default:** `3000`

```env
PORT=3000
```

Server port for Express.js backend.

#### FRONTEND_URL
**Default:** `http://localhost:5173`

```env
# Development
FRONTEND_URL=http://localhost:5173

# Production
FRONTEND_URL=https://koordi.app
```

Used for CORS configuration and OAuth redirects.

---

### WebSocket Configuration

**Note:** WebSocket runs on the same server/port as the HTTP API. There are no separate WebSocket configuration variables.

CORS origin for WebSocket connections uses the same `FRONTEND_URL` value as the HTTP API:

```typescript
// src/config/socket.ts
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
```

---

### Email Configuration (Optional)

For sending invitation emails. If `SMTP_HOST` is not set, emails are logged to console instead of being sent.

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
EMAIL_FROM="noreply@koordi.app"
```

**Implementation in `src/services/emailService.ts`:**
```typescript
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}
```

**Gmail Setup:**
1. Enable 2-factor authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use App Password as `SMTP_PASS`

**Alternative Services:**
- SendGrid: `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`, `SMTP_PASS=<api_key>`
- Mailgun: `SMTP_HOST=smtp.mailgun.org`, `SMTP_USER=<username>`, `SMTP_PASS=<password>`
- AWS SES: `SMTP_HOST=email-smtp.us-east-1.amazonaws.com`, use IAM credentials

---

### Push Notifications (Mobile)

**Status:** NOT IMPLEMENTED

Push notifications are not currently implemented. The following configuration would be needed when implemented:

#### Firebase Cloud Messaging (Android)

```env
FIREBASE_SERVER_KEY="your-firebase-server-key"
```

#### Apple Push Notification Service (iOS)

```env
APNS_KEY_ID="ABC123XYZ"
APNS_TEAM_ID="DEF456UVW"
APNS_BUNDLE_ID="com.koordi.app"
APNS_PRIVATE_KEY_PATH="./certs/apns-key.p8"
```

---

### Analytics & Monitoring

**Status:** NOT IMPLEMENTED

Analytics and error tracking are not currently integrated. The following configuration would be needed when implemented:

```env
POSTHOG_API_KEY="phc_abc123def456ghi789"
POSTHOG_HOST="https://app.posthog.com"
SENTRY_DSN="https://abc123@o456789.ingest.sentry.io/1234567"
```

---

### Background Jobs

Background job intervals are currently hardcoded in the scheduler, not configurable via environment variables.

**Actual Implementation (`src/jobs/scheduler.ts`):**
- ICS sync: Every 15 minutes (hardcoded)
- Invitation cleanup: Daily at 2 AM (hardcoded)

**Not Implemented:**
- Traffic check jobs
- Google token refresh jobs (tokens refreshed on-demand during sync)

---

### Rate Limiting

**Status:** PARTIALLY IMPLEMENTED

Rate limiting is implemented for invitation routes only, with hardcoded values:

```typescript
// src/middleware/invitationRateLimiter.ts
const invitationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  // ... skipped in test environment
});
```

There are no environment variables for rate limiting configuration.

---

### Logging

**Status:** NOT IMPLEMENTED

Structured logging with configurable levels is not implemented. The application uses `console.log/error/warn` directly with emoji prefixes for visibility.

---

### File Storage

**Status:** NOT IMPLEMENTED

File upload/storage is not currently implemented.

---

### Feature Flags

**Status:** NOT IMPLEMENTED

Feature flags are not implemented. All features are controlled by code presence, not runtime configuration.

---

## ENVIRONMENT-SPECIFIC CONFIGURATION

### Development Environment

```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://koordi_user:dev_password_123@localhost:5432/koordi_dev?schema=public"
FRONTEND_URL=http://localhost:5173

JWT_SECRET="dev-secret-change-in-production-12345678"
ENCRYPTION_KEY="abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"

GOOGLE_CLIENT_ID="<your-dev-client-id>"
GOOGLE_CLIENT_SECRET="<your-dev-client-secret>"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
GOOGLE_MAPS_API_KEY="<your-dev-api-key>"

REDIS_URL="redis://localhost:6379"

LOG_LEVEL=debug
LOG_FORMAT=pretty

ENABLE_DEBUG_ROUTES=true
PRISMA_STUDIO_PORT=5555
```

---

### Staging Environment

```env
NODE_ENV=staging
PORT=3000
DATABASE_URL="postgresql://user:pass@staging-db.aws.com:5432/koordi_staging?connection_limit=10&sslmode=require"
FRONTEND_URL=https://staging.koordi.app

JWT_SECRET="<staging-secret-from-secrets-manager>"
ENCRYPTION_KEY="<staging-encryption-key>"

GOOGLE_CLIENT_ID="<staging-client-id>"
GOOGLE_CLIENT_SECRET="<staging-client-secret>"
GOOGLE_REDIRECT_URI="https://api-staging.koordi.app/api/auth/google/callback"
GOOGLE_MAPS_API_KEY="<staging-api-key>"

REDIS_URL="redis://:password@staging-redis.aws.com:6379"

LOG_LEVEL=info
LOG_FORMAT=json

SENTRY_DSN="<staging-sentry-dsn>"
```

---

### Production Environment

```env
NODE_ENV=production
PORT=3000
DATABASE_URL="<from-secrets-manager>"
FRONTEND_URL=https://koordi.app

JWT_SECRET="<from-secrets-manager>"
ENCRYPTION_KEY="<from-secrets-manager>"

GOOGLE_CLIENT_ID="<from-secrets-manager>"
GOOGLE_CLIENT_SECRET="<from-secrets-manager>"
GOOGLE_REDIRECT_URI="https://api.koordi.app/api/auth/google/callback"
GOOGLE_MAPS_API_KEY="<from-secrets-manager>"

REDIS_URL="<from-secrets-manager>"

LOG_LEVEL=warn
LOG_FORMAT=json

RATE_LIMIT_MAX_API=100

SENTRY_DSN="<production-sentry-dsn>"
POSTHOG_API_KEY="<production-posthog-key>"

ENABLE_DEBUG_ROUTES=false

TRUST_PROXY=true  # Behind load balancer
```

**Production Security:**
- All secrets stored in AWS Secrets Manager / Google Secret Manager
- Environment variables injected at runtime
- Secrets rotated every 90 days
- Separate credentials for each environment

---

## THIRD-PARTY SERVICE SETUP

### Google Cloud Platform Setup

All Google services (OAuth, Calendar API, Maps Platform) use the same project.

#### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Create new project: "Koordi App"
3. Note Project ID

#### Step 2: Enable APIs

Navigate to **APIs & Services > Library**, enable:
- [x] Google+ API (for OAuth user info)
- [x] Google Calendar API
- [x] Geocoding API
- [x] Directions API
- [x] Distance Matrix API

#### Step 3: Create OAuth 2.0 Credentials

1. **APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID**
2. **Application Type:** Web application
3. **Name:** "Koordi Web App"
4. **Authorized JavaScript origins:**
   - `http://localhost:3000` (development)
   - `https://api.koordi.app` (production)
5. **Authorized redirect URIs:**
   - `http://localhost:3000/api/auth/google/callback` (development)
   - `https://api.koordi.app/api/auth/google/callback` (production)
6. Click **Create**
7. Copy **Client ID** → `GOOGLE_CLIENT_ID`
8. Copy **Client Secret** → `GOOGLE_CLIENT_SECRET`

#### Step 4: Configure OAuth Consent Screen

1. **APIs & Services > OAuth consent screen**
2. **User Type:** External
3. **App name:** "Koordi"
4. **User support email:** your-email@example.com
5. **Developer contact:** your-email@example.com
6. **Scopes:** Add the following:
   - `userinfo.email`
   - `userinfo.profile`
   - `calendar` (full access to Google Calendar)
7. **Test users:** Add your Google accounts for testing
8. **Publishing status:** Testing (initially), then submit for verification

#### Step 5: Create API Key (Google Maps)

1. **APIs & Services > Credentials > Create Credentials > API Key**
2. Copy key → `GOOGLE_MAPS_API_KEY`
3. Click **Restrict Key**:
   - **API restrictions:** Select:
     - Geocoding API
     - Directions API
     - Distance Matrix API
   - **Application restrictions (optional):**
     - HTTP referrers: `https://koordi.app/*`
     - IP addresses: Your server IPs

#### Step 6: Set Up Billing

Google Maps Platform requires billing account (free tier: $200/month credit).

1. **Billing > Link a billing account**
2. Enable billing for the project
3. Monitor usage: **APIs & Services > Dashboard**

**Cost Optimization:**
- Cache geocoding results (24-hour TTL)
- Batch requests where possible
- Use Distance Matrix API efficiently

---

### Redis Setup

#### Development: Local Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis
```

**Connection:**
```env
REDIS_URL="redis://localhost:6379"
```

#### Production: Managed Redis

**AWS ElastiCache:**
1. Create Redis cluster (6.x or 7.x)
2. Note endpoint: `master.abc123.cache.amazonaws.com:6379`
3. Configure security group to allow access from backend servers
4. Connection:
```env
REDIS_URL="redis://master.abc123.cache.amazonaws.com:6379"
```

**Google Cloud Memorystore:**
1. Create Redis instance
2. Note IP address and port
3. Connection:
```env
REDIS_URL="redis://<ip>:6379"
```

**Redis Cloud (redis.com):**
1. Create free account
2. Create database
3. Copy connection string:
```env
REDIS_URL="redis://:password@redis-12345.cloud.redislabs.com:12345"
```

---

## SECURITY BEST PRACTICES

### 1. Never Commit Secrets

**.gitignore:**
```gitignore
.env
.env.local
.env.*.local
*.p8
google-services.json
```

**Always commit:** `.env.example` (without real values)

---

### 2. Use Secrets Managers in Production

**AWS Secrets Manager Example:**

```typescript
// src/config/secrets.ts
import { SecretsManager } from 'aws-sdk';

const secretsManager = new SecretsManager({ region: 'us-east-1' });

export async function getSecret(secretName: string): Promise<string> {
  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  return data.SecretString!;
}

// Load at startup
const jwtSecret = await getSecret('koordi/jwt-secret');
const encryptionKey = await getSecret('koordi/encryption-key');
```

**Environment Variable:**
```env
# Instead of actual secrets, reference secret names
JWT_SECRET_ARN="arn:aws:secretsmanager:us-east-1:123456789:secret:koordi/jwt-secret"
```

---

### 3. Rotate Secrets Regularly

| Secret | Rotation Frequency | Impact |
|--------|-------------------|--------|
| JWT_SECRET | 90 days | All users logged out |
| ENCRYPTION_KEY | Never (or migrate) | Requires re-encryption |
| GOOGLE_CLIENT_SECRET | On compromise | Requires OAuth re-configuration |
| GOOGLE_MAPS_API_KEY | On compromise | Update environment only |
| Database passwords | 90 days | Brief downtime during rotation |

---

### 4. Principle of Least Privilege

**Google Cloud IAM:**
- Create service account for backend
- Grant only necessary API permissions
- Use separate keys for development/production

**AWS IAM:**
- Assign minimal IAM roles to EC2/Lambda
- Use instance roles instead of access keys
- Separate roles for development/staging/production

---

### 5. Validate Configuration at Startup

**Status:** PARTIALLY IMPLEMENTED

The only configuration validation at startup is for `ENCRYPTION_KEY`:

```typescript
// src/utils/encryption.ts
function validateEncryptionKey(): void {
  if (!ENCRYPTION_KEY) {
    console.error('CRITICAL: ENCRYPTION_KEY environment variable is not set');
    return;
  }

  if (ENCRYPTION_KEY.length !== 64) {
    console.error(`CRITICAL: ENCRYPTION_KEY must be exactly 64 characters`);
    return;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
    console.error('CRITICAL: ENCRYPTION_KEY must be a valid hexadecimal string');
    return;
  }

  console.log('✓ ENCRYPTION_KEY validated successfully');
}

// Validated on module load
validateEncryptionKey();
```

**Not Implemented:**
- Centralized Joi-based validation
- Startup health checks for database, Redis, Google APIs

---

## CONFIGURATION VALIDATION

### Current Validation

The application validates configuration minimally:

1. **ENCRYPTION_KEY:** Validated at module load in `src/utils/encryption.ts`
2. **Google OAuth:** Checked at runtime when creating OAuth client in `src/utils/googleCalendarClient.ts`

```typescript
// src/utils/googleCalendarClient.ts
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new ConfigurationError('Google OAuth credentials not configured', {
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  });
}
```

### Health Check Endpoint

A basic health check endpoint is available:

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

**Note:** This endpoint does not verify database, Redis, or external API connectivity.

---

## SUMMARY CHECKLIST

### Initial Setup
- [ ] Copy `backend/.env.example` to `backend/.env`
- [ ] Copy `frontend/.env.example` to `frontend/.env`
- [ ] Configure `DATABASE_URL` (see [DATABASE_SETUP.md](./DATABASE_SETUP.md))
- [ ] Generate `JWT_SECRET` (`openssl rand -base64 32`)
- [ ] Generate `ENCRYPTION_KEY` (`openssl rand -hex 32`)
- [ ] Create Google Cloud Project and enable APIs
- [ ] Create OAuth 2.0 credentials → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Set `GOOGLE_REDIRECT_URI` to match callback URL
- [ ] Create Google Maps API key → `GOOGLE_MAPS_API_KEY` (backend), `VITE_GOOGLE_MAPS_API_KEY` (frontend)
- [ ] Install and start Redis → `REDIS_URL`
- [ ] Set `FRONTEND_URL` to React dev server (e.g., `http://localhost:5173`)
- [ ] Set `VITE_API_URL` in frontend to backend URL (e.g., `http://localhost:3000/api`)
- [ ] Run `npm install` in both backend and frontend directories

### Implemented Features
- [x] Environment variable loading via `dotenv`
- [x] ENCRYPTION_KEY validation at module load
- [x] Google OAuth credential validation at runtime
- [x] Basic health check endpoint (`/api/health`)
- [x] CORS configuration via `FRONTEND_URL`
- [x] WebSocket on same server as HTTP API
- [x] Email (optional, via SMTP_* variables)
- [x] Rate limiting for invitation routes (hardcoded values)

### Not Yet Implemented
- [ ] Centralized config object (variables accessed directly via `process.env`)
- [ ] Joi-based configuration validation
- [ ] Startup health checks (database, Redis, Google APIs)
- [ ] Configurable background job intervals
- [ ] Configurable rate limiting variables
- [ ] Structured logging with configurable levels
- [ ] File storage (local or S3)
- [ ] Feature flags
- [ ] Push notifications
- [ ] Analytics/monitoring integration (Sentry, PostHog)

---

**Next Steps:** Proceed to [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md) for complete development environment setup instructions.
