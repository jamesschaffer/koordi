import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../lib/prisma';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'james@jamesschaffer.com' },
  });

  if (!user) {
    console.log('❌ User not found');
    return;
  }

  console.log('User ID:', user.id);
  console.log('Email:', user.email);
  console.log('google_calendar_sync_enabled:', user.google_calendar_sync_enabled);
  console.log('Has google_refresh_token_enc:', Boolean(user.google_refresh_token_enc));
  console.log('google_refresh_token_enc length:', user.google_refresh_token_enc?.length || 0);
  console.log('google_calendar_id:', user.google_calendar_id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
