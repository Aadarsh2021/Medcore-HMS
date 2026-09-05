# PHASE 7 — RESEARCH & DISCOVERY (R&D)
## Pharmacy & Inventory Management
## MedCore HMS

---

## 1. Executive Summary & Context

Phase 7 introduces the **Pharmacy & Inventory Management** domain into MedCore HMS.

### Status of Prior Phases
- **Phase 1 — Authentication & Multi-Tenancy**: FROZEN, in production.
- **Phase 2 — Patient Management**: FROZEN, in production.
- **Phase 3 — Doctor Management & Scheduling**: FROZEN, in production.
- **Phase 4 — Appointment Management & Booking**: FROZEN, in production.
- **Phase 5 — Clinical Encounters & EMR**: FROZEN, in production.
- **Phase 6 — Prescription Management & Clinical Medication Ordering**: COMPLETE, FROZEN.

Phase 6 established doctor-authored medication orders tied to clinical encounters. Prescriptions transition from `DRAFT` to `ISSUED` via atomic sequential numbering (`RX-{HOSP}-{YYYY}-{SEQ}`) with vector PDF rendering and private AWS S3 persistence.

**Phase 7 is the downstream consumer of Phase 6 prescriptions and the authoritative owner of physical drug inventory, batch tracking, stock intake, FEFO/FIFO dispensing, stock adjustments, and immutable inventory movement ledgers.**

---

## 2. Existing Repository Reconnaissance

A rigorous audit of the current codebase and PostgreSQL schema revealed the following baseline:

### 2.1 Existing Database Schema (`prisma/schema.prisma`)
1. **`Medicine` Model**:
   - `id`: String (UUID PK)
   - `hospitalId`: String (FK to `Hospital`)
   - `name`: String (Brand/commercial name)
   - `genericName`: String (Active chemical ingredient)
   - `category`: String (Therapeutic class, e.g., Antibiotics, Analgesics)
   - `form`: `MedicineForm` enum (`TABLET`, `CAPSULE`, `SYRUP`, `INJECTION`, `TOPICAL`, `DROPS`, `INHALER`, `OTHER`)
   - `strength`: String (e.g., "500 mg", "10 mg/5 ml")
   - `manufacturer`: String
   - `reorderLevel`: Int (default: 100)
   - Relations: `batches` (`MedicineBatch[]`), `prescriptionItems` (`PrescriptionItem[]`)
   - Indexes: `@@index([hospitalId, name])`, `@@index([hospitalId, category])`
   - Tenant classification: Direct tenant model (`DIRECT_TENANT_MODELS`).

2. **`MedicineBatch` Model**:
   - `id`: String (UUID PK)
   - `medicineId`: String (FK to `Medicine`)
   - `batchNumber`: String
   - `manufacturingDate`: DateTime
   - `expiryDate`: DateTime
   - `initialQuantity`: Int
   - `currentQuantity`: Int
   - `unitCost`: Decimal(10, 2)
   - `mrp`: Decimal(10, 2)
   - `isQuarantined`: Boolean (default: false)
   - Constraints: `@@unique([medicineId, batchNumber])`, `@@index([medicineId, expiryDate])`
   - Tenant classification: Indirect tenant model (`INDIRECT_TENANT_MODELS`) via `medicine.hospitalId`.
   - *Key Discovery*: `MedicineBatch` does NOT currently have a direct `hospitalId` field. Adding `hospitalId` directly to `MedicineBatch` will significantly optimize row-level locking, tenant isolation, and direct batch queries.

3. **`Prescription` Model**:
   - `status`: `PrescriptionStatus` enum (`DRAFT`, `ISSUED`, `DISPENSED`, `CANCELLED`).
   - `prescriptionNumber`: Unique human-readable code (`RX-{HOSP}-{YYYY}-{000001}`).
   - Contains immutable snapshot of clinical medication order once in `ISSUED` status.

4. **`PrescriptionItem` Model**:
   - `medicineId`: Nullable FK to `Medicine`.
   - `medicineName`, `form`, `strength`: Server-side catalog snapshots.
   - `dosage`, `frequency`, `durationDays`, `route`, `instructions`.
   - `quantity`: Int? (Prescribed total quantity).
   - `dispensedQuantity`: Int (default: 0).
   - *Key Discovery*: `dispensedQuantity` was already provisioned in Phase 6 on `PrescriptionItem`.

5. **`AuditLog` Model**:
   - Universal audit table recording `userId`, `hospitalId`, `action`, `entityName`, `entityId`, `changesJson`.

6. **Authentication & Roles (`Role` enum)**:
   - `Role.PHARMACIST` is already defined in Prisma and `@medcore/types`.
   - `RolesGuard` and `SupabaseAuthGuard` support role-based authorization.

7. **Database & Seed Status**:
   - 72 essential medicines are currently seeded across two hospital tenants (`hosp-mgh-001` and `hosp-ccc-002`).
   - Zero `MedicineBatch` records currently exist in database/seed.

---

## 3. Critical Domain Boundaries

```
CLINICAL BOUNDARY (Phase 6 - FROZEN)
  Doctor writes prescription during encounter
  → Prescription (DRAFT)
  → Items selected with catalog snapshot
  → Finalize & Sign (ISSUED)
        │
════════╪══════════════════════════════════════════════════════════════════
        ▼
PHARMACY INVENTORY BOUNDARY (Phase 7 - SCOPE)
  Pharmacy Queue: ISSUED prescriptions discoverable
  → Pharmacist checks stock availability across Batches
  → Batch allocation via FEFO (First Expiry, First Out)
  → Dispense Transaction (Atomic)
        ├── Deducts MedicineBatch.currentQuantity
        ├── Increments PrescriptionItem.dispensedQuantity
        ├── Inserts immutable StockMovement ledger row
        └── Updates Prescription status (PARTIALLY_DISPENSED / DISPENSED)
  Stock Intake: Supplier Goods Receipt Note (GRN)
  → Creates new MedicineBatch + StockMovement (PURCHASE_RECEIPT)
  Stock Adjustments & Quarantine: Audited discrepancy reconciliation
        │
════════╪══════════════════════════════════════════════════════════════════
        ▼
BILLING BOUNDARY (Phase 8 - FUTURE)
  Pharmacy charges, itemized patient billing, insurance claims, cashiering
```

### Immutability Invariant:
Pharmacy **NEVER** modifies the clinical prescription:
- `medicineName`, `dosage`, `frequency`, `durationDays`, `route`, and `instructions` are doctor-owned and clinically immutable.
- Pharmacy only fulfills the order by mapping items to physical batches and recording dispensed units.

---

## 4. Inventory Model R&D: In-Place Mutation vs. Append-Only Ledger

### The Core Accounting Problem
Storing inventory only as an in-place counter (`MedicineBatch.currentQuantity`) makes it impossible to answer:
- *"Why did Batch B-104 lose 15 units yesterday?"*
- *"Was stock reduced due to dispensing, damage, theft, or an adjustment error?"*
- *"How can an auditor verify that total dispensed items match total deductions?"*

### Tradeoff Analysis
| Approach | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- |
| **A. In-Place Batch Mutation Only** | Simple CRUD; low initial code. | Zero auditability; impossible to reconcile inventory; vulnerable to untraced race conditions. | **REJECTED** |
| **B. Event-Sourced Ledger Only (No batch counter)** | Complete history; perfect immutability. | Calculating current on-hand stock requires `SUM(movements)` across millions of rows; slow queries under load. | **REJECTED** |
| **C. Dual State: In-Place `currentQuantity` + Append-Only `StockMovement` Ledger** | High performance $O(1)$ stock checks; 100% auditable accounting; transactional reconciliation. | Requires strict database transaction ensuring balance and ledger are updated simultaneously. | **SELECTED** |

### Selected Architecture: The `StockMovement` Ledger
Every physical inventory change is recorded in an append-only `StockMovement` table with:
- `hospitalId`: Tenant context.
- `batchId` & `medicineId`: Target item.
- `movementType`:
  - `PURCHASE_RECEIPT` (+qty)
  - `DISPENSE` (-qty)
  - `DISPENSE_RETURN` (+qty)
  - `ADJUSTMENT_INCREASE` (+qty)
  - `ADJUSTMENT_DECREASE` (-qty)
  - `DAMAGE_WRITEOFF` (-qty)
  - `EXPIRY_DISPOSAL` (-qty)
- `quantity`: Signed integer (positive for intake, negative for depletion).
- `balanceBefore` & `balanceAfter`: Snapshot of batch balance at the moment of movement.
- `referenceType`: (`PRESCRIPTION`, `STOCK_RECEIPT`, `STOCK_ADJUSTMENT`, `RETURN`).
- `referenceId`: UUID linking to prescription or receipt.
- `performedById`: User performing the action.
- `reason`: Clinical or operational justification.

**Mathematical Invariant**:
For any batch $B$:
$$\text{currentQuantity}_B = \text{initialQuantity}_B + \sum \text{StockMovements}_B$$

---

## 5. Stock Intake & Batch Management R&D

### Stock Intake Architecture
Stock enters the hospital through an authorized intake workflow:
- **`StockReceipt`** (Purchase Intake / Goods Receipt):
  - Represents the delivery invoice from a pharmaceutical distributor.
  - Fields: `receiptNumber`, `hospitalId`, `supplierName`, `invoiceNumber`, `invoiceDate`, `receivedDate`, `totalAmount`, `notes`, `receivedById`.
- **`StockReceiptItem`**:
  - Individual line items on the invoice.
  - Fields: `medicineId`, `batchNumber`, `manufacturingDate`, `expiryDate`, `quantityReceived`, `freeQuantity`, `unitCost`, `mrp`.

### Batch Creation & Lifecycle
When a `StockReceipt` is finalized inside an atomic PostgreSQL transaction:
1. System checks if a batch with `[hospitalId, medicineId, batchNumber]` already exists:
   - If new: Creates a `MedicineBatch` with `initialQuantity = qty`, `currentQuantity = qty`, `unitCost`, `mrp`, `expiryDate`.
   - If existing (re-order of same manufacturer lot): Increments `currentQuantity` by received quantity.
2. An append-only `StockMovement` row (`PURCHASE_RECEIPT`) is inserted for each batch.
3. Batches are never deleted; depleted batches remain in the database with `currentQuantity = 0` for historical auditability.

---

## 6. FIFO vs. FEFO Policy Evaluation

### The Problem with Pure FIFO in Healthcare
- **Pure FIFO (First-In, First-Out)** sorts purely by the date goods were received into the warehouse (`receivedDate` / `createdAt`).
- In pharmaceuticals, a distributor may deliver a batch in March that expires in December 2026, and later deliver a short-dated promotional batch in April that expires in June 2026.
- Pure FIFO would dispense the March batch first, causing the April batch to expire on the shelf, leading to drug wastage or accidental patient administration of expired drugs.

### Clinical Mandate: FEFO (First Expired, First Out)
- **FEFO** prioritizes physical batches having the **earliest valid expiration date**.
- Batches expiring soonest are dispensed first to prevent drug obsolescence.
- Tie-breaking: If two batches have the identical expiration date, the system applies **FIFO** (earliest receipt date).

### Expiry Safety Override
Any batch where $\text{expiryDate} \le \text{CurrentDate}$ or $\text{isQuarantined} = \text{true}$ is **strictly excluded** from candidate selection.

```
Candidate Batches Query:
  WHERE medicineId = :medId
    AND hospitalId = :tenantId
    AND currentQuantity > 0
    AND isQuarantined = false
    AND expiryDate > CURRENT_DATE
  ORDER BY expiryDate ASC, createdAt ASC
```

**Recommendation**: Adopt **FEFO with FIFO tie-breaking and strict expiry exclusion**. This honors the PRD's sequential inventory depletion requirement while satisfying clinical drug safety.

---

## 7. Prescription Fulfillment & Dispensing Model

### 7.1 Prescription Status Interaction
Phase 6 defines `PrescriptionStatus`: `DRAFT`, `ISSUED`, `DISPENSED`, `CANCELLED`.
In real hospital workflows, patients frequently experience partial fulfillment:
- A prescription orders 30 tablets of Amoxicillin and 10 tablets of Paracetamol.
- The pharmacy has only 20 tablets of Amoxicillin and 10 of Paracetamol in stock.
- If the patient cannot wait, the pharmacist dispenses 20 Amoxicillin and 10 Paracetamol now, leaving 10 Amoxicillin pending.

**State Machine Extension**:
Add `PARTIALLY_DISPENSED` to `PrescriptionStatus`:
```
  DRAFT
    │
[Finalize]
    ▼
  ISSUED ───────────────► [Void by Doctor/Admin] ──► CANCELLED
    │
[First Dispense: partial]
    ▼
  PARTIALLY_DISPENSED ──► [Subsequent Dispense: complete]
    │                                                      │
    ▼                                                      ▼
[Subsequent Dispense]                                  DISPENSED
```

### 7.2 The Cancellation / Void Boundary
- If an `ISSUED` prescription has **0 items dispensed** (`dispensedQuantity == 0` across all items):
  - Attending doctor or admin may void it -> transitions to `CANCELLED`.
- If a prescription is **`PARTIALLY_DISPENSED`** or **`DISPENSED`**:
  - Doctor/Admin clinical voiding is **STRICTLY BLOCKED**.
  - Rationale: Medications have physically left hospital control and entered patient possession. An issued medical order cannot be retroactively cancelled once executed. Any discrepancy must be handled via a formal Pharmacy Return.

---

## 8. Concurrency & High-Frequency Dispensing

### Risk Scenario
Batch `B-101` has 10 units in stock. Pharmacist 1 and Pharmacist 2 simultaneously click "Dispense 8 units" for two different patients.
- Without locking: Both read `currentQuantity = 10`. Both compute $10 - 8 = 2$.
- Both write `currentQuantity = 2`.
- Total units dispensed = 16. Actual units in physical stock = 10. **Negative stock anomaly (-6 units)**.

### Solution: Row-Level Locking with `SELECT FOR UPDATE`
All batch allocations and stock deductions must execute inside an atomic PostgreSQL transaction using row locks acquired in deterministic order:

```sql
-- 1. Lock prescription item
SELECT id, "dispensedQuantity", quantity FROM "PrescriptionItem"
WHERE id = :itemId FOR UPDATE;

-- 2. Lock candidate batches in deterministic order (avoids deadlocks)
SELECT id, "currentQuantity", "expiryDate", "isQuarantined"
FROM "MedicineBatch"
WHERE id IN (:batchIds)
ORDER BY id ASC
FOR UPDATE;
```

Inside the transaction:
1. Re-read `currentQuantity`.
2. Ensure $\sum \text{allocated} \le \text{currentQuantity}$.
3. Deduct $\text{currentQuantity} = \text{currentQuantity} - \text{allocated}$.
4. Insert `StockMovement`.
5. Increment `PrescriptionItem.dispensedQuantity`.
6. Update `Prescription.status`.
7. Commit.

If stock is exhausted before the second transaction executes, it throws a clean `409 Conflict: Insufficient stock in selected batch`.

---

## 9. Idempotency & Network Resilience

When a pharmacist clicks "Confirm Dispense", browser network timeouts or impatient double-clicks can generate duplicate HTTP requests.

### Idempotency Strategy:
1. Frontend generates a UUID `idempotencyKey` per dispensing operation.
2. Endpoint accepts header: `Idempotency-Key: <UUID>` or payload property.
3. Dispensing records are stored in a dedicated `PrescriptionDispense` transaction table with unique constraint:
   `@@unique([hospitalId, idempotencyKey])`
4. If a duplicate request with the same `idempotencyKey` arrives, the backend detects the duplicate, skips stock deduction, and returns the previously generated dispense receipt.

---

## 10. Low Stock Detection & Expiry Reporting

### 10.1 Low Stock Calculation
Rather than maintaining a redundant, de-normalized counter on `Medicine`, available stock is derived dynamically:
$$\text{AvailableStock}_M = \sum_{B \in \text{ValidBatches}_M} B.\text{currentQuantity}$$
where $\text{ValidBatches}$ satisfies `isQuarantined = false` and `expiryDate > CURRENT_DATE`.

- **Low Stock Trigger**: $\text{AvailableStock}_M \le M.\text{reorderLevel}$
- **Out of Stock Trigger**: $\text{AvailableStock}_M = 0$

### 10.2 Expiry Buckets
The pharmacy reporting service categorizes inventory into deterministic time horizons:
1. **Critical Expired**: $\text{expiryDate} \le \text{today}$ (Immediate quarantine / disposal required).
2. **Expiring in $\le 30$ Days**: Urgent FEFO prioritization or return to distributor.
3. **Expiring in 31–60 Days**: Close monitoring.
4. **Expiring in 61–90 Days**: Reorder planning.

---

## 11. Security, RBAC & Multi-Tenancy

### 11.1 RBAC Policy
| Action | Pharmacist | Hospital Admin | Super Admin | Doctor | Nurse | Patient | Receptionist |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| View Pharmacy Queue | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| Dispense Medication | ALLOW | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Stock Intake (GRN) | ALLOW | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Stock Adjustment | ALLOW | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Batch Quarantine | ALLOW | ALLOW | DENY | DENY | DENY | DENY | DENY |
| View Inventory / Batches | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| View Prescription Fulfillment | ALLOW | ALLOW | ALLOW | ALLOW (own) | ALLOW | ALLOW (own) | DENY |

### 11.2 Tenant Isolation
- Every query is scoped by `hospitalId` via `TenantGuard` and the Prisma tenant extension.
- Batches belonging to Hospital A are strictly inaccessible and invisible to Hospital B.
- Direct tenant foreign keys (`hospitalId`) are enforced on `Medicine`, `MedicineBatch`, `StockReceipt`, `StockMovement`, and `PrescriptionDispense`.

---

## 12. Summary of R&D Findings

1. **Architecture Is Ready**: The repository has solid Phase 6 foundations. `Medicine` and `PrescriptionItem.dispensedQuantity` already exist.
2. **Key Additions Required for Phase 7**:
   - Schema additions: `StockReceipt`, `StockReceiptItem`, `StockMovement`, `PrescriptionDispense`, `PrescriptionDispenseItem`.
   - Update `MedicineBatch`: Add direct `hospitalId` foreign key and indexes.
   - Update `PrescriptionStatus`: Add `PARTIALLY_DISPENSED`.
3. **Safe Execution**: Implementation can be executed modularly without touching or breaking any Phase 1–6 workflows.
