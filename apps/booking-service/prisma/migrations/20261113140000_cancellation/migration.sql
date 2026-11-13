-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancellation_fee_cents" INTEGER,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "free_cancel_until" TIMESTAMP(3),
ADD COLUMN     "late_cancel_fee_cents" INTEGER,
ADD COLUMN     "refund_cents" INTEGER;
