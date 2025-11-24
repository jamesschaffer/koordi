import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

const prisma = new PrismaClient();

/**
 * Delete Google Calendar events that are NOT tracked in UserGoogleEventSync
 * For events with the same title and start time, keep only the one that's tracked
 */
async function deleteUntrackedDuplicates() {
  console.log('\n🧹 Deleting untracked duplicate events from Google Calendar...\n');

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

  // Get all tracked Google event IDs
  const syncRecords = await prisma.userGoogleEventSync.findMany({
    where: { user_id: user.id },
    select: { google_event_id: true },
  });

  const trackedEventIds = new Set(syncRecords.map(r => r.google_event_id));
  console.log(`📊 Found ${trackedEventIds.size} tracked event IDs in database\n`);

  // Get the Google Calendar client
  const calendar = await getGoogleCalendarClient(user.id);
  const calendarId = user.google_calendar_id || 'primary';

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

  console.log(`📅 Found ${response.data.items?.length || 0} total events in Google Calendar\n`);

  // Group events by title and start time
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

  // For each group with duplicates
  for (const [key, events] of eventsByKey) {
    if (events.length > 1) {
      groupsProcessed++;
      const [title] = key.split('|');

      // Separate tracked and untracked events
      const trackedEvents = events.filter(e => trackedEventIds.has(e.id!));
      const untrackedEvents = events.filter(e => !trackedEventIds.has(e.id!));

      console.log(`\n${groupsProcessed}. ${title}`);
      console.log(`   Total: ${events.length} | Tracked: ${trackedEvents.length} | Untracked: ${untrackedEvents.length}`);

      // Delete all untracked duplicates
      if (untrackedEvents.length > 0) {
        console.log(`   Deleting ${untrackedEvents.length} untracked duplicates...`);

        for (const event of untrackedEvents) {
          try {
            await calendar.events.delete({
              calendarId,
              eventId: event.id!,
            });

            totalDeleted++;
            process.stdout.write('.');

            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error: any) {
            if (error.code === 404) {
              totalDeleted++;
              process.stdout.write('.');
            } else if (error.message?.includes('Rate Limit')) {
              console.log(`\n   ⏳ Rate limit hit, waiting 10 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 10000));

              // Retry
              try {
                await calendar.events.delete({
                  calendarId,
                  eventId: event.id!,
                });
                totalDeleted++;
                process.stdout.write('.');
              } catch (retryError: any) {
                errorCount++;
                process.stdout.write('X');
              }
            } else {
              errorCount++;
              process.stdout.write('X');
            }
          }
        }
        console.log(' Done!');
      }
    }
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 Cleanup complete!`);
  console.log(`   📊 Processed ${groupsProcessed} event groups`);
  console.log(`   ✅ Successfully deleted: ${totalDeleted} untracked duplicate events`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed: ${errorCount} events`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  await prisma.$disconnect();
}

deleteUntrackedDuplicates().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
