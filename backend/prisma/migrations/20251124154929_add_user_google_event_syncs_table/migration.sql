-- CreateTable
CREATE TABLE "user_google_event_syncs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "supplemental_event_id" UUID,
    "google_event_id" VARCHAR(255) NOT NULL,
    "sync_type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_google_event_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_google_event_syncs_user_id_event_id_key" ON "user_google_event_syncs"("user_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_google_event_syncs_user_id_supplemental_event_id_key" ON "user_google_event_syncs"("user_id", "supplemental_event_id");

-- CreateIndex
CREATE INDEX "user_google_event_syncs_user_id_idx" ON "user_google_event_syncs"("user_id");

-- CreateIndex
CREATE INDEX "user_google_event_syncs_event_id_idx" ON "user_google_event_syncs"("event_id");

-- CreateIndex
CREATE INDEX "user_google_event_syncs_supplemental_event_id_idx" ON "user_google_event_syncs"("supplemental_event_id");

-- CreateIndex
CREATE INDEX "user_google_event_syncs_google_event_id_idx" ON "user_google_event_syncs"("google_event_id");

-- CreateIndex
CREATE INDEX "user_google_event_syncs_event_id_sync_type_idx" ON "user_google_event_syncs"("event_id", "sync_type");

-- CreateIndex
CREATE INDEX "user_google_event_syncs_supplemental_event_id_sync_type_idx" ON "user_google_event_syncs"("supplemental_event_id", "sync_type");

-- CreateIndex
CREATE INDEX "user_google_event_syncs_user_id_sync_type_idx" ON "user_google_event_syncs"("user_id", "sync_type");

-- AddForeignKey
ALTER TABLE "user_google_event_syncs" ADD CONSTRAINT "user_google_event_syncs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_google_event_syncs" ADD CONSTRAINT "user_google_event_syncs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_google_event_syncs" ADD CONSTRAINT "user_google_event_syncs_supplemental_event_id_fkey" FOREIGN KEY ("supplemental_event_id") REFERENCES "supplemental_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
