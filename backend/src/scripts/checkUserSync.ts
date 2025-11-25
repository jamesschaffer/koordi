import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserSync() {
  const email = 'james.schaffer@rialtic.io';

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      google_calendar_sync_enabled: true,
      google_refresh_token_enc: true,
      google_calendar_id: true,
    },
  });

  if (!user) {
    console.log(`User ${email} not found`);
    return;
  }

  console.log('User sync status:');
  console.log({
    id: user.id,
    email: user.email,
    google_calendar_sync_enabled: user.google_calendar_sync_enabled,
    has_refresh_token: !!user.google_refresh_token_enc,
    google_calendar_id: user.google_calendar_id,
  });

  // Check membership status
  const memberships = await prisma.eventCalendarMembership.findMany({
    where: { user_id: user.id },
    include: {
      event_calendar: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  console.log('\nCalendar memberships:');
  console.log(memberships.map((m: any) => ({
    calendar_id: m.event_calendar_id,
    calendar_name: m.event_calendar.name,
    status: m.status,
  })));

  await prisma.$disconnect();
}

checkUserSync().catch(console.error);
