# ADR-008: Sensitive Clinical Data Protection & Encryption Strategy

## Status
Accepted (Phase 5 — Clinical Encounters & EMR)

## Context
Section 10 and Section 7.3 of the PRD require high-grade data protection for clinical records:
- Encryption in transit (HTTPS / TLS 1.3).
- Strict multi-tenant row isolation.
- Encryption at rest for database volumes and sensitive attachments.
- Non-exposure of Protected Health Information (PHI) in application logs.
- Strict patient self-access authorization.

## Decision
We implement a **Defense-in-Depth Security Framework** for clinical EMR data:

### 1. Encryption in Transit & At Rest:
- **In Transit**: Enforced TLS 1.3 across all client-to-API and API-to-PostgreSQL communication. Supabase managed database operates with forced SSL connection strings (`sslmode=require`).
- **At Rest**: Managed storage volumes (AWS EBS / Supabase PostgreSQL) utilize AES-256 transparent data encryption (TDE).
- **Attachment Storage**: S3 object storage uses server-side AES-256 encryption (`SSE-S3` or `SSE-KMS`).

### 2. Zero-Leak Logging Policy:
- The NestJS logger is configured with strict redaction:
  - Passwords, access tokens, refresh tokens, service-role keys, `DATABASE_URL`, and `REDIS_PASSWORD` are never logged.
  - Clinical payloads (chief complaint, clinical notes, diagnosis text, vitals values, attachments) are strictly excluded from informational request logs.
  - Logs capture only: HTTP method, route template, sanitized status code, duration, tenant ID, and request ID.

### 3. Patient Self-Access Enforcement:
- Patients can only access their own records. Identity is derived strictly from the cryptographically verified JWT (`user.patient.id`). Any attempt by a patient to query or mutate another patient's ID is intercepted with `403 Forbidden`.

## Consequences
- Protects patient confidentiality across all infrastructure boundaries.
- Adheres to healthcare security best practices without introducing brittle database-level procedural functions.
