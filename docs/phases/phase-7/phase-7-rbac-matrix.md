# PHASE 7 — ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
## Pharmacy & Inventory Management
## MedCore HMS

---

## 1. Roles & Scope

The existing authoritative role definitions in MedCore HMS (`Role` enum in Prisma and `@medcore/types`) are:
1. `SUPER_ADMIN`
2. `HOSPITAL_ADMIN`
3. `DOCTOR`
4. `NURSE`
5. `RECEPTIONIST`
6. `LAB_TECHNICIAN`
7. `PHARMACIST`
8. `ACCOUNTANT`
9. `PATIENT`

---

## 2. Complete Permissions Matrix

| Pharmacy Feature / Endpoint | PHARMACIST | HOSPITAL_ADMIN | SUPER_ADMIN | DOCTOR | NURSE | PATIENT | RECEPTIONIST | ACCOUNTANT | LAB_TECH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Pharmacy Prescription Queue** | ✅ ALLOW | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **View Prescription Dispense Detail** | ✅ ALLOW | ✅ ALLOW | ✅ ALLOW | ✅ (own pt) | ✅ (ward pt) | ✅ (own rx) | ❌ DENY | ❌ DENY | ❌ DENY |
| **Execute Dispensing Transaction** | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **Execute Dispense Return / Reversal** | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **Stock Intake / Goods Receipt (GRN)** | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **View Inventory & Batch Stock** | ✅ ALLOW | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **Create / Update Batches** | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **Stock Adjustment (Audit Discrepancy)**| ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **Batch Quarantine / Unquarantine** | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **View Stock Movement Audit Ledger** | ✅ ALLOW | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **View Expiry & Low Stock Reports** | ✅ ALLOW | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |
| **Configure Medicine Reorder Levels** | ❌ DENY | ✅ ALLOW | ✅ ALLOW | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY | ❌ DENY |

---

## 3. Detailed Role Policy Descriptions

### 3.1 `PHARMACIST`
- **Primary Operator**: Full access to all dispensary and inventory operations within the assigned hospital tenant.
- Can receive stock from distributors, manage physical batches, allocate stock according to FEFO, record dispensations, process returns, and log routine stock adjustments with audit reasons.
- Cannot configure hospital-wide master reorder level defaults or access cross-tenant hospital inventories.

### 3.2 `HOSPITAL_ADMIN`
- **Supervisory Authority**: Full access to all pharmacy operations, batch overrides, quarantine controls, and inventory configuration for their hospital.
- Can configure `reorderLevel` on master medicine catalog records.
- Reviews and audits all `StockMovement` logs and dispensary discrepancy reports.

### 3.3 `SUPER_ADMIN`
- **Global Platform Support**: Read-only oversight and cross-tenant support.
- May inspect audit ledgers and inventory health across hospitals for compliance purposes.
- Cannot perform physical stock intake or drug dispensations (dispensing requires a physical licensed clinician context).

### 3.4 `DOCTOR`
- **Clinical Prescriber**: Absolutely forbidden from modifying inventory, recording stock receipts, or dispensing medications.
- May view the fulfillment status (`ISSUED`, `PARTIALLY_DISPENSED`, `DISPENSED`) of their authored prescriptions to confirm patient adherence.

### 3.5 `PATIENT`
- **Healthcare Consumer**: Can view personal prescription history and whether prescribed items have been dispensed or remain pending at the pharmacy.
- Completely blocked from accessing inventory stock levels, batch purchase costs, profit margins (MRP vs. Unit Cost), or other patients' orders.

### 3.6 `NURSE`, `RECEPTIONIST`, `LAB_TECHNICIAN`, `ACCOUNTANT`
- No clinical dispensing or stock modification capabilities.
- Receptionists and Lab Techs receive HTTP `403 Forbidden` on all pharmacy endpoints.
- Accountants interact with pharmacy solely through consolidated billing invoices in Phase 8.
