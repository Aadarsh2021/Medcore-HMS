# MedCore HMS — Phase 7: Pharmacy & Inventory Management
## Technical Implementation & Architecture Specification

### 1. Architectural Overview

The Phase 7 Pharmacy & Inventory Management module provides an enterprise-grade, concurrency-safe, multi-tenant inventory ledger and prescription fulfillment engine for MedCore HMS.

It guarantees strict multi-tenant isolation, determinism, auditability, and financial accountability by maintaining a **dual-state inventory system**:
1. **Materialized State**: `MedicineBatch.currentQuantity` represents the fast-read row-locked balance.
2. **Append-Only Movement Ledger**: `StockMovement` records every physical increment, decrement, intake, dispensation, return, write-off, and adjustment.

**Core Invariant**:
$$\text{MedicineBatch.currentQuantity} = \text{initialQuantity} + \sum \text{StockMovement.quantity}$$

---

### 2. Domain Data Model & Database Schema

The database schema preserves all Phase 1–6 domains (`Hospital`, `User`, `Patient`, `Doctor`, `Prescription`, `PrescriptionItem`, etc.) and extends them with the following models:

#### 2.1 Schema Additions (`prisma/schema.prisma`)

1. **`MedicineBatch`**:
   - Upgraded with direct `hospitalId` foreign key and relation backfilled safely from parent `Medicine`.
   - Invariant: `MedicineBatch.hospitalId == Medicine.hospitalId`.
   - Compound unique index: `@@unique([hospitalId, medicineId, batchNumber])`.
   - Quarantine audit fields: `quarantinedAt`, `quarantinedById`, `quarantineReason`.

2. **`StockReceipt` (Goods Receipt Note / GRN)**:
   - Tracks intake batches from pharmaceutical vendors.
   - Header fields: `receiptNumber`, `supplierName`, `invoiceNumber`, `invoiceDate`, `receivedDate`, `totalCost`, `receivedById`, `hospitalId`.
   - Enforces duplicate protection: `@@unique([hospitalId, supplierName, invoiceNumber])`.

3. **`StockReceiptItem`**:
   - Line items linked to `StockReceipt`, `Medicine`, and `MedicineBatch`.
   - Stores `quantityReceived`, `unitCost`, `mrp`, `manufacturingDate`, `expiryDate`.

4. **`StockMovement` (Append-Only Ledger)**:
   - Immutable audit ledger of all inventory mutations.
   - Fields: `hospitalId`, `medicineId`, `batchId`, `movementType`, `quantity` (signed integer: positive for additions, negative for deductions), `balanceBefore`, `balanceAfter`, `referenceType`, `referenceId`, `reason`, `performedById`, `createdAt`.
   - Movement Types:
     - `PURCHASE_RECEIPT` (+qty)
     - `DISPENSE` (-qty)
     - `DISPENSE_RETURN` (+qty)
     - `ADJUSTMENT_INCREASE` (+qty)
     - `ADJUSTMENT_DECREASE` (-qty)
     - `DAMAGE_WRITEOFF` (-qty)
     - `EXPIRY_DISPOSAL` (-qty)

5. **`PrescriptionDispense` & `PrescriptionDispenseItem`**:
   - Full history of each dispensing event for a prescription.
   - Supports multiple partial fulfillment events per prescription.
   - `PrescriptionDispenseItem` links directly to the specific `MedicineBatch` and `PrescriptionItem`.
   - Tracks `quantityDispensed` and `returnedQuantity` per batch line.

6. **`IdempotencyRecord`**:
   - Tenant-scoped idempotency storage (`hospitalId`, `idempotencyKey`).
   - Stores `requestHash` (canonical SHA-256), `responseStatus`, `responseBody`, `expiresAt`.

7. **`PrescriptionStatus` Enum Update**:
   - Backward-compatible enhancement adding `PARTIALLY_DISPENSED`.
   - Lifecycle: `ISSUED` $\to$ `PARTIALLY_DISPENSED` $\to$ `DISPENSED`.

---

### 3. Concurrency Model & Locking Strategy

To prevent race conditions, overselling, and deadlocks under heavy concurrent load (e.g. 20+ pharmacists fulfilling prescriptions simultaneously from limited stock):

1. **Transaction Isolation**:
   - All mutations execute within PostgreSQL transactions with row-level locks via `SELECT ... FOR UPDATE`.
   - Interactive transaction timeout is configured with `{ maxWait: 15000, timeout: 30000 }` to withstand distributed pool queue latency.

2. **Deterministic Lock Ordering**:
   Deadlocks are mathematically prevented by strictly acquiring row locks in ascending stable ID order:
   ```
   1. Lock Prescription (SELECT ... FOR UPDATE WHERE id = :prescriptionId AND hospitalId = :hospitalId)
   2. Lock PrescriptionItems (ORDER BY id ASC FOR UPDATE)
   3. Lock MedicineBatches (ORDER BY id ASC FOR UPDATE)
   ```

3. **Re-validation After Lock Acquisition**:
   - Batch eligibility and remaining stock balances are evaluated *after* acquiring row locks, ensuring zero possibility of dirty reads or negative balances.

4. **Rollback Guarantee**:
   - If any item cannot be fulfilled or stock is insufficient, the entire transaction rolls back cleanly. No partial inventory deduction is permitted.

---

### 4. Authoritative Allocation Engine (FEFO + FIFO)

The backend is the sole authority on batch allocation:
1. **Primary Sort**: Earliest `expiryDate ASC` (First-Expired, First-Out - FEFO).
2. **Secondary Sort (Tie-Breaker)**: Earliest `createdAt ASC` (First-In, First-Out - FIFO).
3. **Tertiary Sort (Deterministic Tie-Breaker)**: Stable UUID `id ASC`.

**Hard Exclusion Criteria**:
- `isQuarantined == true` (quarantined stock is blocked from dispensing).
- `expiryDate <= now()` (expired stock is blocked from dispensing).
- `currentQuantity <= 0` (zero or depleted batches are skipped).
- `hospitalId != currentTenantId` (batches from other hospital tenants are invisible and inaccessible).

---

### 5. Idempotency & Duplicate Protection

Every critical state mutation (`POST /dispense`, `POST /stock-receipts`, `POST /adjust`, `POST /returns`) supports the `Idempotency-Key` header:
- **Tenant Scope**: Keys are strictly partitioned by `hospitalId`.
- **Payload Hash Verification**: Payloads are recursively canonicalized into sorted key JSON and hashed using SHA-256 (`requestHash`).
- **Deterministic Behavior**:
  - Same key + identical payload: Returns previously cached response (HTTP 200/201) without re-executing transactions.
  - Same key + differing payload: Throws `ConflictException` (HTTP 409) to prevent payload tampering and accidental reuse.
- **Vendor Receipt Protection**: Re-submitting an invoice from the same supplier (`hospitalId`, `supplierName`, `invoiceNumber`) throws HTTP 409 Conflict.

---

### 6. Role-Based Access Control (RBAC)

Enforced globally and at the controller level via `SupabaseAuthGuard`, `TenantGuard`, and `@Roles(...)`:
- **`PHARMACIST`**: Full operational permissions on queue, dispense, receipts, adjustments, quarantine, returns, and reports.
- **`HOSPITAL_ADMIN`**: Pharmacy oversight, read access, adjustments, audit verification.
- **`SUPER_ADMIN`**: Explicit tenant operations via `X-Hospital-Id`.
- **`DOCTOR` / `NURSE` / `RECEPTIONIST` / `PATIENT` / `LAB_TECHNICIAN`**: Strictly forbidden from mutating stock or invoking pharmacy mutation endpoints.

---

### 7. Tenant Isolation Architecture

- All queries run through MedCore's `AsyncLocalStorage` tenant context.
- The global Prisma extension automatically enforces tenant filters on direct models (`MedicineBatch`, `StockReceipt`, `StockMovement`, `PrescriptionDispense`, `IdempotencyRecord`) and indirect models (`StockReceiptItem`, `PrescriptionDispenseItem`).
- Raw database transactions (`this.prisma.raw.$transaction`) explicitly re-assert `hospitalId` invariants on every query parameter.
- Cross-tenant requests (e.g. Hospital B attempting to read or dispense Hospital A stock) are rejected with HTTP 404/403.

---

### 8. Prescription Lifecycle & Partial Dispensing

- **Prescription States**:
  - `DRAFT`: Clinical draft.
  - `ISSUED`: Finalized by doctor; ready for pharmacy fulfillment.
  - `PARTIALLY_DISPENSED`: Portion of prescribed items or tablets dispensed; remaining balance can be dispensed subsequently.
  - `DISPENSED`: Fully fulfilled.
  - `CANCELLED`: Only permitted before any dispensing occurs.
- **Dispensing History**:
  - Each dispense creates an immutable `PrescriptionDispense` header and `PrescriptionDispenseItem` rows. Prior dispensing events are never overwritten.
- **Dispense Returns**:
  - Returns require a valid `dispenseItemId`.
  - Max returnable quantity cannot exceed `(quantityDispensed - returnedQuantity)`.
  - Restores stock back to the original physical batch with a `DISPENSE_RETURN` movement.

---

### 9. API Specifications

| Method | Endpoint | Description | Permitted Roles |
|---|---|---|---|
| `GET` | `/api/pharmacy/queue` | List prescriptions eligible for dispensing | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/pharmacy/inventory` | Formulary inventory overview with stock levels | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/pharmacy/medicines/:id/batches` | Physical batches for a medicine | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/pharmacy/prescriptions/:id/dispense-plan` | Authoritative FEFO/FIFO allocation preview | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/pharmacy/prescriptions/:id/dispense` | Atomic concurrency-safe dispensing | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/pharmacy/stock-receipts` | Ingest vendor GRN and generate batches | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/pharmacy/batches/:id/adjust` | Physical stock adjustment (+/-) | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/pharmacy/batches/:id/quarantine` | Quarantine or release a physical batch | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/pharmacy/returns` | Process dispense return and restock batch | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/pharmacy/stock-movements` | Query append-only stock movement ledger | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/pharmacy/reports/expiry` | Expiry bracket and summary reporting | `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN` |
