/**
 * Audit script to find orphaned events by checking Google Calendar events
 * and comparing against Koordie database events (not sync records)
 */

import { prisma } from '../lib/prisma';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

interface OrphanedEvent {
  userId: string;
  userEmail: string;
  googleEventId: string;
  googleCalendarId: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
}

async function auditOrphansByDate() {
  console.log('=== Google Calendar Orphan Audit (By Event Matching) ===\n');

  // Get all users with Google Calendar sync enabled
  const users = await prisma.user.findMany({
    where: {
      google_calendar_sync_enabled: true,
      google_refresh_token_enc: { not: null },
    },
    select: {
      id: true,
      name: true,
      email: true,
      google_calendar_id: true,
    },
  });

  console.log(`Found ${users.length} users with Google Calendar sync enabled\n`);

  const allOrphans: OrphanedEvent[] = [];

  // Get all Koordie event titles (for matching against Google Calendar)
  const koordiEvents = await prisma.event.findMany({
    where: {
      start_time: { gte: new Date('2025-01-01') },
    },
    select: {
      id: true,
      title: true,
      start_time: true,
      ics_uid: true,
    },
  });

  // Build a set of Koordie event titles for quick lookup
  const koordieEventTitles = new Set(koordiEvents.map(e => e.title));
  const koordieIcsUids = new Set(koordiEvents.map(e => e.ics_uid));
  console.log(`Loaded ${koordiEvents.length} Koordie events for comparison\n`);

  for (const user of users) {
    console.log(`\n--- Auditing ${user.name} (${user.email}) ---`);

    try {
      const calendar = await getGoogleCalendarClient(user.id);
      const calendarId = user.google_calendar_id || 'primary';

      // Get all events from Google Calendar
      const googleEvents = await calendar.events.list({
        calendarId,
        maxResults: 2500,
        singleEvents: true,
        timeMin: new Date('2025-01-01').toISOString(),
      });

      const items = googleEvents.data.items || [];
      console.log(`  Found ${items.length} total events in Google Calendar`);

      // Get all sync records for this user
      const syncRecords = await prisma.userGoogleEventSync.findMany({
        where: {
          user_id: user.id,
        },
        select: {
          google_event_id: true,
          event_id: true,
        },
      });

      const syncedGoogleEventIds = new Set(syncRecords.map(s => s.google_event_id));
      console.log(`  Found ${syncRecords.length} sync records in database`);

      // Look for events that:
      // 1. Look like Koordie events (have specific patterns in title/description)
      // 2. Are NOT in our sync records
      for (const googleEvent of items) {
        if (!googleEvent.id) continue;

        // Skip if this event IS tracked in our sync records (meaning it's current)
        if (syncedGoogleEventIds.has(googleEvent.id)) continue;

        const summary = googleEvent.summary || '';
        const description = googleEvent.description || '';

        // Check if this looks like a Koordie event:
        // - Has "handling -" in title (assigned event)
        // - Has "❓ Unassigned -" in title
        // - Has "app.koordie.com" in description
        // - Has colorId 9 (blue) which we set for main events
        const looksLikeKoordie =
          summary.includes('handling -') ||
          summary.includes('❓ Unassigned -') ||
          description.includes('koordie.com') ||
          description.includes('Koordie') ||
          googleEvent.colorId === '9';

        if (looksLikeKoordie) {
          const orphan: OrphanedEvent = {
            userId: user.id,
            userEmail: user.email,
            googleEventId: googleEvent.id,
            googleCalendarId: calendarId,
            summary,
            start: googleEvent.start?.dateTime || googleEvent.start?.date || 'Unknown',
            end: googleEvent.end?.dateTime || googleEvent.end?.date || 'Unknown',
            description: description.substring(0, 200),
          };
          allOrphans.push(orphan);
          console.log(`  ⚠️  POTENTIAL ORPHAN: "${summary}" on ${orphan.start}`);
        }
      }

    } catch (error: any) {
      console.error(`  ❌ Error auditing ${user.email}:`, error.message);
    }
  }

  console.log('\n\n=== AUDIT SUMMARY ===');
  console.log(`Total potential orphaned events found: ${allOrphans.length}`);

  if (allOrphans.length > 0) {
    console.log('\nPotential Orphaned Events:');
    for (const orphan of allOrphans) {
      console.log(`\n  User: ${orphan.userEmail}`);
      console.log(`  Event: "${orphan.summary}"`);
      console.log(`  Start: ${orphan.start}`);
      console.log(`  Google Event ID: ${orphan.googleEventId}`);
      if (orphan.description) {
        console.log(`  Description preview: ${orphan.description}...`);
      }
    }
  }

  await prisma.$disconnect();
  return allOrphans;
}

// Run the audit
auditOrphansByDate()
  .then((orphans) => {
    console.log('\n\nAudit complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Audit failed:', error);
    process.exit(1);
  });
