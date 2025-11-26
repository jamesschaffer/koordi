# Bug: Supplemental Event Deletion (RESOLVED)

**Status:** ✅ RESOLVED
**Resolution Date:** November 2025
**Implementation:** `backend/src/services/eventCalendarService.ts`

## Original Issue

When creating a calendar and assigning events to yourself or someone else, then deleting the calendar, it did not detect supplemental events and delete them. This left orphaned supplemental events (drive to, arrive early, drive home) on the user's Google Calendar with no corresponding main event.

### Original Scenarios

**Scenario A:** When you are the calendar owner, you have assigned events to yourself, and there are no other members, deleting the calendar should remove all events, both core and supplemental.

**Scenario B:** When there is a member and you remove that member, you need to delete that member's supplemental events if they are assigned an event, and then unassign that event on the calendar.

## Resolution

The fix was implemented in `deleteEventCalendar()` function in `backend/src/services/eventCalendarService.ts`:

```typescript
export const deleteEventCalendar = async (calendarId: string, userId: string) => {
  // ... verification code ...

  // Get all events for this calendar
  const events = await prisma.event.findMany({
    where: { event_calendar_id: calendarId },
    select: { id: true, title: true },
  });

  // Delete all main events from all members' Google Calendars using the tracking system
  for (const event of events) {
    await deleteMainEventFromAllMembers(event.id);
  }

  // Delete all supplemental events from all members' Google Calendars
  for (const event of events) {
    await deleteSupplementalEventsFromAllMembers(event.id);
  }

  // Delete the calendar (cascade will delete events, memberships, supplemental events, etc.)
  const result = await prisma.eventCalendar.delete({
    where: { id: calendarId },
  });

  return result;
};
```

### Key Functions Used

- `deleteMainEventFromAllMembers(eventId)` - Removes main event from all members' Google Calendars
- `deleteSupplementalEventsFromAllMembers(eventId)` - Removes all supplemental events (departure, buffer, return) from all members' Google Calendars

Both functions are defined in `backend/src/services/multiUserSyncService.ts` and use the `UserGoogleEventSync` tracking table to find and delete events from each user's Google Calendar.

### Related Files

- `backend/src/services/eventCalendarService.ts` - Calendar deletion logic
- `backend/src/services/multiUserSyncService.ts` - Google Calendar sync utilities
- `backend/src/services/invitationService.ts` - Member removal logic (handles Scenario B)

## Verification

The fix properly handles:
1. ✅ Owner deleting calendar with self-assigned events
2. ✅ Owner deleting calendar with events assigned to members
3. ✅ Removing member cleans up their supplemental events
4. ✅ All Google Calendar entries are removed before database cascade
