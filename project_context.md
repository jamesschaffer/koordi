# Koordi - Project Context

## Overview

Koordi is a family scheduling assistant designed to help parents coordinate kids' activities. It imports events from ICS calendar feeds (TeamSnap, school calendars, sports leagues), allows parents to assign responsibility for events, calculates drive times, and syncs everything to Google Calendar.

## Current State

**Status:** In active development, production infrastructure deployed

**Last Updated:** January 28, 2025

### What's Built and Working

**Backend (Node.js + Express + TypeScript)**
- REST API with full CRUD operations for calendars, events, users, children
- Google OAuth authentication with encrypted token storage
- ICS feed parsing and sync (automatic every 5 minutes)
- Cancelled event detection (STATUS:CANCELLED and [CANCELED] prefix)
- Google Calendar sync (one-way: Koordi to Google Calendar)
- Multi-user calendar membership and sharing
- Drive time calculation via Google Maps API
- Supplemental event generation (departure/arrival times)
- WebSocket support for real-time updates

**Frontend (React + TypeScript + Vite)**
- Dashboard showing all events across calendars
- Calendar management (add, edit, delete ICS calendars)
- Event assignment workflow
- "Not Attending" and "Cancelled" status display
- Conflict detection visualization
- Google OAuth login flow
- Real-time updates via WebSocket

**Infrastructure**
- Production: Google Cloud Run (frontend + backend)
- Database: Neon (serverless PostgreSQL, us-east-1)
- Cache: Google Memory Store (Redis)
- CI/CD: GitHub Actions

### Recent Changes (January 2025)

1. **Cancelled Event Detection Feature**
   - Detects `STATUS:CANCELLED` property in ICS
   - Detects `[CANCELED]`/`[CANCELLED]` prefix in event titles
   - Automatically unassigns and removes from Google Calendars
   - Shows grey "Cancelled" badge in frontend

2. **Database Migration to Neon**
   - Moved from Google Cloud SQL to Neon serverless PostgreSQL
   - Reduced costs for low-traffic workloads
   - Built-in connection pooling via pooler endpoint

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│    Backend      │────▶│     Neon        │
│  (Cloud Run)    │     │  (Cloud Run)    │     │  (PostgreSQL)   │
│  React + Vite   │     │  Express + TS   │     │   us-east-1     │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │  Google   │ │  Google   │ │   Redis   │
            │ Calendar  │ │   Maps    │ │  (Cache)  │
            │   API     │ │   API     │ │           │
            └───────────┘ └───────────┘ └───────────┘
```

### Key Data Flow

1. **ICS Sync (every 5 minutes)**
   - Fetch ICS feeds for all enabled calendars
   - Parse events, detect new/updated/deleted/cancelled
   - Update database
   - Sync changes to all members' Google Calendars

2. **Event Assignment**
   - User assigns event to themselves or another member
   - Calculate drive times from assignee's home
   - Create supplemental events (departure, arrival)
   - Update all Google Calendars with assignment info

3. **Google Calendar Sync**
   - One-way sync: Koordi is source of truth
   - Each user has their own Google Event IDs
   - Tracked via `UserGoogleEventSync` table

## Features

### Core Features
- Import events from ICS calendar feeds
- Assign events to family members
- Calculate drive times with traffic
- Sync to Google Calendar
- Real-time updates across devices

### Event Statuses
- **Unassigned**: No one has claimed responsibility
- **Assigned**: A specific parent is handling this event
- **Not Attending**: Family is skipping this event
- **Cancelled**: Event was cancelled by the organizer (detected from ICS)

### User Settings
- Home address (for drive time calculations)
- Comfort buffer (extra time before events)
- Keep supplemental events (see other family members' drive times)
- Google Calendar sync enabled/disabled

## Known Issues / Technical Debt

1. **Timezone Handling**: Currently hardcoded to `America/Los_Angeles`. Should use user's timezone.

2. **Recurring Events**: Not expanded - relies on ICS feeds pre-expanding recurring events.

3. **Rate Limiting**: Google Calendar API quota management not fully implemented.

4. **Error Recovery**: Partial sync failures don't have robust retry logic.

5. **Testing**: Unit and integration test coverage is incomplete.

## Future Considerations

### Near-Term
- User timezone support
- Improved error handling and retry logic
- Test coverage improvement
- Push notifications for critical changes

### Medium-Term
- Mobile app (React Native)
- Bidirectional Google Calendar sync
- Shared event notes/comments
- Carpool coordination

### Long-Term
- AI-powered scheduling suggestions
- Integration with school portals
- Multi-family event coordination

## Development Setup

See [docs/DEVELOPMENT_SETUP.md](/docs/DEVELOPMENT_SETUP.md) for full setup instructions.

**Quick Start:**
```bash
# Clone and install
git clone https://github.com/your-org/koordi.git
cd koordi

# Start all services
./scripts/start-dev.sh
```

**Environment Variables:**
- Backend: See `backend/.env.example`
- Frontend: See `frontend/.env.example`

## Documentation Index

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Quick start and overview |
| [DECISIONS.md](DECISIONS.md) | Technical decision log |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Environment variables |
| [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md) | Database setup guide |
| [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) | Google OAuth flow |
| [docs/API_SPECIFICATION.md](docs/API_SPECIFICATION.md) | REST API reference |
| [docs/ICS_PARSING_SPECIFICATION.md](docs/ICS_PARSING_SPECIFICATION.md) | ICS feed parsing |
| [docs/GOOGLE_CALENDAR_INTEGRATION.md](docs/GOOGLE_CALENDAR_INTEGRATION.md) | Google Calendar sync |
| [docs/EVENT_CHANGE_FLOW.md](docs/EVENT_CHANGE_FLOW.md) | How ICS changes are handled |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature specifications |
| [docs/deployment-plan.md](docs/deployment-plan.md) | Production deployment guide |
| [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md) | Pre-deployment checklist |

## Team / Contact

For questions about this project, contact the project owner or review the documentation above.
