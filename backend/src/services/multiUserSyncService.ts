import { PrismaClient } from '@prisma/client';
import { syncMainEventToGoogleCalendar, deleteMainEventFromGoogleCalendar } from './mainEventGoogleCalendarSync';
import { syncSupplementalEventToGoogleCalendar, deleteSupplementalEventFromGoogleCalendar } from './googleCalendarSyncService';

const prisma = new PrismaClient();

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
 * @param eventId - The event ID
 */
export async function syncMainEventToAllMembers(eventId: string): Promise<void> {
  const memberIds = await getEventCalendarMembers(eventId);

  console.log(`Syncing main event ${eventId} to ${memberIds.length} calendar members`);

  // Sync to each member in parallel
  await Promise.all(
    memberIds.map(async (userId) => {
      try {
        const googleEventId = await syncMainEventToGoogleCalendar(eventId, userId);

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
 * Sync supplemental events to non-assigned members who have keep_supplemental_events enabled
 * @param supplementalEventId - The supplemental event ID
 * @param assignedUserId - The user assigned to the parent event
 */
export async function syncSupplementalEventToOptInMembers(
  supplementalEventId: string,
  assignedUserId: string
): Promise<void> {
  // Get the parent event ID
  const supplementalEvent = await prisma.supplementalEvent.findUnique({
    where: { id: supplementalEventId },
    select: { parent_event_id: true },
  });

  if (!supplementalEvent) {
    return;
  }

  const viewerIds = await getSupplementalEventViewers(supplementalEvent.parent_event_id, assignedUserId);

  console.log(
    `Syncing supplemental event ${supplementalEventId} to ${viewerIds.length} opt-in members`
  );

  // Sync to each viewer in parallel
  await Promise.all(
    viewerIds.map(async (userId) => {
      try {
        const googleEventId = await syncSupplementalEventToGoogleCalendar(supplementalEventId, userId);

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
