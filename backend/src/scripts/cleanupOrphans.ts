/**
 * One-time cleanup script to delete orphaned Google Calendar events
 * These are events that exist in Google Calendar but NOT in Koordie database
 *
 * Run with:
 * ENCRYPTION_KEY="..." DATABASE_URL="..." npx ts-node src/scripts/cleanupOrphans.ts
 */

import { prisma } from '../lib/prisma';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

// Orphans identified from audit on 2025-12-01
const ORPHANS_TO_DELETE = [
  {
    userEmail: 'angie.shaeffer@gmail.com',
    googleEventId: 'k0lj7qa171b0da6qfhmv0bvtfs',
    summary: '⚽️ 2016 - ❤️ings vs Placeholder for Futsal Game',
  },
  {
    userEmail: 'james@jamesschaffer.com',
    googleEventId: 'qorhe8gmelt38re5kcacq2cl98',
    summary: '⚽️ 2016 - ❤️ings vs Placeholder for Futsal Game (Towson Girls Test)',
  },
  {
    userEmail: 'james@jamesschaffer.com',
    googleEventId: 'ioc2ojm1p4sm5sssga4embeshk',
    summary: '⚽️ 2016 - ❤️ings vs Placeholder for Futsal Game (Towson Girls 2016)',
  },
];

async function cleanupOrphans() {
  console.log('=== Orphan Cleanup Script ===\n');
  console.log(`Will attempt to delete ${ORPHANS_TO_DELETE.length} orphaned events\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const orphan of ORPHANS_TO_DELETE) {
    console.log(`\n--- Deleting: "${orphan.summary}" ---`);
    console.log(`  User: ${orphan.userEmail}`);
    console.log(`  Google Event ID: ${orphan.googleEventId}`);

    try {
      // Get user
      const user = await prisma.user.findFirst({
        where: { email: orphan.userEmail },
        select: {
          id: true,
          google_calendar_id: true,
        },
      });

      if (!user) {
        console.error(`  ❌ User not found: ${orphan.userEmail}`);
        errorCount++;
        continue;
      }

      const calendarId = user.google_calendar_id || 'primary';
      const calendar = await getGoogleCalendarClient(user.id);

      // Delete the event
      await calendar.events.delete({
        calendarId,
        eventId: orphan.googleEventId,
      });

      console.log(`  ✅ Successfully deleted from Google Calendar`);
      successCount++;

    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.log(`  ⚠️ Event already deleted or not found (404)`);
        successCount++; // Count as success since the goal is achieved
      } else {
        console.error(`  ❌ Failed to delete:`, error.message);
        errorCount++;
      }
    }
  }

  console.log('\n\n=== CLEANUP SUMMARY ===');
  console.log(`Successfully deleted: ${successCount}`);
  console.log(`Errors: ${errorCount}`);

  await prisma.$disconnect();
}

// Run the cleanup
cleanupOrphans()
  .then(() => {
    console.log('\n\nCleanup complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });
