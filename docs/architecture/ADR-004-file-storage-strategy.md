# ADR-004: Medical File Storage & Attachment Strategy

## Status
Accepted (Phase 1 Foundation, Hardened in Phase 5)

## Context
Clinical records include sensitive diagnostic attachments: ultrasound scans, ECG recordings, histopathology reports, and diagnostic imaging. These files constitute Protected Health Information (PHI) and must comply with healthcare data confidentiality standards.

## Decision
We selected an **S3-Compatible Object Storage Architecture with Short-Lived Pre-Signed URLs, Strict MIME Whitelisting, and Server-Side Authorization**.

### 1. Canonical Storage Architecture:
- **Private S3 Bucket**: Configured with all public access strictly blocked (Block Public Access enabled, zero public bucket policies).
- **Zero Binary Storage in DB**: Binary content is never stored in PostgreSQL. Only structured attachment metadata (`Attachment` entity) is stored in the database.
- **Hierarchical Non-Guessable Object Keys**:
  `attachments/{hospitalId}/{patientId}/{uuid}.{ext}`
  This guarantees tenant isolation and cryptographic randomness at the storage bucket path level.

### 2. Controlled Upload Workflow:
```
Browser / Clinician
    │
    ▼ 1. POST /api/encounters/:id/attachments (Multipart Upload or Presigned URL Request)
NestJS Backend (Validates clinician assignment, encounter state, tenant)
    │
    ▼ 2. Stream to S3 / Issue S3 PutObject Pre-signed URL
S3 Object Storage (Private Bucket)
    │
    ▼ 3. Persist Attachment row (fileName, fileUrl/objectKey, fileType, fileSize, recordId)
PostgreSQL Database
```
- **File Validation**:
  - Maximum file size: **20 MB**.
  - MIME type whitelist: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
  - Executable, script, and dangerous extensions (`.exe`, `.sh`, `.bat`, `.js`, `.html`, `.svg`) are permanently rejected.
- **Orphaned / Failed Upload Handling**:
  - If database metadata persistence fails after object creation, the backend immediately triggers an S3 `DeleteObject` rollback.
  - S3 lifecycle rule archives unreferenced/incomplete multipart uploads after 24 hours.

### 3. Authorized Download Workflow (Pre-Signed URLs):
- Attachments are **never public**.
- Clinicians or patients request access via `GET /api/encounters/:id/attachments/:attachmentId/signed-url`.
- The backend verifies:
  1. Active tenant context matches `attachment.record.hospitalId`.
  2. Patient user ID matches `attachment.record.patientId` (for `PATIENT` role).
  3. Doctor user belongs to the same hospital (for staff roles).
- Upon successful authorization, the backend generates an AWS S3 `GetObject` pre-signed URL valid for **exactly 15 minutes** (900 seconds).

## Consequences
- Strict compliance with PHI protection rules: zero public exposure of clinical records.
- High performance: heavy binary streaming offloaded to cloud storage network while metadata remains strictly indexed and tenant-isolated in PostgreSQL.
