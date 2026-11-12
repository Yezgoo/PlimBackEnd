-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- CreateTable
CREATE TABLE "booking_offers" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'pending',
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "booking_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_offers_professional_id_status_idx" ON "booking_offers"("professional_id", "status");

-- CreateIndex
CREATE INDEX "booking_offers_status_expires_at_idx" ON "booking_offers"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_offers_booking_id_professional_id_key" ON "booking_offers"("booking_id", "professional_id");

-- AddForeignKey
ALTER TABLE "booking_offers" ADD CONSTRAINT "booking_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
