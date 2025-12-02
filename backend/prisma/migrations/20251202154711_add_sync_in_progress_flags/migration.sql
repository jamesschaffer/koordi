-- AlterTable
ALTER TABLE "event_calendars" ADD COLUMN     "sync_in_progress" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "sync_in_progress" BOOLEAN NOT NULL DEFAULT false;
