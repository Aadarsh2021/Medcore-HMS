# MedCore HMS — Phase 8 Laboratory & Diagnostics R&D Report
**Document Version:** 1.0.0  
**Phase:** 8 (Laboratory & Diagnostics Backend)  
**Date:** September 8, 2026  
**Auditor:** Antigravity Engineering Agent

---

## 1. Executive Summary & Existing Status

### Is Phase 8 Implemented?
- **Frontend Scope:** **COMPLETED & FROZEN.**  
  The frontend UI was fully built in previous iterations (`/dashboard/laboratory`, Lab Technician Workspace at `/dashboard`, Patient 360 Diagnostic History at `/dashboard/patients/detail`, and design system badges/dialogs).
- **Backend Scope:** **NOT IMPLEMENTED.**  
  `apps/api/src/modules/laboratory` is currently an empty directory. No laboratory controllers, services, DTOs, or tests exist in `apps/api`.
- **Database Schema:** **PARTIAL SKELETON ONLY.**  
  `prisma/schema.prisma` contains initial models (`LabCategory`, `LabTest`, `LabOrder`, `LabOrderItem`) and enum `LabOrderStatus` (`ORDERED`, `SAMPLE_COLLECTED`, `PROCESSING`, `COMPLETED`, `CANCELLED`). However, it lacks:
  - Collision-safe unique `orderNumber` (e.g., `LAB-YYYY-NNNNNN`) and counter table
  - Diagnostic priority enum (`ROUTINE`, `URGENT`, `STAT`)
  - The refined clinical state machine required by the frontend (`RESULTS_ENTERED` and `APPROVED` instead of generic `COMPLETED`)
  - Clinical result flags (`NORMAL`, `LOW`, `HIGH`, `CRITICAL` / panic values)
  - Specimen accession number and collection metadata
  - Result immutability audit trail / amendment support

---

## 2. Frontend Contract Audit

### Inspected Files:
1. `apps/web/src/lib/api/laboratory.service.ts`
2. `apps/web/src/app/dashboard/laboratory/page.tsx`
3. `apps/web/src/app/dashboard/page.tsx` (Lab Technician Workspace)
4. `apps/web/src/app/dashboard/patients/detail/page.tsx` (Diagnostic History Viewer)

### Contract Specifications:

#### Data Structure (`LabOrderItem` in frontend service):
```typescript
export interface LabOrderItem {
  id: string;
  orderNumber: string; // e.g. LAB-2026-000101
  patientId: string;
  patientUhid: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  doctorId: string;
  doctorName: string;
  encounterId?: string; // Optional (OPD/direct orders)
  status: 'ORDERED' | 'SAMPLE_COLLECTED' | 'PROCESSING' | 'RESULTS_ENTERED' | 'APPROVED' | 'CANCELLED';
  orderDate: string;
  specimenType: string;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  tests: Array<{
    id?: string;
    testId?: string;
    code: string;
    name: string;
    category: string;
    result?: string;
    unit?: string;
    referenceRange?: string;
    flag?: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL';
    notes?: string;
  }>;
  collectedAt?: string;
  processedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}
```

#### Frontend Actions & Service Methods:
1. `getOrders(filters?: { status?: string; patientId?: string })` -> Returns lab order list.
2. `getOrderById(id: string)` -> Returns specific order details.
3. `collectSample(orderId: string, specimenDetails: string)` -> Transitions order to `SAMPLE_COLLECTED`.
4. `startProcessing(orderId: string)` -> Transitions order to `PROCESSING`.
5. `enterResults(orderId: string, results: Array<{ code: string; result: string; unit?: string; referenceRange?: string; flag?: any; notes?: string }>)` -> Transitions order to `RESULTS_ENTERED`.
6. `approveResults(orderId: string, pathologistName: string)` -> Transitions order to `APPROVED` and generates report metadata.
7. `createOrder(payload)` -> Doctor creates a new requisition.
8. `cancelOrder(orderId: string, reason: string)` -> Cancels un-finalized order.

---

## 3. Backend Gap Analysis & Missing Capabilities

| Capability | Frontend Expectation | Current Backend State | Required Action |
|---|---|---|---|
| **API Endpoints** | REST endpoints under `/api/laboratory/*` | None (empty folder) | Implement `LaboratoryController` & `LaboratoryService` |
| **Order Numbering** | Format `LAB-YYYY-000001` scoped to Hospital | Missing field on `LabOrder` | Add `orderNumber` + `LabOrderNumberCounter` with advisory lock |
| **Order Status** | `ORDERED`, `SAMPLE_COLLECTED`, `PROCESSING`, `RESULTS_ENTERED`, `APPROVED`, `CANCELLED` | Prisma enum has `COMPLETED` instead of `RESULTS_ENTERED`/`APPROVED` | Update `LabOrderStatus` enum in Prisma |
| **Priority** | `ROUTINE`, `URGENT`, `STAT` | Missing | Add `LabOrderPriority` enum |
| **Result Flags** | `NORMAL`, `LOW`, `HIGH`, `CRITICAL` | `isAbnormal Boolean` only | Add `LabResultFlag` enum to schema |
| **Server Reference Ranges** | Server evaluates result vs min/max | Missing | Add automated range & critical calculator in backend |
| **Accessioning** | Unique specimen accession number | Missing | Support specimen accession and barcode identification |
| **Immutability** | Approved reports cannot be modified | Missing | Lock approved orders; require amendment for corrections |
| **Audit Logging** | Audit creation, intake, results, approval | Missing | Hook into `AuditLog` model |
| **RBAC** | DOCTOR, LAB_TECHNICIAN, NURSE, ADMIN, PATIENT | Guard architecture exists, needs lab route wiring | Apply `@Roles(...)` and `SupabaseAuthGuard` |
| **Tenant Isolation** | AsyncLocalStorage + tenant extension | Tenant extension has placeholders for LabOrder/LabTest | Connect schema relations and test cross-tenant access |

---

## 4. Required Database Schema Refinements

### Enums to Add / Update in `prisma/schema.prisma`:
```prisma
enum LabOrderStatus {
  ORDERED
  SAMPLE_COLLECTED
  PROCESSING
  RESULTS_ENTERED
  APPROVED
  CANCELLED
}

enum LabOrderPriority {
  ROUTINE
  URGENT
  STAT
}

enum LabResultFlag {
  NORMAL
  LOW
  HIGH
  CRITICAL
}
```

### Model Enhancements:
1. **`LabOrderNumberCounter`**:
   - `hospitalId String`
   - `year Int`
   - `lastNumber Int @default(0)`
   - `@@unique([hospitalId, year])`
2. **`LabOrder`**:
   - Add `orderNumber String` (`@@unique([hospitalId, orderNumber])`)
   - Add `priority LabOrderPriority @default(ROUTINE)`
   - Add `specimenType String?`
   - Add `accessionNumber String?`
   - Make `encounterId String?` (optional for outpatient / direct diagnostic walks)
   - Add `collectedAt DateTime?`
   - Add `collectedByUserId String?`
   - Add `processedAt DateTime?`
   - Add `processedByUserId String?`
   - Add `approvedAt DateTime?`
   - Add `approvedByUserId String?`
   - Add `cancellationReason String?`
3. **`LabOrderItem`**:
   - Add `flag LabResultFlag?`
   - Add `unit String?`
   - Add `referenceRangeMin Decimal?`
   - Add `referenceRangeMax Decimal?`
   - Add `isCritical Boolean @default(false)`
   - Add `previousValue String?` (for amendment tracking)
   - Add `amendedAt DateTime?`
   - Add `amendedByUserId String?`
   - Add `amendmentReason String?`

---

## 5. Security, RBAC & Tenant Boundaries

### RBAC Matrix:
- **`DOCTOR`**:
  - `POST /api/laboratory/orders` (Create order)
  - `GET /api/laboratory/orders` (View orders for patient / hospital)
  - `GET /api/laboratory/orders/:id` (View order & report)
  - `POST /api/laboratory/orders/:id/cancel` (Cancel unfinalized order)
- **`LAB_TECHNICIAN`**:
  - `GET /api/laboratory/orders` (View queue / worklist)
  - `GET /api/laboratory/orders/:id`
  - `POST /api/laboratory/orders/:id/collect` (Record specimen intake & barcode)
  - `POST /api/laboratory/orders/:id/process` (Mark in-analysis)
  - `POST /api/laboratory/orders/:id/results` (Enter measurements & trigger server range checks)
- **`HOSPITAL_ADMIN` / `DOCTOR` (Authorized Pathologist)**:
  - `POST /api/laboratory/orders/:id/approve` (Certify & lock results)
  - `POST /api/laboratory/orders/:id/amend` (Amended corrections with audit reason)
- **`NURSE`**:
  - `GET /api/laboratory/orders`
  - `POST /api/laboratory/orders/:id/collect`
- **`PATIENT`**:
  - `GET /api/laboratory/orders` (Own orders only)
  - `GET /api/laboratory/orders/:id` (Own orders only, only when `APPROVED`)
- **`RECEPTIONIST` / `PHARMACIST` / `ACCOUNTANT`**:
  - Direct clinical result entry and medical report certification are **DENIED (403 Forbidden)**.

### Tenant Isolation:
- Strictly enforced via `AsyncLocalStorage` and `prisma-tenant.extension.ts`.
- Direct relations: `LabOrder` has `hospitalId`.
- Indirect relations: `LabOrderItem` belongs to `LabOrder` which belongs to `Hospital`.
- Cross-tenant validation: Cannot attach patient or doctor belonging to another hospital.

---

## 6. Testing & Quality Assurance Plan

1. **Unit & Integration Suite (`apps/api/test/laboratory-management.spec.ts`)**:
   - Minimum 40 test cases covering the complete lifecycle, negative assertions, RBAC enforcement, server-side range flags, concurrency on accession/order numbering, and multi-tenant isolation.
2. **Phase 1–7 Regression**:
   - All existing 168 tests across 9 test suites must remain 100% green.
3. **Frontend Live Integration**:
   - Replace adapter stubbing in `apps/web/src/lib/api/laboratory.service.ts` with typed HTTP client calls (`api.get`, `api.post`).
4. **Build Verifications**:
   - `@medcore/types`: build cleanly.
   - `@medcore/api`: compile cleanly with 0 TypeScript errors.
   - `@medcore/web`: compile and export all 28 static routes cleanly.

---
**Status:** R&D Complete. Ready for Architecture Freeze & Implementation.
