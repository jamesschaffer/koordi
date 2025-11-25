When you create a calendar and assign events to yourself or someone else, and then decide to delete the calendar, it currently does not detect the supplemental events and delete them. What you are left with is no main core event, and the supplemental events remain on the calendar. We need to update the deletion logic in both scenarios.

Scenario A: When you are the calendar owner, you have assigned events to yourself, and there are no other members, deleting the calendar should remove all events, both core and supplemental.

Scenario B: When there is a member and you remove that member, you need to delete that member's supplemental events if they are assigned an event, and then unassign that event on the calendar.

This is a somewhat complicated bug with some nuance. I want you to think carefully about how to implement this gracefully, and I want you to ask me any clarifying questions before you begin coding. Have I over looked any edge cases? Do you need additional information? Once you have all the answers to your questions, I want you to put together a step-by-step plan of how you intend to do this.