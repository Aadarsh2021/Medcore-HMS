# ADR-004: Medical File Storage & Attachment Strategy

## Status
Accepted

## Context
Clinical records include sensitive diagnostic attachments: ultrasound scans, ECG recordings, histopathology reports, and prescription PDFs. These files constitute Protected Health Information (PHI) and must comply with healthcare data confidentiality standards.

## Decision
We selected an **Object Storage Architecture with Short-Lived Pre-Signed URLs and Strict MIME Validation**.

### Implementation:
1. **Private Bucket Policy**:
   - The S3 / Cloudinary bucket is configured with all public access strictly blocked.
   - Files are stored using opaque, non-guessable keys: `attachments/{hospitalId}/{patientId}/{uuid}.{ext}`.
2. **Upload Pipeline**:
   - Files pass through NestJS Multer middleware with rigorous validation:
     - MIME type validation against an approved whitelist (e.g. `application/pdf`, `image/jpeg`, `image/png`, `image/webp`).
     - Executable and script extensions (`.exe`, `.sh`, `.bat`, `.js`, `.html`) are permanently rejected.
     - Maximum file size capped at 20 MB.
3. **Authorized Access via Pre-Signed URLs**:
   - Clinicians or patients requesting to view an attachment do not receive a public URL.
   - The backend checks tenant and ownership permissions, then generates a cryptographically signed pre-signed URL valid for 15 minutes.

## Consequences
- Zero risk of public file enumeration or unauthorized document exposure.
- Storage bandwidth and heavy binary streaming are handled by the cloud object storage network rather than overloading the application server.
