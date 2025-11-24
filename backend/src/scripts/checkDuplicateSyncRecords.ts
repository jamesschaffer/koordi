import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicateSyncRecords() {
  const user = await prisma.user.findUnique({
    where: { email: 'james@jamesschaffer.com' },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  console.log(`\n🔍 Checking for duplicate sync records for ${user.email}...\n`);

  // Get all sync records for main events
  const mainEventSyncs = await prisma.userGoogleEventSync.findMany({
    where: {
      user_id: user.id,
      sync_type: 'main',
    },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          start_time: true,
        },
      },
    },
  });

  console.log(`Found ${mainEventSyncs.length} total main event sync records`);

  // Group by event_id to find duplicates
  const eventGroups = new Map<string, any[]>();

  mainEventSyncs.forEach(sync => {
    if (!sync.event_id) return;

    if (!eventGroups.has(sync.event_id)) {
      eventGroups.set(sync.event_id, []);
    }
    eventGroups.get(sync.event_id)!.push(sync);
  });

  let duplicateCount = 0;

  console.log('\n📊 Events with duplicate sync records:\n');

  eventGroups.forEach((syncs, eventId) => {
    if (syncs.length > 1) {
      duplicateCount++;
      const event = syncs[0].event;
      console.log(`${duplicateCount}. "${event?.title}" (Event ID: ${eventId})`);
      console.log(`   ${syncs.length} sync records:`);
      syncs.forEach((sync, index) => {
        console.log(`     [${index + 1}] Sync ID: ${sync.id}, Google Event ID: ${sync.google_event_id}`);
      });
      console.log('');
    }
  });

  if (duplicateCount === 0) {
    console.log('✅ No duplicate sync records found!');
  } else {
    console.log(`\n⚠️  Found ${duplicateCount} events with duplicate sync records`);
  }

  await prisma.$disconnect();
}

checkDuplicateSyncRecords().catch(console.error);
