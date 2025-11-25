import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findJamesUsers() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        contains: 'james',
      },
    },
    select: {
      id: true,
      email: true,
      google_calendar_sync_enabled: true,
      google_refresh_token_enc: true,
      google_calendar_id: true,
    },
  });

  console.log('Users with "james" in email:');
  console.log(users.map(u => ({
    id: u.id,
    email: u.email,
    sync_enabled: u.google_calendar_sync_enabled,
    has_refresh_token: !!u.google_refresh_token_enc,
    google_calendar_id: u.google_calendar_id,
  })));

  await prisma.$disconnect();
}

findJamesUsers().catch(console.error);
