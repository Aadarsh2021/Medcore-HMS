-- Phase 7: Pharmacy & Inventory Management Migration
-- Safe backward-compatible migration with backfill and tenant scoping

-- AlterEnum: Add PARTIALLY_DISPENSED to PrescriptionStatus
ALTER TYPE "PrescriptionStatus" ADD VALUE 'PARTIALLY_DISPENSED';

-- CreateEnum: StockMovementType
CREATE TYPE "StockMovementType" AS ENUM (
    'PURCHASE_RECEIPT',
    'DISPENSE',
    'DISPENSE_RETURN',
    'ADJUSTMENT_INCREASE',
    'ADJUSTMENT_DECREASE',
    'DAMAGE_WRITEOFF',
    'EXPIRY_DISPOSAL'
);

-- Drop previous MedicineBatch index if exists
DROP INDEX IF EXISTS "MedicineBatch_medicineId_batchNumber_key";

-- AlterTable: Add hospitalId and quarantine audit fields to MedicineBatch (Nullable first for safe backfill)
ALTER TABLE "MedicineBatch" ADD COLUMN IF NOT EXISTS "hospitalId" TEXT;
ALTER TABLE "MedicineBatch" ADD COLUMN IF NOT EXISTS "quarantinedAt" TIMESTAMP(3);
ALTER TABLE "MedicineBatch" ADD COLUMN IF NOT EXISTS "quarantinedById" TEXT;
ALTER TABLE "MedicineBatch" ADD COLUMN IF NOT EXISTS "quarantineReason" TEXT;

-- Backfill hospitalId from parent Medicine to preserve existing batches
UPDATE "MedicineBatch" mb
SET "hospitalId" = m."hospitalId"
FROM "Medicine" m
WHERE mb."medicineId" = m."id" AND mb."hospitalId" IS NULL;

-- Enforce NOT NULL on hospitalId post-backfill
ALTER TABLE "MedicineBatch" ALTER COLUMN "hospitalId" SET NOT NULL;

-- CreateTable: StockReceipt
CREATE TABLE IF NOT EXISTS "StockReceipt" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "receivedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StockReceiptItem
CREATE TABLE IF NOT EXISTS "StockReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StockMovement (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS "StockMovement" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PrescriptionDispense
CREATE TABLE IF NOT EXISTS "PrescriptionDispense" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "dispenseNumber" TEXT NOT NULL,
    "dispensedById" TEXT NOT NULL,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionDispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PrescriptionDispenseItem
CREATE TABLE IF NOT EXISTS "PrescriptionDispenseItem" (
    "id" TEXT NOT NULL,
    "dispenseId" TEXT NOT NULL,
    "prescriptionItemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantityDispensed" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionDispenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IdempotencyRecord
CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes for StockReceipt
CREATE INDEX IF NOT EXISTS "StockReceipt_hospitalId_receivedDate_idx" ON "StockReceipt"("hospitalId", "receivedDate");
CREATE UNIQUE INDEX IF NOT EXISTS "StockReceipt_hospitalId_receiptNumber_key" ON "StockReceipt"("hospitalId", "receiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "StockReceipt_hospitalId_supplierName_invoiceNumber_key" ON "StockReceipt"("hospitalId", "supplierName", "invoiceNumber");

-- CreateIndexes for StockReceiptItem
CREATE INDEX IF NOT EXISTS "StockReceiptItem_receiptId_idx" ON "StockReceiptItem"("receiptId");
CREATE INDEX IF NOT EXISTS "StockReceiptItem_batchId_idx" ON "StockReceiptItem"("batchId");

-- CreateIndexes for StockMovement
CREATE INDEX IF NOT EXISTS "StockMovement_hospitalId_batchId_idx" ON "StockMovement"("hospitalId", "batchId");
CREATE INDEX IF NOT EXISTS "StockMovement_hospitalId_medicineId_idx" ON "StockMovement"("hospitalId", "medicineId");
CREATE INDEX IF NOT EXISTS "StockMovement_hospitalId_movementType_idx" ON "StockMovement"("hospitalId", "movementType");
CREATE INDEX IF NOT EXISTS "StockMovement_hospitalId_createdAt_idx" ON "StockMovement"("hospitalId", "createdAt");

-- CreateIndexes for PrescriptionDispense
CREATE INDEX IF NOT EXISTS "PrescriptionDispense_hospitalId_prescriptionId_idx" ON "PrescriptionDispense"("hospitalId", "prescriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "PrescriptionDispense_hospitalId_dispenseNumber_key" ON "PrescriptionDispense"("hospitalId", "dispenseNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PrescriptionDispense_hospitalId_idempotencyKey_key" ON "PrescriptionDispense"("hospitalId", "idempotencyKey");

-- CreateIndexes for PrescriptionDispenseItem
CREATE INDEX IF NOT EXISTS "PrescriptionDispenseItem_dispenseId_idx" ON "PrescriptionDispenseItem"("dispenseId");
CREATE INDEX IF NOT EXISTS "PrescriptionDispenseItem_prescriptionItemId_idx" ON "PrescriptionDispenseItem"("prescriptionItemId");
CREATE INDEX IF NOT EXISTS "PrescriptionDispenseItem_batchId_idx" ON "PrescriptionDispenseItem"("batchId");

-- CreateIndexes for IdempotencyRecord
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_hospitalId_expiresAt_idx" ON "IdempotencyRecord"("hospitalId", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_hospitalId_idempotencyKey_key" ON "IdempotencyRecord"("hospitalId", "idempotencyKey");

-- CreateIndexes for MedicineBatch
CREATE INDEX IF NOT EXISTS "MedicineBatch_hospitalId_medicineId_idx" ON "MedicineBatch"("hospitalId", "medicineId");
CREATE INDEX IF NOT EXISTS "MedicineBatch_hospitalId_expiryDate_idx" ON "MedicineBatch"("hospitalId", "expiryDate");
CREATE INDEX IF NOT EXISTS "MedicineBatch_hospitalId_isQuarantined_idx" ON "MedicineBatch"("hospitalId", "isQuarantined");
CREATE UNIQUE INDEX IF NOT EXISTS "MedicineBatch_hospitalId_medicineId_batchNumber_key" ON "MedicineBatch"("hospitalId", "medicineId", "batchNumber");

-- Foreign Keys
ALTER TABLE "MedicineBatch" DROP CONSTRAINT IF EXISTS "MedicineBatch_hospitalId_fkey";
ALTER TABLE "MedicineBatch" ADD CONSTRAINT "MedicineBatch_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockReceipt" DROP CONSTRAINT IF EXISTS "StockReceipt_hospitalId_fkey";
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockReceipt" DROP CONSTRAINT IF EXISTS "StockReceipt_receivedById_fkey";
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockReceiptItem" DROP CONSTRAINT IF EXISTS "StockReceiptItem_receiptId_fkey";
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "StockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockReceiptItem" DROP CONSTRAINT IF EXISTS "StockReceiptItem_batchId_fkey";
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MedicineBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_hospitalId_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_batchId_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MedicineBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement" DROP CONSTRAINT IF EXISTS "StockMovement_performedById_fkey";
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrescriptionDispense" DROP CONSTRAINT IF EXISTS "PrescriptionDispense_hospitalId_fkey";
ALTER TABLE "PrescriptionDispense" ADD CONSTRAINT "PrescriptionDispense_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrescriptionDispense" DROP CONSTRAINT IF EXISTS "PrescriptionDispense_prescriptionId_fkey";
ALTER TABLE "PrescriptionDispense" ADD CONSTRAINT "PrescriptionDispense_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrescriptionDispense" DROP CONSTRAINT IF EXISTS "PrescriptionDispense_dispensedById_fkey";
ALTER TABLE "PrescriptionDispense" ADD CONSTRAINT "PrescriptionDispense_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PrescriptionDispenseItem" DROP CONSTRAINT IF EXISTS "PrescriptionDispenseItem_dispenseId_fkey";
ALTER TABLE "PrescriptionDispenseItem" ADD CONSTRAINT "PrescriptionDispenseItem_dispenseId_fkey" FOREIGN KEY ("dispenseId") REFERENCES "PrescriptionDispense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrescriptionDispenseItem" DROP CONSTRAINT IF EXISTS "PrescriptionDispenseItem_prescriptionItemId_fkey";
ALTER TABLE "PrescriptionDispenseItem" ADD CONSTRAINT "PrescriptionDispenseItem_prescriptionItemId_fkey" FOREIGN KEY ("prescriptionItemId") REFERENCES "PrescriptionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrescriptionDispenseItem" DROP CONSTRAINT IF EXISTS "PrescriptionDispenseItem_batchId_fkey";
ALTER TABLE "PrescriptionDispenseItem" ADD CONSTRAINT "PrescriptionDispenseItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "MedicineBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRecord" DROP CONSTRAINT IF EXISTS "IdempotencyRecord_hospitalId_fkey";
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
