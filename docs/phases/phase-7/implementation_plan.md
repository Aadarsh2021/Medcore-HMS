# PHASE 7 — IMPLEMENTATION PLAN
## Pharmacy & Inventory Management
## MedCore HMS

---

## 1. Plan Summary
This implementation plan outlines the exact sequence for implementing Phase 7 Pharmacy & Inventory Management upon approval.
**Current Mode**: R&D / ARCHITECTURE ONLY. No code changes have been executed yet.

---

## 2. Prerequisites & Safety Guardrails
- Phase 1–6 implementations are frozen.
- Supabase PostgreSQL remains the only database.
- Zero destructive database operations.
- Zero modifications or weakening of existing Phase 1–6 tests (baseline: 148 passed).
- Never log passwords, tokens, JWTs, AWS keys, or PHI.

---

## 3. Step-by-Step Implementation Sequence

### Stage 1: Shared Types & Interfaces (`packages/types`)
1. Extend `PrescriptionStatus`: Add `PARTIALLY_DISPENSED`.
2. Define `StockMovementType`: `PURCHASE_RECEIPT`, `DISPENSE`, `DISPENSE_RETURN`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, `DAMAGE_WRITEOFF`, `EXPIRY_DISPOSAL`.
3. Add Pharmacy DTO contracts:
   - `StockReceiptCreateDto`, `StockReceiptResponseData`
   - `DispensePrescriptionDto`, `DispenseResponseData`
   - `StockAdjustmentDto`, `StockMovementResponseData`
   - `BatchResponseData`, `InventoryItemResponseData`
   - `ExpiryReportResponseData`
4. Build `@medcore/types`.

### Stage 2: Database Schema & Migration (`prisma`)
1. Update `prisma/schema.prisma`:
   - Extend `PrescriptionStatus` enum (`PARTIALLY_DISPENSED`).
   - Add `hospitalId` to `MedicineBatch` with relations and composite indexes.
   - Add `StockMovementType` enum.
   - Add `StockMovement` model.
   - Add `StockReceipt` and `StockReceiptItem` models.
   - Add `PrescriptionDispense` and `PrescriptionDispenseItem` models.
2. Generate migration: `add_phase_7_pharmacy_and_inventory`.
3. Apply migration to Supabase PostgreSQL using established migration flow.
4. Update `apps/api/src/database/prisma-tenant.extension.ts`:
   - Register new direct tenant models (`MedicineBatch`, `StockMovement`, `StockReceipt`, `PrescriptionDispense`).
5. Update seed data in `prisma/seed.ts`:
   - Seed sample non-expired batches for essential medicines per hospital to enable immediate testing.

### Stage 3: Backend Pharmacy Module (`apps/api`)
1. Create directory `apps/api/src/modules/pharmacy/`:
   - `pharmacy.module.ts`
   - `pharmacy.controller.ts`
   - `dispensing.service.ts`: FEFO allocation, `SELECT FOR UPDATE` locking, status transition, dispense record generation.
   - `inventory.service.ts`: Stock receipts (GRN), batch quarantine, reorder level queries, expiry reporting.
   - `ledger.service.ts`: Atomic append-only `StockMovement` recording and consistency validation.
   - `dto/`: Validation classes with `class-validator`.
2. Register `PharmacyModule` in `apps/api/src/app.module.ts`.
3. Update `apps/api/src/modules/prescriptions/prescriptions.service.ts`:
   - In `voidPrescription`: Guard against voiding prescriptions if `status === PARTIALLY_DISPENSED` or `dispensedQuantity > 0`.

### Stage 4: Backend Integration & Concurrency Tests
1. Create `apps/api/test/pharmacy.e2e-spec.ts`:
   - 36 integration, concurrency, RBAC, and tenant isolation tests.
   - 10-user batch depletion race test (`SELECT FOR UPDATE`).
   - Idempotency key replay test.
   - Regression verification across all 8 existing test suites.

### Stage 5: Frontend Pharmacy Workspace (`apps/web`)
1. Create components in `apps/web/src/components/pharmacy/`:
   - `PharmacyQueue.tsx`: Table of pending prescriptions with search & status filters.
   - `DispenseModal.tsx`: FEFO batch allocation preview, batch split view, and dispense confirmation.
   - `InventoryList.tsx`: Formulary stock overview with low-stock badges.
   - `StockIntakeModal.tsx`: Supplier invoice & batch intake form.
   - `ExpiryReportModal.tsx`: Expiry risk breakdown (30/60/90 days).
2. Create pages in `apps/web/src/app/dashboard/pharmacy/`:
   - `page.tsx`: Pharmacy operations dashboard with KPI tiles, queue, and inventory management.
3. Update patient portal (`apps/web/src/components/patient/PatientPrescriptionHistory.tsx`):
   - Display real-time fulfillment status badge (`ISSUED`, `PARTIALLY_DISPENSED`, `DISPENSED`).

### Stage 6: Build & Verification
1. Run full monorepo build:
   - `pnpm --filter @medcore/types build`
   - `pnpm --filter @medcore/api build`
   - `pnpm --filter @medcore/web build`
2. Run complete test suite:
   - `pnpm --filter @medcore/api test` (target: 184 passing tests).
3. Security & logging audit:
   - Verify zero PHI, secrets, or raw passwords in console logs.
