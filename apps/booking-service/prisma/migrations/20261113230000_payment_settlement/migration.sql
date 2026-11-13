ALTER TABLE "booking_receipts" ADD COLUMN "settled_at" TIMESTAMP(3);
CREATE INDEX "booking_receipts_unsettled_idx" ON "booking_receipts" ("received_at") WHERE "settled_at" IS NULL;
