-- =============================================================================
-- Phase 6: Prescription Management & Clinical Medication Ordering
-- Lifecycle, Concurrency-Safe Numbering, PDF Metadata & Historical Snapshots
-- =============================================================================

-- AlterEnum
ALTER TYPE "PrescriptionStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- DropForeignKey
ALTER TABLE "PrescriptionItem" DROP CONSTRAINT IF EXISTS "PrescriptionItem_medicineId_fkey";

-- AlterTable Prescription
ALTER TABLE "Prescription" 
    ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pdfGeneratedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pdfGenerationStatus" TEXT DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "pdfSha256" TEXT,
    ADD COLUMN IF NOT EXISTS "pdfStorageKey" TEXT,
    ADD COLUMN IF NOT EXISTS "prescriptionNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "voidReason" TEXT,
    ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "voidedById" TEXT;

ALTER TABLE "Prescription" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable PrescriptionItem with safe backfill
ALTER TABLE "PrescriptionItem" 
    ADD COLUMN IF NOT EXISTS "form" "MedicineForm" NOT NULL DEFAULT 'TABLET',
    ADD COLUMN IF NOT EXISTS "medicineName" TEXT DEFAULT 'Prescribed Medication',
    ADD COLUMN IF NOT EXISTS "quantity" INTEGER,
    ADD COLUMN IF NOT EXISTS "strength" TEXT,
    ALTER COLUMN "medicineId" DROP NOT NULL;

-- Backfill existing PrescriptionItem records from Medicine master
UPDATE "PrescriptionItem" pi
SET 
    "medicineName" = COALESCE(m.name, 'Prescribed Medication'),
    "form" = COALESCE(m.form, 'TABLET'),
    "strength" = m.strength
FROM "Medicine" m
WHERE pi."medicineId" = m.id AND pi."medicineName" = 'Prescribed Medication';

-- Remove temporary default for medicineName
ALTER TABLE "PrescriptionItem" ALTER COLUMN "medicineName" DROP DEFAULT;
ALTER TABLE "PrescriptionItem" ALTER COLUMN "medicineName" SET NOT NULL;

-- CreateTable PrescriptionNumberCounter
CREATE TABLE IF NOT EXISTS "PrescriptionNumberCounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionNumberCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "PrescriptionNumberCounter_hospitalId_idx" ON "PrescriptionNumberCounter"("hospitalId");
CREATE UNIQUE INDEX IF NOT EXISTS "PrescriptionNumberCounter_hospitalId_year_key" ON "PrescriptionNumberCounter"("hospitalId", "year");
CREATE INDEX IF NOT EXISTS "Prescription_hospitalId_status_idx" ON "Prescription"("hospitalId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_hospitalId_prescriptionNumber_key" ON "Prescription"("hospitalId", "prescriptionNumber");

-- AddForeignKeys
ALTER TABLE "PrescriptionItem" 
    ADD CONSTRAINT "PrescriptionItem_medicineId_fkey" 
    FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrescriptionNumberCounter" 
    ADD CONSTRAINT "PrescriptionNumberCounter_hospitalId_fkey" 
    FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
