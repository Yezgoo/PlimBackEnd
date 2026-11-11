-- CreateEnum
CREATE TYPE "ProDocumentType" AS ENUM ('id_card', 'activity_proof', 'liability_insurance', 'certificate');

-- CreateEnum
CREATE TYPE "ProDocumentStatus" AS ENUM ('uploading', 'pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "pro_documents" (
    "id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "type" "ProDocumentType" NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "ProDocumentStatus" NOT NULL DEFAULT 'uploading',
    "rejection_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pro_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pro_documents_file_key_key" ON "pro_documents"("file_key");

-- CreateIndex
CREATE INDEX "pro_documents_professional_id_idx" ON "pro_documents"("professional_id");

-- AddForeignKey
ALTER TABLE "pro_documents" ADD CONSTRAINT "pro_documents_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
