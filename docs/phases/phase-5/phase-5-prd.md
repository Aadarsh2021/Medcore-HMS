# PHASE 5 — PRODUCT REQUIREMENTS SPECIFICATION (PRD)
# Clinical Encounters & Electronic Medical Records (EMR)

**Version:** 1.0.0  
**Status:** APPROVED  
**Module:** EMR & Clinical Encounters (Week 2 PRD Deliverable)  

---

## 1. Scope & Objective

Phase 5 delivers the clinical core of MedCore HMS: the **Clinical Encounter Lifecycle** and **Electronic Medical Record (EMR)** system.
The objective is to provide clinicians with a unified, role-aware, high-performance digital workspace to conduct outpatient encounters, document patient vitals, record diagnostic evaluations with ICD-10 coding, manage longitudinal patient safety data (allergies, medication history, vaccinations, family history), and preserve complete historical integrity through an append-only architecture.

---

## 2. Source-of-Truth PRD Requirements

Derived directly from Section 7.3 and Section 2 of the MedCore HMS PRD (`docs/prd.txt`):

### 2.1 Clinical Encounter Initiation
1. A clinical encounter is initiated by an authenticated doctor for a scheduled patient appointment.
2. Starting an encounter transitions the appointment from `CONFIRMED` to `IN_PROGRESS`.
3. An encounter cannot be created for appointments that are `CANCELLED` or marked as `NO_SHOW`.
4. Only the assigned doctor (or authorized staff with explicit administrative rights) can start and conduct the encounter.

### 2.2 Electronic Medical Record (EMR) Data Points
A medical record must capture the following clinical data points during an encounter:
1. **Vitals**:
   - Blood Pressure: Systolic and Diastolic (mmHg)
   - Pulse / Heart Rate (bpm)
   - Body Temperature (°C / °F)
   - Oxygen Saturation (SpO2, %)
   - Respiratory Rate (breaths/min)
   - Height (cm)
   - Weight (kg)
   - **Body Mass Index (BMI)**: Must be auto-calculated server-side (`weightKg / (heightMeters ^ 2)`). Client-supplied BMI values must be rejected or recalculated.
2. **Clinical Presentation**:
   - Chief Complaint (mandatory presenting problem)
   - Presenting Symptoms & Onset
   - Clinical Notes & Physical Examination Findings
3. **Diagnosis**:
   - Provisional (Differential) Diagnosis
   - Confirmed Diagnosis
   - Primary vs. Secondary diagnosis flag
   - ICD-10 Code mapping and standard diagnostic description
4. **Treatment Plan**:
   - Management & Therapeutic instructions
   - Recommended follow-up date and lifestyle advisories
5. **Allergies & Adverse Drug Reactions (ADR)**:
   - Allergen / Substance
   - Reaction symptoms
   - Severity: `MILD`, `MODERATE`, `SEVERE`
   - Diagnosed date
6. **Medication History (Longitudinal)**:
   - Past and active medications (name, dosage, frequency, route, start date, end date, status)
   - Distinct from new outpatient prescriptions (Phase 6)
7. **Vaccination History (Longitudinal)**:
   - Vaccine name
   - Administration date
   - Batch / Lot number
   - Next due date
8. **Family History (Longitudinal)**:
   - Structured condition tracking (Diabetes, Hypertension, Cancer, Cardiac conditions)
   - Relation (Father, Mother, Sibling, Grandparent, etc.)
   - Clinical notes
9. **Clinical Attachments**:
   - Scanned diagnostic documents, ultrasound reports, ECG tracings, lab reports
   - Private S3/Cloudinary object storage with non-guessable paths
   - Maximum 20 MB per file
   - Strict MIME validation
   - Pre-signed URL retrieval (15-minute expiration)

### 2.3 Append-Only Historical Integrity
As specified in PRD Section 7.3:
> *"A Medical Record is created when a doctor starts an appointment encounter. It is append-only — doctors can add notes but cannot delete past entries."*

1. Historical clinical records must **never be deleted or silently overwritten**.
2. Once an encounter is completed, the medical record is finalized and locked.
3. Subsequent corrections or additions must be recorded as **Clinical Amendments** (`MedicalRecordAmendment`) with the amending doctor's ID, amendment reason, and timestamp.
4. Old versions and notes remain fully accessible in the audit timeline.

---

## 3. RBAC & Security Requirements

1. **Role Access Restrictions**:
   - `DOCTOR`: Full access to start, conduct, complete, and amend encounters where they are the assigned doctor.
   - `NURSE`: Authorized to record vitals; read-only access to basic patient clinical summary.
   - `PATIENT`: Read-only access strictly limited to **their own** finalized medical records and encounters. Cannot mutate clinical data. Cannot access records of other patients.
   - `HOSPITAL_ADMIN`: Read-only access for operational oversight, hospital analytics, and clinical audit reviews. Cannot modify clinical notes or diagnoses.
   - `SUPER_ADMIN`: Cross-tenant read access requiring explicit `X-Hospital-Id` header.
   - `RECEPTIONIST`, `PHARMACIST`, `LAB_TECHNICIAN`, `ACCOUNTANT`: Denied access to edit clinical records.
2. **Tenant Isolation**:
   - Every clinical record is tied to a specific hospital tenant. Cross-tenant access is strictly blocked at the database layer via Prisma extensions.
3. **PHI & Privacy Protection**:
   - Medical notes, diagnostic text, and vitals payloads must never appear in unencrypted server logs or public monitoring streams.

---

## 4. Acceptance Criteria
- [x] Encounter lifecycle enforces valid state transitions and atomic appointment updates.
- [x] Server calculates BMI accurately using standard formula.
- [x] Medical records and sub-entities (diagnoses, vitals, allergies, histories) are persisted correctly.
- [x] Append-only rule is enforced: completed records cannot be updated directly; amendments are preserved in history.
- [x] Multi-tenancy and patient self-access controls prevent any cross-tenant or cross-patient leaks.
- [x] 100% regression pass on Phases 1–4 test suite.
