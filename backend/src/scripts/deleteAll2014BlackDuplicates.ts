import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

const prisma = new PrismaClient();

/**
 * Delete ALL duplicate 2014 Black events, keeping only one of each
 */
async function deleteAll2014BlackDuplicates() {
  console.log('\n🧹 Removing ALL duplicate 2014 Black (Richardson) events...\n');

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

  console.log(`📅 Fetching all "2014 Black" events from calendar...`);

  // List all 2014 Black events
  const response = await calendar.events.list({
    calendarId,
    q: '2014 Black',
    timeMin: '2025-01-01T00:00:00Z',
    timeMax: '2026-12-31T23:59:59Z',
    maxResults: 2500,
    singleEvents: true,
    orderBy: 'startTime',
  });

  console.log(`Found ${response.data.items?.length || 0} total events\n`);

  // Group events by their start time and title to find duplicates
  const eventsByKey = new Map<string, any[]>();

  response.data.items?.forEach((event) => {
    const key = `${event.summary}|${event.start?.dateTime || event.start?.date}`;
    if (!eventsByKey.has(key)) {
      eventsByKey.set(key, []);
    }
    eventsByKey.get(key)!.push(event);
  });

  let totalDeleted = 0;
  let errorCount = 0;
  let groupsProcessed = 0;

  // For each group, keep the first one and delete the rest
  for (const [key, events] of eventsByKey) {
    if (events.length > 1) {
      groupsProcessed++;
      const [title] = key.split('|');
      const duplicatesToDelete = events.slice(1); // Keep first, delete rest

      console.log(`\n${groupsProcessed}. ${title}`);
      console.log(`   Found ${events.length} instances, deleting ${duplicatesToDelete.length} duplicates...`);

      for (const event of duplicatesToDelete) {
        try {
          await calendar.events.delete({
            calendarId,
            eventId: event.id,
          });

          // Remove from tracking table if exists
          const syncRecord = await prisma.userGoogleEventSync.findFirst({
            where: {
              user_id: user.id,
              google_event_id: event.id,
            },
          });

          if (syncRecord) {
            await prisma.userGoogleEventSync.delete({
              where: { id: syncRecord.id },
            });
          }

          totalDeleted++;
          process.stdout.write('.');

          // Add delay to avoid rate limiting (100ms between deletions)
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          if (error.code === 404) {
            // Event already deleted, just clean up tracking
            const syncRecord = await prisma.userGoogleEventSync.findFirst({
              where: {
                user_id: user.id,
                google_event_id: event.id,
              },
            });

            if (syncRecord) {
              await prisma.userGoogleEventSync.delete({
                where: { id: syncRecord.id },
              });
            }
            totalDeleted++;
            process.stdout.write('.');
          } else if (error.message?.includes('Rate Limit')) {
            // If we hit rate limit, wait 10 seconds and retry
            console.log(`\n   ⏳ Rate limit hit, waiting 10 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 10000));

            try {
              await calendar.events.delete({
                calendarId,
                eventId: event.id,
              });

              const syncRecord = await prisma.userGoogleEventSync.findFirst({
                where: {
                  user_id: user.id,
                  google_event_id: event.id,
                },
              });

              if (syncRecord) {
                await prisma.userGoogleEventSync.delete({
                  where: { id: syncRecord.id },
                });
              }

              totalDeleted++;
              process.stdout.write('.');
            } catch (retryError: any) {
              errorCount++;
              process.stdout.write('X');
              console.error(`\n   ❌ Retry failed for ${event.id}: ${retryError.message}`);
            }
          } else {
            errorCount++;
            process.stdout.write('X');
            console.error(`\n   ❌ Error deleting ${event.id}: ${error.message}`);
          }
        }
      }
      console.log(` Done!`);
    }
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 Cleanup complete!`);
  console.log(`   📊 Processed ${groupsProcessed} event groups`);
  console.log(`   ✅ Successfully deleted: ${totalDeleted} duplicate events`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed: ${errorCount} events`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await prisma.$disconnect();
}

deleteAll2014BlackDuplicates().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
