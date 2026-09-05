# ADR-006: EMR Append-Only & Historical Immutability Strategy

## Status
Accepted (Phase 5 — Clinical Encounters & EMR)

## Context
In healthcare systems, clinical data constitutes an official, legally binding medical record.
Allowing clinicians or users to silently update, overwrite, or delete historical medical notes, diagnoses, or vitals violates healthcare regulations, compromises clinical safety, and destroys the evidentiary audit trail.
The MedCore HMS Product Requirements Document (PRD Section 7.3) explicitly specifies:
> *"A Medical Record is created when a doctor starts an appointment encounter. It is append-only — doctors can add notes but cannot delete past entries."*

## Decision
We implement a **Strict Two-Stage Immutability & Additive Amendment Architecture**:

### 1. Two-Stage Lifecycle:
- **Draft Stage (`EncounterStatus.IN_PROGRESS`)**:
  While the patient consultation is actively occurring, the assigned doctor can incrementally record vitals, draft clinical notes, add provisional/confirmed diagnoses, and attach diagnostic files to the active draft `MedicalRecord`.
- **Finalized Stage (`EncounterStatus.COMPLETED`)**:
  When the doctor completes the encounter, the clinical record is permanently **finalized and locked**.
  Direct mutations (`PUT /api/encounters/:id/notes`, `DELETE /api/encounters/:id/diagnoses`, `UPDATE`) are strictly rejected with `409 Conflict` (`Medical record is finalized and cannot be directly modified. Submit an amendment instead`).

### 2. Additive Clinical Amendment Model (`MedicalRecordAmendment`):
- To record new clinical insights, correct errors, or incorporate late-arriving diagnostic findings, clinicians must submit a formal **Amendment**.
- **Crucial Invariant**: An amendment **NEVER modifies the original row** in `MedicalRecord`. The original text, diagnoses, and timestamps remain 100% untouched.
- Every amendment is an independent, immutable child record capturing:
  - `id`: UUID
  - `recordId`: UUID referencing the finalized `MedicalRecord`
  - `amendedById`: UUID of the authenticated clinician taking legal responsibility
  - `amendmentNumber`: Incremental sequence number per record (`1, 2, 3...`)
  - `amendmentType`: Enum `ADDENDUM` (new supplementary information), `CORRECTION` (rectifying a factual error), or `LATE_ENTRY` (documentation entered after visit close)
  - `section`: Enum `CLINICAL_NOTES`, `DIAGNOSIS`, `TREATMENT_PLAN`, or `OTHER`
  - `reason`: Mandatory clinical justification (minimum 10 characters)
  - `content`: The exact substantive text of the amendment
  - `createdAt`: Tamper-proof timestamp
- When medical history is viewed, the API returns the original untouched `MedicalRecord` alongside the chronological list of `MedicalRecordAmendment` entries.

### 3. Vitals & Diagnoses Append-Only Semantics:
- Successive vital sign measurements during an encounter create new timestamped `Vital` records rather than overwriting prior readings.
- Diagnoses recorded during the encounter are permanent historical impressions and cannot be deleted.

## Consequences
- Guarantees 100% compliance with medical-legal standards and PRD append-only requirements.
- Zero risk of accidental or malicious data eradication.
- Full auditability for malpractice defense, clinical peer review, and regulatory inspections.
