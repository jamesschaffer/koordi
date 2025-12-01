/**
 * Script to find a specific orphaned event in James's calendar
 */

import { prisma } from '../lib/prisma';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

async function findSpecificOrphan() {
  console.log('=== Finding specific orphan in James\'s calendar ===\n');

  const user = await prisma.user.findFirst({
    where: { email: 'james@jamesschaffer.com' },
    select: {
      id: true,
      name: true,
      email: true,
      google_calendar_id: true,
    },
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  const calendar = await getGoogleCalendarClient(user.id);
  const calendarId = user.google_calendar_id || 'primary';

  // Search specifically for events around December 13
  const googleEvents = await calendar.events.list({
    calendarId,
    maxResults: 100,
    singleEvents: true,
    timeMin: new Date('2025-12-13T00:00:00Z').toISOString(),
    timeMax: new Date('2025-12-14T00:00:00Z').toISOString(),
  });

  const items = googleEvents.data.items || [];
  console.log(`Found ${items.length} events on December 13`);

  for (const event of items) {
    const summary = event.summary || 'No title';
    const description = event.description || '';

    // Check if it looks like our orphan
    if (summary.includes('Futsal') || summary.includes('Placeholder') || description.includes('Koordie') || description.includes('koordie')) {
      console.log('\n⚠️  FOUND ORPHAN CANDIDATE:');
      console.log(`  Title: ${summary}`);
      console.log(`  Google Event ID: ${event.id}`);
      console.log(`  Start: ${event.start?.dateTime || event.start?.date}`);
      console.log(`  Description: ${description.substring(0, 300)}`);
    }
  }

  // Also check sync records for that date
  const syncRecords = await prisma.userGoogleEventSync.findMany({
    where: {
      user_id: user.id,
    },
    include: {
      event: {
        select: {
          title: true,
          start_time: true,
        },
      },
    },
  });

  console.log(`\nTotal sync records: ${syncRecords.length}`);

  // Filter to events around Dec 13
  const dec13Records = syncRecords.filter(s =>
    s.event?.start_time &&
    s.event.start_time >= new Date('2025-12-13') &&
    s.event.start_time < new Date('2025-12-14')
  );

  console.log(`Sync records for Dec 13: ${dec13Records.length}`);
  for (const rec of dec13Records) {
    console.log(`  - ${rec.event?.title} (Google ID: ${rec.google_event_id})`);
  }

  await prisma.$disconnect();
}

findSpecificOrphan()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
