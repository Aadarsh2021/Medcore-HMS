-- Phase 8: Laboratory & Diagnostics Production Migration
-- Safe backward-compatible migration with multi-tenant scoping and integrity constraints

-- 1. Enums
DO $$ BEGIN
    ALTER TYPE "LabOrderStatus" ADD VALUE 'RESULTS_ENTERED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "LabOrderStatus" ADD VALUE 'APPROVED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "LabOrderStatus" ADD VALUE 'REJECTED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LabSpecimenStatus" AS ENUM ('COLLECTED', 'RECEIVED', 'PROCESSING', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LabResultFlag" AS ENUM ('NORMAL', 'LOW', 'HIGH', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LabPriority" AS ENUM ('ROUTINE', 'URGENT', 'STAT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Alter LabTest: Add test-specific critical ranges
ALTER TABLE "LabTest" ADD COLUMN IF NOT EXISTS "criticalLow" DECIMAL(10,2);
ALTER TABLE "LabTest" ADD COLUMN IF NOT EXISTS "criticalHigh" DECIMAL(10,2);

-- 3. Alter LabOrder: Optional encounterId, orderNumber, priority, and clinical audit fields
ALTER TABLE "LabOrder" ALTER COLUMN "encounterId" DROP NOT NULL;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "priority" "LabPriority" NOT NULL DEFAULT 'ROUTINE';
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "specimenType" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "clinicalNotes" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "collectedById" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "collectedByName" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "collectedAt" TIMESTAMP(3);
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "approvedByName" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "LabOrder" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

-- Backfill orderNumber if existing orders have null
UPDATE "LabOrder"
SET "orderNumber" = 'LAB-2026-' || LPAD(SUBSTRING("id" FROM 1 FOR 6), 6, '0')
WHERE "orderNumber" IS NULL;

ALTER TABLE "LabOrder" ALTER COLUMN "orderNumber" SET NOT NULL;

-- Unique and performance indexes on LabOrder
CREATE UNIQUE INDEX IF NOT EXISTS "LabOrder_hospitalId_orderNumber_key" ON "LabOrder"("hospitalId", "orderNumber");
CREATE INDEX IF NOT EXISTS "LabOrder_hospitalId_patientId_idx" ON "LabOrder"("hospitalId", "patientId");
CREATE INDEX IF NOT EXISTS "LabOrder_hospitalId_status_idx" ON "LabOrder"("hospitalId", "status");
CREATE INDEX IF NOT EXISTS "LabOrder_hospitalId_doctorId_idx" ON "LabOrder"("hospitalId", "doctorId");

-- 4. Alter LabOrderItem: Add numeric and formatted results, flags, units, and notes
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "resultValue" TEXT;
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "resultValueNumeric" DECIMAL(12,4);
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "resultUnit" TEXT;
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "referenceRangeText" TEXT;
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "flag" "LabResultFlag";
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "isCritical" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "technicianNotes" TEXT;
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "LabOrderItem_testId_idx" ON "LabOrderItem"("testId");

-- 5. Create Table: LabOrderNumberCounter
CREATE TABLE IF NOT EXISTS "LabOrderNumberCounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrderNumberCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabOrderNumberCounter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabOrderNumberCounter_hospitalId_year_key" ON "LabOrderNumberCounter"("hospitalId", "year");
CREATE INDEX IF NOT EXISTS "LabOrderNumberCounter_hospitalId_idx" ON "LabOrderNumberCounter"("hospitalId");

-- 6. Create Table: LabAccessionCounter
CREATE TABLE IF NOT EXISTS "LabAccessionCounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabAccessionCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabAccessionCounter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabAccessionCounter_hospitalId_year_key" ON "LabAccessionCounter"("hospitalId", "year");
CREATE INDEX IF NOT EXISTS "LabAccessionCounter_hospitalId_idx" ON "LabAccessionCounter"("hospitalId");

-- 7. Create Table: LabSpecimen
CREATE TABLE IF NOT EXISTS "LabSpecimen" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "specimenType" TEXT NOT NULL,
    "status" "LabSpecimenStatus" NOT NULL DEFAULT 'COLLECTED',
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedById" TEXT,
    "collectedByName" TEXT,
    "receivedAt" TIMESTAMP(3),
    "processorId" TEXT,
    "processedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSpecimen_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabSpecimen_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabSpecimen_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabSpecimen_hospitalId_accessionNumber_key" ON "LabSpecimen"("hospitalId", "accessionNumber");
CREATE INDEX IF NOT EXISTS "LabSpecimen_hospitalId_orderId_idx" ON "LabSpecimen"("hospitalId", "orderId");

-- 8. Create Table: LabResultAmendment
CREATE TABLE IF NOT EXISTS "LabResultAmendment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "previousValue" TEXT NOT NULL,
    "previousFlag" "LabResultFlag",
    "newValue" TEXT NOT NULL,
    "newFlag" "LabResultFlag",
    "reason" TEXT NOT NULL,
    "amendedById" TEXT NOT NULL,
    "amendedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabResultAmendment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LabResultAmendment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabResultAmendment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabResultAmendment_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "LabOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LabResultAmendment_hospitalId_orderId_idx" ON "LabResultAmendment"("hospitalId", "orderId");
CREATE INDEX IF NOT EXISTS "LabResultAmendment_orderItemId_idx" ON "LabResultAmendment"("orderItemId");
