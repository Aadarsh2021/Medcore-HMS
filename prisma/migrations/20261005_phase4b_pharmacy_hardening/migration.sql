-- =============================================================================
-- Phase 4B: Pharmacy & Inventory Hardening Migration
-- 1. Create DispenseNumberCounter table for collision-free sequential dispense numbers
-- 2. Create StockReceiptNumberCounter table for collision-free sequential GRN numbers
-- 3. Additional compound indexes for performance and rapid lookups
-- =============================================================================

CREATE TABLE IF NOT EXISTS "DispenseNumberCounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispenseNumberCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DispenseNumberCounter_hospitalId_year_key" 
ON "DispenseNumberCounter"("hospitalId", "year");

CREATE INDEX IF NOT EXISTS "DispenseNumberCounter_hospitalId_idx" 
ON "DispenseNumberCounter"("hospitalId");

ALTER TABLE "DispenseNumberCounter" 
DROP CONSTRAINT IF EXISTS "DispenseNumberCounter_hospitalId_fkey";

ALTER TABLE "DispenseNumberCounter" 
ADD CONSTRAINT "DispenseNumberCounter_hospitalId_fkey" 
FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "StockReceiptNumberCounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReceiptNumberCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockReceiptNumberCounter_hospitalId_year_key" 
ON "StockReceiptNumberCounter"("hospitalId", "year");

CREATE INDEX IF NOT EXISTS "StockReceiptNumberCounter_hospitalId_idx" 
ON "StockReceiptNumberCounter"("hospitalId");

ALTER TABLE "StockReceiptNumberCounter" 
DROP CONSTRAINT IF EXISTS "StockReceiptNumberCounter_hospitalId_fkey";

ALTER TABLE "StockReceiptNumberCounter" 
ADD CONSTRAINT "StockReceiptNumberCounter_hospitalId_fkey" 
FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PrescriptionItem_prescriptionId_medicineId_idx" 
ON "PrescriptionItem"("prescriptionId", "medicineId");

CREATE INDEX IF NOT EXISTS "StockMovement_hospitalId_batchId_movementType_idx" 
ON "StockMovement"("hospitalId", "batchId", "movementType");
