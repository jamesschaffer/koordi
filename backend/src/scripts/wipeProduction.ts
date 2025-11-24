import { prisma } from '../lib/prisma';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('⚠️  WARNING: This will DELETE ALL DATA from the production database!');
  console.log('Database:', process.env.DATABASE_URL?.split('@')[1]?.split('?')[0]);

  // Safety check - only run if DATABASE_URL contains the production host
  if (!process.env.DATABASE_URL?.includes('104.198.219.130')) {
    console.error('❌ This script only runs on production database (104.198.219.130)');
    process.exit(1);
  }

  console.log('\n🗑️  Deleting all data...\n');

  // Delete in order respecting foreign key constraints
  const eventsDeleted = await prisma.event.deleteMany({});
  console.log(`✅ Deleted ${eventsDeleted.count} events`);

  const membershipsDeleted = await prisma.eventCalendarMembership.deleteMany({});
  console.log(`✅ Deleted ${membershipsDeleted.count} calendar memberships`);

  const calendarsDeleted = await prisma.eventCalendar.deleteMany({});
  console.log(`✅ Deleted ${calendarsDeleted.count} event calendars`);

  const childrenDeleted = await prisma.child.deleteMany({});
  console.log(`✅ Deleted ${childrenDeleted.count} children`);

  const usersDeleted = await prisma.user.deleteMany({});
  console.log(`✅ Deleted ${usersDeleted.count} users`);

  console.log('\n✨ Production database wiped successfully!');
  console.log('\n📊 Verifying counts...');

  // Verify all tables are empty
  const userCount = await prisma.user.count();
  const childCount = await prisma.child.count();
  const calendarCount = await prisma.eventCalendar.count();
  const membershipCount = await prisma.eventCalendarMembership.count();
  const eventCount = await prisma.event.count();

  console.log(`Users: ${userCount}`);
  console.log(`Children: ${childCount}`);
  console.log(`Event Calendars: ${calendarCount}`);
  console.log(`Memberships: ${membershipCount}`);
  console.log(`Events: ${eventCount}`);

  if (userCount === 0 && childCount === 0 && calendarCount === 0 && membershipCount === 0 && eventCount === 0) {
    console.log('\n✅ Database is completely clean!');
  } else {
    console.log('\n⚠️  Warning: Some records remain');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
