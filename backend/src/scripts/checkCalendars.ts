import { prisma } from '../lib/prisma';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const calendars = await prisma.eventCalendar.findMany({
    take: 5,
    select: {
      id: true,
      name: true,
      owner_id: true,
      sync_enabled: true,
    },
  });

  console.log(`Total calendars found: ${calendars.length}`);
  calendars.forEach((cal) => {
    console.log(`- ${cal.name} (ID: ${cal.id}, Owner: ${cal.owner_id}, Sync: ${cal.sync_enabled})`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
