BEGIN;

ALTER TABLE "bookings"
  ADD COLUMN "service_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_cents" INTEGER,
  ADD COLUMN "commission_bps" INTEGER,
  ADD COLUMN "commission_cents" INTEGER,
  ADD COLUMN "pro_payout_cents" INTEGER;

UPDATE "bookings" SET "total_cents" = "price_cents";

ALTER TABLE "bookings"
  ALTER COLUMN "total_cents" SET NOT NULL,
  ADD CONSTRAINT "bookings_customer_total" CHECK ("total_cents" = "price_cents" + "service_fee_cents"),
  ADD CONSTRAINT "bookings_professional_split" CHECK (
    ("commission_bps" IS NULL AND "commission_cents" IS NULL AND "pro_payout_cents" IS NULL)
    OR
    ("commission_bps" IS NOT NULL AND "commission_cents" IS NOT NULL AND "pro_payout_cents" IS NOT NULL
      AND "commission_cents" + "pro_payout_cents" = "price_cents")
  );

COMMIT;
