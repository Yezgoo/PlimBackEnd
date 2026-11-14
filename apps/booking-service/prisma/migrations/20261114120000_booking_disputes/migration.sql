CREATE TYPE "DisputeResolution" AS ENUM ('refund', 'pay_professional');

CREATE TABLE "booking_disputes" (
  "booking_id" UUID PRIMARY KEY REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "evidence" TEXT NOT NULL CHECK (char_length("evidence") BETWEEN 1 AND 2000),
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolution" "DisputeResolution",
  "resolved_at" TIMESTAMP(3),
  "resolved_by" TEXT
);

CREATE INDEX "booking_disputes_resolution_opened_at_idx" ON "booking_disputes"("resolution", "opened_at");
