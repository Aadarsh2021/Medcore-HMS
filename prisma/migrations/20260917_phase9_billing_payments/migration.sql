-- Phase 9 — Billing, Invoicing & Payments Migration

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Alter Existing Enums
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'UPI';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- 3. Update Table: Invoice
ALTER TABLE "Invoice" 
    ADD COLUMN IF NOT EXISTS "createdById" TEXT,
    ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR',
    ADD COLUMN IF NOT EXISTS "issueDate" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "issuedById" TEXT,
    ADD COLUMN IF NOT EXISTS "notes" TEXT,
    ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS "voidReason" TEXT,
    ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "voidedById" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_hospitalId_status_idx" ON "Invoice"("hospitalId", "status");

-- 4. Update Table: InvoiceItem
ALTER TABLE "InvoiceItem" 
    ADD COLUMN IF NOT EXISTS "appointmentId" TEXT,
    ADD COLUMN IF NOT EXISTS "discount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS "dispenseId" TEXT,
    ADD COLUMN IF NOT EXISTS "encounterId" TEXT,
    ADD COLUMN IF NOT EXISTS "labOrderId" TEXT,
    ADD COLUMN IF NOT EXISTS "labTestId" TEXT,
    ADD COLUMN IF NOT EXISTS "prescriptionId" TEXT,
    ADD COLUMN IF NOT EXISTS "tax" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE "InvoiceItem" ALTER COLUMN "unitPrice" TYPE DECIMAL(12,2);
ALTER TABLE "InvoiceItem" ALTER COLUMN "totalPrice" TYPE DECIMAL(12,2);

CREATE INDEX IF NOT EXISTS "InvoiceItem_appointmentId_idx" ON "InvoiceItem"("appointmentId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_encounterId_idx" ON "InvoiceItem"("encounterId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_prescriptionId_idx" ON "InvoiceItem"("prescriptionId");
CREATE INDEX IF NOT EXISTS "InvoiceItem_labOrderId_idx" ON "InvoiceItem"("labOrderId");

-- 5. Update Table: Payment
ALTER TABLE "Payment" 
    ADD COLUMN IF NOT EXISTS "createdById" TEXT,
    ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR',
    ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
    ADD COLUMN IF NOT EXISTS "paymentNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT,
    ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_hospitalId_paymentNumber_key" ON "Payment"("hospitalId", "paymentNumber");
CREATE INDEX IF NOT EXISTS "Payment_hospitalId_status_idx" ON "Payment"("hospitalId", "status");
CREATE INDEX IF NOT EXISTS "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");

-- 6. Create Table: Refund
CREATE TABLE IF NOT EXISTS "Refund" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'SUCCESS',
    "providerRefundId" TEXT,
    "createdById" TEXT,
    "processedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Refund_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Refund_hospitalId_invoiceId_idx" ON "Refund"("hospitalId", "invoiceId");
CREATE INDEX IF NOT EXISTS "Refund_hospitalId_paymentId_idx" ON "Refund"("hospitalId", "paymentId");

-- 7. Create Table: PaymentProviderEvent
CREATE TABLE IF NOT EXISTS "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentProviderEvent_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentProviderEvent_eventId_key" ON "PaymentProviderEvent"("eventId");
CREATE INDEX IF NOT EXISTS "PaymentProviderEvent_provider_eventType_idx" ON "PaymentProviderEvent"("provider", "eventType");
CREATE INDEX IF NOT EXISTS "PaymentProviderEvent_processingStatus_idx" ON "PaymentProviderEvent"("processingStatus");

-- 8. Create Table: InvoiceNumberCounter
CREATE TABLE IF NOT EXISTS "InvoiceNumberCounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceNumberCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceNumberCounter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceNumberCounter_hospitalId_year_key" ON "InvoiceNumberCounter"("hospitalId", "year");

-- 9. Create Table: PaymentNumberCounter
CREATE TABLE IF NOT EXISTS "PaymentNumberCounter" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentNumberCounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentNumberCounter_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentNumberCounter_hospitalId_year_key" ON "PaymentNumberCounter"("hospitalId", "year");

-- 10. Ensure Payment has hospital foreign key
DO $$ BEGIN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
