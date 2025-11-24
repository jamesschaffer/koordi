import { PrismaClient } from '@prisma/client';
import { getGoogleCalendarClient } from '../utils/googleCalendarClient';

const prisma = new PrismaClient();

async function findDuplicateEvents() {
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

  console.log(`Checking Google Calendar for ${user.email}...`);

  // Get the Google Calendar client
  const calendar = await getGoogleCalendarClient(user.id);
  const calendarId = user.google_calendar_id || 'primary';

  // List events containing "KPC 2034"
  const response = await calendar.events.list({
    calendarId,
    q: 'KPC 2034',
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
  });

  console.log(`\nFound ${response.data.items?.length || 0} events with "KPC 2034":`);

  response.data.items?.forEach((event, index) => {
    console.log(`\n${index + 1}. ${event.summary}`);
    console.log(`   ID: ${event.id}`);
    console.log(`   Start: ${event.start?.dateTime || event.start?.date}`);
    console.log(`   Description: ${event.description?.substring(0, 100) || 'None'}`);
  });

  await prisma.$disconnect();
}

findDuplicateEvents().catch(console.error);
