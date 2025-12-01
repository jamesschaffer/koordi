/**
 * Audit script to find orphaned events in Google Calendar
 * These are events that exist in Google Calendar but NOT in Koordie database
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
}

async function auditOrphans() {
  console.log('=== Google Calendar Orphan Audit ===\n');

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

  for (const user of users) {
    console.log(`\n--- Auditing ${user.name} (${user.email}) ---`);

    try {
      const calendar = await getGoogleCalendarClient(user.id);
      const calendarId = user.google_calendar_id || 'primary';

      // Get all events from Google Calendar
      // We'll filter by checking for icsUid extended property after fetching
      const googleEvents = await calendar.events.list({
        calendarId,
        maxResults: 2500,
        singleEvents: true,
        timeMin: new Date('2025-01-01').toISOString(), // Only check recent/future events
      });

      const allItems = googleEvents.data.items || [];
      console.log(`  Found ${allItems.length} total events in Google Calendar`);

      // Filter to only events created by Koordie (have icsUid in extended properties)
      const items = allItems.filter(event =>
        event.extendedProperties?.private?.icsUid
      );
      console.log(`  Found ${items.length} Koordie-created events (have icsUid)`)

      // Get all sync records for this user (main events only)
      const syncRecords = await prisma.userGoogleEventSync.findMany({
        where: {
          user_id: user.id,
          sync_type: 'main',
        },
        select: {
          google_event_id: true,
          event_id: true,
        },
      });

      const syncedGoogleEventIds = new Set(syncRecords.map(s => s.google_event_id));
      console.log(`  Found ${syncRecords.length} sync records in database`);

      // Find orphans: events in Google Calendar that are NOT in our sync records
      // This means they were synced at some point but the sync record was deleted
      // (which happens when the Koordie event is deleted)
      for (const googleEvent of items) {
        if (!googleEvent.id) continue;

        // Check if this Google event is tracked in our sync table
        if (!syncedGoogleEventIds.has(googleEvent.id)) {
          const icsUid = googleEvent.extendedProperties?.private?.icsUid || 'unknown';
          const orphan: OrphanedEvent = {
            userId: user.id,
            userEmail: user.email,
            googleEventId: googleEvent.id,
            googleCalendarId: calendarId,
            summary: googleEvent.summary || 'No title',
            start: googleEvent.start?.dateTime || googleEvent.start?.date || 'Unknown',
            end: googleEvent.end?.dateTime || googleEvent.end?.date || 'Unknown',
          };
          allOrphans.push(orphan);
          console.log(`  ⚠️  ORPHAN: "${orphan.summary}" on ${orphan.start} (icsUid: ${icsUid})`);
        }
      }

    } catch (error: any) {
      console.error(`  ❌ Error auditing ${user.email}:`, error.message);
    }
  }

  console.log('\n\n=== AUDIT SUMMARY ===');
  console.log(`Total orphaned events found: ${allOrphans.length}`);

  if (allOrphans.length > 0) {
    console.log('\nOrphaned Events:');
    for (const orphan of allOrphans) {
      console.log(`\n  User: ${orphan.userEmail}`);
      console.log(`  Event: "${orphan.summary}"`);
      console.log(`  Start: ${orphan.start}`);
      console.log(`  Google Event ID: ${orphan.googleEventId}`);
      console.log(`  Calendar ID: ${orphan.googleCalendarId}`);
    }
  }

  await prisma.$disconnect();
  return allOrphans;
}

// Run the audit
auditOrphans()
  .then((orphans) => {
    console.log('\n\nAudit complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Audit failed:', error);
    process.exit(1);
  });
