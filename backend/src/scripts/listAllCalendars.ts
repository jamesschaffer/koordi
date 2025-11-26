import { prisma } from '../lib/prisma';

async function listAllCalendars() {
  const calendars = await prisma.eventCalendar.findMany({
    include: {
      owner: {
        select: { email: true, name: true, id: true }
      },
      members: {
        include: {
          user: {
            select: { email: true, name: true }
          }
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });

  console.log('\n=== ALL CALENDARS IN DATABASE ===\n');
  console.log(`Total: ${calendars.length}\n`);

  calendars.forEach((cal, idx) => {
    console.log(`${idx + 1}. ${cal.name}`);
    console.log(`   ID: ${cal.id}`);
    console.log(`   Owner: ${cal.owner.name} (${cal.owner.email})`);
    console.log(`   Members: ${cal.members.length}`);

    const acceptedMembers = cal.members.filter(m => m.status === 'accepted');
    console.log(`   Accepted: ${acceptedMembers.length}`);

    if (acceptedMembers.length > 0) {
      acceptedMembers.forEach(m => {
        console.log(`     - ${m.invited_email} ${m.user ? `(${m.user.name})` : '(pending)'}`);
      });
    }
    console.log('');
  });

  await prisma.$disconnect();
}

listAllCalendars().catch(console.error);
