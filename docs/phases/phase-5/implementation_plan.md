# PHASE 5 — REVISED MASTER IMPLEMENTATION PLAN
# Clinical Encounters & Electronic Medical Records (EMR)

**Version:** 2.0.0 (Hardened)  
**Status:** READY FOR IMPLEMENTATION APPROVAL  
**Module:** Clinical Encounters & EMR  

---

## 1. Revised Schema Plan

### 1.1 Non-Destructive Model Additions in `prisma/schema.prisma`
Phase 5 introduces three patient-longitudinal models and one encounter-amendment model:

```prisma
// 1. Longitudinal Immunization Ledger
model VaccinationHistory {
  id               String         @id @default(uuid())
  patientId        String
  patient          Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recordId         String?
  record           MedicalRecord? @relation(fields: [recordId], references: [id], onDelete: SetNull)
  vaccineName      String
  administeredDate DateTime
  batchNumber      String?
  nextDueDate      DateTime?
  notes            String?
  createdAt        DateTime       @default(now())

  @@index([patientId])
}

// 2. Longitudinal Familial Genetic Risk Ledger
model FamilyHistory {
  id           String         @id @default(uuid())
  patientId    String
  patient      Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recordId     String?
  record       MedicalRecord? @relation(fields: [recordId], references: [id], onDelete: SetNull)
  condition    String         // e.g. "Diabetes", "Hypertension", "Cancer", "Cardiac"
  relationship String         // e.g. "Father", "Mother", "Sibling", "Grandparent"
  notes        String?
  createdAt    DateTime       @default(now())

  @@index([patientId])
}

// 3. Longitudinal Past/Chronic Medication Ledger
model MedicationHistory {
  id             String         @id @default(uuid())
  patientId      String
  patient        Patient        @relation(fields: [patientId], references: [id], onDelete: Cascade)
  recordId       String?
  record         MedicalRecord? @relation(fields: [recordId], references: [id], onDelete: SetNull)
  medicationName String
  dosage         String         // e.g. "500mg"
  frequency      String         // e.g. "Once daily", "BD"
  route          String?        // e.g. "Oral"
  startDate      DateTime?
  endDate        DateTime?
  isActive       Boolean        @default(true)
  notes          String?
  createdAt      DateTime       @default(now())

  @@index([patientId])
}

// 4. Append-Only Amendment Ledger (Old Records Untouched)
model MedicalRecordAmendment {
  id              String           @id @default(uuid())
  recordId        String
  record          MedicalRecord    @relation(fields: [recordId], references: [id], onDelete: Cascade)
  amendedById     String
  amendedBy       Doctor           @relation(fields: [amendedById], references: [id], onDelete: Cascade)
  amendmentNumber Int
  amendmentType   AmendmentType    @default(ADDENDUM)
  section         AmendmentSection @default(CLINICAL_NOTES)
  reason          String
  content         String
  createdAt       DateTime         @default(now())

  @@index([recordId])
}

enum AmendmentType {
  ADDENDUM
  CORRECTION
  LATE_ENTRY
}

enum AmendmentSection {
  CLINICAL_NOTES
  DIAGNOSIS
  TREATMENT_PLAN
  OTHER
}
```

### 1.2 Tenant Extension Integration (`prisma-tenant.extension.ts`)
Conforming to ADR-001 Section 1.C, these models inherit tenancy via their parent relationships:
- `VaccinationHistory`: `{ relation: 'patient', parentIdField: 'patientId', parentModel: 'Patient' }`
- `FamilyHistory`: `{ relation: 'patient', parentIdField: 'patientId', parentModel: 'Patient' }`
- `MedicationHistory`: `{ relation: 'patient', parentIdField: 'patientId', parentModel: 'Patient' }`
- `MedicalRecordAmendment`: `{ relation: 'record', parentIdField: 'recordId', parentModel: 'MedicalRecord' }`

---

## 2. Final Clinical Domain Classification

- **Encounter-Scoped (Visit-Bound)**:
  `PatientEncounter`, `MedicalRecord`, `Vital`, `Diagnosis`, `Attachment`, `MedicalRecordAmendment`.
- **Patient-Longitudinal (Permanent Safety & Health Profile)**:
  `Allergy`, `MedicationHistory`, `VaccinationHistory`, `FamilyHistory`.

---

## 3. Encounter State Machine

```
Appointment: CONFIRMED or IN_PROGRESS
       │
       ▼ [POST /api/appointments/:id/encounter] (Assigned Doctor Only)
PatientEncounter: IN_PROGRESS
Appointment: IN_PROGRESS
MedicalRecord: DRAFT CREATED
       │
       ├── Add / Update Vitals (Server-computed BMI)
       ├── Add Diagnoses (Provisional / Confirmed, ICD-10)
       ├── Draft Clinical Notes & Presenting Symptoms
       ├── Draft Treatment Plan
       ├── Upload Diagnostic Attachments (S3)
       │
       ▼ [POST /api/encounters/:id/complete] (Assigned Doctor Only)
PatientEncounter: COMPLETED
Appointment: COMPLETED
MedicalRecord: LOCKED & FINALIZED
       │
       ▼ [POST /api/encounters/:id/amendments] (Assigned Doctor Only)
MedicalRecordAmendment: APPEND-ONLY ROW PERSISTED (Original record untouched)
```

---

## 4. Completion Invariants

1. **Status**: Must be in `EncounterStatus.IN_PROGRESS`.
2. **Clinician**: Must be executed by the **assigned doctor** (`encounter.doctorId === authenticatedDoctor.id`).
3. **Mandatory Fields**:
   - `chiefComplaint`: Non-empty string (min 3 characters).
   - `diagnoses`: At least 1 diagnosis (`PROVISIONAL` or `CONFIRMED`).
4. **Optional Fields**: `presentingSymptoms`, `clinicalNotes`, `treatmentPlan`, `vitals`, `attachments`, `followUpDate`.
5. **Atomic Execution**: Single database transaction updates encounter to `COMPLETED`, appointment to `COMPLETED`, sets `completedAt`, and writes to `AuditLog`.

---

## 5. Append-Only Strategy (ADR-006)

- Direct mutation on a finalized record (`PUT /notes`) is rejected with `409 Conflict`.
- Old rows in `MedicalRecord` are **never updated or deleted**.
- Historical truth is preserved by pairing the original record with its chronological amendments.

---

## 6. Amendment Model

- Child entity `MedicalRecordAmendment` stores `amendmentNumber`, `amendmentType`, `section`, `reason` (min 10 chars), `content`, `amendedById`, and `createdAt`.
- Clinicians cannot delete or modify past amendments.
- Queries return the original record plus all amendments ordered by `amendmentNumber ASC`.

---

## 7. Storage Architecture (ADR-004)

- Private S3-compatible bucket with Block Public Access enabled.
- Key format: `attachments/{hospitalId}/{patientId}/{uuid}.{ext}`.
- Max file size: **20 MB**. Whitelist: PDF, JPEG, PNG, WEBP.
- Pre-signed download URLs valid for **15 minutes** generated only after checking tenant and patient/doctor permissions.
- Failed DB persistence triggers immediate S3 `DeleteObject` rollback.

---

## 8. RBAC Matrix

- `DOCTOR`: Full access to assigned encounters and medical records.
- `NURSE`: Allowed to record vitals and view patient clinical summary.
- `PATIENT`: Read-only access strictly limited to **their own** finalized records (`user.patient.id === targetPatientId`). Cannot mutate clinical data.
- `HOSPITAL_ADMIN`: Read-only access for operational audits. Cannot modify clinical notes or diagnoses.
- `SUPER_ADMIN`: Cross-tenant read access with `X-Hospital-Id` header.
- `RECEPTIONIST`: **Strictly denied** from viewing or modifying clinical records and notes.

---

## 9. Tenant Invariants

- Direct tenant models (`PatientEncounter`, `MedicalRecord`) carry `hospitalId`.
- Child entities inherit tenancy via `Patient` or `MedicalRecord`.
- Mismatched `hospitalId` in request headers or body throws `403 Forbidden`.
- Client-supplied `patientId` is ignored for `PATIENT` role; identity is resolved strictly from JWT.

---

## 10. API Contract

1. `POST /api/appointments/:appointmentId/encounter`
2. `GET /api/encounters/:id`
3. `POST /api/encounters/:id/vitals`
4. `POST /api/encounters/:id/diagnoses`
5. `PUT /api/encounters/:id/notes`
6. `POST /api/encounters/:id/attachments`
7. `GET /api/encounters/:id/attachments/:attachmentId/url`
8. `POST /api/encounters/:id/complete`
9. `POST /api/encounters/:id/amendments`
10. `GET /api/medical-records/patients/:patientId/summary`
11. `GET /api/medical-records/patients/:patientId/encounters` (Paginated)
12. `GET /api/medical-records/patients/:patientId/vitals` (Paginated time-series)
13. `POST /api/medical-records/patients/:patientId/allergies`
14. `POST /api/medical-records/patients/:patientId/medications`
15. `POST /api/medical-records/patients/:patientId/vaccinations`
16. `POST /api/medical-records/patients/:patientId/family-history`

---

## 11. Performance & Query Strategy

- Paginated encounter and vitals endpoints prevent memory exhaustion.
- Indexes on `[recordId]`, `[patientId]`, and `[hospitalId, patientId]` ensure sub-millisecond lookups.
- Patient summary query fetches only the 5 most recent encounters.

---

## 12. Test Strategy

Suite `apps/api/test/clinical-encounters.spec.ts` covers:
- Complete encounter lifecycle (start, edit, complete).
- Invariant enforcement (rejection of empty chief complaint, 0 diagnoses, unassigned doctor).
- Append-only immutability (rejection of direct edit on completed record, successful additive amendment).
- Patient self-access isolation (patient A cannot read patient B).
- Vitals validation and server-computed BMI.
- S3 pre-signed upload/download security.
- Zero-leak logging verification.
- Zero regressions on all 94 Phase 1–4 tests.

---

## 13. Phase 4 Compatibility Assessment

- Phase 4 Appointment Management remains **100% FROZEN**.
- The partial unique index `unique_doctor_active_slot` and ADR-002 appointment locking are untouched.
- `followUpDate` in `MedicalRecord` is an advisory clinical recommendation; actual booking uses Phase 4 `POST /api/appointments`.

---

## 14. Remaining Risks & Mitigations

1. **Risk:** S3 network latency during attachment downloads.  
   **Mitigation:** 15-minute pre-signed URLs offload binary streaming directly to AWS S3.
2. **Risk:** Unintentional clinical notes leakage in application logs.  
   **Mitigation:** Verified log sanitization filter strips all clinical payloads from console output.

---

## 15. Exact Implementation Sequence

1. **Step 1:** Prisma schema additions + migration generation + database application.
2. **Step 2:** Shared types in `packages/types/src/index.ts`.
3. **Step 3:** Storage service abstraction in `apps/api/src/common/storage/`.
4. **Step 4:** Encounters module (`EncountersService`, `EncountersController`, DTOs).
5. **Step 5:** Medical records module (`MedicalRecordsService`, `MedicalRecordsController`, DTOs).
6. **Step 6:** App module registration.
7. **Step 7:** Integration test suite `apps/api/test/clinical-encounters.spec.ts`.
8. **Step 8:** Doctor Clinical Workspace UI in `apps/web/src/app/dashboard/clinical/`.
9. **Step 9:** Full monorepo regression verification (`pnpm test` + `pnpm build`).
