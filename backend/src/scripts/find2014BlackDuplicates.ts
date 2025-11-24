import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

const prisma = new PrismaClient();

async function find2014BlackDuplicates() {
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
    console.error('User not found');
    process.exit(1);
  }

  console.log(`Checking Google Calendar for duplicates...`);

  // Get the Google Calendar client
  const calendar = await getGoogleCalendarClient(user.id);
  const calendarId = user.google_calendar_id || 'primary';

  // List events around the time shown in the screenshot (seems to be late 2025)
  const response = await calendar.events.list({
    calendarId,
    q: '2014 Black',
    timeMin: '2025-01-01T00:00:00Z',
    timeMax: '2026-12-31T23:59:59Z',
    maxResults: 200,
    singleEvents: true,
    orderBy: 'startTime',
  });

  console.log(`\nFound ${response.data.items?.length || 0} "2014 Black" events`);

  // Group events by their start time and title to find duplicates
  const eventsByKey = new Map<string, any[]>();

  response.data.items?.forEach((event) => {
    const key = `${event.summary}|${event.start?.dateTime || event.start?.date}`;
    if (!eventsByKey.has(key)) {
      eventsByKey.set(key, []);
    }
    eventsByKey.get(key)!.push(event);
  });

  // Find and display duplicates
  console.log('\n🔍 Duplicate events found:');
  let duplicateGroups = 0;

  eventsByKey.forEach((events, key) => {
    if (events.length > 1) {
      duplicateGroups++;
      const [title, startTime] = key.split('|');
      console.log(`\n${duplicateGroups}. ${title}`);
      console.log(`   Start: ${startTime}`);
      console.log(`   ${events.length} instances:`);

      events.forEach((event, index) => {
        console.log(`     [${index + 1}] ID: ${event.id}`);
        console.log(`         Location: ${event.location || 'No location'}`);
      });
    }
  });

  if (duplicateGroups === 0) {
    console.log('\n✅ No duplicates found!');
  }

  await prisma.$disconnect();
}

find2014BlackDuplicates().catch(console.error);
