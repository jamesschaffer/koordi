-- AlterTable
ALTER TABLE "event_calendar_memberships" ADD COLUMN "expires_at" TIMESTAMPTZ(6);

-- Update existing pending invitations to expire in 30 days from now
UPDATE "event_calendar_memberships"
SET "expires_at" = NOW() + INTERVAL '30 days'
WHERE "status" = 'pending' AND "expires_at" IS NULL;
