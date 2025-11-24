#!/usr/bin/env node
/**
 * Database Reset Script - Option 1
 *
 * Completely resets a user's account to simulate first-time setup.
 * This allows for rapid testing iteration after Phase 4 refactoring.
 *
 * Usage:
 *   npx ts-node src/scripts/resetUserAccount.ts <user_email>
 *   npx ts-node src/scripts/resetUserAccount.ts james@jamesschaffer.com
 *
 * What it does:
 * 1. Deletes all EventCalendarMemberships (both owned and invited)
 * 2. Deletes all UserGoogleEventSync records
 * 3. Deletes all SupplementalEvents for user's events
 * 4. Deletes all Events for user's calendars
 * 5. Deletes all EventCalendars owned by user
 * 6. Deletes all Children
 * 7. Resets user profile fields (home address, Google tokens, etc.)
 *
 * What it preserves:
 * - User account (email, name, avatar)
 * - User ID (so OAuth sessions still work)
 */

import dotenv from 'dotenv';
dotenv.config();

import { prisma } from '../lib/prisma';

async function resetUserAccount(userEmail: string) {
  console.log(`\n🧹 Starting account reset for: ${userEmail}\n`);

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!user) {
    console.error(`❌ User not found: ${userEmail}`);
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.name} (${user.email})`);
  console.log(`   User ID: ${user.id}\n`);

  const stats = {
    memberships: 0,
    googleSyncs: 0,
    supplementalEvents: 0,
    events: 0,
    calendars: 0,
    children: 0,
  };

  try {
    // Step 1: Delete all calendar memberships (invited to other calendars)
    console.log('📋 Step 1: Deleting calendar memberships...');
    const deletedMemberships = await prisma.eventCalendarMembership.deleteMany({
      where: {
        OR: [
          { user_id: user.id },
          { invited_email: userEmail },
        ],
      },
    });
    stats.memberships = deletedMemberships.count;
    console.log(`   ✅ Deleted ${stats.memberships} memberships\n`);

    // Step 2: Delete all Google Calendar sync records
    console.log('📅 Step 2: Deleting Google Calendar sync records...');
    const deletedSyncs = await prisma.userGoogleEventSync.deleteMany({
      where: { user_id: user.id },
    });
    stats.googleSyncs = deletedSyncs.count;
    console.log(`   ✅ Deleted ${stats.googleSyncs} sync records\n`);

    // Step 3: Get all calendars owned by user (to delete their events)
    console.log('🗓️  Step 3: Finding user\'s calendars...');
    const userCalendars = await prisma.eventCalendar.findMany({
      where: { owner_id: user.id },
      select: { id: true, name: true },
    });
    console.log(`   Found ${userCalendars.length} calendars\n`);

    // Step 4: Delete all supplemental events for user's calendars
    console.log('🚗 Step 4: Deleting supplemental events...');
    if (userCalendars.length > 0) {
      const calendarIds = userCalendars.map(c => c.id);
      const deletedSupplementalEvents = await prisma.supplementalEvent.deleteMany({
        where: {
          parent_event: {
            event_calendar_id: { in: calendarIds },
          },
        },
      });
      stats.supplementalEvents = deletedSupplementalEvents.count;
    }
    console.log(`   ✅ Deleted ${stats.supplementalEvents} supplemental events\n`);

    // Step 5: Delete all events for user's calendars
    console.log('📆 Step 5: Deleting events...');
    if (userCalendars.length > 0) {
      const calendarIds = userCalendars.map(c => c.id);
      const deletedEvents = await prisma.event.deleteMany({
        where: { event_calendar_id: { in: calendarIds } },
      });
      stats.events = deletedEvents.count;
    }
    console.log(`   ✅ Deleted ${stats.events} events\n`);

    // Step 6: Delete all event calendars
    console.log('🗓️  Step 6: Deleting event calendars...');
    const deletedCalendars = await prisma.eventCalendar.deleteMany({
      where: { owner_id: user.id },
    });
    stats.calendars = deletedCalendars.count;
    console.log(`   ✅ Deleted ${stats.calendars} calendars\n`);

    // Step 7: Delete all children
    // Note: Children are NOT directly related to users in the schema,
    // but they're orphaned after we delete EventCalendars.
    // We should delete children that no longer have any calendars.
    console.log('👶 Step 7: Deleting orphaned children...');
    const orphanedChildren = await prisma.child.findMany({
      where: {
        event_calendars: {
          none: {},
        },
      },
      select: { id: true },
    });

    if (orphanedChildren.length > 0) {
      const deletedChildren = await prisma.child.deleteMany({
        where: {
          id: { in: orphanedChildren.map(c => c.id) },
        },
      });
      stats.children = deletedChildren.count;
    }
    console.log(`   ✅ Deleted ${stats.children} children\n`);

    // Step 8: Reset user profile fields
    console.log('👤 Step 8: Resetting user profile...');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        google_refresh_token_enc: null,
        google_calendar_id: null,
        google_calendar_sync_enabled: false,
        home_address: null,
        home_latitude: null,
        home_longitude: null,
        comfort_buffer_minutes: 5, // Reset to default
        keep_supplemental_events: false, // Reset to default
      },
    });
    console.log(`   ✅ Reset profile fields\n`);

    // Summary
    console.log('📊 Reset Summary:');
    console.log(`   ✅ Memberships deleted: ${stats.memberships}`);
    console.log(`   ✅ Google sync records deleted: ${stats.googleSyncs}`);
    console.log(`   ✅ Supplemental events deleted: ${stats.supplementalEvents}`);
    console.log(`   ✅ Events deleted: ${stats.events}`);
    console.log(`   ✅ Calendars deleted: ${stats.calendars}`);
    console.log(`   ✅ Children deleted: ${stats.children}`);
    console.log(`\n✨ Account reset complete! User can now simulate first-time setup.\n`);

  } catch (error) {
    console.error('\n❌ Reset failed:', error);
    process.exit(1);
  }
}

// Get user email from command line
const userEmail = process.argv[2];

if (!userEmail) {
  console.error('❌ Usage: npx ts-node src/scripts/resetUserAccount.ts <user_email>');
  console.error('   Example: npx ts-node src/scripts/resetUserAccount.ts james@jamesschaffer.com');
  process.exit(1);
}

resetUserAccount(userEmail)
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
