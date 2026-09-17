# Phase 8 — Laboratory & Diagnostics Role-Based Access Control (RBAC)

## 1. Role Matrix Overview

The Laboratory & Diagnostics module enforces strict separation of duties between clinical diagnostics, technical laboratory execution, administrative oversight, pharmacy, nursing, front-desk operations, and patient self-service access.

Under MedCore HMS security policy:
1. **Clinical Certification Authority**: Only clinicians possessing the `DOCTOR` role (specifically Pathologists / diagnostic certifying physicians) are authorized to certify, sign, and approve diagnostic reports (`APPROVED` state) and author clinical amendments (`LabResultAmendment`).
2. **Operational Administrative Boundaries**: `HOSPITAL_ADMIN` has operational and configuration visibility but **cannot** medically certify or approve lab diagnostic reports.
3. **Specimen & Processing Operations**: `LAB_TECHNICIAN` and `NURSE` can collect specimens and manage accession workflows. Specimen rejection requires mandatory clinical justification.
4. **Patient Privacy & Result Embargo**: Patients may **only** view finalized (`APPROVED`) diagnostic reports belonging strictly to their own patient profile. Preliminary, pending, or in-processing lab orders are hidden to avoid premature clinical panic before physician interpretation.
5. **Operational Firewalls**: `RECEPTIONIST`, `PHARMACIST`, and `ACCOUNTANT` are completely blocked from viewing the clinical laboratory test queue or entering results.

---

## 2. Definitive RBAC Permission Matrix

| Laboratory Action / Endpoint | SUPER_ADMIN | HOSPITAL_ADMIN | DOCTOR | LAB_TECHNICIAN | NURSE | PATIENT | RECEPTIONIST | PHARMACIST | ACCOUNTANT |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Catalog** (`GET /laboratory/catalog`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Manage Catalog** (`POST/PUT/DEL /laboratory/catalog`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Order Lab Test** (`POST /laboratory/orders`) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Order Queue** (`GET /laboratory/orders`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (Own only) | ❌ | ❌ | ❌ |
| **Collect Specimen** (`POST /orders/:id/specimen`) | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Reject Specimen** (`POST /orders/:id/reject-specimen`) | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Start Processing** (`POST /orders/:id/process`) | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Enter/Record Results** (`POST /orders/:id/results`) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Certify & Approve Report** (`POST /orders/:id/approve`) | ❌ | ❌ | ✅ (Pathologist) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Clinical Amendment** (`POST /orders/:id/amend`) | ❌ | ❌ | ✅ (Doctor) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cancel Order** (`POST /orders/:id/cancel`) | ✅ | ✅ | ✅ (Ordering) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Patient Report Access** (`GET /laboratory/patient/reports`) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Finalized only) | ❌ | ❌ | ❌ |

---

## 3. Enforcement Layers

1. **Route Level Guards**:
   - `SupabaseAuthGuard`: Validates and extracts cryptographically verified user identity from Supabase JWT.
   - `RolesGuard`: Evaluates `@Roles(...)` metadata against user role enum.
   - `TenantGuard`: Enforces hospital tenant context and validates request header `x-hospital-id`.

2. **Service Level Authority Checks**:
   - `approveOrder`: Queries doctor profile and verifies user role is `DOCTOR`. Any non-doctor role (including `HOSPITAL_ADMIN` or `LAB_TECHNICIAN`) is rejected with HTTP 403 `ForbiddenException`.
   - `amendResult`: Rejects non-doctor actors; enforces non-empty clinical justification string.
   - `getOrderById`: Enforces patient identity verification when caller is `PATIENT`. Rejects access if order belongs to a different patient or if order status is not `APPROVED`.

3. **Database Level Isolation**:
   - `prisma-tenant.extension.ts`: Automatically injects `hospitalId` into all queries and mutations for `LabOrder`, `LabOrderItem`, `LabSpecimen`, `LabResultAmendment`, `LabTest`, `LabCategory`, `LabOrderNumberCounter`, and `LabAccessionCounter`.
   - Rejects cross-tenant entity references (e.g. attempting to order tests across hospital boundaries).
