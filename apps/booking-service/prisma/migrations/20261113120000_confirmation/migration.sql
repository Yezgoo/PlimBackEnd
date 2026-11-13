-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "done_at" TIMESTAMP(3),
ADD COLUMN     "release_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "bookings_status_release_at_idx" ON "bookings"("status", "release_at");
