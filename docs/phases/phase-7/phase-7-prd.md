# PHASE 7 — PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Pharmacy & Inventory Management
## MedCore HMS

---

## 1. Document Control
- **Document Version**: 1.0.0
- **Status**: DRAFT / R&D REVIEW
- **Owner**: Pharmacy & EMR Core Engineering Team
- **Target Release**: MedCore HMS Phase 7

---

## 2. Product Vision & Goals

Phase 7 delivers a high-reliability, clinically-safe, auditable Pharmacy & Inventory Management system for MedCore HMS.

### Primary Objectives:
1. **Clinical Fulfillment of Prescriptions**: Seamlessly ingest finalized (`ISSUED`) prescriptions from Phase 6 and enable pharmacists to fulfill medication orders safely and accurately.
2. **Deterministic FEFO/FIFO Dispensing**: Eliminate medication wastage and accidental dispensing of near-expiry or expired drugs by strictly enforcing First Expired, First Out (FEFO) batch allocation.
3. **Double-Entry Style Inventory Ledger**: Provide total transparency into every stock change via an append-only `StockMovement` ledger that accounts for every tablet, ampoule, and bottle in the hospital.
4. **Zero Stock Discrepancy & Concurrency Safety**: Eliminate race conditions, negative inventory, and duplicate dispensing across simultaneous pharmacy terminals using PostgreSQL row-level locks and idempotency keys.
5. **Real-time Reorder & Expiry Surveillance**: Automatically identify low-stock medicines approaching reorder levels and quarantine batches approaching or past their expiration dates.

---

## 3. User Personas & Workflows

### 3.1 Pharmacist (Primary Persona)
- **Role**: Licensed hospital dispensary staff.
- **Key Tasks**:
  - Monitors the incoming prescription queue for outpatients and discharged inpatients.
  - Reviews prescribed medications against available batch inventory.
  - Executes batch allocation (automated FEFO recommendation with manual batch override if justified).
  - Dispenses medications to patients and prints dispensing labels/receipts.
  - Records incoming stock shipments (goods receipts) from pharmaceutical distributors.
  - Initiates stock adjustments for physical breakage or verified cycle count discrepancies.
  - Flags damaged or recalled batches into quarantine.

### 3.2 Hospital Administrator (Supervisory Persona)
- **Role**: Pharmacy operations supervisor / Chief Pharmacist.
- **Key Tasks**:
  - Reviews low-stock and dead-stock reports.
  - Sets and adjusts minimum reorder thresholds (`reorderLevel`) per medicine.
  - Approves significant inventory write-offs and returns.
  - Audits stock movement history across departments.

### 3.3 Attending Doctor (Consumer Persona)
- **Role**: Clinical prescriber.
- **Key Tasks**:
  - Views real-time fulfillment status of authored prescriptions (`ISSUED` -> `PARTIALLY_DISPENSED` -> `DISPENSED`).
  - Cannot alter inventory or dispense drugs directly.

### 3.4 Patient (Beneficiary Persona)
- **Role**: Healthcare recipient.
- **Key Tasks**:
  - Views personal prescription fulfillment status in the patient portal.
  - Verifies which medications were dispensed and which remain pending.

---

## 4. Feature Specifications & Functional Requirements

### 4.1 Pharmacy Prescription Queue
- **FR-PHARM-01**: The system must display a real-time queue of all prescriptions in `ISSUED` and `PARTIALLY_DISPENSED` status within the pharmacist's hospital tenant.
- **FR-PHARM-02**: The queue must display patient UHID, patient name, prescribing doctor, encounter date, prescription number, and total item count.
- **FR-PHARM-03**: The queue must support filtering by prescription status, date range, patient UHID, and patient name.
- **FR-PHARM-04**: Prescriptions in `DRAFT` or `CANCELLED` status must never appear in the dispensing queue.

### 4.2 Automated Batch Allocation & Dispensing
- **FR-PHARM-05**: For each prescription item, the system must compute the remaining required quantity:
  $$\text{remaining} = \text{quantity} - \text{dispensedQuantity}$$
- **FR-PHARM-06**: When dispensing an item linked to a catalog `medicineId`, the system must query available batches belonging to the tenant.
- **FR-PHARM-07**: Batch allocation must prioritize batches by earliest expiry date (FEFO), breaking ties by earliest creation/receipt date (FIFO).
- **FR-PHARM-08**: The system must strictly reject any batch where $\text{expiryDate} \le \text{CurrentDate}$ or $\text{isQuarantined} = \text{true}$.
- **FR-PHARM-09**: If a single batch has insufficient stock, the system must automatically split the allocation across the next available batch in FEFO order.
- **FR-PHARM-10**: The pharmacist must have the ability to accept the FEFO recommendation or select specific batches if physical storage conditions require it.
- **FR-PHARM-11**: The system must support partial dispensing when on-hand stock is less than the prescribed quantity or when the patient requests a partial supply.
- **FR-PHARM-12**: Once all items in a prescription are fully dispensed ($\text{dispensedQuantity} \ge \text{quantity}$), the prescription status must transition to `DISPENSED`.
- **FR-PHARM-13**: If one or more items are partially dispensed, the prescription status must transition to `PARTIALLY_DISPENSED`.
- **FR-PHARM-14**: The system must never allow $\text{dispensedQuantity} > \text{quantity}$ without explicit doctor re-prescription.

### 4.3 Stock Intake & Goods Receipt (GRN)
- **FR-PHARM-15**: Pharmacists and hospital admins must be able to record incoming shipments via a Goods Receipt Note (GRN) / `StockReceipt`.
- **FR-PHARM-16**: A stock receipt must capture: supplier name, distributor invoice number, invoice date, delivery date, notes, and an array of items.
- **FR-PHARM-17**: Each receipt line must record: `medicineId`, `batchNumber`, `manufacturingDate`, `expiryDate`, `quantityReceived`, `unitCost`, and `mrp`.
- **FR-PHARM-18**: Committing a stock receipt must atomically create or update `MedicineBatch` records and record `PURCHASE_RECEIPT` movements in the `StockMovement` ledger.

### 4.4 Append-Only Stock Movement Ledger
- **FR-PHARM-19**: Every modification to physical inventory must generate an immutable record in `StockMovement`.
- **FR-PHARM-20**: The ledger must capture the exact balance before and after the transaction, the actor, timestamp, reference entity, and clinical reason.
- **FR-PHARM-21**: Direct update or deletion of `StockMovement` records is strictly prohibited at both application and database levels.

### 4.5 Stock Adjustments & Quarantine
- **FR-PHARM-22**: Authorized pharmacists can record physical count adjustments (`ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, or `DAMAGE_WRITEOFF`).
- **FR-PHARM-23**: All adjustments require a mandatory explanatory reason of at least 5 characters.
- **FR-PHARM-24**: Batches can be placed in `QUARANTINED` status at any time, immediately removing them from dispensing algorithms.

### 4.6 Low Stock & Expiry Surveillance
- **FR-PHARM-25**: The system must compute real-time available inventory per medicine and flag any item where $\text{availableStock} \le \text{reorderLevel}$.
- **FR-PHARM-26**: The system must generate expiry reports grouped into critical brackets: Expired, Expiring in $\le 30$ days, 31–60 days, 61–90 days.

---

## 5. Non-Functional Requirements

1. **Transactional Integrity**: Batch balance deduction, prescription item counter increment, movement ledger recording, and prescription status updates must execute inside a single atomic PostgreSQL transaction.
2. **Concurrency Safety**: 10 simultaneous dispensing calls targeting the same batch must never cause negative inventory. All candidate batch rows must be locked using `SELECT ... FOR UPDATE`.
3. **Idempotency**: All dispensing endpoints must accept an `Idempotency-Key` to prevent double-dispensing caused by network retries.
4. **Tenant Isolation**: Multi-tenancy is non-negotiable. Pharmacists in Hospital A must never see or dispense stock from Hospital B.
5. **Sub-second Response Times**: Queue queries, formulary batch searches, and dispensing transactions must complete in $< 200\text{ms}$ under standard production load.
6. **No Phantom Inventories**: Physical stock in the database must reconcile with physical stock on the shelf with 100% mathematical auditability.

---

## 6. Success Metrics
- **0** instances of negative batch quantities in production.
- **0** instances of expired medications allocated for dispensing.
- **100%** reconciliation between `MedicineBatch.currentQuantity` and the `StockMovement` ledger.
- **< 100ms** latency for FEFO batch allocation recommendations.
