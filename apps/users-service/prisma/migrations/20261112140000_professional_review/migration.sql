-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;

-- AlterTable
ALTER TABLE "pro_documents" ALTER COLUMN "reviewed_by" SET DATA TYPE TEXT;
