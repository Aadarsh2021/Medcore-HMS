# PHASE 6 — RESEARCH & DISCOVERY (R&D) FINDINGS
# MedCore HMS — Prescription Management & Clinical Medication Ordering

**Status:** COMPLETE — AWAITING IMPLEMENTATION APPROVAL  
**Date:** September 2026  
**Document Version:** 1.0.0  
**Authors:** MedCore HMS Core Architecture Team  

---

## 1. Executive Summary

Phase 6 introduces **Prescription Management & Clinical Medication Ordering** to MedCore HMS.
Prescription data is clinical, legally binding, highly auditable, and must preserve absolute historical integrity. Under medical guidelines and the MedCore HMS Product Requirements Document (PRD Section 7.4), a prescription represents a licensed doctor's official medication order for a patient formulated during an active clinical encounter.

This R&D document presents an exhaustive code audit of the current MedCore HMS repository, inspects pre-existing schemas and infrastructure, establishes hard domain boundaries, resolves critical architectural questions (immutability, numbering, PDF generation, digital signatures, and RBAC), and defines the exact execution plan for Phase 6 without touching production code.

---

## 2. Existing Code Audit Findings

### 2.1 Schema Inspection: Models & Relations

1. **`Prescription` Model (Pre-existing in `prisma/schema.prisma` lines 635–655):**
   - **Primary Key:** `id` (UUID)
   - **Tenant Key:** `hospitalId` (Foreign Key referencing `Hospital.id`, `onDelete: Cascade`)
   - **Encounter Link:** `encounterId` (`@unique`, Foreign Key referencing `PatientEncounter.id`, `onDelete: Cascade`)
   - **Patient Link:** `patientId` (Foreign Key referencing `Patient.id`, `onDelete: Cascade`)
   - **Doctor Link:** `doctorId` (Foreign Key referencing `Doctor.id`, `onDelete: Cascade`)
   - **Fields:** `notes` (String?), `signedPdfUrl` (String?), `status` (`PrescriptionStatus`, default `ISSUED`)
   - **Relations:** `items` (`PrescriptionItem[]`)
   - **Timestamps:** `createdAt`, `updatedAt`
   - **Indexes:** `@@index([hospitalId, patientId])`

2. **`PrescriptionItem` Model (Pre-existing in `prisma/schema.prisma` lines 657–673):**
   - **Primary Key:** `id` (UUID)
   - **Parent Link:** `prescriptionId` (Foreign Key referencing `Prescription.id`, `onDelete: Cascade`)
   - **Medicine Link:** `medicineId` (Foreign Key referencing `Medicine.id`)
   - **Fields:** `dosage` (String), `frequency` (`PrescriptionFrequency`, default `BD`), `durationDays` (Int, default 5), `route` (String, default `"ORAL"`), `instructions` (String?), `dispensedQuantity` (Int, default 0)
   - **Timestamps:** `createdAt`
   - **Indexes:** `@@index([prescriptionId])`

3. **`Medicine` & `MedicineBatch` Models (Pre-existing in `prisma/schema.prisma` lines 675–715):**
   - `Medicine` represents hospital-scoped catalog entries: `id`, `hospitalId`, `name`, `genericName`, `category`, `form` (`MedicineForm`: `TABLET`, `CAPSULE`, `SYRUP`, `INJECTION`, `TOPICAL`, `DROPS`, `INHALER`, `OTHER`), `strength`, `manufacturer`, `reorderLevel`.
   - `MedicineBatch` represents future pharmacy inventory: `id`, `medicineId`, `batchNumber`, `manufacturingDate`, `expiryDate`, `initialQuantity`, `currentQuantity`, `unitCost`, `mrp`, `isQuarantined`.

4. **`Doctor` Signature & License (Pre-existing in `prisma/schema.prisma` lines 307–330):**
   - `Doctor.licenseNumber`: String (Doctor's official state medical council registration / license number).
   - `Doctor.signatureUrl`: String? (Path / URL to the doctor's stored physical signature image).
   - `Doctor.prescriptions`: `Prescription[]` relation.

5. **`PatientEncounter` & `MedicalRecord` Pivots:**
   - `PatientEncounter` (1:1 with `Appointment`) acts as the parent pivot for clinical care.
   - `PatientEncounter` has `medicalRecord` (`MedicalRecord?` via `encounterId @unique`).
   - `PatientEncounter` has `prescription` (`Prescription?` via `encounterId @unique`).
   - Both point to the exact same clinical encounter!

6. **`MedicationHistory` vs `Prescription` (CRITICAL DOMAIN BOUNDARY):**
   - `MedicationHistory` (lines 596–613) records longitudinal patient history: medications the patient has been taking at home, past chronic therapies, or home regimens reported during intake.
   - `Prescription` records acute, legally binding clinical orders prescribed by the physician during an encounter.
   - **Rule:** They are completely separate models. Creating or modifying a prescription NEVER directly mutates `MedicationHistory`.

7. **PDF & Storage Infrastructure:**
   - **Puppeteer:** Not installed.
   - **Existing Storage:** `apps/api/src/common/storage/storage.service.ts` is fully implemented and tested. It provides S3 private storage, 20 MB file size limit, MIME whitelist (including `application/pdf`), and 15-minute temporary pre-signed download URLs.
   - **PDF Strategy:** A lightweight, pure TypeScript/JavaScript PDF engine (`pdfkit` + `@types/pdfkit`) generates deterministic clinical prescription PDFs without Chromium binaries or server bloat.

8. **Existing API Response Envelope:**
   - Standard envelope: `{ success: true, data: ... }` or `{ success: true, data: [...], pagination: { page, limit, total, totalPages } }`.

9. **Existing Audit Infrastructure:**
   - `tx.auditLog.create` / `this.prisma.auditLog.create` logs `hospitalId`, `userId`, `action` (`AuditAction`), `entityName`, `entityId`, `changesJson`.

---

## 3. The 27 Detailed R&D Findings

### 1. Existing Prescription-Related Schema
`Prescription` currently has:
- `id`, `hospitalId`, `encounterId` (@unique), `patientId`, `doctorId`, `notes`, `signedPdfUrl`, `status` (`PrescriptionStatus`: `ISSUED`, `DISPENSED`, `CANCELLED`).
- `items`: `PrescriptionItem[]`.

### 2. Existing Medication-Related Schema
`MedicationHistory` has:
- `id`, `patientId`, `recordId`?, `medicationName`, `dosage`, `frequency`, `route`?, `startDate`?, `endDate`?, `isActive`, `notes`, `createdAt`.
- Attached to `MedicalRecord` and `Patient`, storing longitudinal patient history.

### 3. Existing Medicine-Related Infrastructure
- `Medicine` catalog scoped to `hospitalId`.
- Fields: `name`, `genericName`, `category`, `form` (`MedicineForm`), `strength`, `manufacturer`.
- Indexed on `[hospitalId, name]` and `[hospitalId, category]`.

### 4. Existing PDF Infrastructure
- No PDF generation library currently installed in `apps/api/package.json`.
- Puppeteer is absent.
- `StorageService` is already equipped to store `application/pdf` and issue signed download URLs.

### 5. Existing S3 Infrastructure
- Canonical private object storage via AWS S3 / mock local S3 adapter in `StorageService`.
- 15-minute expiration on pre-signed download tokens.
- Secure key paths: `prescriptions/{hospitalId}/{patientId}/{prescriptionNumber}.pdf`.

### 6. Existing Doctor Signature Implementation
- `Doctor` table has `signatureUrl` (String?) and `licenseNumber` (String).
- Prescriptions are stamped with the authenticated doctor's identity, license number, and signature graphic.

### 7. Proposed Prescription Domain Model
To support professional clinical workflows, the schema will be enriched with:
- **`PrescriptionStatus` Enum Enhancement:** Add `DRAFT` status:
  `enum PrescriptionStatus { DRAFT, ISSUED, DISPENSED, CANCELLED }`.
- **`Prescription` Model Extensions:**
  - `prescriptionNumber`: String? (Human-readable, e.g. `RX-MGH-2026-000001`, unique per hospital: `@@unique([hospitalId, prescriptionNumber])`).
  - `issuedAt`: DateTime? (Timestamp of finalization).
  - `voidedAt`: DateTime? (Timestamp if cancelled/voided).
  - `voidReason`: String? (Audited clinical explanation for voiding).
  - `voidedById`: String? (Doctor/Admin who cancelled the prescription).
- **`PrescriptionItem` Model Extensions:**
  - `medicineName`: String (Snapshot of medicine brand/generic name to ensure immutability even if the catalog is updated later).
  - `quantity`: Int? (Total prescribed units, e.g., 10 tablets).

### 8. Medicine Master Strategy
- Use existing `Medicine` model as the primary hospital catalog.
- Introduce seeded essential medicine catalog (WHO / NLEM essentials: Paracetamol, Amoxicillin, Azithromycin, Metformin, Atorvastatin, Omeprazole, etc.) per tenant.
- Doctor search endpoint: `GET /api/medicines/search?q=...&limit=20` with case-insensitive `ILIKE` / `mode: 'insensitive'` on `name` or `genericName`.
- Results return structured `name`, `genericName`, `form`, `strength`.
- Doctor can select from catalog; snapshotting `medicineName` into `PrescriptionItem` ensures clinical historical integrity.

### 9. Prescription Lifecycle
```
[ DOCTOR IN ENCOUNTER ]
         │
         ▼
    1. DRAFT  ────────────► CANCELLED (Draft discarded by Doctor)
         │
         ▼ (Doctor reviews items, dosage, instructions, and clicks Finalize)
    2. ISSUED (Finalized & Immutable)
         │
         ├────────────────► CANCELLED / VOIDED (Audited cancellation with mandatory reason)
         │
         ▼ (Future Pharmacy Phase)
    3. DISPENSED
```

### 10. Finalization Invariants
Finalization requires all of the following:
1. `Encounter` status must be `IN_PROGRESS`.
2. Authenticated user must be a DOCTOR, matching `encounter.doctorId`.
3. Prescription must currently be in `DRAFT` status.
4. Prescription must contain at least one valid `PrescriptionItem`.
5. Each item must specify: `medicineName`, `dosage`, `frequency`, `durationDays >= 1`, `route`.
6. Atomic transaction:
   - Assign collision-free `prescriptionNumber`.
   - Update status to `ISSUED`, set `issuedAt = now()`.
   - Generate prescription PDF and upload to private S3.
   - Record `signedPdfUrl`.
   - Create operational `AuditLog` entry.

### 11. Immutability Strategy
- Once a prescription reaches `ISSUED`, it is **strictly immutable**.
- All update/delete operations on finalized prescriptions are rejected with HTTP 409 Conflict.
- Prescription items cannot be added, edited, or removed from an `ISSUED` prescription.

### 12. Correction / Void Strategy
- If a finalized prescription contains a clinical error, it CANNOT be modified.
- The prescribing doctor or hospital admin may issue a void request: `POST /api/prescriptions/:id/void` with a mandatory `reason` (minimum 5 characters).
- The prescription status transitions to `CANCELLED`, recording `voidedAt`, `voidReason`, and `voidedById`.
- The original prescription record and generated PDF remain intact in the database for auditing.
- If replacement therapy is needed, the doctor creates a new prescription draft for the encounter.

### 13. Prescription Numbering Strategy
- Format: `RX-{HOSPITAL_CODE}-{YYYY}-{SEQUENTIAL_6_DIGIT}`
  - Example: `RX-MGH-2026-000001`
- Hospital-scoped uniqueness enforced by `@unique([hospitalId, prescriptionNumber])`.
- Generated inside a serializable database transaction using a dedicated `PrescriptionSequence` or atomic transactional counter to guarantee zero collisions under concurrency.

### 14. Digital Signature Semantics
- In MedCore HMS, "digital signature" signifies the legally recognized electronic sign-off of the attending physician:
  - Doctor authentication verified via Supabase JWT and verified `Doctor` profile.
  - Doctor's registration/license number (`Doctor.licenseNumber`) is stamped on the prescription.
  - Doctor's verified signature graphic (`Doctor.signatureUrl`) stored in private S3 is retrieved and overlaid onto the PDF letterhead.
  - Document metadata includes the cryptographic SHA-256 digest of prescription content, doctor ID, and finalization timestamp.

### 15. PDF Architecture
- PDF Engine: `pdfkit` (lightweight, zero Chromium dependencies, instant, deterministic).
- Layout:
  - Hospital Header: Hospital Name, Address, Contact, Rx Logo.
  - Patient Details: UHID, Name, Age, Gender, Date of Issue, Prescription Number.
  - Doctor Details: Doctor Name, Specialization, License Number.
  - Medication Table: #, Medicine Name & Form, Strength, Dosage, Frequency, Route, Duration, Instructions.
  - Doctor Signature Block: Physical signature image overlay, printed doctor name, license number, timestamp.
  - Footer: Tamper-evident verification hash and clinical disclaimer.

### 16. Storage Architecture
- Binary PDFs are **never** stored in PostgreSQL.
- S3 Key: `prescriptions/{hospitalId}/{patientId}/{prescriptionNumber}.pdf`.
- Access is strictly via authorized pre-signed URLs expiring in 15 minutes (`StorageService.getSignedDownloadUrl`).

### 17. RBAC Matrix
Detailed in Section 5 below and `phase-6-rbac-matrix.md`.

### 18. Tenant Invariants
- All queries enforce `hospitalId` matching the authenticated tenant context.
- Prisma Tenant Extension automatically applies `hospitalId` to `Prescription`, `PrescriptionItem`, and `Medicine`.
- Cross-tenant lookups return HTTP 404/403.

### 19. API Contract
Detailed in Section 6 below and `phase-6-api-contract.md`.

### 20. Concurrency Analysis
- **Double Finalization:** Guarded by conditional atomic update: `WHERE id = :id AND status = 'DRAFT'`. Second concurrent request finds no matching record and returns HTTP 409 Conflict.
- **Prescription Number Collisions:** Protected by database unique constraint `@@unique([hospitalId, prescriptionNumber])` and transactional counter allocation.
- **Concurrent Draft Edits:** Guarded by transactional item replacement.

### 21. Test Plan
Comprehensive suite of unit and integration tests covering:
- Draft creation, update, and deletion.
- Finalization validation and item checks.
- Immutability enforcement on finalized prescriptions.
- Voiding workflow and audit logs.
- Medicine search with pagination and case-insensitivity.
- Doctor signature overlay and PDF generation.
- Pre-signed S3 download URLs and unauthorized access prevention.
- Cross-tenant and cross-patient security checks.
- Full Phase 1–5 regression test execution.

### 22. Phase 5 Integration Points
- Prescriptions are initiated during an `IN_PROGRESS` encounter.
- Doctor assigning prescription must match `encounter.doctorId`.
- Clinical Workspace (`DoctorClinicalWorkspacePage`) integrates prescription formulation panel alongside Vitals and Diagnoses.

### 23. Pharmacy Integration Boundary
- Phase 6 models the doctor's medication order (`Prescription` + `PrescriptionItem`).
- Dispensing, batch deduction, inventory depletion, expiry alerts, and FIFO tracking belong strictly to Phase 7/8 (Pharmacy).
- `PrescriptionItem.dispensedQuantity` remains 0 until fulfilled by Pharmacy.

### 24. Billing Integration Boundary
- Invoicing, line items, payments, and insurance claims belong to the Billing module.
- Prescriptions provide `prescriptionId` and `encounterId` for future pharmacy invoice generation.

### 25. Risks & Mitigations
| Risk | Severity | Mitigation |
| :--- | :---: | :--- |
| PDF generation memory spike | Medium | Use streaming `pdfkit` rather than Chromium/Puppeteer |
| Inadvertent prescription edit | High | Database and service-level immutability post-finalization |
| Unauthorized PDF download | High | Short-lived (15 min) pre-signed URLs with RBAC checks |
| Cross-tenant leakage | Critical | Strict Prisma tenant extension + route guards |

### 26. Open Questions
- Addressed in Section 4 below.

### 27. Exact Implementation Sequence
- Detailed in Section 7 below.

---

## 4. Open Questions & Architectural Clarifications

1. **Custom Doctor-Entered Medicines vs. Catalog Only:**
   - *Clarification:* Should doctors be allowed to prescribe a medicine not currently in the hospital's catalog?
   - *Decision:* Yes. To prevent clinical blocking during emergencies, if a rare or unlisted medicine is needed, the doctor can provide custom text. The `PrescriptionItem` stores `medicineName` directly as a snapshot, with `medicineId` optional.
2. **Prescription Cancellation vs. Correction:**
   - *Decision:* Finalized prescriptions cannot be modified. They can only be cancelled with a documented clinical reason, followed by creating a fresh prescription draft if replacement therapy is required.

---

## 5. RBAC Matrix

| Role | Search Medicines | Create Draft Rx | Edit Draft Rx | Finalize Rx | Void/Cancel Rx | View Finalized Rx | Download PDF |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **SUPER_ADMIN** | Yes | No | No | No | Yes | Yes | Yes |
| **HOSPITAL_ADMIN** | Yes | No | No | No | Yes | Yes | Yes |
| **DOCTOR** | Yes | Assigned Only | Assigned Only | Assigned Only | Prescribing Only | Yes (Tenant) | Yes |
| **NURSE** | Yes | No | No | No | No | Yes (Tenant) | Yes |
| **RECEPTIONIST** | No | No | No | No | No | No | No |
| **PHARMACIST** | Yes | No | No | No | No | Yes (Tenant) | Yes |
| **PATIENT** | No | No | No | No | No | Own Only | Own Only |

---

## 6. API Endpoints

1. `GET /api/medicines/search?q=...&limit=20` — Search hospital medicines catalog
2. `POST /api/encounters/:encounterId/prescriptions` — Create draft prescription
3. `GET /api/prescriptions/:id` — Get prescription details
4. `PUT /api/prescriptions/:id` — Update draft prescription items
5. `POST /api/prescriptions/:id/finalize` — Finalize prescription, generate PDF
6. `POST /api/prescriptions/:id/void` — Void/cancel finalized prescription
7. `GET /api/prescriptions/:id/pdf/url` — Get authorized 15-minute signed PDF URL
8. `GET /api/patients/:patientId/prescriptions` — Get paginated patient prescriptions

---

## 7. Implementation Sequence (15 Steps)

1. **Step 1:** Schema extension & Prisma migration (`DRAFT` status, `prescriptionNumber`, snapshots, auditing).
2. **Step 2:** Shared TypeScript contracts in `@medcore/types`.
3. **Step 3:** Seed hospital essential medicines catalog.
4. **Step 4:** Medicine search module & controller.
5. **Step 5:** Prescription domain service & draft management.
6. **Step 6:** Prescription item management & validation.
7. **Step 7:** Immutability & finalization workflow.
8. **Step 8:** Cancellation / voiding workflow & audit logs.
9. **Step 9:** PDF generation service (`pdfkit`).
10. **Step 10:** S3 PDF upload & pre-signed URL generation.
11. **Step 11:** Prescriptions API controller & route guards.
12. **Step 12:** Integration test suite for Phase 6.
13. **Step 13:** Doctor clinical workspace prescription UI.
14. **Step 14:** Patient portal finalized prescription view & PDF download.
15. **Step 15:** Full Phase 1–5 regression test run & build verification.
