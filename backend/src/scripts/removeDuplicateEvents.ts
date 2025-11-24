import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

const prisma = new PrismaClient();

/**
 * Remove specific duplicate events from Google Calendar
 */
async function removeDuplicateEvents() {
  console.log('\n🧹 Removing duplicate Google Calendar events...\n');

  const user = await prisma.user.findUnique({
    where: { email: 'james@jamesschaffer.com' },
    select: {
      id: true,
      email: true,
      google_calendar_sync_enabled: true,
      google_refresh_token_enc: true,
      google_calendar_id: true,
    },
  });

  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  // Get the Google Calendar client
  const calendar = await getGoogleCalendarClient(user.id);
  const calendarId = user.google_calendar_id || 'primary';

  // Specific event IDs to delete (the duplicate ones we want to remove)
  const eventsToDelete = [
    'hp7fap6gj19aadseq2jr509g7c',  // Duplicate: Drive to KPC 2034 - Team Practice (Jan 21)
    't66p7oej9bipqmq4psig1nv8gk',  // Duplicate: Drive home from KPC 2034 - Team Practice (Jan 21)
  ];

  let successCount = 0;
  let errorCount = 0;

  for (const eventId of eventsToDelete) {
    try {
      await calendar.events.delete({
        calendarId,
        eventId,
      });

      // Also remove from tracking table if it exists
      const syncRecord = await prisma.userGoogleEventSync.findFirst({
        where: {
          user_id: user.id,
          google_event_id: eventId,
        },
      });

      if (syncRecord) {
        await prisma.userGoogleEventSync.delete({
          where: { id: syncRecord.id },
        });
        console.log(`✅ Deleted event ${eventId} and removed sync record`);
      } else {
        console.log(`✅ Deleted event ${eventId} (no sync record found)`);
      }

      successCount++;
    } catch (error: any) {
      if (error.code === 404) {
        console.log(`⚠️  Event ${eventId} already deleted from Google Calendar`);

        // Still try to remove from tracking table
        const syncRecord = await prisma.userGoogleEventSync.findFirst({
          where: {
            user_id: user.id,
            google_event_id: eventId,
          },
        });

        if (syncRecord) {
          await prisma.userGoogleEventSync.delete({
            where: { id: syncRecord.id },
          });
          console.log(`   Removed sync record for ${eventId}`);
        }

        successCount++;
      } else {
        errorCount++;
        console.error(`❌ Failed to delete event ${eventId}: ${error.message}`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 Cleanup complete!`);
  console.log(`   ✅ Successfully processed: ${successCount} events`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed: ${errorCount} events`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await prisma.$disconnect();
}

removeDuplicateEvents().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
