-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "avatar_url" TEXT,
    "google_refresh_token_enc" TEXT,
    "google_calendar_id" VARCHAR(255),
    "google_calendar_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "home_address" TEXT,
    "home_latitude" DECIMAL(10,8),
    "home_longitude" DECIMAL(11,8),
    "comfort_buffer_minutes" INTEGER NOT NULL DEFAULT 5,
    "keep_supplemental_events" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "photo_url" TEXT,
    "date_of_birth" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_calendars" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "ics_url" TEXT NOT NULL,
    "child_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_sync_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "last_sync_error" TEXT,
    "google_calendar_watch_token" TEXT,
    "google_calendar_watch_expiry" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_calendar_memberships" (
    "id" UUID NOT NULL,
    "event_calendar_id" UUID NOT NULL,
    "user_id" UUID,
    "invited_email" VARCHAR(255) NOT NULL,
    "invitation_token" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "invited_by_user_id" UUID NOT NULL,
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_calendar_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "event_calendar_id" UUID NOT NULL,
    "ics_uid" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "location_lat" DECIMAL(10,8),
    "location_lng" DECIMAL(11,8),
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "assigned_to_user_id" UUID,
    "google_event_id" VARCHAR(255),
    "last_modified" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplemental_events" (
    "id" UUID NOT NULL,
    "parent_event_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,
    "origin_address" TEXT NOT NULL,
    "origin_lat" DECIMAL(10,8) NOT NULL,
    "origin_lng" DECIMAL(11,8) NOT NULL,
    "destination_address" TEXT NOT NULL,
    "destination_lat" DECIMAL(10,8) NOT NULL,
    "destination_lng" DECIMAL(11,8) NOT NULL,
    "drive_time_minutes" INTEGER NOT NULL,
    "google_event_id" VARCHAR(255),
    "last_traffic_check" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplemental_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "event_calendars_child_id_idx" ON "event_calendars"("child_id");

-- CreateIndex
CREATE INDEX "event_calendars_owner_id_idx" ON "event_calendars"("owner_id");

-- CreateIndex
CREATE INDEX "event_calendars_ics_url_idx" ON "event_calendars"("ics_url");

-- CreateIndex
CREATE INDEX "event_calendars_last_sync_at_idx" ON "event_calendars"("last_sync_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_calendar_memberships_invitation_token_key" ON "event_calendar_memberships"("invitation_token");

-- CreateIndex
CREATE INDEX "event_calendar_memberships_event_calendar_id_idx" ON "event_calendar_memberships"("event_calendar_id");

-- CreateIndex
CREATE INDEX "event_calendar_memberships_user_id_idx" ON "event_calendar_memberships"("user_id");

-- CreateIndex
CREATE INDEX "event_calendar_memberships_invited_email_idx" ON "event_calendar_memberships"("invited_email");

-- CreateIndex
CREATE INDEX "event_calendar_memberships_invitation_token_idx" ON "event_calendar_memberships"("invitation_token");

-- CreateIndex
CREATE INDEX "event_calendar_memberships_status_idx" ON "event_calendar_memberships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "event_calendar_memberships_event_calendar_id_user_id_key" ON "event_calendar_memberships"("event_calendar_id", "user_id");

-- CreateIndex
CREATE INDEX "events_event_calendar_id_idx" ON "events"("event_calendar_id");

-- CreateIndex
CREATE INDEX "events_assigned_to_user_id_idx" ON "events"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "events_start_time_idx" ON "events"("start_time");

-- CreateIndex
CREATE INDEX "events_end_time_idx" ON "events"("end_time");

-- CreateIndex
CREATE INDEX "events_google_event_id_idx" ON "events"("google_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_event_calendar_id_ics_uid_key" ON "events"("event_calendar_id", "ics_uid");

-- CreateIndex
CREATE INDEX "supplemental_events_parent_event_id_idx" ON "supplemental_events"("parent_event_id");

-- CreateIndex
CREATE INDEX "supplemental_events_type_idx" ON "supplemental_events"("type");

-- CreateIndex
CREATE INDEX "supplemental_events_start_time_idx" ON "supplemental_events"("start_time");

-- CreateIndex
CREATE INDEX "supplemental_events_google_event_id_idx" ON "supplemental_events"("google_event_id");

-- AddForeignKey
ALTER TABLE "event_calendars" ADD CONSTRAINT "event_calendars_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_calendars" ADD CONSTRAINT "event_calendars_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_calendar_memberships" ADD CONSTRAINT "event_calendar_memberships_event_calendar_id_fkey" FOREIGN KEY ("event_calendar_id") REFERENCES "event_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_calendar_memberships" ADD CONSTRAINT "event_calendar_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_calendar_memberships" ADD CONSTRAINT "event_calendar_memberships_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_event_calendar_id_fkey" FOREIGN KEY ("event_calendar_id") REFERENCES "event_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplemental_events" ADD CONSTRAINT "supplemental_events_parent_event_id_fkey" FOREIGN KEY ("parent_event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
