import { PrismaClient } from '@prisma/client';
import { parseArrivalTime } from './arrivalTimeParser';
import { calculateDriveTime, geocodeAddress, Coordinates } from './googleMapsService';
import {
  syncSupplementalEventToGoogleCalendar,
  deleteSupplementalEventsForParent,
} from './googleCalendarSyncService';

const prisma = new PrismaClient();

export interface SupplementalEventResult {
  departure: any;
  buffer: any;
  return: any;
}

/**
 * Create supplemental events (drive-to and drive-home) for an assigned event
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

  // Fetch the assigned user's settings and home address
  const user = await prisma.user.findUnique({
    where: { id: assignedUserId },
  });

  if (!user) {
    throw new Error('Assigned user not found');
  }

  // Validate user has home address
  if (!user.home_address || !user.home_latitude || !user.home_longitude) {
    throw new Error('User home address is not set. Please configure home address in settings.');
  }

  // Validate event has location
  if (!event.location) {
    console.warn(`Event ${eventId} has no location, skipping supplemental events`);
    throw new Error('Event location is required to create supplemental events');
  }

  // Parse arrival time from event description
  const arrivalInfo = parseArrivalTime(
    event.description,
    event.start_time,
    user.comfort_buffer_minutes
  );

  console.log(`Event ${event.title}: Using ${arrivalInfo.source} buffer of ${arrivalInfo.bufferMinutes} minutes`);

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

  // Calculate drive time from home to event
  const driveToEvent = await calculateDriveTime(
    userCoordinates,
    eventCoordinates,
    arrivalInfo.arrivalTime
  );

  // Calculate drive time from event back to home
  const driveFromEvent = await calculateDriveTime(
    eventCoordinates,
    userCoordinates,
    event.end_time
  );

  // Create departure supplemental event (home -> event location)
  // Start time: arrival time minus drive time
  // End time: arrival time (when they arrive at the event)
  const departureStartTime = new Date(
    arrivalInfo.arrivalTime.getTime() - driveToEvent.duration_in_traffic_minutes * 60000
  );

  const departureEvent = await prisma.supplementalEvent.create({
    data: {
      parent_event_id: eventId,
      type: 'departure',
      title: `Drive to ${event.title}`,
      start_time: departureStartTime,
      end_time: arrivalInfo.arrivalTime,
      origin_address: user.home_address,
      origin_lat: user.home_latitude,
      origin_lng: user.home_longitude,
      destination_address: event.location,
      destination_lat: eventCoordinates.lat,
      destination_lng: eventCoordinates.lng,
      drive_time_minutes: driveToEvent.duration_in_traffic_minutes,
      last_traffic_check: new Date(),
    },
  });

  // Create buffer supplemental event (early arrival time)
  // Start time: arrival time (when drive ends)
  // End time: event start time
  // This represents the buffer period where you arrive early before the event starts
  const bufferMinutes = Math.round(
    (event.start_time.getTime() - arrivalInfo.arrivalTime.getTime()) / 60000
  );

  const bufferEvent = await prisma.supplementalEvent.create({
    data: {
      parent_event_id: eventId,
      type: 'buffer',
      title: `Early arrival for ${event.title}`,
      start_time: arrivalInfo.arrivalTime,
      end_time: event.start_time,
      origin_address: event.location,
      origin_lat: eventCoordinates.lat,
      origin_lng: eventCoordinates.lng,
      destination_address: event.location,
      destination_lat: eventCoordinates.lat,
      destination_lng: eventCoordinates.lng,
      drive_time_minutes: 0, // No driving during buffer
      last_traffic_check: new Date(),
    },
  });

  // Create return supplemental event (event location -> home)
  // Start time: event end time
  // End time: event end time plus drive time
  const returnEndTime = new Date(
    event.end_time.getTime() + driveFromEvent.duration_in_traffic_minutes * 60000
  );

  const returnEvent = await prisma.supplementalEvent.create({
    data: {
      parent_event_id: eventId,
      type: 'return',
      title: `Drive home from ${event.title}`,
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

  console.log(`Created supplemental events for ${event.title}: departure (${driveToEvent.duration_in_traffic_minutes}min), buffer (${bufferMinutes}min), return (${driveFromEvent.duration_in_traffic_minutes}min)`);

  // Sync all supplemental events to Google Calendar in parallel
  // We await these to ensure google_event_id is set before returning
  // This prevents race conditions when quickly unassigning events
  await Promise.all([
    syncSupplementalEventToGoogleCalendar(departureEvent.id, assignedUserId).catch((error) => {
      console.error('Failed to sync departure event to Google Calendar:', error);
    }),
    syncSupplementalEventToGoogleCalendar(bufferEvent.id, assignedUserId).catch((error) => {
      console.error('Failed to sync buffer event to Google Calendar:', error);
    }),
    syncSupplementalEventToGoogleCalendar(returnEvent.id, assignedUserId).catch((error) => {
      console.error('Failed to sync return event to Google Calendar:', error);
    }),
  ]);

  return {
    departure: departureEvent,
    buffer: bufferEvent,
    return: returnEvent,
  };
}

/**
 * Delete all supplemental events for a given parent event
 * @param eventId - The parent event ID
 */
export async function deleteSupplementalEvents(eventId: string): Promise<void> {
  await prisma.supplementalEvent.deleteMany({
    where: { parent_event_id: eventId },
  });
  console.log(`Deleted supplemental events for event ${eventId}`);
}

/**
 * Delete specific supplemental event types for a given parent event
 * @param eventId - The parent event ID
 * @param types - Array of event types to delete ('departure', 'buffer', 'return')
 */
export async function deleteSupplementalEventsByType(
  eventId: string,
  types: Array<'departure' | 'buffer' | 'return'>
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
