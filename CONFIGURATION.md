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
```typescript
// src/config/index.ts
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL!,
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  },
  // ... more config
};

// Validate required variables at startup
function validateConfig() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'GOOGLE_MAPS_API_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateConfig();
```

**Frontend (Vite):**
```typescript
// src/config.ts
// Vite only exposes variables prefixed with VITE_
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  // ... more config
};
```

**Frontend .env:**
```env
VITE_API_URL=http://localhost:3000
VITE_GOOGLE_MAPS_API_KEY=your-key-here
VITE_WEBSOCKET_URL=http://localhost:3001
```

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
**Purpose:** AES-256-GCM key for encrypting Google refresh tokens in database
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

#### WEBSOCKET_PORT
**Default:** Same as `PORT`

```env
WEBSOCKET_PORT=3001
```

Use separate port if running Socket.io on different process.

#### WEBSOCKET_CORS_ORIGIN
**Default:** `FRONTEND_URL`

```env
WEBSOCKET_CORS_ORIGIN="http://localhost:5173,https://staging.koordi.app"
```

Comma-separated list of allowed WebSocket origins.

---

### Email Configuration (Optional)

For sending invitation emails.

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
SMTP_FROM="Koordi <noreply@koordi.app>"
```

**Gmail Setup:**
1. Enable 2-factor authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use App Password as `SMTP_PASSWORD`

**Alternative Services:**
- SendGrid: `SMTP_HOST=smtp.sendgrid.net`, `SMTP_USER=apikey`, `SMTP_PASSWORD=<api_key>`
- Mailgun: `SMTP_HOST=smtp.mailgun.org`, `SMTP_USER=<username>`, `SMTP_PASSWORD=<password>`
- AWS SES: `SMTP_HOST=email-smtp.us-east-1.amazonaws.com`, use IAM credentials

---

### Push Notifications (Mobile)

#### Firebase Cloud Messaging (Android)

```env
FIREBASE_SERVER_KEY="your-firebase-server-key"
```

**Setup:**
1. Create Firebase project: https://console.firebase.google.com
2. Add Android app to project
3. Download `google-services.json`
4. Get Server Key from Project Settings > Cloud Messaging

#### Apple Push Notification Service (iOS)

```env
APNS_KEY_ID="ABC123XYZ"
APNS_TEAM_ID="DEF456UVW"
APNS_BUNDLE_ID="com.koordi.app"
APNS_PRIVATE_KEY_PATH="./certs/apns-key.p8"
```

**Setup:**
1. Apple Developer Account: https://developer.apple.com
2. Certificates, Identifiers & Profiles > Keys
3. Create APNs Key (download .p8 file)
4. Note Key ID and Team ID

---

### Analytics & Monitoring

#### PostHog (Product Analytics)

```env
POSTHOG_API_KEY="phc_abc123def456ghi789"
POSTHOG_HOST="https://app.posthog.com"
```

**Setup:** Create account at https://posthog.com

#### Sentry (Error Tracking)

```env
SENTRY_DSN="https://abc123@o456789.ingest.sentry.io/1234567"
```

**Setup:** Create project at https://sentry.io

---

### Background Jobs

```env
ICS_SYNC_INTERVAL_HOURS=4
TRAFFIC_CHECK_INTERVAL_MINUTES=60
GOOGLE_TOKEN_REFRESH_INTERVAL_DAYS=7
```

**Defaults:**
- ICS sync: Every 4 hours per calendar
- Traffic check: Every 60 minutes for events in next 48 hours
- Google token refresh: Every 7 days

---

### Rate Limiting

```env
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_AUTH=5        # 5 auth attempts per window
RATE_LIMIT_MAX_API=100       # 100 API requests per window
```

---

### Logging

```env
LOG_LEVEL=info
LOG_FORMAT=json
```

**LOG_LEVEL Options:**
- `error`: Only errors
- `warn`: Warnings and errors
- `info`: General info, warnings, errors (recommended production)
- `debug`: Verbose debug logs (development only)

**LOG_FORMAT Options:**
- `json`: Structured JSON logs (recommended for production, log aggregation)
- `pretty`: Human-readable colored logs (development)

---

### File Storage

```env
# Local Storage (Development)
STORAGE_TYPE=local
STORAGE_PATH=./uploads

# AWS S3 (Production)
STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=koordi-uploads
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**S3 Setup:**
1. Create S3 bucket
2. Create IAM user with S3 permissions
3. Generate access keys
4. Configure CORS on bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://koordi.app"],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

### Feature Flags

```env
FEATURE_GOOGLE_CALENDAR_SYNC=true
FEATURE_PUSH_NOTIFICATIONS=false
FEATURE_EMAIL_INVITATIONS=true
FEATURE_ANALYTICS=false
```

Enable/disable features without code changes.

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

```typescript
// src/config/validation.ts
import Joi from 'joi';

const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').required(),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  ENCRYPTION_KEY: Joi.string().length(64).hex().required(),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_REDIRECT_URI: Joi.string().uri().required(),
  GOOGLE_MAPS_API_KEY: Joi.string().required(),
  REDIS_URL: Joi.string().uri().required(),
  // ... more validations
});

export function validateConfig() {
  const { error } = configSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true, // Allow extra env vars
  });

  if (error) {
    const errors = error.details.map((d) => d.message).join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }
}
```

**Usage:**
```typescript
// src/index.ts
import { validateConfig } from './config/validation';

validateConfig();

// Start server
app.listen(config.port);
```

---

## CONFIGURATION VALIDATION

### Startup Checks

```typescript
// src/config/healthcheck.ts

export async function runStartupChecks() {
  console.log('Running startup health checks...');

  // 1. Database connection
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }

  // 2. Redis connection
  try {
    await redis.ping();
    console.log('✅ Redis connection successful');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    process.exit(1);
  }

  // 3. Google OAuth credentials
  try {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );
    console.log('✅ Google OAuth credentials configured');
  } catch (error) {
    console.error('❌ Google OAuth configuration failed:', error);
    process.exit(1);
  }

  // 4. Google Maps API key
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${config.google.mapsApiKey}`
    );
    if (response.ok) {
      console.log('✅ Google Maps API key valid');
    } else {
      throw new Error('API key invalid');
    }
  } catch (error) {
    console.error('❌ Google Maps API key failed:', error);
    process.exit(1);
  }

  console.log('All startup checks passed ✅');
}
```

---

## SUMMARY CHECKLIST

### Initial Setup
- [ ] Copy `.env.example` to `.env`
- [ ] Set `NODE_ENV` to `development`
- [ ] Configure `DATABASE_URL` (see [DATABASE_SETUP.md](./DATABASE_SETUP.md))
- [ ] Generate `JWT_SECRET` (`openssl rand -base64 32`)
- [ ] Generate `ENCRYPTION_KEY` (`openssl rand -hex 32`)
- [ ] Create Google Cloud Project and enable APIs
- [ ] Create OAuth 2.0 credentials → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Create Google Maps API key → `GOOGLE_MAPS_API_KEY`
- [ ] Install and start Redis → `REDIS_URL`
- [ ] Set `FRONTEND_URL` to React dev server
- [ ] Run `npm install` to install dependencies
- [ ] Run configuration validation (see above)
- [ ] Run startup health checks (see above)

### Production Deployment
- [ ] Store all secrets in secrets manager (AWS Secrets Manager, etc.)
- [ ] Set `NODE_ENV=production`
- [ ] Use production database with SSL (`sslmode=require`)
- [ ] Use managed Redis (ElastiCache, Memorystore)
- [ ] Configure production OAuth redirect URIs in Google Cloud Console
- [ ] Restrict Google Maps API key to production domains
- [ ] Enable rate limiting (`RATE_LIMIT_*` variables)
- [ ] Configure CORS for production domains
- [ ] Set up monitoring (Sentry, PostHog)
- [ ] Enable logging to log aggregation service
- [ ] Disable debug routes (`ENABLE_DEBUG_ROUTES=false`)
- [ ] Configure SSL/TLS certificates (if self-hosted)
- [ ] Set `TRUST_PROXY=true` if behind load balancer

---

**Next Steps:** Proceed to [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md) for complete development environment setup instructions.
