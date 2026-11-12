-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending_payment', 'finding_pro', 'accepted', 'en_route', 'in_progress', 'done', 'confirmed', 'cancelled', 'disputed');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "professional_id" UUID,
    "service_type_id" UUID NOT NULL,
    "service_slug" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "address" JSONB NOT NULL,
    "municipality_code" TEXT NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "vat_rate" DECIMAL(4,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending_payment',
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "changed_by" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bookings_customer_id_scheduled_start_idx" ON "bookings"("customer_id", "scheduled_start");

-- CreateIndex
CREATE INDEX "bookings_professional_id_scheduled_start_idx" ON "bookings"("professional_id", "scheduled_start");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "booking_events_booking_id_at_idx" ON "booking_events"("booking_id", "at");

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
