/**
 * Migration script to rename 'buffer' supplemental events to 'early_arrival'
 *
 * This is a one-time migration to standardize the event type naming.
 * The 'buffer' type was confusing as it mixed the comfort buffer setting
 * with the early arrival period concept.
 *
 * Run with: npx ts-node src/scripts/migrateBufferToEarlyArrival.ts
 */

import { prisma } from '../lib/prisma';

async function migrateBufferToEarlyArrival() {
  console.log('Starting migration: buffer -> early_arrival');

  // Find all supplemental events with type 'buffer'
  const bufferEvents = await prisma.supplementalEvent.findMany({
    where: { type: 'buffer' },
    select: {
      id: true,
      title: true,
      parent_event: {
        select: {
          title: true,
        },
      },
    },
  });

  console.log(`Found ${bufferEvents.length} 'buffer' type events to migrate`);

  if (bufferEvents.length === 0) {
    console.log('No events to migrate. Done.');
    return;
  }

  // Update all buffer events to early_arrival
  const result = await prisma.supplementalEvent.updateMany({
    where: { type: 'buffer' },
    data: { type: 'early_arrival' },
  });

  console.log(`Successfully migrated ${result.count} events from 'buffer' to 'early_arrival'`);

  // List the migrated events for verification
  console.log('\nMigrated events:');
  for (const event of bufferEvents) {
    console.log(`  - ${event.title} (parent: ${event.parent_event.title})`);
  }

  console.log('\nMigration complete!');
}

migrateBufferToEarlyArrival()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
