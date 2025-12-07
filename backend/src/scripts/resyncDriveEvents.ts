/**
 * Bulk resync script to update all drive events in Google Calendar
 * with the new location format (destination/origin address) and directions URL
 *
 * Run with:
 * ENCRYPTION_KEY="..." DATABASE_URL="..." npx ts-node src/scripts/resyncDriveEvents.ts
 */

import { prisma } from '../lib/prisma';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

async function resyncDriveEvents() {
  console.log('=== Drive Events Resync Script ===\n');

  // Find all departure and return supplemental events that have been synced to Google Calendar
  const syncRecords = await prisma.userGoogleEventSync.findMany({
    where: {
      sync_type: 'supplemental',
      supplemental_event_id: { not: null },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          google_calendar_id: true,
        },
      },
      supplemental_event: {
        include: {
          parent_event: {
            include: {
              event_calendar: {
                include: {
                  child: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Filter to only departure and return events
  const driveEventSyncs = syncRecords.filter(
    (sync) =>
      sync.supplemental_event &&
      (sync.supplemental_event.type === 'departure' || sync.supplemental_event.type === 'return')
  );

  console.log(`Found ${driveEventSyncs.length} drive events to resync\n`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const sync of driveEventSyncs) {
    const supplementalEvent = sync.supplemental_event!;
    const user = sync.user;

    console.log(`\n--- Resyncing: "${supplementalEvent.title}" ---`);
    console.log(`  Type: ${supplementalEvent.type}`);
    console.log(`  User: ${user.email}`);
    console.log(`  Google Event ID: ${sync.google_event_id}`);

    // Skip if missing required data
    if (!supplementalEvent.origin_address || !supplementalEvent.destination_address) {
      console.log(`  ⚠️ Skipping - missing origin or destination address`);
      skippedCount++;
      continue;
    }

    try {
      const calendarId = user.google_calendar_id || 'primary';
      const calendar = await getGoogleCalendarClient(user.id);

      // Build the new event body with correct location and directions URL
      const originEncoded = encodeURIComponent(supplementalEvent.origin_address);
      const destinationEncoded = encodeURIComponent(supplementalEvent.destination_address);
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originEncoded}&destination=${destinationEncoded}&travelmode=driving`;

      const eventBody = {
        summary: supplementalEvent.title,
        description: `Drive time for: ${supplementalEvent.parent_event.title}\nChild: ${supplementalEvent.parent_event.event_calendar.child.name}\n\nOrigin: ${supplementalEvent.origin_address}\nDestination: ${supplementalEvent.destination_address}\nEstimated drive time: ${supplementalEvent.drive_time_minutes} minutes\n\n📍 Directions: ${directionsUrl}`,
        // Location is always the destination (where you're driving TO)
        location: supplementalEvent.destination_address,
        start: {
          dateTime: supplementalEvent.start_time.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: supplementalEvent.end_time.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
        colorId: '8',
        transparency: 'opaque' as const,
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup' as const, minutes: 15 }],
        },
      };

      // Update the event in Google Calendar
      await calendar.events.update({
        calendarId,
        eventId: sync.google_event_id,
        requestBody: eventBody,
      });

      console.log(`  ✅ Successfully updated`);
      console.log(`  New location: ${eventBody.location}`);
      successCount++;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.log(`  ⚠️ Event not found in Google Calendar (404) - sync record may be stale`);
        skippedCount++;
      } else {
        console.error(`  ❌ Failed to update:`, error.message);
        errorCount++;
      }
    }
  }

  console.log('\n\n=== RESYNC SUMMARY ===');
  console.log(`Successfully updated: ${successCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);

  await prisma.$disconnect();
}

// Run the resync
resyncDriveEvents()
  .then(() => {
    console.log('\n\nResync complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Resync failed:', error);
    process.exit(1);
  });
