# PHASE 5 — RESEARCH & DISCOVERY (R&D) FINDINGS
# MedCore HMS — Clinical Encounters & Electronic Medical Records (EMR)

**Status:** COMPLETE & AUDITED  
**Date:** September 2026  
**Document Version:** 1.0.0  
**Authors:** MedCore HMS Core Architecture Team  

---

## 1. Executive Summary

Phase 5 introduces the clinical core of MedCore HMS: **Clinical Encounters and Electronic Medical Records (EMR)**.
Clinical data is longitudinal, legally binding, highly sensitive (PHI), auditable, and must preserve historical integrity. Under healthcare regulations and the project's Product Requirements Document (PRD), medical records must be **append-only**—historical records cannot be silently overwritten or deleted.

This R&D document provides a thorough audit of the existing codebase, schema, tenant architecture, security contracts, and clinical workflows to formulate a rock-solid, production-grade architectural design for Phase 5 before writing production code.

---

## 2. Baseline Architecture & Codebase Discovery

### 2.1 Schema Inspection & Existing Clinical Models
Inspection of `prisma/schema.prisma` reveals that fundamental clinical models already exist in the PostgreSQL schema:

1. **`PatientEncounter`**:
   - Primary Key: `id` (UUID)
   - Tenant Key: `hospitalId` (Foreign Key referencing `Hospital.id`, `onDelete: Cascade`)
   - Appointment Link: `appointmentId` (`@unique`, Foreign Key referencing `Appointment.id`, `onDelete: Cascade`)
   - Patient Link: `patientId` (Foreign Key referencing `Patient.id`, `onDelete: Cascade`)
   - Doctor Link: `doctorId` (Foreign Key referencing `Doctor.id`, `onDelete: Cascade`)
   - Status: `EncounterStatus` enum (`CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), default `CHECKED_IN`
   - Timestamps: `startedAt` (DateTime?), `completedAt` (DateTime?), `createdAt`, `updatedAt`
   - Relations: `medicalRecord` (1:1 optional), `prescription` (1:1 optional), `labOrders` (1:many), `invoice` (1:1 optional)
   - Indexes: `@@index([hospitalId, patientId])`, `@@index([hospitalId, doctorId])`

2. **`MedicalRecord`**:
   - Primary Key: `id` (UUID)
   - Tenant Key: `hospitalId` (Foreign Key referencing `Hospital.id`, `onDelete: Cascade`)
   - Encounter Link: `encounterId` (`@unique`, Foreign Key referencing `PatientEncounter.id`, `onDelete: Cascade`)
   - Patient Link: `patientId` (Foreign Key referencing `Patient.id`, `onDelete: Cascade`)
   - Doctor Link: `doctorId` (Foreign Key referencing `Doctor.id`, `onDelete: Cascade`)
   - Clinical Core Fields:
     - `chiefComplaint`: String (Mandatory clinical presenting reason)
     - `presentingSymptoms`: String? (Optional detailed symptoms)
     - `clinicalNotes`: String? (Doctor's examination notes)
     - `treatmentPlan`: String? (Therapeutic and management plan)
     - `followUpDate`: DateTime? (Optional recommended follow-up date)
   - Timestamps: `createdAt`, `updatedAt`
   - Relations: `vitals` (`Vital[]`), `diagnoses` (`Diagnosis[]`), `allergies` (`Allergy[]`), `attachments` (`Attachment[]`)
   - Indexes: `@@index([hospitalId, patientId])`

3. **`Vital`**:
   - Primary Key: `id` (UUID)
   - Parent Record Link: `recordId` (Foreign Key referencing `MedicalRecord.id`, `onDelete: Cascade`)
   - Vitals Payload:
     - `bpSystolic`: Int?
     - `bpDiastolic`: Int?
     - `heartRate`: Int?
     - `temperature`: Decimal(4,1)?
     - `spo2`: Int?
     - `respiratoryRate`: Int?
     - `heightCm`: Decimal(5,2)?
     - `weightKg`: Decimal(5,2)?
     - `bmi`: Decimal(4,1)?
     - `notes`: String?
   - Timestamps: `recordedAt` (default `now()`), `createdAt`
   - Indexes: `@@index([recordId])`

4. **`Diagnosis`**:
   - Primary Key: `id` (UUID)
   - Parent Record Link: `recordId` (Foreign Key referencing `MedicalRecord.id`, `onDelete: Cascade`)
   - Fields: `code` (String?, ICD-10), `description` (String), `type` (`DiagnosisType`: `PROVISIONAL` | `CONFIRMED`), `isPrimary` (Boolean, default `true`), `notes` (String?)
   - Timestamps: `createdAt`
   - Indexes: `@@index([recordId])`

5. **`Allergy`**:
   - Primary Key: `id` (UUID)
   - Parent Links: `patientId` (Foreign Key referencing `Patient.id`), `recordId` (Foreign Key referencing `MedicalRecord.id`, optional)
   - Fields: `allergen` (String), `reaction` (String), `severity` (`AllergySeverity`: `MILD` | `MODERATE` | `SEVERE`), `diagnosedAt` (DateTime)
   - Indexes: `@@index([patientId])`

6. **`Attachment`**:
   - Primary Key: `id` (UUID)
   - Parent Record Link: `recordId` (Foreign Key referencing `MedicalRecord.id`, `onDelete: Cascade`)
   - Fields: `fileName` (String), `fileUrl` (String), `fileType` (String), `fileSize` (Int), `uploadedAt` (DateTime)
   - Indexes: `@@index([recordId])`

### 2.2 Answers to the 12 Mandatory R&D Questions

1. **Does `PatientEncounter` already exist?**  
   Yes. It is defined in `prisma/schema.prisma` lines 426–450.
2. **What fields does it currently have?**  
   `id`, `hospitalId`, `appointmentId` (@unique), `patientId`, `doctorId`, `status`, `startedAt`, `completedAt`, `createdAt`, `updatedAt`.
3. **Is it already 1:1 with Appointment?**  
   Yes. The field `appointmentId` is decorated with `@unique` in `PatientEncounter`, ensuring exactly zero or one encounter per appointment at the database level.
4. **What is `MedicalRecord`'s current shape?**  
   `id`, `hospitalId`, `encounterId` (@unique), `patientId`, `doctorId`, `chiefComplaint`, `presentingSymptoms`, `clinicalNotes`, `treatmentPlan`, `followUpDate`, `createdAt`, `updatedAt`, with relations to `vitals`, `diagnoses`, `allergies`, and `attachments`.
5. **Which clinical models already exist in Prisma?**  
   `PatientEncounter`, `MedicalRecord`, `Vital`, `Diagnosis`, `Allergy`, and `Attachment`.
6. **Which models are placeholders only?**  
   No business logic, services, controllers, or test suites exist yet for any of these clinical models (`apps/api/src/modules/encounters` and `apps/api/src/modules/medical-records` are empty directories).
   Furthermore, several PRD-required models are **missing entirely**:
   - `VaccinationHistory` (PRD: date, vaccine name, batch number, next due date).
   - `FamilyHistory` (PRD: structured conditions for diabetes, hypertension, cancer, cardiac).
   - `MedicationHistory` (PRD: past medications distinct from new `Prescription`).
   - `MedicalRecordAmendment` (Required to guarantee historical integrity and append-only auditability for finalized records).
7. **Which relationships already exist?**  
   `Appointment` ↔ `PatientEncounter` (1:1 optional)  
   `PatientEncounter` ↔ `MedicalRecord` (1:1 optional)  
   `MedicalRecord` ↔ `Vital` (1:N)  
   `MedicalRecord` ↔ `Diagnosis` (1:N)  
   `MedicalRecord` ↔ `Attachment` (1:N)  
   `MedicalRecord` ↔ `Allergy` (1:N optional) & `Patient` ↔ `Allergy` (1:N)  
8. **Which enums already exist?**  
   `EncounterStatus` (`CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`)  
   `DiagnosisType` (`PROVISIONAL`, `CONFIRMED`)  
   `AllergySeverity` (`MILD`, `MODERATE`, `SEVERE`)  
   `AppointmentStatus` (`PENDING`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`)  
9. **Which indexes already exist?**  
   `PatientEncounter`: `[hospitalId, patientId]`, `[hospitalId, doctorId]`, `appointmentId` (@unique)  
   `MedicalRecord`: `[hospitalId, patientId]`, `encounterId` (@unique)  
   `Vital`: `[recordId]`  
   `Diagnosis`: `[recordId]`  
   `Allergy`: `[patientId]`  
   `Attachment`: `[recordId]`  
10. **Which tenant constraints already cover EMR?**  
    In `apps/api/src/database/prisma-tenant.extension.ts`:
    - `DIRECT_TENANT_MODELS`: `PatientEncounter`, `MedicalRecord`
    - `INDIRECT_TENANT_MODELS`: `Vital` (via `record`), `Diagnosis` (via `record`), `Allergy` (via `patient`), `Attachment` (via `record`)
    - `RELATION_TENANT_CONSTRAINTS`: `PatientEncounter` (`patientId`, `doctorId`, `appointmentId`), `MedicalRecord` (`patientId`, `doctorId`, `encounterId`)
11. **Which frontend routes already exist?**  
    `apps/web/src/app/(auth)/` and `apps/web/src/app/dashboard/` exist. No clinical encounter workspace exists in the frontend.
12. **Which shared types already exist?**  
    `packages/types/src/index.ts` defines `UserRole`, `Gender`, `BloodGroup`, `AppointmentStatus`, `AppointmentType`, `EncounterStatus`, `DiagnosisType`, `AllergySeverity`, `MedicineForm`, `PrescriptionFrequency`, `PrescriptionStatus`, `AuditAction`.  
    However, Sections 1–8 cover auth, users, hospitals, departments, patients, doctors, scheduling, and appointments. **No API request/response contracts exist for encounters or EMR.**

---

## 3. PRD Requirements vs. Proposed Architecture

### 3.1 PRD Requirements
- **Encounter Workflow:** Doctor starts an appointment encounter, opening the clinical workspace.
- **Vitals:** Systolic BP, Diastolic BP, pulse/heart rate, temperature, SpO2, height, weight, auto-calculated BMI.
- **Clinical Presentation:** Chief complaint and presenting symptoms.
- **Diagnosis:** Differential (provisional) and confirmed diagnosis with ICD-10 mapping.
- **Treatment Plan:** Instructions, follow-up recommendations.
- **Allergies & Adverse Drug Reactions (ADR):** Allergen, reaction, severity.
- **Longitudinal Medical History:**
  - Medication History (past medications, distinct from new prescriptions).
  - Vaccination History (date, vaccine name, batch number, next due date).
  - Family History (diabetes, hypertension, cancer, cardiac).
- **Attachments:** Scanned documents, lab reports, images (max 20 MB, pre-signed URLs, private bucket).
- **Immutability & Historical Integrity:** Medical records are append-only. Past entries cannot be deleted or silently overwritten.

### 3.2 Distinguishing PRD Requirements, Constraints, and Design Decisions
- **PRD Requirement:** Medical records are append-only; past entries cannot be deleted or rewritten; vitals auto-calculate BMI; allergies, medications, vaccinations, family history must be captured.
- **Existing Architectural Constraint:** 
  - Shared-database multi-tenancy enforced by `prisma-tenant.extension.ts` with `hospitalId` validation.
  - Phase 4 frozen appointment contract: `Appointment` status transition rules, ADR-002 concurrency, partial unique index `unique_doctor_active_slot`.
  - Supabase Auth + JWT with role validation and `User` → `Doctor` / `Patient` resolution.
- **Proposed Design Decisions:**
  1. **Encounter State Machine & Atomicity:** Encounter starts from an appointment in `CONFIRMED` or `IN_PROGRESS` status. `PatientEncounter` is created/transitioned to `IN_PROGRESS` and `Appointment.status` is updated to `IN_PROGRESS` atomically in a single Prisma transaction.
  2. **Encounter Completion & Immutability:** Completing an encounter transitions `PatientEncounter.status` to `COMPLETED` and `Appointment.status` to `COMPLETED` atomically. Once `COMPLETED`, direct mutations on `MedicalRecord` base fields are strictly locked.
  3. **Append-Only Clinical Amendments:** Any post-completion modification must be created as a `MedicalRecordAmendment` entry specifying the amending doctor, reason, timestamp, and field delta. Past versions remain intact.
  4. **Longitudinal Patient Records:** `Allergy`, `MedicationHistory`, `VaccinationHistory`, and `FamilyHistory` belong to the `Patient` longitudinally with direct `hospitalId` and `patientId`, optionally referencing the `recordId` where they were recorded.
  5. **Server-Side BMI Calculation:** BMI is computed as `weightKg / ((heightCm / 100) ^ 2)`, rounded to 1 decimal place. Client-supplied BMI values are strictly ignored.
  6. **Attachment Abstraction:** File uploads are abstracted via `StorageService` interface. Real S3/Cloudinary configuration generates pre-signed URLs; mock/local storage implementation ensures automated tests pass reliably in CI without external cloud dependencies.

---

## 4. Required Schema Enhancements (Deterministic Migration)

To fulfill PRD compliance without breaking existing models, we add:

```prisma
// 1. New model: VaccinationHistory
model VaccinationHistory {
  id          String         @id @default(uuid())
  hospitalId  String
  hospital    Hospital       @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  patientId   String
  patient     Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recordId    String?
  record      MedicalRecord? @relation(fields: [recordId], references: [id], onDelete: SetNull)
  vaccineName String
  administeredDate DateTime
  batchNumber String?
  nextDueDate DateTime?
  notes       String?
  createdAt   DateTime       @default(now())

  @@index([hospitalId, patientId])
}

// 2. New model: FamilyHistory
model FamilyHistory {
  id           String         @id @default(uuid())
  hospitalId   String
  hospital     Hospital       @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  patientId    String
  patient      Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recordId     String?
  record       MedicalRecord? @relation(fields: [recordId], references: [id], onDelete: SetNull)
  condition    String         // e.g. "Diabetes", "Hypertension", "Cancer", "Cardiac"
  relationship String         // e.g. "Father", "Mother", "Sibling", "Maternal Grandparent"
  notes        String?
  createdAt    DateTime       @default(now())

  @@index([hospitalId, patientId])
}

// 3. New model: MedicationHistory
model MedicationHistory {
  id             String         @id @default(uuid())
  hospitalId     String
  hospital       Hospital       @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  patientId      String
  patient        Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recordId       String?
  record         MedicalRecord? @relation(fields: [recordId], references: [id], onDelete: SetNull)
  medicationName String
  dosage         String         // e.g. "500mg"
  frequency      String         // e.g. "Once daily", "BD", "TDS"
  route          String?        // e.g. "Oral"
  startDate      DateTime?
  endDate        DateTime?
  isActive       Boolean        @default(true)
  notes          String?
  createdAt      DateTime       @default(now())

  @@index([hospitalId, patientId])
}

// 4. New model: MedicalRecordAmendment (Append-Only Historical Trail)
model MedicalRecordAmendment {
  id             String        @id @default(uuid())
  recordId       String
  record         MedicalRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
  amendedById    String
  amendedBy      Doctor        @relation(fields: [amendedById], references: [id], onDelete: Cascade)
  reason         String
  previousNotes  String?
  newNotes       String?
  changesJson    Json?
  createdAt      DateTime      @default(now())

  @@index([recordId])
}
```

Add reverse relations to `Hospital`, `Patient`, `MedicalRecord`, and `Doctor` accordingly.
Also add `hospitalId` directly to `Allergy` for direct multi-tenant indexing (`@@index([hospitalId, patientId])`).

---

## 5. Encounter Lifecycle State Machine

```
Appointment: CONFIRMED or IN_PROGRESS
       │
       ▼ [POST /api/appointments/:id/encounter] (Doctor starts encounter)
PatientEncounter: IN_PROGRESS
Appointment: IN_PROGRESS
MedicalRecord: CREATED (Draft)
       │
       ├── Add/Update Vitals (Server-calculated BMI)
       ├── Add Diagnoses (Provisional / Confirmed, ICD-10)
       ├── Add Clinical Notes & Symptoms
       ├── Add Treatment Plan
       ├── Add Allergies / ADR
       ├── Add Medication History
       ├── Add Vaccination History
       ├── Add Family History
       └── Add Attachments
       │
       ▼ [POST /api/encounters/:id/complete] (Doctor completes encounter)
PatientEncounter: COMPLETED
Appointment: COMPLETED
MedicalRecord: FINALIZED (Immutable)
       │
       ▼ [POST /api/encounters/:id/amendments] (Doctor amends finalized record)
MedicalRecordAmendment: CREATED (Append-only trail, old records preserved)
```

### Transition Invariants:
1. An encounter can only be started by the **assigned doctor** of the appointment.
2. `CANCELLED` and `NO_SHOW` appointments are **strictly forbidden** from starting encounters (`400 Bad Request` / `422 Unprocessable Entity`).
3. Calling start encounter when one already exists is **idempotent** (returns existing active encounter without duplicating records).
4. An encounter can only be completed by the **assigned doctor**.
5. Once `COMPLETED`, base `MedicalRecord` fields cannot be directly updated; amendments must be recorded via `POST /encounters/:id/amendments`.

---

## 6. RBAC Authorization Matrix

| Action | DOCTOR | NURSE | PATIENT | RECEPTIONIST | HOSPITAL_ADMIN | SUPER_ADMIN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Start Encounter | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| Edit Active Encounter | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| Add Vitals | Allowed | Allowed | Denied | Denied | Denied | Denied |
| Add Diagnoses | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| Add Notes / Treatment | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| Add Allergy / Med / Vax / Family | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| Upload Attachment | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| Complete Encounter | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| Amend Completed Record | Allowed (Assigned) | Denied | Denied | Denied | Denied | Denied |
| View Encounter / EMR | Allowed (Tenant) | Allowed (Tenant) | Allowed (Self-Only) | Denied | Allowed (Audit) | Allowed (with Header) |

---

## 7. Tenant & Patient Security Invariants

1. **Hospital Tenant Isolation:**
   Every query and mutation must be scoped by the authenticated user's `hospitalId` via `prisma-tenant.extension.ts`. A doctor from Hospital A cannot view, query, start, or modify an encounter in Hospital B (`404 Not Found` or `403 Forbidden`).
2. **Patient Self-Access Isolation:**
   When a `PATIENT` role queries medical records (`GET /api/medical-records/patients/:patientId`), the API extracts the patient's ID from the authenticated session (`user.patient.id`) and verifies it strictly matches the requested route parameter.
   Any attempt to query another patient's medical record yields `403 Forbidden`.
3. **Doctor Ownership:**
   When a doctor attempts to mutate an encounter, the API resolves `user.doctor.id` and verifies `encounter.doctorId === doctor.id`. A different doctor cannot mutate or complete Doctor A's encounter.

---

## 8. Clinical Audit Trail Strategy (ADR-007)

Every sensitive EMR operation must write an audit record to the `AuditLog` table:
- Action: `CREATE`, `UPDATE`, `VIEW_CONFIDENTIAL`
- `entityName`: `'PatientEncounter'`, `'MedicalRecord'`, `'Vital'`, `'Diagnosis'`, `'MedicalRecordAmendment'`
- `entityId`: Record ID
- `hospitalId`: Tenant ID
- `userId`: Authenticated clinician ID
- `changesJson`: Metadata on what changed (e.g. `{"action": "COMPLETE_ENCOUNTER", "amendmentReason": "..."}`).
**CRITICAL:** Clinical payloads (e.g. raw notes, diagnosis descriptions, patient symptoms) must **NEVER** be leaked into console logs, server stdout, or unencrypted system event streams.

---

## 9. Attachments Strategy (ADR-004 Compliance)

1. Attachments are stored using non-guessable paths: `attachments/{hospitalId}/{patientId}/{uuid}.{ext}`.
2. File validation: MIME type check against whitelist (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`), max size 20 MB, executable extensions permanently rejected.
3. Access: Attachments are never served publicly. Pre-signed URLs with a 15-minute expiration are generated on-demand after validating tenant and clinician/patient ownership.

---

## 10. Conclusion & Next Steps

The R&D phase confirms that the existing schema and tenant foundation provide an ideal base for Phase 5.
With the addition of `VaccinationHistory`, `FamilyHistory`, `MedicationHistory`, and `MedicalRecordAmendment`, the clinical EMR system will achieve 100% PRD compliance while maintaining the append-only immutability invariant.
We proceed to formalize the architectural artifacts and the master implementation plan.
