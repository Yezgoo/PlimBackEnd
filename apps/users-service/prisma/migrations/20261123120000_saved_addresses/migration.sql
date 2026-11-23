CREATE TABLE "saved_addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "details" TEXT,
    "postal_code" TEXT NOT NULL,
    "city" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_addresses_user_id_created_at_idx" ON "saved_addresses"("user_id", "created_at");

ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
