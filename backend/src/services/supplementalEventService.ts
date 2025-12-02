import { parseArrivalTime } from './arrivalTimeParser';
import { calculateDriveTime, geocodeAddress, Coordinates } from './googleMapsService';
import {
  syncSupplementalEventToGoogleCalendar,
  deleteSupplementalEventsForParent,
} from './googleCalendarSyncService';
import {
  syncSupplementalEventToOptInMembers,
  deleteSupplementalEventFromOptInMembers,
} from './multiUserSyncService';
import { prisma } from '../lib/prisma';

export interface SupplementalEventResult {
  departure: any;
  earlyArrival: any | null;
  return: any;
}

/**
 * Create supplemental events (drive-to, optional early-arrival, and drive-home) for an assigned event
 *
 * The comfort buffer is added to the departure drive time, NOT to the arrival time.
 * Early arrival events are ONLY created if the event description explicitly specifies an arrival time.
 *
 * @param eventId - The main event ID
 * @param assignedUserId - The user the event is assigned to
 * @returns Created supplemental events
 */
export async function createSupplementalEvents(
  eventId: string,
  assignedUserId: string
): Promise<SupplementalEventResult> {
  // Fetch the event with all necessary relations
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      event_calendar: {
        include: {
          child: true,
        },
      },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  // Skip all-day events - they don't have specific times for drive time calculations
  if (event.is_all_day) {
    console.log(`Event ${eventId} is an all-day event, skipping supplemental event creation`);
    throw new Error('Cannot create supplemental events for all-day events');
  }

  // Fetch the assigned user's settings and home address
  const user = await prisma.user.findUnique({
    where: { id: assignedUserId },
  });

  if (!user) {
    throw new Error('Assigned user not found');
  }

  // Extract first name from user's full name (first word)
  const firstName = user.name.split(' ')[0];

  // Validate user has home address
  if (!user.home_address || !user.home_latitude || !user.home_longitude) {
    throw new Error('User home address is not set. Please configure home address in settings.');
  }

  // Validate event has location
  if (!event.location) {
    console.warn(`Event ${eventId} has no location, skipping supplemental events`);
    throw new Error('Event location is required to create supplemental events');
  }

  // Parse arrival time from event description (returns null if no arrival time specified)
  const arrivalInfo = parseArrivalTime(event.description, event.start_time);

  // Determine when we need to arrive at the event
  // If there's an explicit arrival time, use that; otherwise, use event start time
  const targetArrivalTime = arrivalInfo ? arrivalInfo.arrivalTime : event.start_time;

  if (arrivalInfo) {
    const earlyMinutes = Math.round((event.start_time.getTime() - arrivalInfo.arrivalTime.getTime()) / 60000);
    console.log(`Event ${event.title}: Parsed arrival time from description (${earlyMinutes} min before event start)`);
  } else {
    console.log(`Event ${event.title}: No arrival time in description, departure will end at event start`);
  }

  // Get event location coordinates (geocode if needed)
  let eventCoordinates: Coordinates;

  if (event.location_lat && event.location_lng) {
    eventCoordinates = {
      lat: Number(event.location_lat),
      lng: Number(event.location_lng),
    };
  } else {
    // Geocode the event location
    const geocoded = await geocodeAddress(event.location);
    eventCoordinates = geocoded.coordinates;

    // Update event with geocoded coordinates for future use
    await prisma.event.update({
      where: { id: eventId },
      data: {
        location_lat: geocoded.coordinates.lat,
        location_lng: geocoded.coordinates.lng,
      },
    });
  }

  const userCoordinates: Coordinates = {
    lat: Number(user.home_latitude),
    lng: Number(user.home_longitude),
  };

  // Calculate drive time from home to event (arriving at target arrival time)
  const driveToEvent = await calculateDriveTime(
    userCoordinates,
    eventCoordinates,
    targetArrivalTime
  );

  // Calculate drive time from event back to home
  const driveFromEvent = await calculateDriveTime(
    eventCoordinates,
    userCoordinates,
    event.end_time
  );

  // Get comfort buffer from user settings
  const comfortBufferMinutes = user.comfort_buffer_minutes;

  // Calculate departure event times
  // Drive time + comfort buffer determines when to leave
  // The departure event ends at the target arrival time
  const totalDepartureMinutes = driveToEvent.duration_in_traffic_minutes + comfortBufferMinutes;
  const departureStartTime = new Date(
    targetArrivalTime.getTime() - totalDepartureMinutes * 60000
  );

  const departureEvent = await prisma.supplementalEvent.create({
    data: {
      parent_event_id: eventId,
      type: 'departure',
      title: `🚗 ${firstName} to drive to event`,
      start_time: departureStartTime,
      end_time: targetArrivalTime,
      origin_address: user.home_address,
      origin_lat: user.home_latitude,
      origin_lng: user.home_longitude,
      destination_address: event.location,
      destination_lat: eventCoordinates.lat,
      destination_lng: eventCoordinates.lng,
      drive_time_minutes: totalDepartureMinutes, // Includes comfort buffer
      last_traffic_check: new Date(),
    },
  });

  // Create early arrival event ONLY if an arrival time was explicitly specified in the description
  let earlyArrivalEvent = null;
  if (arrivalInfo) {
    const earlyArrivalMinutes = Math.round(
      (event.start_time.getTime() - arrivalInfo.arrivalTime.getTime()) / 60000
    );

    earlyArrivalEvent = await prisma.supplementalEvent.create({
      data: {
        parent_event_id: eventId,
        type: 'early_arrival',
        title: `🌅 ${earlyArrivalMinutes} min early arrival`,
        start_time: arrivalInfo.arrivalTime,
        end_time: event.start_time,
        origin_address: event.location,
        origin_lat: eventCoordinates.lat,
        origin_lng: eventCoordinates.lng,
        destination_address: event.location,
        destination_lat: eventCoordinates.lat,
        destination_lng: eventCoordinates.lng,
        drive_time_minutes: 0, // No driving during early arrival
        last_traffic_check: new Date(),
      },
    });
  }

  // Create return supplemental event (event location -> home)
  // Start time: event end time
  // End time: event end time plus drive time (no buffer on return)
  const returnEndTime = new Date(
    event.end_time.getTime() + driveFromEvent.duration_in_traffic_minutes * 60000
  );

  const returnEvent = await prisma.supplementalEvent.create({
    data: {
      parent_event_id: eventId,
      type: 'return',
      title: `🚗 ${firstName} to drive home`,
      start_time: event.end_time,
      end_time: returnEndTime,
      origin_address: event.location,
      origin_lat: eventCoordinates.lat,
      origin_lng: eventCoordinates.lng,
      destination_address: user.home_address,
      destination_lat: user.home_latitude,
      destination_lng: user.home_longitude,
      drive_time_minutes: driveFromEvent.duration_in_traffic_minutes,
      last_traffic_check: new Date(),
    },
  });

  const earlyArrivalDesc = arrivalInfo
    ? `, early_arrival (${Math.round((event.start_time.getTime() - arrivalInfo.arrivalTime.getTime()) / 60000)}min)`
    : '';
  console.log(`Created supplemental events for ${event.title}: departure (${totalDepartureMinutes}min including ${comfortBufferMinutes}min buffer)${earlyArrivalDesc}, return (${driveFromEvent.duration_in_traffic_minutes}min)`);

  // Sync all supplemental events to the assigned user's Google Calendar
  // We await these to ensure google_event_id is set before returning
  // This prevents race conditions when quickly unassigning events
  const syncPromises = [
    syncSupplementalEventToGoogleCalendar(departureEvent.id, assignedUserId).catch((error) => {
      console.error('Failed to sync departure event to Google Calendar:', error);
    }),
    syncSupplementalEventToGoogleCalendar(returnEvent.id, assignedUserId).catch((error) => {
      console.error('Failed to sync return event to Google Calendar:', error);
    }),
  ];

  if (earlyArrivalEvent) {
    syncPromises.push(
      syncSupplementalEventToGoogleCalendar(earlyArrivalEvent.id, assignedUserId).catch((error) => {
        console.error('Failed to sync early arrival event to Google Calendar:', error);
      })
    );
  }

  await Promise.all(syncPromises);

  // Also sync to non-assigned members who have keep_supplemental_events enabled
  // This runs in the background and doesn't block the return
  const optInSyncPromises = [
    syncSupplementalEventToOptInMembers(departureEvent.id, assignedUserId).catch((error) => {
      console.error('Failed to sync departure event to opt-in members:', error);
    }),
    syncSupplementalEventToOptInMembers(returnEvent.id, assignedUserId).catch((error) => {
      console.error('Failed to sync return event to opt-in members:', error);
    }),
  ];

  if (earlyArrivalEvent) {
    optInSyncPromises.push(
      syncSupplementalEventToOptInMembers(earlyArrivalEvent.id, assignedUserId).catch((error) => {
        console.error('Failed to sync early arrival event to opt-in members:', error);
      })
    );
  }

  Promise.all(optInSyncPromises);

  return {
    departure: departureEvent,
    earlyArrival: earlyArrivalEvent,
    return: returnEvent,
  };
}

/**
 * Delete all supplemental events for a given parent event
 * Also deletes from all users' Google Calendars (assigned + opt-in members)
 * @param eventId - The parent event ID
 */
export async function deleteSupplementalEvents(eventId: string): Promise<void> {
  // Get all supplemental events for this parent event
  const supplementalEvents = await prisma.supplementalEvent.findMany({
    where: { parent_event_id: eventId },
    select: { id: true },
  });

  // Delete from opt-in members' calendars first
  await Promise.all(
    supplementalEvents.map((se) =>
      deleteSupplementalEventFromOptInMembers(se.id).catch((error) => {
        console.error(`Failed to delete supplemental event ${se.id} from opt-in members:`, error);
      })
    )
  );

  // Delete from database (this also triggers Google Calendar deletion for assigned user via existing logic)
  await prisma.supplementalEvent.deleteMany({
    where: { parent_event_id: eventId },
  });

  console.log(`Deleted supplemental events for event ${eventId}`);
}

/**
 * Delete specific supplemental event types for a given parent event
 * @param eventId - The parent event ID
 * @param types - Array of event types to delete ('departure', 'early_arrival', 'return')
 */
export async function deleteSupplementalEventsByType(
  eventId: string,
  types: Array<'departure' | 'early_arrival' | 'return'>
): Promise<void> {
  const deleted = await prisma.supplementalEvent.deleteMany({
    where: {
      parent_event_id: eventId,
      type: { in: types },
    },
  });
  console.log(`Deleted ${deleted.count} supplemental events (${types.join(', ')}) for event ${eventId}`);
}

/**
 * Get all supplemental events for a given parent event
 * @param eventId - The parent event ID
 * @returns Array of supplemental events
 */
export async function getSupplementalEvents(eventId: string) {
  return prisma.supplementalEvent.findMany({
    where: { parent_event_id: eventId },
    orderBy: { start_time: 'asc' },
  });
}

/**
 * Update supplemental events when event details change
 * This is called when an event's time or location changes
 * @param eventId - The event ID
 * @param assignedUserId - The user the event is assigned to
 */
export async function updateSupplementalEvents(
  eventId: string,
  assignedUserId: string
): Promise<SupplementalEventResult> {
  // Delete existing supplemental events
  await deleteSupplementalEvents(eventId);

  // Create new supplemental events with updated information
  return createSupplementalEvents(eventId, assignedUserId);
}

/**
 * Handle event reassignment
 * - If event is unassigned: delete supplemental events
 * - If event is assigned to new user: delete old supplemental events and create new ones
 * @param eventId - The event ID
 * @param previousAssignedUserId - The previous assigned user ID (for Google Calendar cleanup)
 * @param newAssignedUserId - The new assigned user ID (null if unassigning)
 */
export async function handleEventReassignment(
  eventId: string,
  previousAssignedUserId: string | null,
  newAssignedUserId: string | null
): Promise<SupplementalEventResult | null> {
  // Delete from previous user's Google Calendar if there was a previous assignment
  if (previousAssignedUserId) {
    await deleteSupplementalEventsForParent(eventId, previousAssignedUserId).catch((error) => {
      console.error('Failed to delete supplemental events from Google Calendar:', error);
    });
  }

  // Always delete existing supplemental events from database
  await deleteSupplementalEvents(eventId);

  // If event is being assigned (not unassigned), create new supplemental events
  if (newAssignedUserId) {
    return createSupplementalEvents(eventId, newAssignedUserId);
  }

  return null;
}
