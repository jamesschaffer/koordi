import { prisma } from '../lib/prisma';

async function checkCalendarMembers() {
  const calendarId = '461e1eab-7eac-4c79-b927-d4e2d5e5c4ae';

  const calendar = await prisma.eventCalendar.findUnique({
    where: { id: calendarId },
    include: {
      owner: {
        select: { email: true, name: true }
      },
      members: {
        include: {
          user: {
            select: { email: true, name: true }
          }
        },
        orderBy: { invited_at: 'desc' }
      }
    }
  });

  if (!calendar) {
    console.log('Calendar not found');
    await prisma.$disconnect();
    return;
  }

  console.log('\n=== CALENDAR INFORMATION ===');
  console.log(`Name: ${calendar.name}`);
  console.log(`Owner: ${calendar.owner.name} (${calendar.owner.email})`);
  console.log(`\n=== MEMBERS (${calendar.members.length}) ===\n`);

  calendar.members.forEach((member, idx) => {
    console.log(`${idx + 1}. ${member.invited_email}`);
    console.log(`   Status: ${member.status}`);
    console.log(`   User: ${member.user ? `${member.user.name} (${member.user.email})` : 'Pending invitation'}`);
    console.log(`   Role: ${member.user_id === calendar.owner_id ? 'Owner' : 'Member'}`);
    console.log('');
  });

  // Count accepted members
  const acceptedCount = calendar.members.filter(m => m.status === 'accepted').length;
  console.log(`\nAccepted members: ${acceptedCount}`);
  console.log(`Pending invitations: ${calendar.members.filter(m => m.status === 'pending').length}`);

  if (acceptedCount >= 1) {
    console.log('\n⚠️  Cannot delete: Calendar has accepted members');
    console.log('   Remove all other members before deleting');
  } else {
    console.log('\n✅ Can delete: Only owner remains');
  }

  await prisma.$disconnect();
}

checkCalendarMembers().catch(console.error);
