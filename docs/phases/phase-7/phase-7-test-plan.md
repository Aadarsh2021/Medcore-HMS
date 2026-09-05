# PHASE 7 — TEST PLAN & VERIFICATION MATRIX
## Pharmacy & Inventory Management
## MedCore HMS

---

## 1. Testing Philosophy & Baseline

Phase 7 maintains the strict testing discipline established in Phases 1–6:
- **Zero Weakened Tests**: All existing 148 regression tests (across Phases 1–6) must remain 100% green without modification.
- **Real Database Environment**: Tests execute against real Supabase PostgreSQL test instances; mock databases are prohibited.
- **Stress & Concurrency Verification**: Dispensing, batch deductions, and stock receipts must undergo parallel concurrency testing.

---

## 2. Test Suites Specification

### 2.1 Unit Tests (`apps/api/src/modules/pharmacy/*.spec.ts`)
- **FEFO Calculation Unit Tests**:
  - `should allocate batches with earliest expiration date first`
  - `should break ties using creation/receipt date (FIFO)`
  - `should strictly exclude expired batches (expiry <= today)`
  - `should strictly exclude quarantined batches`
  - `should split allocations across multiple batches when single batch is insufficient`
  - `should return unfulfilled quantity when total valid stock is less than prescribed`
- **Reorder Level & Low Stock Calculations**:
  - `should correctly sum valid non-expired batch quantities`
  - `should flag low stock when available quantity is less than or equal to reorderLevel`

---

### 2.2 Integration & E2E Tests (`apps/api/test/pharmacy.e2e-spec.ts`)

#### Group 1: Stock Intake & Goods Receipt (GRN)
1. `should allow pharmacist to record a stock receipt with valid batches`
2. `should atomically create new MedicineBatch and record PURCHASE_RECEIPT movement`
3. `should increment existing batch currentQuantity when same batch number is received`
4. `should reject stock receipt with missing supplier, negative cost, or past expiry date`
5. `should enforce tenant isolation on stock receipts (Hospital A cannot receive for Hospital B)`

#### Group 2: Pharmacy Prescription Queue & Eligibility
6. `should list ISSUED and PARTIALLY_DISPENSED prescriptions in pharmacy queue`
7. `should strictly exclude DRAFT and CANCELLED prescriptions from queue`
8. `should filter queue by patient UHID, prescription number, and status`
9. `should return 403 when doctor or patient attempts to view pharmacy queue`

#### Group 3: FEFO Batch Allocation & Dispensing
10. `should generate FEFO dispense plan for an ISSUED prescription`
11. `should successfully dispense prescription item from single batch`
12. `should successfully dispense item across multiple batches in FEFO sequence`
13. `should accurately decrement MedicineBatch.currentQuantity and increment PrescriptionItem.dispensedQuantity`
14. `should insert DISPENSE record in StockMovement ledger with exact balance snapshots`
15. `should transition prescription status to DISPENSED when all items are 100% fulfilled`
16. `should transition prescription status to PARTIALLY_DISPENSED when stock only partially fulfills order`
17. `should reject dispensing if selected batch has insufficient stock (HTTP 409)`
18. `should reject dispensing if batch is expired (HTTP 422)`
19. `should reject dispensing if batch is quarantined (HTTP 422)`
20. `should reject dispensing quantity exceeding prescribed quantity (HTTP 400)`

#### Group 4: High Concurrency & Race Condition Elimination
21. **The 10-User Batch Depletion Test**:
    - Batch has exactly 10 units.
    - 10 concurrent requests simultaneously request 8 units each.
    - **Expectation**: Exactly 1 request succeeds (8 units dispensed, 2 remaining). 9 requests receive `HTTP 409 Conflict`. Total dispensed = 8. Batch quantity = 2. Zero negative stock.
22. **100 Concurrent Stock Receipts Test**:
    - 100 parallel stock receipt transactions execute across distinct and shared batches.
    - **Expectation**: Zero deadlocks, zero lost updates, exactly 100 matching ledger movements.
23. **Double-Click Idempotency Test**:
    - Same dispense payload with identical `Idempotency-Key` sent 5 times concurrently.
    - **Expectation**: Exactly 1 stock deduction occurs. 4 requests return identical dispense receipt.

#### Group 5: Prescription Cancellation & Void Boundary
24. `should allow doctor/admin to void ISSUED prescription when dispensedQuantity is 0`
25. `should strictly block voiding of PARTIALLY_DISPENSED prescription (HTTP 409)`
26. `should strictly block voiding of DISPENSED prescription (HTTP 409)`
27. `should prevent dispensing against a CANCELLED prescription (HTTP 409)`

#### Group 6: Stock Adjustments, Quarantine & Ledger Audit
28. `should allow pharmacist to adjust stock with mandatory reason >= 5 characters`
29. `should record ADJUSTMENT movement in ledger with actor attribution`
30. `should reject negative stock adjustment that would drive batch quantity below 0`
31. `should toggle quarantine on a batch and immediately remove it from dispense plan`
32. `should maintain mathematical invariant: batch.currentQuantity == initial + sum(movements)`

#### Group 7: Reports & RBAC
33. `should accurately report expired and near-expiry batches across 30/60/90 day brackets`
34. `should accurately report low-stock medicines based on aggregated batch totals`
35. `should reject non-pharmacist / non-admin users from mutating inventory (HTTP 403)`
36. `should ensure complete tenant isolation: Hospital A pharmacist cannot see Hospital B batches`

---

## 3. Regression Test Target
- Phase 1 Authentication & Tenancy: 20 tests
- Phase 2 Patient Management: 23 tests
- Phase 3 Doctor Scheduling: 23 tests
- Phase 4 Appointment Booking: 28 tests
- Phase 5 Clinical Encounters & EMR: 26 tests
- Phase 6 Prescription Lifecycle: 28 tests
- **Phase 7 Pharmacy & Inventory: 36 new tests**
- **Total Expected Suite: 184 passing tests**
