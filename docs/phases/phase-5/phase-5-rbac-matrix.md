# PHASE 5 — REVISED RBAC AUTHORIZATION MATRIX
# Clinical Encounters & Electronic Medical Records (EMR)

**Version:** 2.0.0 (Hardened)  
**Status:** APPROVED FOR IMPLEMENTATION  
**Principle:** Principle of Least Privilege (PoLP) and Separation of Duties  

---

## 1. System Roles in Clinical Context

- `SUPER_ADMIN`: Cross-tenant platform supervisor. Requires `X-Hospital-Id` header to establish tenant context. Read-only for clinical data.
- `HOSPITAL_ADMIN`: Institutional administrator. Oversight of operations and audits. Strictly prohibited from authoring or amending clinical diagnosis and notes.
- `DOCTOR`: Clinical specialist. Full authority over assigned outpatient encounters and medical records.
- `NURSE`: Clinical support staff. Authorized to record vitals and view patient clinical summary.
- `RECEPTIONIST`: Front-desk staff. Manages patient registration and appointment scheduling. **Strictly denied** from viewing or modifying clinical medical records, notes, diagnoses, and attachments.
- `PATIENT`: Outpatient client. Strictly limited to **their own** finalized records. Zero mutation permissions.

---

## 2. Definitive Phase 5 RBAC Matrix

| Clinical Operation | SUPER_ADMIN | HOSPITAL_ADMIN | DOCTOR | NURSE | RECEPTIONIST | PATIENT |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Start Encounter** (`POST /appointments/:id/encounter`) | `DENY` | `DENY` | `CONDITIONAL` (1) | `DENY` | `DENY` | `DENY` |
| **View Encounter** (`GET /encounters/:id`) | `CONDITIONAL` (2) | `ALLOW` | `ALLOW` | `ALLOW` | `DENY` | `CONDITIONAL` (3) |
| **Edit Active Draft Notes** (`PUT /encounters/:id/notes`) | `DENY` | `DENY` | `CONDITIONAL` (1) | `DENY` | `DENY` | `DENY` |
| **Record Vitals** (`POST /encounters/:id/vitals`) | `DENY` | `DENY` | `CONDITIONAL` (1) | `ALLOW` | `DENY` | `DENY` |
| **Add Diagnosis** (`POST /encounters/:id/diagnoses`) | `DENY` | `DENY` | `CONDITIONAL` (1) | `DENY` | `DENY` | `DENY` |
| **Upload Attachment** (`POST /encounters/:id/attachments`) | `DENY` | `DENY` | `CONDITIONAL` (1) | `DENY` | `DENY` | `DENY` |
| **Download Attachment** (`GET /encounters/:id/attachments/:attId/url`) | `CONDITIONAL` (2) | `ALLOW` | `ALLOW` | `ALLOW` | `DENY` | `CONDITIONAL` (3) |
| **Complete Encounter** (`POST /encounters/:id/complete`) | `DENY` | `DENY` | `CONDITIONAL` (1) | `DENY` | `DENY` | `DENY` |
| **Amend Finalized Record** (`POST /encounters/:id/amendments`) | `DENY` | `DENY` | `CONDITIONAL` (1) | `DENY` | `DENY` | `DENY` |
| **View Patient Longitudinal EMR** (`GET /medical-records/patients/:id/*`) | `CONDITIONAL` (2) | `ALLOW` | `ALLOW` | `ALLOW` | `DENY` | `CONDITIONAL` (3) |
| **Add Patient Allergy** (`POST /patients/:id/allergies`) | `DENY` | `DENY` | `ALLOW` | `DENY` | `DENY` | `DENY` |
| **Add Medication History** (`POST /patients/:id/medications`) | `DENY` | `DENY` | `ALLOW` | `DENY` | `DENY` | `DENY` |
| **Add Vaccination Record** (`POST /patients/:id/vaccinations`) | `DENY` | `DENY` | `ALLOW` | `ALLOW` | `DENY` | `DENY` |
| **Add Family History** (`POST /patients/:id/family-history`) | `DENY` | `DENY` | `ALLOW` | `DENY` | `DENY` | `DENY` |

### Condition Definitions:
- **(1) CONDITIONAL (Assigned Doctor Only)**:
  The authenticated clinician's doctor record must strictly match the appointment's assigned doctor (`encounter.doctorId === authenticatedDoctor.id`).
- **(2) CONDITIONAL (Tenant Header Required)**:
  `SUPER_ADMIN` must supply a valid `X-Hospital-Id` header referencing an active hospital. Access is strictly read-only for audit purposes.
- **(3) CONDITIONAL (Self-Record Only)**:
  `PATIENT` role identity is resolved exclusively from `user.patient.id`. The patient may only view records where `patientId === user.patient.id`. All other patient IDs return `403 Forbidden`.
