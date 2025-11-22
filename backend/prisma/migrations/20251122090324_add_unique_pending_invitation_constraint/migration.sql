-- CreateIndex: Prevent duplicate pending invitations for same email to same calendar
-- This partial unique index only applies to rows where status = 'pending'
-- Prevents race condition where two simultaneous invitation requests create duplicate pending invitations
CREATE UNIQUE INDEX IF NOT EXISTS "unique_pending_invitation"
ON "event_calendar_memberships" ("event_calendar_id", "invited_email")
WHERE "status" = 'pending';
