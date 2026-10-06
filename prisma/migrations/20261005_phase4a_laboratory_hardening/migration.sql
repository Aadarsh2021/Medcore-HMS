-- =============================================================================
-- Phase 4A: Laboratory / Diagnostic Workflow Hardening Migration
-- 1. Unique index on active LabSpecimen per order to physically prevent duplicate collections
-- 2. Index on LabOrder (hospitalId, encounterId) for fast tenant-scoped encounter lookups
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_order_specimen" 
ON "LabSpecimen" ("orderId") 
WHERE "status" != 'REJECTED';

CREATE INDEX IF NOT EXISTS "LabOrder_hospitalId_encounterId_idx" 
ON "LabOrder" ("hospitalId", "encounterId");
