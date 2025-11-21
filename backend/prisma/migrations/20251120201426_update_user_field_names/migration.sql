-- AlterTable: Rename columns in users table for better API consistency
ALTER TABLE "users" RENAME COLUMN "home_lat" TO "home_latitude";
ALTER TABLE "users" RENAME COLUMN "home_lng" TO "home_longitude";
ALTER TABLE "users" RENAME COLUMN "supplemental_retention" TO "keep_supplemental_events";
