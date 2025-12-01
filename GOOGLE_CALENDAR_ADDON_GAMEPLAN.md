# Koordi Google Calendar Add-on: Strategic Implementation Plan

## Executive Summary

This document outlines a comprehensive strategy to transform Koordi from a standalone web application into a Google Calendar Add-on that appears in the right-hand sidebar panel. This will allow users to assign events to family members while viewing their calendar, creating a seamless workflow.

**Key Insight:** Google Calendar Add-ons use a **Card-based UI system** (not custom HTML/CSS), which means we cannot simply embed the existing React application. We must build a parallel interface using Google Apps Script and the Card Service API that communicates with your existing backend.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technical Constraints & Considerations](#2-technical-constraints--considerations)
3. [Implementation Phases](#3-implementation-phases)
4. [Phase 1: Foundation & Authentication](#phase-1-foundation--authentication)
5. [Phase 2: Core Functionality](#phase-2-core-functionality)
6. [Phase 3: Advanced Features](#phase-3-advanced-features)
7. [Phase 4: Testing & Quality Assurance](#phase-4-testing--quality-assurance)
8. [Phase 5: Marketplace Publication](#phase-5-marketplace-publication)
9. [Post-Launch Operations](#6-post-launch-operations)
10. [Risk Assessment & Mitigation](#7-risk-assessment--mitigation)
11. [Cost Considerations](#8-cost-considerations)
12. [Alternative Approaches](#9-alternative-approaches)
13. [Decision Points Requiring Your Input](#10-decision-points-requiring-your-input)

---

## 1. Architecture Overview

### Current Koordi Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Current System                            │
├─────────────────────────────────────────────────────────────┤
│  React Frontend (Vite)  ←→  Express Backend  ←→  PostgreSQL │
│         ↓                        ↓                          │
│    Google OAuth           Google Calendar API               │
│    Google Maps API        Google Maps API                   │
└─────────────────────────────────────────────────────────────┘
```

### Proposed Add-on Architecture
```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Google Calendar                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Right Sidebar Panel                              │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │               Google Apps Script Add-on                       │  │ │
│  │  │                    (Card Service UI)                          │  │ │
│  │  │                         │                                     │  │ │
│  │  │                    UrlFetchApp                                │  │ │
│  │  │                         │                                     │  │ │
│  │  └─────────────────────────┼─────────────────────────────────────┘  │ │
│  └────────────────────────────┼─────────────────────────────────────────┘ │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────┐
│              Existing Koordi Backend (Enhanced)              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  New Add-on API Endpoints                               ││
│  │  - /api/addon/auth/verify                               ││
│  │  - /api/addon/events                                    ││
│  │  - /api/addon/events/:id/assign                         ││
│  │  - /api/addon/calendars                                 ││
│  │  - /api/addon/family-members                            ││
│  └─────────────────────────────────────────────────────────┘│
│                           ↓                                  │
│                      PostgreSQL                              │
└─────────────────────────────────────────────────────────────┘
```

### Component Roles

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Add-on UI** | Google Apps Script + Card Service | Sidebar interface in Google Calendar |
| **Add-on Logic** | Google Apps Script | Handle user interactions, call backend |
| **Backend API** | Express.js (existing + new endpoints) | Business logic, database, Google APIs |
| **Database** | PostgreSQL (existing) | Store all application data |
| **Authentication** | Google OAuth + JWT | Unified auth across web & add-on |

---

## 2. Technical Constraints & Considerations

### Hard Constraints (Cannot Be Changed)

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| **No custom HTML/CSS** | Cannot reuse React components | Must rebuild UI with Card Service widgets |
| **No mobile support** | Add-on only works on desktop web | Users continue using mobile web app |
| **30-second execution limit** | Long operations will timeout | Optimize API calls, async patterns |
| **Fixed sidebar width** | Limited horizontal space | Design compact, vertical layouts |
| **Card-based navigation** | No traditional routing | Use card stack for multi-view flows |
| **No iframe embedding** | Cannot embed external content | All content via Card Service |
| **No drag-and-drop** | Cannot replicate some web UI patterns | Use selection-based assignment |

### Soft Constraints (Can Work Around)

| Constraint | Workaround |
|------------|------------|
| Limited widget types | Combine widgets creatively; use DecoratedText with icons |
| No real-time updates | Refresh button + smart caching |
| No complex forms | Multi-card wizard flows |
| Limited state management | Pass state via action parameters |

### What We Can Do

- Display lists of events with filtering
- Show event details with assignment dropdown
- Create selection inputs for assignees
- Navigate between views (calendars → events → details)
- Make API calls to your backend
- Use Google OAuth tokens for authentication
- Display conflict warnings
- Show success/error notifications
- Open external links (to full web app)

---

## 3. Implementation Phases

### Phase Overview

```
Phase 1: Foundation & Authentication (2-3 weeks development)
    ↓
Phase 2: Core Functionality (3-4 weeks development)
    ↓
Phase 3: Advanced Features (2-3 weeks development)
    ↓
Phase 4: Testing & QA (2 weeks)
    ↓
Phase 5: Marketplace Publication (1-2 weeks)
```

---

## Phase 1: Foundation & Authentication

### 1.1 Google Cloud Project Setup

**Tasks:**
1. Create a new Google Cloud Project (or use existing Koordi project)
2. Enable required APIs:
   - Google Workspace Add-ons API
   - Google Apps Script API
   - Google Calendar API (already enabled)
3. Configure OAuth consent screen
4. Create OAuth credentials for add-on

**Configuration Files Needed:**
```json
// appsscript.json (Add-on manifest)
{
  "timeZone": "America/New_York",
  "dependencies": {
    "libraries": []
  },
  "addOns": {
    "common": {
      "name": "Koordi - Family Event Coordinator",
      "logoUrl": "https://koordi.app/logo-512.png",
      "layoutProperties": {
        "primaryColor": "#4F46E5",
        "secondaryColor": "#818CF8"
      },
      "homepageTrigger": {
        "runFunction": "onHomepage",
        "enabled": true
      },
      "universalActions": [
        {
          "label": "Open Full Koordi App",
          "openLink": {
            "url": "https://koordi.app"
          }
        },
        {
          "label": "Settings",
          "runFunction": "onSettingsClick"
        }
      ],
      "urlFetchWhitelist": [
        "https://api.koordi.app/*",
        "https://koordi.app/*"
      ]
    },
    "calendar": {
      "homepageTrigger": {
        "runFunction": "onCalendarHomepage",
        "enabled": true
      },
      "eventOpenTrigger": {
        "runFunction": "onCalendarEventOpen"
      },
      "eventUpdateTrigger": {
        "runFunction": "onCalendarEventUpdate"
      },
      "currentEventAccess": "READ_WRITE"
    }
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/calendar.addons.execute",
    "https://www.googleapis.com/auth/calendar.addons.current.event.read",
    "https://www.googleapis.com/auth/calendar.addons.current.event.write",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

### 1.2 Authentication Bridge

**Challenge:** The add-on runs in Google's environment with its own OAuth context. We need to authenticate users with your existing Koordi backend.

**Solution: OAuth Token Exchange**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Google Add-on  │────▶│  Koordi Backend  │────▶│    Database     │
│                 │     │                  │     │                 │
│ ScriptApp       │     │ /api/addon/auth  │     │ Find user by    │
│ .getOAuthToken()│     │ /verify          │     │ Google email    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Backend Changes Required:**

```typescript
// New file: backend/src/routes/addon-auth.ts

import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';

const router = Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verify Google OAuth token from add-on
router.post('/addon/auth/verify', async (req, res) => {
  try {
    const { googleToken } = req.body;

    // Verify the Google OAuth token
    const ticket = await client.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload?.email;

    // Find existing Koordi user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        eventCalendarMemberships: {
          where: { status: 'accepted' },
          include: { eventCalendar: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Please sign up at koordi.app first'
      });
    }

    // Generate short-lived addon session token
    const addonToken = jwt.sign(
      { userId: user.id, source: 'addon' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.json({
      token: addonToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        hasHomeAddress: !!user.home_address
      }
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
```

**Apps Script Authentication:**

```javascript
// addon/src/auth.gs

const KOORDI_API_BASE = 'https://api.koordi.app';

/**
 * Get or refresh Koordi API token
 */
function getKoordiToken() {
  const cache = CacheService.getUserCache();
  let token = cache.get('koordi_token');

  if (!token) {
    token = authenticateWithKoordi();
    if (token) {
      // Cache for 55 minutes (token expires in 60)
      cache.put('koordi_token', token, 55 * 60);
    }
  }

  return token;
}

/**
 * Authenticate with Koordi backend using Google OAuth token
 */
function authenticateWithKoordi() {
  const googleToken = ScriptApp.getIdentityToken();

  const response = UrlFetchApp.fetch(KOORDI_API_BASE + '/api/addon/auth/verify', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ googleToken }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() === 200) {
    const data = JSON.parse(response.getContentText());
    return data.token;
  } else if (response.getResponseCode() === 404) {
    // User not registered
    return null;
  }

  throw new Error('Authentication failed');
}

/**
 * Make authenticated request to Koordi API
 */
function koordiApiRequest(endpoint, options = {}) {
  const token = getKoordiToken();

  if (!token) {
    return { error: 'not_authenticated', needsSignup: true };
  }

  const defaultOptions = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  const mergedOptions = { ...defaultOptions, ...options };
  if (options.payload) {
    mergedOptions.payload = JSON.stringify(options.payload);
  }

  const response = UrlFetchApp.fetch(
    KOORDI_API_BASE + endpoint,
    mergedOptions
  );

  return JSON.parse(response.getContentText());
}
```

### 1.3 Project Structure

**Add-on File Structure:**
```
addon/
├── appsscript.json           # Manifest
├── src/
│   ├── main.gs               # Entry points (triggers)
│   ├── auth.gs               # Authentication logic
│   ├── api.gs                # Backend API calls
│   ├── cards/
│   │   ├── homepage.gs       # Homepage card builder
│   │   ├── eventList.gs      # Event list card
│   │   ├── eventDetail.gs    # Event detail card
│   │   ├── assignment.gs     # Assignment UI
│   │   ├── calendars.gs      # Calendar selector
│   │   ├── settings.gs       # Settings card
│   │   └── errors.gs         # Error cards
│   ├── utils/
│   │   ├── formatting.gs     # Date/time formatting
│   │   └── navigation.gs     # Card navigation helpers
│   └── constants.gs          # Shared constants
└── test/
    └── mockData.gs           # Test data for development
```

---

## Phase 2: Core Functionality

### 2.1 Homepage Card

When users open the add-on in Google Calendar, they see this card.

```javascript
// addon/src/cards/homepage.gs

/**
 * Build the homepage card for the add-on
 */
function buildHomepageCard(userInfo) {
  const card = CardService.newCardBuilder();

  // Header with user info
  card.setHeader(
    CardService.newCardHeader()
      .setTitle('Koordi')
      .setSubtitle(userInfo.name)
      .setImageUrl('https://koordi.app/logo.png')
      .setImageStyle(CardService.ImageStyle.CIRCLE)
  );

  // Quick stats section
  const statsSection = CardService.newCardSection()
    .setHeader('Today\'s Overview');

  // Unassigned events count
  const unassignedCount = getUnassignedEventsCount();
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Unassigned Events')
      .setText(unassignedCount.toString())
      .setStartIcon(
        CardService.newIconImage()
          .setIcon(CardService.Icon.EVENT_PERFORMER)
      )
      .setButton(
        CardService.newTextButton()
          .setText('View')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('showUnassignedEvents')
          )
      )
  );

  // My events today
  const myEventsToday = getMyEventsTodayCount();
  statsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('My Events Today')
      .setText(myEventsToday.toString())
      .setStartIcon(
        CardService.newIconImage()
          .setIcon(CardService.Icon.PERSON)
      )
  );

  card.addSection(statsSection);

  // Calendar selector section
  const calendarSection = CardService.newCardSection()
    .setHeader('Select Calendar');

  const calendars = getCalendars();
  const calendarDropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('calendarId')
    .setTitle('Calendar')
    .setOnChangeAction(
      CardService.newAction()
        .setFunctionName('onCalendarSelected')
    );

  calendars.forEach(cal => {
    calendarDropdown.addItem(cal.name, cal.id, cal.id === getSelectedCalendarId());
  });

  calendarSection.addWidget(calendarDropdown);
  card.addSection(calendarSection);

  // Quick actions
  const actionsSection = CardService.newCardSection()
    .setHeader('Quick Actions');

  actionsSection.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText('All Events')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('showAllEvents')
          )
      )
      .addButton(
        CardService.newTextButton()
          .setText('Refresh')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('refreshHomepage')
          )
      )
  );

  card.addSection(actionsSection);

  return card.build();
}

/**
 * Build signup prompt card for non-registered users
 */
function buildSignupPromptCard() {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle('Welcome to Koordi')
      .setSubtitle('Family Event Coordination')
  );

  const section = CardService.newCardSection();

  section.addWidget(
    CardService.newTextParagraph()
      .setText('Koordi helps families coordinate who\'s taking the kids to their activities.')
  );

  section.addWidget(
    CardService.newTextParagraph()
      .setText('To use this add-on, you\'ll need to create a Koordi account first.')
  );

  section.addWidget(
    CardService.newTextButton()
      .setText('Sign Up at Koordi.app')
      .setOpenLink(
        CardService.newOpenLink()
          .setUrl('https://koordi.app/signup')
          .setOpenAs(CardService.OpenAs.FULL_SIZE)
      )
  );

  card.addSection(section);

  return card.build();
}
```

### 2.2 Event List Card

```javascript
// addon/src/cards/eventList.gs

/**
 * Build event list card with filtering
 */
function buildEventListCard(calendarId, filter) {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle('Events')
      .setSubtitle(filter === 'unassigned' ? 'Unassigned Only' : 'All Events')
  );

  // Filter buttons
  const filterSection = CardService.newCardSection();
  filterSection.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText('All')
          .setBackgroundColor(filter === 'all' ? '#4F46E5' : '#E5E7EB')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('filterEvents')
              .setParameters({ filter: 'all', calendarId: calendarId })
          )
      )
      .addButton(
        CardService.newTextButton()
          .setText('Unassigned')
          .setBackgroundColor(filter === 'unassigned' ? '#4F46E5' : '#E5E7EB')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('filterEvents')
              .setParameters({ filter: 'unassigned', calendarId: calendarId })
          )
      )
      .addButton(
        CardService.newTextButton()
          .setText('Mine')
          .setBackgroundColor(filter === 'mine' ? '#4F46E5' : '#E5E7EB')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('filterEvents')
              .setParameters({ filter: 'mine', calendarId: calendarId })
          )
      )
  );
  card.addSection(filterSection);

  // Events list
  const events = getEvents(calendarId, filter);
  const eventsSection = CardService.newCardSection();

  if (events.length === 0) {
    eventsSection.addWidget(
      CardService.newTextParagraph()
        .setText('No events found.')
    );
  } else {
    events.slice(0, 10).forEach(event => {
      const assignedText = event.assignedTo
        ? `Assigned to: ${event.assignedTo.name}`
        : '⚠️ Unassigned';

      eventsSection.addWidget(
        CardService.newDecoratedText()
          .setTopLabel(formatEventDate(event.startTime))
          .setText(event.title)
          .setBottomLabel(assignedText)
          .setWrapText(true)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('showEventDetail')
              .setParameters({ eventId: event.id })
          )
      );
    });

    // Load more button if needed
    if (events.length > 10) {
      eventsSection.addWidget(
        CardService.newTextButton()
          .setText('Load More...')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('loadMoreEvents')
              .setParameters({ offset: '10', calendarId: calendarId, filter: filter })
          )
      );
    }
  }

  card.addSection(eventsSection);

  // Back button
  card.setFixedFooter(
    CardService.newFixedFooter()
      .setPrimaryButton(
        CardService.newTextButton()
          .setText('← Back')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('goToHomepage')
          )
      )
  );

  return card.build();
}
```

### 2.3 Event Detail & Assignment Card

```javascript
// addon/src/cards/eventDetail.gs

/**
 * Build event detail card with assignment controls
 */
function buildEventDetailCard(eventId) {
  const event = getEventDetails(eventId);
  const familyMembers = getFamilyMembers(event.calendarId);

  const card = CardService.newCardBuilder();

  // Event header
  card.setHeader(
    CardService.newCardHeader()
      .setTitle(event.title)
      .setSubtitle(event.calendarName)
  );

  // Event details section
  const detailsSection = CardService.newCardSection()
    .setHeader('Event Details');

  // Date & Time
  detailsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('When')
      .setText(formatEventDateTime(event.startTime, event.endTime, event.allDay))
      .setStartIcon(
        CardService.newIconImage()
          .setIcon(CardService.Icon.CLOCK)
      )
  );

  // Location
  if (event.location) {
    detailsSection.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Where')
        .setText(event.location)
        .setWrapText(true)
        .setStartIcon(
          CardService.newIconImage()
            .setIcon(CardService.Icon.MAP_PIN)
        )
    );
  }

  // Description (truncated)
  if (event.description) {
    detailsSection.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Notes')
        .setText(truncate(event.description, 200))
        .setWrapText(true)
    );
  }

  card.addSection(detailsSection);

  // Assignment section
  const assignSection = CardService.newCardSection()
    .setHeader('Assignment');

  // Current assignment status
  if (event.assignedTo) {
    assignSection.addWidget(
      CardService.newDecoratedText()
        .setTopLabel('Currently Assigned')
        .setText(event.assignedTo.name)
        .setStartIcon(
          CardService.newIconImage()
            .setIconUrl(event.assignedTo.avatar || 'https://koordi.app/default-avatar.png')
        )
    );
  } else {
    assignSection.addWidget(
      CardService.newDecoratedText()
        .setText('⚠️ This event is unassigned')
        .setWrapText(true)
    );
  }

  // Assignment dropdown (only show if not all-day event)
  if (!event.allDay) {
    const assignDropdown = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setFieldName('assigneeId')
      .setTitle('Assign to')
      .addItem('-- Select Parent --', '', !event.assignedTo);

    familyMembers.forEach(member => {
      assignDropdown.addItem(
        member.name,
        member.id,
        event.assignedTo?.id === member.id
      );
    });

    assignSection.addWidget(assignDropdown);

    // Assign button
    assignSection.addWidget(
      CardService.newTextButton()
        .setText(event.assignedTo ? 'Reassign Event' : 'Assign Event')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName('assignEvent')
            .setParameters({
              eventId: event.id,
              version: event.version.toString()
            })
        )
    );

    // Unassign button (only if currently assigned)
    if (event.assignedTo) {
      assignSection.addWidget(
        CardService.newTextButton()
          .setText('Unassign')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('unassignEvent')
              .setParameters({
                eventId: event.id,
                version: event.version.toString()
              })
          )
      );
    }
  } else {
    assignSection.addWidget(
      CardService.newTextParagraph()
        .setText('ℹ️ All-day events cannot be assigned.')
    );
  }

  card.addSection(assignSection);

  // Drive time info (if assigned and has supplemental events)
  if (event.assignedTo && event.supplementalEvents?.length > 0) {
    const driveSection = CardService.newCardSection()
      .setHeader('Drive Time');

    event.supplementalEvents.forEach(supEvent => {
      const typeEmoji = supEvent.type === 'departure' ? '🚗' :
                        supEvent.type === 'return' ? '🏠' : '⏰';
      driveSection.addWidget(
        CardService.newDecoratedText()
          .setText(`${typeEmoji} ${supEvent.type}: ${formatTime(supEvent.startTime)}`)
          .setBottomLabel(`${supEvent.driveTimeMinutes} min drive`)
      );
    });

    card.addSection(driveSection);
  }

  // Footer with navigation
  card.setFixedFooter(
    CardService.newFixedFooter()
      .setPrimaryButton(
        CardService.newTextButton()
          .setText('← Back to Events')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('goBack')
          )
      )
      .setSecondaryButton(
        CardService.newTextButton()
          .setText('Open in Koordi')
          .setOpenLink(
            CardService.newOpenLink()
              .setUrl(`https://koordi.app/events/${event.id}`)
          )
      )
  );

  return card.build();
}
```

### 2.4 Contextual Event Card (When Opening Calendar Event)

```javascript
// addon/src/main.gs

/**
 * Triggered when user opens a calendar event
 */
function onCalendarEventOpen(e) {
  const calendarEvent = e.calendar;
  const googleEventId = calendarEvent.id;
  const calendarId = calendarEvent.calendarId;

  // Try to find this event in Koordi
  const koordiEvent = findKoordiEventByGoogleEventId(googleEventId, calendarId);

  if (koordiEvent) {
    // Show Koordi event details
    return [buildEventDetailCard(koordiEvent.id)];
  } else {
    // Event not managed by Koordi
    return [buildEventNotManagedCard(calendarEvent)];
  }
}

/**
 * Card shown when event isn't in Koordi
 */
function buildEventNotManagedCard(calendarEvent) {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle('Not a Koordi Event')
  );

  const section = CardService.newCardSection();

  section.addWidget(
    CardService.newTextParagraph()
      .setText('This event isn\'t managed by Koordi.')
  );

  section.addWidget(
    CardService.newTextParagraph()
      .setText('Koordi tracks events from imported ICS calendar feeds (school, sports, activities).')
  );

  section.addWidget(
    CardService.newTextButton()
      .setText('Go to Koordi Dashboard')
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('goToHomepage')
      )
  );

  card.addSection(section);

  return card.build();
}
```

### 2.5 Backend API Endpoints for Add-on

```typescript
// backend/src/routes/addon.ts

import { Router } from 'express';
import { authenticateAddonToken } from '../middleware/addon-auth';

const router = Router();

// All addon routes require addon authentication
router.use(authenticateAddonToken);

// Get calendars for current user
router.get('/addon/calendars', async (req, res) => {
  const userId = req.user.id;

  const memberships = await prisma.eventCalendarMembership.findMany({
    where: {
      user_id: userId,
      status: 'accepted'
    },
    include: {
      eventCalendar: {
        include: {
          child: true
        }
      }
    }
  });

  const calendars = memberships.map(m => ({
    id: m.eventCalendar.id,
    name: m.eventCalendar.name,
    childName: m.eventCalendar.child?.name,
    color: m.eventCalendar.color
  }));

  res.json(calendars);
});

// Get events for a calendar
router.get('/addon/calendars/:calendarId/events', async (req, res) => {
  const { calendarId } = req.params;
  const { filter, limit = 20, offset = 0 } = req.query;
  const userId = req.user.id;

  // Verify user has access to calendar
  const membership = await prisma.eventCalendarMembership.findFirst({
    where: {
      event_calendar_id: calendarId,
      user_id: userId,
      status: 'accepted'
    }
  });

  if (!membership) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Build query based on filter
  const where: any = {
    event_calendar_id: calendarId,
    start_time: { gte: new Date() } // Only future events
  };

  if (filter === 'unassigned') {
    where.assigned_to_user_id = null;
    where.all_day = false;
  } else if (filter === 'mine') {
    where.assigned_to_user_id = userId;
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { start_time: 'asc' },
    take: Number(limit),
    skip: Number(offset),
    include: {
      assignedToUser: {
        select: { id: true, name: true, avatar_url: true }
      },
      supplementalEvents: true
    }
  });

  res.json(events.map(e => ({
    id: e.id,
    title: e.title,
    startTime: e.start_time,
    endTime: e.end_time,
    location: e.location,
    allDay: e.all_day,
    version: e.version,
    assignedTo: e.assignedToUser ? {
      id: e.assignedToUser.id,
      name: e.assignedToUser.name,
      avatar: e.assignedToUser.avatar_url
    } : null,
    supplementalEvents: e.supplementalEvents
  })));
});

// Get event details
router.get('/addon/events/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user.id;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      eventCalendar: {
        include: {
          child: true,
          memberships: {
            where: { status: 'accepted' },
            include: { user: true }
          }
        }
      },
      assignedToUser: true,
      supplementalEvents: true
    }
  });

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  // Verify access
  const hasAccess = event.eventCalendar.memberships.some(m => m.user_id === userId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json({
    id: event.id,
    title: event.title,
    description: event.description,
    startTime: event.start_time,
    endTime: event.end_time,
    location: event.location,
    allDay: event.all_day,
    version: event.version,
    calendarId: event.event_calendar_id,
    calendarName: event.eventCalendar.name,
    assignedTo: event.assignedToUser ? {
      id: event.assignedToUser.id,
      name: event.assignedToUser.name,
      avatar: event.assignedToUser.avatar_url
    } : null,
    supplementalEvents: event.supplementalEvents.map(s => ({
      type: s.event_type,
      startTime: s.start_time,
      driveTimeMinutes: s.drive_time_minutes
    }))
  });
});

// Find Koordi event by Google Calendar event ID
router.get('/addon/events/by-google-id/:googleEventId', async (req, res) => {
  const { googleEventId } = req.params;
  const { googleCalendarId } = req.query;
  const userId = req.user.id;

  // Look up in user_google_event_sync table
  const sync = await prisma.userGoogleEventSync.findFirst({
    where: {
      google_event_id: googleEventId,
      user_id: userId
    },
    include: {
      event: {
        include: {
          eventCalendar: true,
          assignedToUser: true
        }
      }
    }
  });

  if (sync?.event) {
    return res.json({
      found: true,
      eventId: sync.event.id
    });
  }

  res.json({ found: false });
});

// Assign event
router.post('/addon/events/:eventId/assign', async (req, res) => {
  const { eventId } = req.params;
  const { assigneeId, expectedVersion } = req.body;
  const userId = req.user.id;

  // Use existing event service logic
  // This reuses your existing assignment logic with conflict checking
  try {
    const result = await eventService.assignEvent(eventId, assigneeId, expectedVersion, userId);
    res.json(result);
  } catch (error) {
    if (error.code === 'VERSION_CONFLICT') {
      return res.status(409).json({ error: 'Event was modified by someone else' });
    }
    throw error;
  }
});

// Unassign event
router.post('/addon/events/:eventId/unassign', async (req, res) => {
  const { eventId } = req.params;
  const { expectedVersion } = req.body;
  const userId = req.user.id;

  const result = await eventService.unassignEvent(eventId, expectedVersion, userId);
  res.json(result);
});

// Get family members for a calendar
router.get('/addon/calendars/:calendarId/members', async (req, res) => {
  const { calendarId } = req.params;

  const memberships = await prisma.eventCalendarMembership.findMany({
    where: {
      event_calendar_id: calendarId,
      status: 'accepted'
    },
    include: {
      user: {
        select: { id: true, name: true, avatar_url: true }
      }
    }
  });

  res.json(memberships.map(m => ({
    id: m.user.id,
    name: m.user.name,
    avatar: m.user.avatar_url
  })));
});

// Get unassigned events count
router.get('/addon/stats/unassigned-count', async (req, res) => {
  const userId = req.user.id;

  const count = await prisma.event.count({
    where: {
      eventCalendar: {
        memberships: {
          some: {
            user_id: userId,
            status: 'accepted'
          }
        }
      },
      assigned_to_user_id: null,
      all_day: false,
      start_time: { gte: new Date() }
    }
  });

  res.json({ count });
});

export default router;
```

---

## Phase 3: Advanced Features

### 3.1 Conflict Warning System

```javascript
// addon/src/cards/conflictWarning.gs

/**
 * Check for conflicts before assignment
 */
function checkAndShowConflicts(eventId, assigneeId, expectedVersion) {
  const conflicts = koordiApiRequest(`/api/addon/events/${eventId}/check-conflicts`, {
    method: 'post',
    payload: { assigneeId }
  });

  if (conflicts.hasConflicts) {
    return buildConflictWarningCard(eventId, assigneeId, expectedVersion, conflicts.conflictingEvents);
  }

  // No conflicts, proceed with assignment
  return performAssignment(eventId, assigneeId, expectedVersion);
}

/**
 * Build conflict warning card
 */
function buildConflictWarningCard(eventId, assigneeId, expectedVersion, conflictingEvents) {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle('⚠️ Scheduling Conflict')
      .setSubtitle('This assignment may cause overlap')
  );

  const section = CardService.newCardSection();

  section.addWidget(
    CardService.newTextParagraph()
      .setText('The selected parent already has events at this time:')
  );

  conflictingEvents.forEach(conflict => {
    section.addWidget(
      CardService.newDecoratedText()
        .setText(conflict.title)
        .setBottomLabel(formatEventDateTime(conflict.startTime, conflict.endTime))
        .setStartIcon(
          CardService.newIconImage()
            .setIcon(CardService.Icon.EVENT_PERFORMER)
        )
    );
  });

  section.addWidget(
    CardService.newTextParagraph()
      .setText('Do you want to proceed anyway?')
  );

  section.addWidget(
    CardService.newButtonSet()
      .addButton(
        CardService.newTextButton()
          .setText('Assign Anyway')
          .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('forceAssignment')
              .setParameters({
                eventId: eventId,
                assigneeId: assigneeId,
                version: expectedVersion
              })
          )
      )
      .addButton(
        CardService.newTextButton()
          .setText('Cancel')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('goBack')
          )
      )
  );

  card.addSection(section);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(card.build()))
    .build();
}
```

### 3.2 Notification System

```javascript
// addon/src/utils/notifications.gs

/**
 * Show success notification
 */
function showSuccessNotification(message) {
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification()
        .setText(message)
    )
    .build();
}

/**
 * Show error notification
 */
function showErrorNotification(message) {
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification()
        .setText('❌ ' + message)
    )
    .build();
}

/**
 * Build error card for serious errors
 */
function buildErrorCard(title, message, retryFunction) {
  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle('❌ ' + title)
  );

  const section = CardService.newCardSection();

  section.addWidget(
    CardService.newTextParagraph()
      .setText(message)
  );

  const buttons = CardService.newButtonSet();

  if (retryFunction) {
    buttons.addButton(
      CardService.newTextButton()
        .setText('Try Again')
        .setOnClickAction(
          CardService.newAction()
            .setFunctionName(retryFunction)
        )
    );
  }

  buttons.addButton(
    CardService.newTextButton()
      .setText('Go Home')
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('goToHomepage')
      )
  );

  section.addWidget(buttons);
  card.addSection(section);

  return card.build();
}
```

### 3.3 Settings Card

```javascript
// addon/src/cards/settings.gs

/**
 * Build settings card
 */
function buildSettingsCard() {
  const userSettings = koordiApiRequest('/api/addon/user/settings');

  const card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle('Settings')
  );

  // Account section
  const accountSection = CardService.newCardSection()
    .setHeader('Account');

  accountSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Signed in as')
      .setText(userSettings.email)
      .setStartIcon(
        CardService.newIconImage()
          .setIcon(CardService.Icon.PERSON)
      )
  );

  accountSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Home Address')
      .setText(userSettings.homeAddress || 'Not set')
      .setBottomLabel(userSettings.homeAddress ? '' : 'Set in Koordi app for drive times')
      .setWrapText(true)
  );

  card.addSection(accountSection);

  // Preferences section
  const prefsSection = CardService.newCardSection()
    .setHeader('Preferences');

  prefsSection.addWidget(
    CardService.newDecoratedText()
      .setTopLabel('Comfort Buffer')
      .setText(`${userSettings.comfortBufferMinutes} minutes`)
      .setBottomLabel('Early arrival time added to drive times')
  );

  prefsSection.addWidget(
    CardService.newTextButton()
      .setText('Edit Settings in Koordi')
      .setOpenLink(
        CardService.newOpenLink()
          .setUrl('https://koordi.app/settings')
      )
  );

  card.addSection(prefsSection);

  // Help section
  const helpSection = CardService.newCardSection()
    .setHeader('Help');

  helpSection.addWidget(
    CardService.newDecoratedText()
      .setText('About Koordi')
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('showAbout')
      )
  );

  helpSection.addWidget(
    CardService.newDecoratedText()
      .setText('Get Support')
      .setOpenLink(
        CardService.newOpenLink()
          .setUrl('https://koordi.app/support')
      )
  );

  card.addSection(helpSection);

  // Footer
  card.setFixedFooter(
    CardService.newFixedFooter()
      .setPrimaryButton(
        CardService.newTextButton()
          .setText('← Back')
          .setOnClickAction(
            CardService.newAction()
              .setFunctionName('goToHomepage')
          )
      )
  );

  return card.build();
}
```

---

## Phase 4: Testing & Quality Assurance

### 4.1 Development Testing

**Test Deployment Setup:**
```
1. In Apps Script editor:
   - Click Deploy > Test deployments
   - Click Install
   - Open Google Calendar in same browser
   - Verify add-on icon appears in sidebar
```

**Test Cases:**

| Category | Test Case | Expected Result |
|----------|-----------|-----------------|
| **Auth** | Open add-on without Koordi account | Show signup prompt |
| **Auth** | Open add-on with Koordi account | Show homepage with stats |
| **Auth** | Token expiration | Automatic re-authentication |
| **Navigation** | Click calendar dropdown | Show list of user's calendars |
| **Navigation** | Click event in list | Navigate to event detail |
| **Navigation** | Click back button | Return to previous card |
| **Events** | View unassigned events | Only show unassigned, non-all-day |
| **Events** | View my events | Only show events assigned to me |
| **Events** | View all events | Show all events for calendar |
| **Assignment** | Assign event to parent | Event updates, drive times created |
| **Assignment** | Assign event with conflict | Show conflict warning |
| **Assignment** | Force assign with conflict | Assignment proceeds |
| **Assignment** | Unassign event | Event unassigned, drive times removed |
| **Assignment** | Concurrent modification | Show version conflict error |
| **Contextual** | Open Koordi event in Calendar | Show event detail card |
| **Contextual** | Open non-Koordi event | Show "not managed" card |
| **Settings** | View settings | Show user settings |
| **Error** | API timeout | Show error with retry |
| **Error** | Network failure | Show offline message |

### 4.2 Performance Testing

```javascript
// addon/src/utils/performance.gs

/**
 * Log execution times for debugging
 */
function measureApiCall(name, fn) {
  const start = new Date().getTime();
  const result = fn();
  const duration = new Date().getTime() - start;

  if (duration > 5000) {
    console.warn(`Slow API call: ${name} took ${duration}ms`);
  }

  return result;
}
```

**Performance Targets:**
- Homepage load: < 3 seconds
- Event list load: < 2 seconds
- Assignment action: < 5 seconds
- Card navigation: < 1 second

### 4.3 Test User Program

Before public launch, recruit 5-10 test users:

1. Share Apps Script project with testers
2. Have them install via Test Deployments
3. Collect feedback via form
4. Fix issues found in testing

---

## Phase 5: Marketplace Publication

### 5.1 Pre-Publication Checklist

- [ ] Create standard Google Cloud Project (not Apps Script default)
- [ ] Link Apps Script to Cloud Project
- [ ] Configure OAuth consent screen
- [ ] Create versioned deployment
- [ ] Prepare listing assets:
  - [ ] Logo (512x512 PNG)
  - [ ] Screenshots (1280x800)
  - [ ] Short description (80 chars)
  - [ ] Full description (500 chars)
  - [ ] Privacy policy URL
  - [ ] Terms of service URL
  - [ ] Support URL

### 5.2 Marketplace Listing Content

**Application Name:** Koordi - Family Event Coordinator

**Short Description:**
Assign family events to parents directly from Google Calendar. Coordinate who's taking the kids!

**Full Description:**
Koordi helps busy families coordinate who's taking the kids to their activities.

With this Google Calendar add-on, you can:
• View all imported events from school, sports, and activity calendars
• See which events need to be assigned to a parent
• Assign events to family members without leaving Google Calendar
• See drive time calculations for each event
• Get conflict warnings when assignments overlap

Koordi automatically syncs events to each parent's personal calendar, so everyone knows their schedule.

**Requirements:**
A Koordi account is required. Sign up free at koordi.app

**Category:** Productivity

**Tags:** calendar, family, scheduling, coordination, events

### 5.3 Publication Decision: Private vs Public

**Option A: Private (Organization Only)**
- Pros: Immediate availability, minimal review
- Cons: Only your Google Workspace organization can use it
- Best for: Internal testing, limited beta

**Option B: Public (All Users)**
- Pros: Anyone can discover and install
- Cons: Requires Google review, stricter requirements
- Best for: Production launch

**Recommendation:** Start with Private for beta testing, then convert to Public for general availability. Note: You cannot change visibility after initial publication, so create a new listing for public.

### 5.4 Publication Steps

```
1. Go to Google Cloud Console
2. Search "Google Workspace Marketplace SDK"
3. Enable the SDK
4. Click "Configure" in the SDK dashboard
5. Fill out all required fields:
   - App Configuration
   - Store Listing
   - OAuth Setup
6. Add deployment ID from versioned deployment
7. Submit for review
8. Wait for approval (public apps)
9. Once approved, app appears in Marketplace
```

---

## 6. Post-Launch Operations

### 6.1 Monitoring

**Add-on Metrics to Track:**
- Daily/weekly active users
- Most used features (via backend logging)
- Error rates
- API response times
- User feedback/ratings

**Backend Additions for Monitoring:**
```typescript
// backend/src/middleware/addon-analytics.ts

export const addonAnalytics = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Log to analytics service
    analytics.track({
      event: 'addon_api_call',
      properties: {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        duration,
        userId: req.user?.id
      }
    });
  });

  next();
};
```

### 6.2 Update Process

```
When updating the add-on:
1. Make changes in Apps Script
2. Test with HEAD deployment
3. Create new versioned deployment
4. Update Marketplace SDK with new deployment ID
5. Existing users automatically receive update
```

### 6.3 User Support

- Add "Report Issue" link in settings
- Create FAQ page on koordi.app/addon-help
- Monitor Marketplace reviews
- Respond to user feedback within 48 hours

---

## 7. Risk Assessment & Mitigation

### High Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| UI limitations frustrate users | Users prefer web app | Medium | Clearly communicate add-on is for quick actions; link to full app |
| 30-second timeout causes failures | Assignment fails | Low | Optimize backend, add retry logic |
| Google OAuth token verification issues | Auth fails | Medium | Comprehensive error handling, clear error messages |

### Medium Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Card Service API changes | Features break | Low | Monitor Google Workspace changelog |
| Marketplace review delays | Launch delayed | Medium | Submit early, follow all guidelines |
| User confusion about setup | Poor adoption | Medium | Clear onboarding flow, help documentation |

### Low Risk

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Concurrent modification conflicts | Data inconsistency | Low | Already handled via versioning |
| Add-on caching issues | Stale data shown | Low | Clear cache on refresh button |

---

## 8. Cost Considerations

### Development Costs (if hiring)

| Item | Estimated Hours | Notes |
|------|-----------------|-------|
| Google Apps Script development | 40-60 hours | Add-on UI and logic |
| Backend API endpoints | 15-20 hours | New addon routes |
| Authentication bridge | 10-15 hours | Token exchange system |
| Testing & QA | 15-20 hours | All test scenarios |
| Marketplace submission | 5-10 hours | Assets, review process |
| **Total** | **85-125 hours** | |

### Ongoing Costs

| Item | Cost | Notes |
|------|------|-------|
| Google Cloud Project | $0 | Within free tier |
| Apps Script execution | $0 | Generous free quota |
| Backend hosting | Existing | No additional cost |
| Marketplace listing | $0 | Free to list |

---

## 9. Alternative Approaches

### Alternative 1: Chrome Extension

Instead of a Workspace Add-on, build a Chrome Extension that injects UI into Google Calendar.

**Pros:**
- Full control over HTML/CSS
- Could reuse React components
- No Card Service limitations

**Cons:**
- Only works in Chrome browser
- More complex installation
- Not discoverable in Marketplace
- May break with Calendar UI changes

**Verdict:** Not recommended. Workspace Add-on is more robust and discoverable.

### Alternative 2: Progressive Web App (PWA)

Make the existing Koordi web app installable as a PWA with side-by-side window.

**Pros:**
- No new development needed
- Full feature parity
- Works everywhere

**Cons:**
- Requires manual window positioning
- Not integrated into Calendar UI
- Less seamless workflow

**Verdict:** Could be a good interim solution while building the add-on.

### Alternative 3: Calendar Iframe Embed

Google Calendar doesn't support embedding external content, so this isn't possible.

---

## 10. Decision Points Requiring Your Input

Before proceeding, please consider and decide on:

### 1. Target Audience
- [ ] Personal use only (private add-on)
- [ ] Beta testers (shared privately)
- [ ] Public marketplace listing

### 2. Feature Scope for V1
- [ ] **Minimal:** View events + assign only
- [ ] **Standard:** Above + conflict warnings + settings
- [ ] **Full:** Above + contextual cards when opening events

### 3. Authentication Approach
- [ ] **Recommended:** OAuth token exchange (seamless but requires backend work)
- [ ] **Alternative:** Require users to manually copy API key (simpler but worse UX)

### 4. Timeline Priority
- [ ] **Fast:** Launch basic version ASAP, iterate
- [ ] **Thorough:** Complete all features before launch

### 5. Branding
- [ ] Use "Koordi" branding in add-on
- [ ] Consider white-label option for other families

---

## Appendix A: Complete File List

### Add-on Files
```
addon/
├── appsscript.json
├── src/
│   ├── main.gs
│   ├── auth.gs
│   ├── api.gs
│   ├── cards/
│   │   ├── homepage.gs
│   │   ├── eventList.gs
│   │   ├── eventDetail.gs
│   │   ├── assignment.gs
│   │   ├── conflictWarning.gs
│   │   ├── settings.gs
│   │   ├── signup.gs
│   │   └── errors.gs
│   └── utils/
│       ├── formatting.gs
│       ├── navigation.gs
│       └── notifications.gs
```

### Backend Changes
```
backend/src/
├── routes/
│   ├── addon-auth.ts (new)
│   └── addon.ts (new)
├── middleware/
│   └── addon-auth.ts (new)
└── services/
    └── addon/ (new directory)
        └── addonEventService.ts
```

---

## Appendix B: Useful Resources

- [Google Workspace Add-ons Overview](https://developers.google.com/workspace/add-ons)
- [Card Service Reference](https://developers.google.com/apps-script/reference/card-service)
- [Calendar Add-on Documentation](https://developers.google.com/workspace/add-ons/calendar)
- [Marketplace Publishing Guide](https://developers.google.com/workspace/marketplace/how-to-publish)
- [Apps Script OAuth2 Library](https://github.com/googleworkspace/apps-script-oauth2)

---

## Next Steps

1. Review this document and make decisions on the items in Section 10
2. Set up Google Cloud Project and Apps Script project
3. Begin Phase 1: Foundation & Authentication
4. Iterate through phases with regular check-ins

---

*Document created: December 2024*
*Last updated: December 2024*
