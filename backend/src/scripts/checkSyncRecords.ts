import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSyncRecords() {
  const user = await prisma.user.findUnique({
    where: { email: 'james@jamesschaffer.com' },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  console.log(`Checking sync records for ${user.email}...`);

  const syncRecords = await prisma.userGoogleEventSync.findMany({
    where: { user_id: user.id },
    include: {
      event: {
        select: { title: true, start_time: true },
      },
      supplemental_event: {
        select: { title: true, start_time: true },
      },
    },
  });

  console.log(`\nFound ${syncRecords.length} sync records:`);
  syncRecords.forEach(sync => {
    const title = sync.event?.title || sync.supplemental_event?.title || 'Unknown';
    const startTime = sync.event?.start_time || sync.supplemental_event?.start_time;
    console.log(`- ${title} (${sync.sync_type}) - Google ID: ${sync.google_event_id} - Start: ${startTime}`);
  });

  await prisma.$disconnect();
}

checkSyncRecords().catch(console.error);
