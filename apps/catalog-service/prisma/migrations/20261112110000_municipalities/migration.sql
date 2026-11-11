-- CreateTable
CREATE TABLE "municipalities" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "pilot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "postal_prefixes" (
    "cp4" TEXT NOT NULL,
    "municipality_code" TEXT NOT NULL,

    CONSTRAINT "postal_prefixes_pkey" PRIMARY KEY ("cp4")
);

-- CreateIndex
CREATE INDEX "postal_prefixes_municipality_code_idx" ON "postal_prefixes"("municipality_code");

-- AddForeignKey
ALTER TABLE "postal_prefixes" ADD CONSTRAINT "postal_prefixes_municipality_code_fkey" FOREIGN KEY ("municipality_code") REFERENCES "municipalities"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
