CREATE TABLE "settings" (
    "key" TEXT PRIMARY KEY,
    "value" INTEGER NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settings_value_range" CHECK ("value" BETWEEN "min" AND "max")
);

CREATE TABLE "audit_log" (
    "id" UUID PRIMARY KEY,
    "setting_key" TEXT NOT NULL,
    "previous" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "admin_sub" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "audit_log_setting_key_revision_key" ON "audit_log"("setting_key", "revision");
CREATE INDEX "audit_log_occurred_at_id_idx" ON "audit_log"("occurred_at", "id");

CREATE TABLE "outbox_events" (
    "id" UUID PRIMARY KEY,
    "sequence" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "outbox_events_sequence_key" ON "outbox_events"("sequence");
CREATE INDEX "outbox_events_published_at_sequence_idx" ON "outbox_events"("published_at", "sequence");

-- Commission is in basis points and the fee is in cents.
INSERT INTO "settings" ("key", "value", "min", "max") VALUES
    ('commission_default', 2000, 1500, 2500),
    ('service_fee_cents', 200, 150, 250),
    ('offer_timeout_minutes', 15, 1, 60),
    ('max_offers', 5, 1, 20),
    ('release_after_hours', 48, 1, 168);
