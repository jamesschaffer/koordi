# Port Configuration Guide

## Problem
The application has experienced recurring CORS issues due to port mismatches between frontend and backend configurations.

## Root Cause
- **Frontend** port is hardcoded in `frontend/vite.config.ts` (port 5173)
- **Backend** CORS configuration uses `FRONTEND_URL` from `backend/.env`
- When these don't match, CORS blocks all API requests

## Correct Configuration

### Frontend (Hardcoded)
**File**: `frontend/vite.config.ts`
```typescript
server: {
  port: 5173,  // DO NOT CHANGE without updating backend
}
```

### Backend (Environment Variable)
**File**: `backend/.env`
```bash
FRONTEND_URL=http://localhost:5173  # MUST match vite.config.ts
```

## Validation

Before starting development, run:
```bash
cd backend
npm run validate-ports
```

This will check if ports are aligned and fail with a helpful error if they're not.

## Development Workflow

### Option 1: Start with Validation (Recommended)
```bash
cd backend
npm run dev:check  # Validates ports then starts server
```

### Option 2: Manual Start
```bash
# Terminal 1 - Backend
cd backend
npm run validate-ports  # Check first
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## If You See CORS Errors

1. **Check the error message** - it will show the mismatched ports
2. **Run validation**: `cd backend && npm run validate-ports`
3. **Fix backend/.env** to match the port in `frontend/vite.config.ts`
4. **Restart backend** server

## Changing Ports (If Needed)

If you must change the frontend port:

1. Update `frontend/vite.config.ts` server port
2. Update `backend/.env` FRONTEND_URL
3. Update `backend/.env.example` FRONTEND_URL (for other developers)
4. Run `npm run validate-ports` to confirm
5. Commit both changes together

## Why Not Use Environment Variables for Frontend Port?

Vite's port configuration doesn't support environment variables in `vite.config.ts` effectively. Hardcoding provides:
- Predictable behavior
- Faster startup (no env parsing)
- Single source of truth for frontend

The backend is configured to match the frontend, not vice versa.

## Automated Checks

The validation script (`scripts/validate-ports.sh`) runs automatically in CI/CD to prevent deployment with mismatched ports.
