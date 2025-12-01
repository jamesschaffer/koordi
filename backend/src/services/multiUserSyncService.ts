import { syncMainEventToGoogleCalendar, deleteMainEventFromGoogleCalendar } from './mainEventGoogleCalendarSync';
import { syncSupplementalEventToGoogleCalendar, deleteSupplementalEventFromGoogleCalendar } from './googleCalendarSyncService';
import { prisma } from '../lib/prisma';

/**
 * Get all calendar members (accepted only) for an event's calendar
 * @param eventId - The event ID
 * @returns Array of user IDs who are members of this event's calendar
 */
export async function getEventCalendarMembers(eventId: string): Promise<string[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      event_calendar: {
        include: {
          members: {
            where: {
              status: 'accepted',
            },
            select: {
              user_id: true,
            },
          },
          owner: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    return [];
  }

  // Combine owner and members (filter out null user_ids from pending invitations)
  const memberIds = event.event_calendar.members
    .filter((m) => m.user_id !== null)
    .map((m) => m.user_id as string);

  // Add owner if not already in members list
  if (!memberIds.includes(event.event_calendar.owner.id)) {
    memberIds.push(event.event_calendar.owner.id);
  }

  return memberIds;
}

/**
 * Get all calendar members who have keep_supplemental_events enabled
 * (excluding the assigned user, who always sees supplemental events)
 * @param eventId - The event ID
 * @param assignedUserId - The user assigned to the event (to exclude)
 * @returns Array of user IDs who should see supplemental events
 */
export async function getSupplementalEventViewers(
  eventId: string,
  assignedUserId: string
): Promise<string[]> {
  const memberIds = await getEventCalendarMembers(eventId);

  // Get users who have keep_supplemental_events enabled
  const users = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      keep_supplemental_events: true,
    },
    select: {
      id: true,
    },
  });

  // Filter out the assigned user (they get supplemental events regardless of toggle)
  return users.map((u) => u.id).filter((id) => id !== assignedUserId);
}

/**
 * Sync a main event to all calendar members
 * Tracks each sync in the UserGoogleEventSync table
 * Optimized to batch-fetch all user data to eliminate N+1 queries
 * @param eventId - The event ID
 */
export async function syncMainEventToAllMembers(eventId: string): Promise<void> {
  // Step 1: Fetch event with calendar info and assigned user (1 query)
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      assigned_to: {
        select: {
          id: true,
          name: true,
        },
      },
      event_calendar: {
        include: {
          child: true,
          members: {
            where: { status: 'accepted' },
            select: {
              user_id: true,
              user: {
                select: {
                  id: true,
                  google_calendar_sync_enabled: true,
                  google_refresh_token_enc: true,
                  google_calendar_id: true,
                },
              },
            },
          },
          owner: {
            select: {
              id: true,
              google_calendar_sync_enabled: true,
              google_refresh_token_enc: true,
              google_calendar_id: true,
            },
          },
        },
      },
    },
  });

  if (!event) {
    console.error(`Event ${eventId} not found`);
    return;
  }

  // Step 2: Build member list and user map from batch-fetched data
  const userMap = new Map<string, any>();
  const memberIds: string[] = [];

  // Add members
  event.event_calendar.members.forEach((m) => {
    console.log(`[DEBUG] Member data:`, {
      user_id: m.user_id,
      user_exists: !!m.user,
      user_data: m.user ? {
        id: m.user.id,
        sync_enabled: m.user.google_calendar_sync_enabled,
        has_refresh_token: !!m.user.google_refresh_token_enc,
      } : null,
    });
    if (m.user && m.user_id) {
      userMap.set(m.user.id, m.user);
      memberIds.push(m.user.id);
    }
  });

  // Add owner if not already in members
  const owner = event.event_calendar.owner;
  console.log(`[DEBUG] Owner data:`, {
    owner_exists: !!owner,
    owner_data: owner ? {
      id: owner.id,
      sync_enabled: owner.google_calendar_sync_enabled,
      has_refresh_token: !!owner.google_refresh_token_enc,
    } : null,
  });
  if (owner && !memberIds.includes(owner.id)) {
    userMap.set(owner.id, owner);
    memberIds.push(owner.id);
  }

  // Step 3: Fetch existing sync records for all members (1 query)
  const existingSyncs = await prisma.userGoogleEventSync.findMany({
    where: {
      event_id: eventId,
      sync_type: 'main',
      user_id: { in: memberIds },
    },
  });

  const existingSyncMap = new Map(
    existingSyncs.map((sync) => [sync.user_id, sync])
  );

  console.log(`Syncing main event ${eventId} to ${memberIds.length} calendar members (batch-optimized)`);

  // Step 4: Sync to each member in parallel, using batch-fetched data
  await Promise.all(
    memberIds.map(async (userId) => {
      try {
        const user = userMap.get(userId);

        console.log(`[DEBUG] Syncing to user ${userId}:`, {
          user_exists: !!user,
          user_data: user ? {
            id: user.id,
            sync_enabled: user.google_calendar_sync_enabled,
            sync_enabled_type: typeof user.google_calendar_sync_enabled,
            has_refresh_token: !!user.google_refresh_token_enc,
            refresh_token_type: typeof user.google_refresh_token_enc,
          } : null,
        });

        // Check if user has sync enabled (using batch-fetched data)
        if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
          console.log(`Google Calendar sync not enabled for user ${userId}`, {
            user_is_falsy: !user,
            sync_enabled_is_falsy: !user?.google_calendar_sync_enabled,
            refresh_token_is_falsy: !user?.google_refresh_token_enc,
          });
          return;
        }

        // Sync using batch-fetched context
        const googleEventId = await syncMainEventToGoogleCalendar(
          eventId,
          userId,
          { event, user, existingSync: existingSyncMap.get(userId) }
        );

        if (googleEventId) {
          // Record the sync in our tracking table
          await prisma.userGoogleEventSync.upsert({
            where: {
              user_id_event_id: {
                user_id: userId,
                event_id: eventId,
              },
            },
            create: {
              user_id: userId,
              event_id: eventId,
              google_event_id: googleEventId,
              sync_type: 'main',
            },
            update: {
              google_event_id: googleEventId,
            },
          });

          console.log(`Synced main event ${eventId} to user ${userId}: ${googleEventId}`);
        }
      } catch (error) {
        console.error(`Failed to sync main event ${eventId} to user ${userId}:`, error);
        // Don't throw - partial failures shouldn't break the whole sync
      }
    })
  );
}

/**
 * Delete a main event from all calendar members' Google Calendars
 * @param eventId - The event ID
 */
export async function deleteMainEventFromAllMembers(eventId: string): Promise<void> {
  // Get all syncs for this event
  const syncs = await prisma.userGoogleEventSync.findMany({
    where: {
      event_id: eventId,
      sync_type: 'main',
    },
  });

  console.log(`Deleting main event ${eventId} from ${syncs.length} users' Google Calendars`);

  // Delete from each user's calendar in parallel
  await Promise.all(
    syncs.map(async (sync) => {
      try {
        await deleteMainEventFromGoogleCalendar(eventId, sync.user_id);

        // Remove the sync record
        await prisma.userGoogleEventSync.delete({
          where: { id: sync.id },
        });

        console.log(`Deleted main event ${eventId} from user ${sync.user_id}`);
      } catch (error) {
        console.error(`Failed to delete main event ${eventId} from user ${sync.user_id}:`, error);
        // Don't throw - partial failures shouldn't break the whole deletion
      }
    })
  );
}

/**
 * Delete all supplemental events for a parent event from all calendar members' Google Calendars
 * @param eventId - The parent event ID
 */
export async function deleteSupplementalEventsFromAllMembers(eventId: string): Promise<void> {
  // Get all supplemental events for this parent event
  const supplementalEvents = await prisma.supplementalEvent.findMany({
    where: { parent_event_id: eventId },
    select: { id: true, type: true },
  });

  console.log(`Deleting ${supplementalEvents.length} supplemental events for parent event ${eventId} from all users' Google Calendars`);

  // For each supplemental event, delete from all users' Google Calendars
  for (const suppEvent of supplementalEvents) {
    // Get all syncs for this supplemental event
    const syncs = await prisma.userGoogleEventSync.findMany({
      where: {
        supplemental_event_id: suppEvent.id,
        sync_type: 'supplemental',
      },
    });

    console.log(`Deleting supplemental event ${suppEvent.id} (${suppEvent.type}) from ${syncs.length} users' Google Calendars`);

    // Delete from each user's calendar in parallel
    await Promise.all(
      syncs.map(async (sync) => {
        try {
          await deleteSupplementalEventFromGoogleCalendar(suppEvent.id, sync.user_id);

          // Remove the sync record
          await prisma.userGoogleEventSync.delete({
            where: { id: sync.id },
          });

          console.log(`Deleted supplemental event ${suppEvent.id} (${suppEvent.type}) from user ${sync.user_id}`);
        } catch (error) {
          console.error(`Failed to delete supplemental event ${suppEvent.id} from user ${sync.user_id}:`, error);
          // Don't throw - partial failures shouldn't break the whole deletion
        }
      })
    );
  }
}

/**
 * Sync supplemental events to non-assigned members who have keep_supplemental_events enabled
 * Optimized to batch-fetch all user data to eliminate N+1 queries
 * @param supplementalEventId - The supplemental event ID
 * @param assignedUserId - The user assigned to the parent event
 */
export async function syncSupplementalEventToOptInMembers(
  supplementalEventId: string,
  assignedUserId: string
): Promise<void> {
  // Step 1: Fetch supplemental event with parent event and calendar info (1 query)
  const supplementalEvent = await prisma.supplementalEvent.findUnique({
    where: { id: supplementalEventId },
    include: {
      parent_event: {
        include: {
          event_calendar: {
            include: {
              child: true,
              members: {
                where: {
                  status: 'accepted',
                  user: {
                    keep_supplemental_events: true,
                  },
                },
                select: {
                  user_id: true,
                  user: {
                    select: {
                      id: true,
                      google_calendar_sync_enabled: true,
                      google_refresh_token_enc: true,
                      google_calendar_id: true,
                    },
                  },
                },
              },
              owner: {
                select: {
                  id: true,
                  keep_supplemental_events: true,
                  google_calendar_sync_enabled: true,
                  google_refresh_token_enc: true,
                  google_calendar_id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!supplementalEvent) {
    return;
  }

  // Step 2: Build viewer list (exclude assigned user)
  const userMap = new Map<string, any>();
  const viewerIds: string[] = [];

  // Add members who have keep_supplemental_events enabled
  supplementalEvent.parent_event.event_calendar.members.forEach((m) => {
    if (m.user && m.user_id && m.user_id !== assignedUserId) {
      userMap.set(m.user.id, m.user);
      viewerIds.push(m.user.id);
    }
  });

  // Add owner if they have keep_supplemental_events enabled and are not the assigned user
  const owner = supplementalEvent.parent_event.event_calendar.owner;
  if (owner && owner.id !== assignedUserId && owner.keep_supplemental_events && !viewerIds.includes(owner.id)) {
    userMap.set(owner.id, owner);
    viewerIds.push(owner.id);
  }

  if (viewerIds.length === 0) {
    console.log(`No opt-in members to sync supplemental event ${supplementalEventId}`);
    return;
  }

  // Step 3: Fetch existing sync records for all viewers (1 query)
  const existingSyncs = await prisma.userGoogleEventSync.findMany({
    where: {
      supplemental_event_id: supplementalEventId,
      sync_type: 'supplemental',
      user_id: { in: viewerIds },
    },
  });

  const existingSyncMap = new Map(
    existingSyncs.map((sync) => [sync.user_id, sync])
  );

  console.log(
    `Syncing supplemental event ${supplementalEventId} to ${viewerIds.length} opt-in members (batch-optimized)`
  );

  // Step 4: Sync to each viewer in parallel, using batch-fetched data
  await Promise.all(
    viewerIds.map(async (userId) => {
      try {
        const user = userMap.get(userId);

        // Check if user has sync enabled (using batch-fetched data)
        if (!user || !user.google_calendar_sync_enabled || !user.google_refresh_token_enc) {
          console.log(`Google Calendar sync not enabled for user ${userId}`);
          return;
        }

        // Sync using batch-fetched context
        const googleEventId = await syncSupplementalEventToGoogleCalendar(
          supplementalEventId,
          userId,
          {
            supplementalEvent,
            user,
            existingSync: existingSyncMap.get(userId),
          }
        );

        if (googleEventId) {
          // Record the sync in our tracking table
          await prisma.userGoogleEventSync.upsert({
            where: {
              user_id_supplemental_event_id: {
                user_id: userId,
                supplemental_event_id: supplementalEventId,
              },
            },
            create: {
              user_id: userId,
              supplemental_event_id: supplementalEventId,
              google_event_id: googleEventId,
              sync_type: 'supplemental',
            },
            update: {
              google_event_id: googleEventId,
            },
          });

          console.log(`Synced supplemental event ${supplementalEventId} to user ${userId}: ${googleEventId}`);
        }
      } catch (error) {
        console.error(`Failed to sync supplemental event ${supplementalEventId} to user ${userId}:`, error);
        // Don't throw - partial failures shouldn't break the whole sync
      }
    })
  );
}

/**
 * Delete supplemental events from opt-in members' Google Calendars
 * @param supplementalEventId - The supplemental event ID
 */
export async function deleteSupplementalEventFromOptInMembers(
  supplementalEventId: string
): Promise<void> {
  // Get all syncs for this supplemental event (excluding assigned user, handled separately)
  const syncs = await prisma.userGoogleEventSync.findMany({
    where: {
      supplemental_event_id: supplementalEventId,
      sync_type: 'supplemental',
    },
  });

  console.log(
    `Deleting supplemental event ${supplementalEventId} from ${syncs.length} opt-in members' Google Calendars`
  );

  // Delete from each user's calendar in parallel
  await Promise.all(
    syncs.map(async (sync) => {
      try {
        await deleteSupplementalEventFromGoogleCalendar(supplementalEventId, sync.user_id);

        // Remove the sync record
        await prisma.userGoogleEventSync.delete({
          where: { id: sync.id },
        });

        console.log(`Deleted supplemental event ${supplementalEventId} from user ${sync.user_id}`);
      } catch (error) {
        console.error(
          `Failed to delete supplemental event ${supplementalEventId} from user ${sync.user_id}:`,
          error
        );
        // Don't throw - partial failures shouldn't break the whole deletion
      }
    })
  );
}

/**
 * Handle retention toggle change for a user
 * When keep_supplemental_events is enabled: sync all supplemental events to user
 * When disabled: delete all supplemental events from user
 * @param userId - The user ID
 * @param enabled - Whether to enable or disable supplemental events
 */
export async function handleRetentionToggleChange(userId: string, enabled: boolean): Promise<void> {
  // Get all event calendars the user is a member of
  const memberships = await prisma.eventCalendarMembership.findMany({
    where: {
      user_id: userId,
      status: 'accepted',
    },
    include: {
      event_calendar: {
        include: {
          events: {
            where: {
              assigned_to_user_id: { not: userId }, // Exclude events assigned to this user
            },
            include: {
              supplemental_events: true,
            },
          },
        },
      },
    },
  });

  // Collect all supplemental events from events this user is NOT assigned to
  const supplementalEventIds: string[] = [];
  memberships.forEach((membership) => {
    membership.event_calendar.events.forEach((event) => {
      event.supplemental_events.forEach((se) => {
        supplementalEventIds.push(se.id);
      });
    });
  });

  console.log(
    `${enabled ? 'Syncing' : 'Deleting'} ${supplementalEventIds.length} supplemental events for user ${userId}`
  );

  if (enabled) {
    // Sync all supplemental events to this user
    await Promise.all(
      supplementalEventIds.map(async (supplementalEventId) => {
        try {
          const googleEventId = await syncSupplementalEventToGoogleCalendar(supplementalEventId, userId);

          if (googleEventId) {
            await prisma.userGoogleEventSync.upsert({
              where: {
                user_id_supplemental_event_id: {
                  user_id: userId,
                  supplemental_event_id: supplementalEventId,
                },
              },
              create: {
                user_id: userId,
                supplemental_event_id: supplementalEventId,
                google_event_id: googleEventId,
                sync_type: 'supplemental',
              },
              update: {
                google_event_id: googleEventId,
              },
            });
          }
        } catch (error) {
          console.error(`Failed to sync supplemental event ${supplementalEventId} to user ${userId}:`, error);
        }
      })
    );
  } else {
    // Delete all supplemental events from this user's calendar
    const syncs = await prisma.userGoogleEventSync.findMany({
      where: {
        user_id: userId,
        sync_type: 'supplemental',
      },
    });

    await Promise.all(
      syncs.map(async (sync) => {
        try {
          if (sync.supplemental_event_id) {
            await deleteSupplementalEventFromGoogleCalendar(sync.supplemental_event_id, userId);
          }

          await prisma.userGoogleEventSync.delete({
            where: { id: sync.id },
          });
        } catch (error) {
          console.error(`Failed to delete supplemental event sync ${sync.id} for user ${userId}:`, error);
        }
      })
    );
  }
}
