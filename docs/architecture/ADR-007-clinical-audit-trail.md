# ADR-007: Clinical Audit Trail Strategy

## Status
Accepted (Phase 5 — Clinical Encounters & EMR)

## Context
Electronic Medical Records contain sensitive Protected Health Information (PHI). Regulatory compliance (such as HIPAA Security Rule §164.312(b) and Indian EHR Standards 2016) mandates strict audit controls recording who accessed, modified, created, or exported clinical records.

## Decision
We implement a **Unified Clinical Audit Trail** backed by the `AuditLog` model and NestJS interceptor / service lifecycle events, with a strict separation between application logs and audit events:

### 1. Separation of Application Logs vs. Clinical Audit Events:
- **Application Logs (Stdout / Console / Aggregator)**:
  - Captures high-level HTTP request lifecycle: method, route pattern, status code, response time, tenant ID, and request correlation ID.
  - **Strict Prohibition**: Application logs must **NEVER** contain:
    - Passwords, access tokens, refresh tokens, service-role keys.
    - Clinical narrative (chief complaint, clinical notes, treatment plans).
    - Diagnosis codes and descriptions.
    - Allergy and medication details.
    - Vitals measurement payloads.
    - Attachment file contents.
- **Clinical Audit Events (`AuditLog` PostgreSQL Table)**:
  - Recorded when state-changing clinical actions or confidential views take place:
    - `actor`: `userId`
    - `hospitalId`: Tenant ID
    - `action`: `CREATE`, `UPDATE`, `VIEW_CONFIDENTIAL`, `EXPORT`
    - `entityName`: `'PatientEncounter'`, `'MedicalRecord'`, `'Vital'`, `'Diagnosis'`, `'MedicalRecordAmendment'`
    - `entityId`: Unique ID of the affected clinical entity
    - `ipAddress` and `userAgent`: Captured from request headers
    - `changesJson`: Contains **operational metadata only** (e.g. `{ "action": "START_ENCOUNTER", "appointmentId": "..." }`, `{ "action": "COMPLETE_ENCOUNTER" }`, `{ "action": "CREATE_AMENDMENT", "amendmentNumber": 1, "section": "CLINICAL_NOTES" }`).
  - Sensitive clinical text is strictly excluded from `AuditLog.changesJson` to prevent unencrypted PHI duplication.

## Consequences
- Complete non-repudiation and traceability of all clinician actions.
- Safe audit logs that do not duplicate or expose unencrypted clinical text.
- Clean separation between operational infrastructure metrics and clinical governance.
