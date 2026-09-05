# PHASE 5 — REVISED COMPREHENSIVE TEST PLAN
# Clinical Encounters & Electronic Medical Records (EMR)

**Version:** 2.0.0 (Hardened)  
**Status:** APPROVED FOR IMPLEMENTATION  
**Target Suite:** `apps/api/test/clinical-encounters.spec.ts`  

---

## 1. Test Architecture & Multi-Tenant Setup

The test suite runs against the live PostgreSQL database and uses real authenticated HTTP requests:
- **Hospital Alpha (`hosp-alpha`)**:
  - Doctor Alpha 1 (`doc-a1`, assigned doctor)
  - Doctor Alpha 2 (`doc-a2`, unassigned doctor)
  - Nurse Alpha (`nurse-a`)
  - Receptionist Alpha (`rec-a`)
  - Patient Alpha 1 (`pat-a1`) & Patient Alpha 2 (`pat-a2`)
- **Hospital Beta (`hosp-beta`)**:
  - Doctor Beta (`doc-b`)
  - Patient Beta (`pat-b`)

---

## 2. Test Suites Breakdown

### Suite A: Encounter Lifecycle & Completion Invariants
- [x] **A1: Valid Start**: Doctor starts encounter for `CONFIRMED` appointment. Sets appointment & encounter to `IN_PROGRESS`.
- [x] **A2: Idempotent Start**: Starting an existing `IN_PROGRESS` encounter returns the active encounter without duplicates.
- [x] **A3: Cancelled / No-Show Blocked**: Starting encounter on `CANCELLED` or `NO_SHOW` appointment returns `422 Unprocessable Entity`.
- [x] **A4: Unassigned Doctor Blocked**: Doctor Alpha 2 attempts to start encounter for Doctor Alpha 1's appointment. Rejection: `403 Forbidden`.
- [x] **A5: Receptionist Blocked**: Receptionist attempts to start encounter. Rejection: `403 Forbidden`.
- [x] **A6: Complete Encounter Success**: Doctor completes encounter with non-empty chief complaint and at least 1 diagnosis. Sets encounter and appointment to `COMPLETED`.
- [x] **A7: Incomplete Completion Blocked (Zero Diagnoses)**: Attempting to complete encounter with 0 diagnoses returns `422 Unprocessable Entity`.
- [x] **A8: Incomplete Completion Blocked (Empty Chief Complaint)**: Attempting to complete encounter with empty chief complaint returns `400 Bad Request`.
- [x] **A9: Double Completion Blocked**: Attempting to complete an already completed encounter returns `400 Bad Request`.

### Suite B: Strict Append-Only Immutability & Amendments
- [x] **B1: Direct Mutation on Finalized Record Blocked**: Calling `PUT /notes` on a completed encounter returns `409 Conflict`.
- [x] **B2: Amendment Preserves Original Record**: Doctor creates an amendment. Original `MedicalRecord.clinicalNotes` and timestamps remain 100% unchanged.
- [x] **B3: Additive Amendment Row Persisted**: A new `MedicalRecordAmendment` row is created with sequence number 1, clinical reason, and author ID.
- [x] **B4: Multiple Chronological Amendments**: Successive amendments increment `amendmentNumber` (`1, 2, 3...`) and preserve full history.
- [x] **B5: Unauthorized Amendment Blocked**: Doctor Alpha 2 or Receptionist attempting to amend Doctor Alpha 1's record returns `403 Forbidden`.
- [x] **B6: Cross-Hospital Amendment Blocked**: Doctor Beta attempting to amend Hospital Alpha's record returns `404 Not Found`.
- [x] **B7: Patient Cannot Amend**: Patient attempting to submit an amendment returns `403 Forbidden`.

### Suite C: Patient & Tenant Isolation
- [x] **C1: Patient Reads Own Clinical History**: Patient Alpha 1 retrieves their own medical record summary (`GET /patients/:patA1/summary`). Returns `200 OK`.
- [x] **C2: Patient Reading Another Patient Blocked**: Patient Alpha 1 attempts to read Patient Alpha 2's medical record. Rejection: `403 Forbidden`.
- [x] **C3: Patient Mutation Blocked**: Patient attempts to record vitals, diagnoses, or notes. Rejection: `403 Forbidden`.
- [x] **C4: Doctor Cross-Tenant Blocked**: Doctor Beta queries encounter in Hospital Alpha. Rejection: `404 Not Found`.
- [x] **C5: Receptionist Clinical Access Blocked**: Receptionist queries `GET /patients/:id/summary` or `GET /encounters/:id`. Rejection: `403 Forbidden`.

### Suite D: Vitals & Server-Side BMI
- [x] **D1: Server-Computed BMI**: Height 180 cm, Weight 81 kg yields server-computed BMI `25.0` (`81 / 1.8^2`).
- [x] **D2: Client BMI Overwritten**: Client sends `"bmi": 99.9` with height 170 cm, weight 68 kg. Persisted BMI is `23.5`. Client value is ignored.
- [x] **D3: Range Validation**: Systolic BP 500 or heart rate negative is rejected with `400 Bad Request`.
- [x] **D4: Vitals Append-Only**: Successive vital recordings in the same encounter create multiple append-only `Vital` rows.

### Suite E: Diagnoses & Longitudinal Safety Records
- [x] **E1: Diagnoses Persistence**: Records provisional and confirmed diagnoses with ICD-10 codes.
- [x] **E2: Allergy Persistence**: Records patient allergy with severity and reaction.
- [x] **E3: Medication History**: Records longitudinal past medications, distinct from new prescriptions.
- [x] **E4: Vaccination History**: Records vaccine name, batch number, administered date, and next due date.
- [x] **E5: Family History**: Records family conditions (diabetes, hypertension, cancer, cardiac).

### Suite F: S3 File Storage & Attachments
- [x] **F1: Upload File**: Doctor uploads PDF (under 20MB). Persists `Attachment` metadata with non-guessable S3 key.
- [x] **F2: Whitelist Rejection**: Uploading `.exe` or `.sh` script returns `400 Bad Request`.
- [x] **F3: Pre-Signed Download URL**: Generates valid signed URL with 15-minute expiration after verifying tenancy.

### Suite G: Zero PHI / Credential Logging
- [x] **G1: Log Sanitization**: Proves that diagnostic text, clinical notes, passwords, and JWTs are never written to application logs.

---

## 3. Regression Invariant
- All **94 existing Phase 1–4 tests** must pass without modification.
- Total tests post-Phase 5: **130+ passing tests** across 7 suites.
