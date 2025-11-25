import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('🗑️  Starting database reset...\n');

  try {
    // Delete in order to respect foreign key constraints
    console.log('Deleting user_google_event_syncs...');
    await prisma.userGoogleEventSync.deleteMany({});

    console.log('Deleting supplemental_events...');
    await prisma.supplementalEvent.deleteMany({});

    console.log('Deleting events...');
    await prisma.event.deleteMany({});

    console.log('Deleting event_calendar_memberships...');
    await prisma.eventCalendarMembership.deleteMany({});

    console.log('Deleting event_calendars...');
    await prisma.eventCalendar.deleteMany({});

    console.log('Deleting children...');
    await prisma.child.deleteMany({});

    console.log('Deleting users...');
    await prisma.user.deleteMany({});

    console.log('\n✅ Database reset complete!');
    console.log('All tables have been cleared.\n');

    // Show counts to verify
    const counts = {
      users: await prisma.user.count(),
      children: await prisma.child.count(),
      eventCalendars: await prisma.eventCalendar.count(),
      events: await prisma.event.count(),
      memberships: await prisma.eventCalendarMembership.count(),
      supplementalEvents: await prisma.supplementalEvent.count(),
      syncs: await prisma.userGoogleEventSync.count(),
    };

    console.log('📊 Final counts:');
    console.log(counts);

    if (Object.values(counts).every(count => count === 0)) {
      console.log('\n✅ All tables are empty - database is clean!');
    } else {
      console.log('\n⚠️  Warning: Some tables still have data');
    }

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
