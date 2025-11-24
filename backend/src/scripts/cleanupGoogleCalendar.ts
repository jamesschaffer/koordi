import { prisma } from '../lib/prisma';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

/**
 * Cleanup script to remove all synced events from a user's Google Calendar
 * Usage: npx ts-node src/scripts/cleanupGoogleCalendar.ts <user_email>
 */

async function cleanupUserGoogleCalendar(userEmail: string) {
  console.log(`\n🧹 Starting cleanup for user: ${userEmail}\n`);

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      email: true,
      google_calendar_id: true,
      google_calendar_sync_enabled: true,
    },
  });

  if (!user) {
    console.error(`❌ User not found: ${userEmail}`);
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (${user.id})`);

  if (!user.google_calendar_sync_enabled) {
    console.log(`⚠️  Google Calendar sync is not enabled for this user`);
    process.exit(0);
  }

  // Get all synced events for this user
  const syncedEvents = await prisma.userGoogleEventSync.findMany({
    where: { user_id: user.id },
    select: {
      id: true,
      google_event_id: true,
      sync_type: true,
      event_id: true,
      supplemental_event_id: true,
    },
  });

  console.log(`\n📊 Found ${syncedEvents.length} synced events to clean up\n`);

  if (syncedEvents.length === 0) {
    console.log(`✅ No events to clean up`);
    process.exit(0);
  }

  // Get Google Calendar client
  const calendar = await getGoogleCalendarClient(user.id);
  const calendarId = user.google_calendar_id || 'primary';

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ eventId: string; error: string }> = [];

  // Delete each event from Google Calendar
  for (const syncedEvent of syncedEvents) {
    try {
      await calendar.events.delete({
        calendarId,
        eventId: syncedEvent.google_event_id,
      });

      // Delete the sync record from our database
      await prisma.userGoogleEventSync.delete({
        where: { id: syncedEvent.id },
      });

      successCount++;
      console.log(`✅ Deleted ${syncedEvent.sync_type} event: ${syncedEvent.google_event_id}`);
    } catch (error: any) {
      errorCount++;
      const errorMsg = error?.message || 'Unknown error';
      errors.push({
        eventId: syncedEvent.google_event_id,
        error: errorMsg,
      });
      console.error(`❌ Failed to delete event ${syncedEvent.google_event_id}: ${errorMsg}`);
    }
  }

  console.log(`\n📊 Cleanup Summary:`);
  console.log(`   ✅ Successfully deleted: ${successCount}`);
  console.log(`   ❌ Failed to delete: ${errorCount}`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`);
    errors.forEach(({ eventId, error }) => {
      console.log(`   - ${eventId}: ${error}`);
    });
  }

  console.log(`\n✨ Cleanup complete!\n`);
}

// Get user email from command line arguments
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Usage: npx ts-node src/scripts/cleanupGoogleCalendar.ts <user_email>');
  process.exit(1);
}

cleanupUserGoogleCalendar(userEmail)
  .catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
