/*
  Warnings:

  - You are about to drop the column `google_event_id` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `google_event_id` on the `supplemental_events` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "events_google_event_id_idx";

-- DropIndex
DROP INDEX "supplemental_events_google_event_id_idx";

-- AlterTable
ALTER TABLE "events" DROP COLUMN "google_event_id";

-- AlterTable
ALTER TABLE "supplemental_events" DROP COLUMN "google_event_id";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "timezone" VARCHAR(50);
