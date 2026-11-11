-- CreateEnum
CREATE TYPE "ProfessionalStatus" AS ENUM ('applied', 'approved', 'rejected', 'suspended');

-- CreateTable
CREATE TABLE "professionals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "business_name" TEXT,
    "nif" TEXT NOT NULL,
    "activity_registered" BOOLEAN NOT NULL,
    "insurance_policy" TEXT,
    "insurance_valid_until" DATE,
    "bio" TEXT,
    "status" "ProfessionalStatus" NOT NULL DEFAULT 'applied',
    "verified_at" TIMESTAMP(3),
    "rating_avg" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professionals_user_id_key" ON "professionals"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_nif_key" ON "professionals"("nif");

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
