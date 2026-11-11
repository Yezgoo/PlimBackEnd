-- CreateTable
CREATE TABLE "pro_areas" (
    "professional_id" UUID NOT NULL,
    "municipality_code" TEXT NOT NULL,

    CONSTRAINT "pro_areas_pkey" PRIMARY KEY ("professional_id","municipality_code")
);

-- CreateTable
CREATE TABLE "pro_services" (
    "professional_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,

    CONSTRAINT "pro_services_pkey" PRIMARY KEY ("professional_id","service_type_id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pro_areas_municipality_code_idx" ON "pro_areas"("municipality_code");

-- CreateIndex
CREATE INDEX "pro_services_service_type_id_idx" ON "pro_services"("service_type_id");

-- CreateIndex
CREATE INDEX "availability_slots_professional_id_weekday_idx" ON "availability_slots"("professional_id", "weekday");

-- CreateIndex
CREATE INDEX "time_off_professional_id_ends_at_idx" ON "time_off"("professional_id", "ends_at");

-- AddForeignKey
ALTER TABLE "pro_areas" ADD CONSTRAINT "pro_areas_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pro_services" ADD CONSTRAINT "pro_services_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
