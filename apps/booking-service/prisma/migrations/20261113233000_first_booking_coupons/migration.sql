BEGIN;
CREATE TABLE "coupons" (
  "code" TEXT PRIMARY KEY CHECK ("code" ~ '^[A-Z0-9_-]{1,32}$'),
  "fixed_cents" INTEGER,
  "percent" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (num_nonnulls("fixed_cents", "percent") = 1),
  CHECK ("fixed_cents" > 0),
  CHECK ("percent" BETWEEN 1 AND 100)
);
ALTER TABLE "bookings"
  ADD COLUMN "coupon_code" TEXT,
  ADD COLUMN "discount_cents" INTEGER NOT NULL DEFAULT 0,
  DROP CONSTRAINT "bookings_customer_total",
  ADD CONSTRAINT "bookings_customer_total" CHECK ("total_cents" = "price_cents" - "discount_cents" + "service_fee_cents"),
  ADD CONSTRAINT "bookings_coupon_discount" CHECK ("discount_cents" BETWEEN 0 AND "price_cents" AND ("discount_cents" = 0) = ("coupon_code" IS NULL));
CREATE UNIQUE INDEX "bookings_one_coupon_per_customer" ON "bookings" ("customer_id") WHERE "coupon_code" IS NOT NULL;
CREATE FUNCTION "check_first_booking_coupon"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.customer_id::text, 1206));
  IF NEW.coupon_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM bookings WHERE customer_id = NEW.customer_id
  ) THEN
    RAISE unique_violation USING MESSAGE = 'Coupon requires a first booking',
      CONSTRAINT = 'bookings_one_coupon_per_customer';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "bookings_first_coupon" BEFORE INSERT ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION "check_first_booking_coupon"();
COMMIT;
