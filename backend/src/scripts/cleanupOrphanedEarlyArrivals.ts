/**
 * Cleanup script to remove early arrival events that were created as placeholders
 * when no real arrival time was specified in the event description.
 *
 * This script:
 * 1. Finds all early_arrival supplemental events
 * 2. Checks if the parent event has a real arrival time in its description
 * 3. Deletes early arrival events that don't have corresponding arrival times
 * 4. Also deletes them from users' Google Calendars
 *
 * Run with:
 * DATABASE_URL="..." ENCRYPTION_KEY="..." npx ts-node src/scripts/cleanupOrphanedEarlyArrivals.ts
 */

import { prisma } from '../lib/prisma';
import { parseArrivalTime } from '../services/arrivalTimeParser';
import { deleteSupplementalEventFromGoogleCalendar } from '../services/googleCalendarSyncService';

async function cleanupOrphanedEarlyArrivals() {
  console.log('Starting cleanup of orphaned early arrival events...\n');

  // Find all early_arrival supplemental events with their parent events
  const earlyArrivalEvents = await prisma.supplementalEvent.findMany({
    where: {
      type: { in: ['early_arrival', 'buffer'] }
    },
    include: {
      parent_event: {
        select: {
          id: true,
          title: true,
          description: true,
          start_time: true,
        },
      },
    },
  });

  console.log(`Found ${earlyArrivalEvents.length} early arrival events to check\n`);

  const toDelete: typeof earlyArrivalEvents = [];
  const toKeep: typeof earlyArrivalEvents = [];

  for (const event of earlyArrivalEvents) {
    // Check if parent event has an actual arrival time in description
    const arrivalInfo = parseArrivalTime(
      event.parent_event.description,
      event.parent_event.start_time
    );

    if (arrivalInfo === null) {
      // No arrival time in description - this is an orphaned placeholder
      toDelete.push(event);
    } else {
      toKeep.push(event);
    }
  }

  console.log(`Events to DELETE (no arrival time in description): ${toDelete.length}`);
  console.log(`Events to KEEP (have valid arrival time): ${toKeep.length}\n`);

  if (toDelete.length === 0) {
    console.log('No orphaned events to clean up. Done.');
    return;
  }

  console.log('Events to be deleted:');
  for (const event of toDelete) {
    const durationMin = Math.round(
      (event.end_time.getTime() - event.start_time.getTime()) / 60000
    );
    console.log(`  - "${event.title}" (${durationMin}min) - parent: "${event.parent_event.title}"`);
  }

  console.log('\n--- Starting deletion ---\n');

  for (const event of toDelete) {
    // Find all users who have this event synced to their Google Calendar
    const syncRecords = await prisma.userGoogleEventSync.findMany({
      where: {
        supplemental_event_id: event.id,
      },
    });

    console.log(`Deleting "${event.title}" from ${syncRecords.length} Google Calendar(s)...`);

    // Delete from each user's Google Calendar
    for (const syncRecord of syncRecords) {
      try {
        await deleteSupplementalEventFromGoogleCalendar(event.id, syncRecord.user_id);
        console.log(`  ✓ Deleted from user ${syncRecord.user_id}'s calendar`);
      } catch (error: any) {
        console.log(`  ✗ Failed to delete from user ${syncRecord.user_id}: ${error.message}`);
      }
    }

    // Delete the supplemental event from database
    await prisma.supplementalEvent.delete({
      where: { id: event.id },
    });
    console.log(`  ✓ Deleted from database\n`);
  }

  console.log(`\nCleanup complete! Deleted ${toDelete.length} orphaned early arrival events.`);
}

cleanupOrphanedEarlyArrivals()
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
