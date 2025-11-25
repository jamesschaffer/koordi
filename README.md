# Koordi

Family scheduling assistant for coordinating kids' events between parents.

## Quick Start

### Start Development Environment

```bash
./scripts/start-dev.sh
```

This starts all services:
| Service | URL | Port |
|---------|-----|------|
| Backend API | http://localhost:3000 | 3000 |
| Frontend App | http://localhost:5173 | 5173 |
| Marketing Site | http://localhost:8080 | 8080 |

Press `Ctrl+C` to stop all services.

### Start Services Individually

```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev

# Marketing Site
cd marketing-site && python3 -m http.server 8080
```

## Project Structure

```
koordi/
├── backend/           # Node.js + Express + Prisma API
├── frontend/          # React + Vite + TypeScript app
├── marketing-site/    # Static landing page
├── scripts/           # Development scripts
└── docs/              # Documentation
```

## Documentation

- [Development Setup](docs/DEVELOPMENT_SETUP.md) - Full setup guide
- [API Specification](docs/API_SPECIFICATION.md) - REST API docs
- [Authentication](docs/AUTHENTICATION.md) - Google OAuth flow
- [Configuration](docs/CONFIGURATION.md) - Environment variables

## Tech Stack

**Backend:** Node.js, Express, Prisma, PostgreSQL, Redis, Socket.IO
**Frontend:** React, TypeScript, Vite, TanStack Query, Tailwind CSS, shadcn/ui
**APIs:** Google Calendar, Google Maps (Geocoding, Distance Matrix, Places)
