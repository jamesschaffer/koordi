# Development Setup Guide
## Koordi

**Purpose:** Complete instructions to set up a local development environment from scratch
**Time Estimate:** 30-60 minutes

---

## TABLE OF CONTENTS
1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Backend Setup](#backend-setup)
4. [Frontend Setup](#frontend-setup)
5. [Database Setup](#database-setup)
6. [External Services Setup](#external-services-setup)
7. [Running the Application](#running-the-application)
8. [Development Tools](#development-tools)
9. [Common Development Tasks](#common-development-tasks)
10. [Troubleshooting](#troubleshooting)

---

## PREREQUISITES

### Required Software

| Software | Version | Installation |
|----------|---------|--------------|
| **Node.js** | 20 LTS | https://nodejs.org |
| **npm** | 9+ | Included with Node.js |
| **PostgreSQL** | 15+ | https://www.postgresql.org/download/ |
| **Redis** | 7+ | https://redis.io/download |
| **Git** | Latest | https://git-scm.com/downloads |

### Recommended Tools

| Tool | Purpose | Installation |
|------|---------|--------------|
| **VS Code** | Code editor | https://code.visualstudio.com/ |
| **Postman** | API testing | https://www.postman.com/downloads/ |
| **Prisma Studio** | Database browser | Included with Prisma |
| **Redis Insight** | Redis GUI | https://redis.com/redis-enterprise/redis-insight/ |

### VS Code Extensions (Recommended)

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "orta.vscode-jest"
  ]
}
```

Save as `.vscode/extensions.json` in project root.

---

## PROJECT STRUCTURE

```
/koordi
├── backend/                    # Node.js + Express backend
│   ├── src/
│   │   ├── routes/            # API route handlers
│   │   ├── middleware/        # Auth, validation, error handling
│   │   ├── services/          # Business logic
│   │   ├── jobs/              # Background jobs (Bull Queue)
│   │   ├── utils/             # Helper functions
│   │   ├── config/            # Configuration
│   │   └── index.ts           # Server entry point
│   ├── tests/                 # Backend tests (Vitest)
│   ├── prisma/                # Prisma schema and migrations
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                   # React + TypeScript frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utilities (API client, auth)
│   │   ├── types/             # TypeScript types
│   │   └── main.tsx           # Entry point
│   ├── public/                # Static assets
│   ├── tests/                 # Frontend tests (Vitest)
│   ├── e2e/                   # E2E tests (Playwright)
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── mobile/                     # Capacitor mobile configuration
│   ├── android/               # Android project
│   ├── ios/                   # iOS project
│   └── capacitor.config.ts
│
├── docs/                       # Documentation (this file!)
│   ├── API_SPECIFICATION.md
│   ├── DATABASE_SETUP.md
│   ├── AUTHENTICATION.md
│   └── ...
│
├── .env.example               # Environment variables template
├── .gitignore
├── README.md
└── package.json               # Root package.json (optional monorepo)
```

---

## BACKEND SETUP

### Step 1: Initialize Backend Project

```bash
# Navigate to project root
cd koordi

# Create backend directory
mkdir backend
cd backend

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express prisma @prisma/client jsonwebtoken bcrypt googleapis ical.js socket.io bull redis cors helmet express-rate-limit dotenv

# Install dev dependencies
npm install -D typescript @types/node @types/express @types/jsonwebtoken @types/bcrypt @types/cors ts-node nodemon vitest supertest @types/supertest eslint prettier
```

### Step 2: Configure TypeScript

Create `backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Step 3: Configure Package Scripts

Update `backend/package.json`:

```json
{
  "name": "koordi-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "prisma:seed": "ts-node prisma/seed.ts",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\""
  }
}
```

### Step 4: Create Directory Structure

```bash
# From backend directory
mkdir -p src/{routes,middleware,services,jobs,utils,config}
mkdir tests
mkdir prisma
```

### Step 5: Set Up Prisma

```bash
# Initialize Prisma
npx prisma init

# This creates:
# - prisma/schema.prisma
# - .env (with DATABASE_URL placeholder)
```

Copy the schema from `prisma/schema.prisma` (created earlier in Phase 1).

### Step 6: Create Basic Server

Create `backend/src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.get('/api', (req, res) => {
  res.json({ message: 'Koordi API' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
```

### Step 7: Configure Nodemon

Create `backend/nodemon.json`:

```json
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "ts-node src/index.ts",
  "env": {
    "NODE_ENV": "development"
  }
}
```

---

## FRONTEND SETUP

### Step 1: Create React + Vite Project

```bash
# From project root
cd koordi

# Create Vite project
npm create vite@latest frontend -- --template react-ts

cd frontend

# Install dependencies
npm install

# Install additional dependencies
npm install @tanstack/react-query react-router-dom socket.io-client @capacitor/core @capacitor/ios @capacitor/android

# Install UI dependencies
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Install dev dependencies
npm install -D vitest @testing-library/react @testing-library/jest-dom @playwright/test
```

### Step 2: Configure Tailwind CSS

Update `frontend/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#10B981',
      },
    },
  },
  plugins: [],
}
```

Update `frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 3: Configure Vite

Update `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});
```

### Step 4: Configure Package Scripts

Update `frontend/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src --ext ts,tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\""
  }
}
```

### Step 5: Create Directory Structure

```bash
# From frontend directory
mkdir -p src/{components,pages,hooks,lib,types}
mkdir tests
mkdir e2e
```

### Step 6: Set Up React Query

Create `frontend/src/main.tsx`:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

---

## DATABASE SETUP

### Step 1: Install PostgreSQL

**macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-15 postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download installer from https://www.postgresql.org/download/windows/

### Step 2: Create Database and User

```bash
# Connect to PostgreSQL
psql postgres

# Run these SQL commands:
CREATE DATABASE koordi_dev;
CREATE USER koordi_user WITH PASSWORD 'dev_password_123';
GRANT ALL PRIVILEGES ON DATABASE koordi_dev TO koordi_user;

# PostgreSQL 15+ requires schema privileges
\c koordi_dev
GRANT ALL ON SCHEMA public TO koordi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO koordi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO koordi_user;

# Exit
\q
```

### Step 3: Configure Environment Variables

Create `backend/.env`:

```env
DATABASE_URL="postgresql://koordi_user:dev_password_123@localhost:5432/koordi_dev?schema=public"

# Copy other variables from .env.example (see CONFIGURATION.md)
```

### Step 4: Run Migrations

```bash
# From backend directory
cd backend

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed database with test data
npx prisma db seed

# Open Prisma Studio to view data
npx prisma studio
```

**Expected Output:**
```
✔ Generated Prisma Client
✔ Applied migration: 20240101000000_init
✔ Seeded database with test data
```

Open Prisma Studio at http://localhost:5555 to verify data.

For more details, see [DATABASE_SETUP.md](./DATABASE_SETUP.md).

---

## EXTERNAL SERVICES SETUP

### Redis Setup

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis

# Test connection
redis-cli ping
# Should return: PONG
```

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis

# Test connection
redis-cli ping
```

**Windows:**
Use WSL or download from https://redis.io/download

**Environment Variable:**
```env
REDIS_URL="redis://localhost:6379"
```

### Google Cloud Platform Setup

Follow the complete setup in [CONFIGURATION.md](./CONFIGURATION.md#third-party-service-setup).

**Quick Start:**

1. **Create Project:** https://console.cloud.google.com
2. **Enable APIs:**
   - Google+ API
   - Google Calendar API
   - Geocoding API
   - Directions API
   - Distance Matrix API
3. **Create OAuth 2.0 Credentials:**
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
   - Copy Client ID and Secret to `.env`
4. **Create API Key:**
   - Restrict to Maps APIs
   - Copy to `.env` as `GOOGLE_MAPS_API_KEY`

### Generate Secrets

```bash
# Generate JWT_SECRET (32+ characters)
openssl rand -base64 32

# Generate ENCRYPTION_KEY (64 hex characters)
openssl rand -hex 32
```

Add to `backend/.env`:

```env
JWT_SECRET="<generated-jwt-secret>"
ENCRYPTION_KEY="<generated-encryption-key>"
```

---

## RUNNING THE APPLICATION

### Terminal 1: Backend

```bash
cd backend
npm run dev
```

**Expected Output:**
```
🚀 Server running on http://localhost:3000
```

**Test Health Endpoint:**
```bash
curl http://localhost:3000/health
```

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

**Expected Output:**
```
  VITE v4.x.x  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open http://localhost:5173 in your browser.

### Terminal 3: Prisma Studio (Optional)

```bash
cd backend
npx prisma studio
```

Open http://localhost:5555 to browse database.

### Terminal 4: Redis Insight (Optional)

Install Redis Insight: https://redis.com/redis-enterprise/redis-insight/

Connect to `redis://localhost:6379` to browse Redis data.

---

## DEVELOPMENT TOOLS

### ESLint Configuration

Create `backend/.eslintrc.json`:

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "env": {
    "node": true,
    "es2022": true
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off"
  }
}
```

Create `frontend/.eslintrc.json`:

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint", "react", "react-hooks"],
  "env": {
    "browser": true,
    "es2022": true
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  },
  "rules": {
    "react/react-in-jsx-scope": "off"
  }
}
```

### Prettier Configuration

Create `.prettierrc` in project root:

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### Git Hooks (Husky)

```bash
# From project root
npm install -D husky lint-staged

# Initialize Husky
npx husky init

# Create pre-commit hook
echo "npx lint-staged" > .husky/pre-commit
```

Create `.lintstagedrc.json`:

```json
{
  "*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write"
  ]
}
```

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "prisma.fileWatcher": true
}
```

---

## COMMON DEVELOPMENT TASKS

### Creating a New API Endpoint

1. **Define route handler:**

```typescript
// backend/src/routes/events.ts
import { Router } from 'express';
import { authenticateJWT } from '../middleware/authenticate';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticateJWT, async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        event_calendar: {
          members: {
            some: {
              user_id: req.user!.id,
              status: 'accepted',
            },
          },
        },
      },
      include: {
        event_calendar: {
          select: { name: true, child: true },
        },
        assigned_to: {
          select: { id: true, name: true },
        },
      },
      orderBy: { start_time: 'asc' },
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;
```

2. **Register route in main server:**

```typescript
// backend/src/index.ts
import eventRoutes from './routes/events';

app.use('/api/events', eventRoutes);
```

3. **Test with curl:**

```bash
# Get JWT token first (via OAuth flow or test token)
TOKEN="your-jwt-token"

curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/events
```

### Adding a New Database Migration

1. **Modify Prisma schema:**

```prisma
// Add field to User model
model User {
  // ... existing fields
  timezone String @default("America/Los_Angeles") @db.VarChar(50)
}
```

2. **Create and apply migration:**

```bash
npx prisma migrate dev --name add_timezone_to_user

# Review generated SQL in prisma/migrations/<timestamp>_add_timezone_to_user/migration.sql
```

3. **Update seed data (if needed):**

```typescript
// prisma/seed.ts
const user = await prisma.user.create({
  data: {
    email: 'test@example.com',
    name: 'Test User',
    timezone: 'America/New_York', // New field
  },
});
```

### Running Tests

**Backend Unit Tests:**
```bash
cd backend
npm test

# With coverage
npm run test:coverage
```

**Frontend Unit Tests:**
```bash
cd frontend
npm test
```

**E2E Tests:**
```bash
cd frontend
npm run test:e2e

# With UI
npx playwright test --ui
```

### Debugging

**Backend (VS Code):**

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/backend",
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    }
  ]
}
```

Set breakpoints in VS Code and press F5.

**Frontend (Browser DevTools):**

1. Open http://localhost:5173 in Chrome/Firefox
2. Open DevTools (F12)
3. Use React DevTools extension for component debugging

### Viewing Logs

**Backend Logs:**
```bash
# In terminal running backend
# Logs appear in console
```

**Database Queries (Prisma):**
```typescript
// Enable query logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
```

**Redis Logs:**
```bash
# Monitor Redis commands
redis-cli monitor
```

---

## TROUBLESHOOTING

### Issue: Port Already in Use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

---

### Issue: Database Connection Failed

**Error:**
```
Error: P1003: Database koordi_dev does not exist
```

**Solution:**
```bash
# Verify PostgreSQL is running
pg_isready

# Create database manually
psql postgres -c "CREATE DATABASE koordi_dev;"

# Verify DATABASE_URL in .env
cat backend/.env | grep DATABASE_URL
```

---

### Issue: Redis Connection Failed

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:**
```bash
# Start Redis
brew services start redis  # macOS
sudo systemctl start redis  # Linux

# Test connection
redis-cli ping
```

---

### Issue: Prisma Client Out of Sync

**Error:**
```
Error: @prisma/client did not initialize yet
```

**Solution:**
```bash
cd backend
npx prisma generate
npm run dev
```

---

### Issue: Google OAuth "Redirect URI Mismatch"

**Error:**
```
Error 400: redirect_uri_mismatch
```

**Solution:**
1. Go to Google Cloud Console > Credentials
2. Edit OAuth 2.0 Client
3. Add `http://localhost:3000/api/auth/google/callback` to Authorized redirect URIs
4. Save and wait 5 minutes for changes to propagate

---

### Issue: TypeScript Compilation Errors

**Error:**
```
error TS2307: Cannot find module '@prisma/client'
```

**Solution:**
```bash
cd backend
npx prisma generate
npm install
```

---

### Issue: Vite HMR Not Working

**Symptoms:** Changes not reflecting in browser

**Solution:**
```bash
# Clear Vite cache
cd frontend
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

---

### Issue: Permission Denied (PostgreSQL)

**Error:**
```
ERROR: permission denied for schema public
```

**Solution:**
```bash
psql koordi_dev -U postgres
GRANT ALL ON SCHEMA public TO koordi_user;
\q
```

---

## SUMMARY CHECKLIST

### Initial Setup
- [ ] Node.js 20 LTS installed
- [ ] PostgreSQL 15+ installed and running
- [ ] Redis 7+ installed and running
- [ ] Git installed
- [ ] VS Code installed (recommended)

### Backend Setup
- [ ] Backend directory created
- [ ] Dependencies installed (`npm install`)
- [ ] TypeScript configured (`tsconfig.json`)
- [ ] Prisma schema created
- [ ] Database created and migrated (`npx prisma migrate dev`)
- [ ] Seed data loaded (`npx prisma db seed`)
- [ ] Environment variables configured (`.env`)
- [ ] Server starts successfully (`npm run dev`)

### Frontend Setup
- [ ] Frontend directory created with Vite
- [ ] Dependencies installed
- [ ] Tailwind CSS configured
- [ ] Vite proxy configured for API
- [ ] React Query set up
- [ ] App starts successfully (`npm run dev`)

### External Services
- [ ] Google Cloud Project created
- [ ] APIs enabled (OAuth, Calendar, Maps)
- [ ] OAuth credentials created
- [ ] API key created
- [ ] Credentials added to `.env`

### Development Tools
- [ ] ESLint configured
- [ ] Prettier configured
- [ ] Git hooks set up (optional)
- [ ] VS Code extensions installed

### Testing
- [ ] Health endpoint responds: `curl http://localhost:3000/health`
- [ ] Frontend loads: http://localhost:5173
- [ ] Prisma Studio opens: http://localhost:5555
- [ ] Can create test user and view in database

---

## NEXT STEPS

1. **Review Architecture:** Read [PROJECT_CONTEXT.MD](./PROJECT_CONTEXT.MD)
2. **Implement Authentication:** Follow [AUTHENTICATION.md](./AUTHENTICATION.md)
3. **Create API Endpoints:** Refer to [API_SPECIFICATION.md](./API_SPECIFICATION.md)
4. **Set Up Background Jobs:** Follow Phase 2 documentation (coming next)
5. **Integrate Google Services:** Follow Phase 3 documentation (coming next)

---

**Questions?** See the troubleshooting section above or create an issue in the project repository.
