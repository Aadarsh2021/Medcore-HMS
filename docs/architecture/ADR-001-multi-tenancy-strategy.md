# ADR-001: Multi-Tenancy Strategy & Data Isolation

## Status
IMPLEMENTED (Phase 1 — Core Data Isolation Foundation)

## Architecture Overview
MedCore HMS employs a **Shared-Database / Shared-Schema Multi-Tenancy Model** with **Hospital as the Tenant Root**.
Data isolation is enforced at the database access layer via a custom Prisma Client Extension coupled with Node.js `AsyncLocalStorage` and NestJS Guards/Interceptors.

---

## 1. Entity Classification

### A. Global / Shared Models
Models that exist globally across the platform without strict hospital partitioning:
- `Address`: Reusable physical address entities linked to hospitals and patients.
- `Hospital`: The root tenant catalog entity.

### B. Direct Tenant-Owned Models
Models possessing a direct `hospitalId` foreign key referencing `Hospital(id)`:
- `Patient`
- `Doctor`
- `Department`
- `Appointment`
- `PatientEncounter`
- `MedicalRecord`
- `Prescription`
- `Medicine`
- `LabCategory`
- `LabTest`
- `LabOrder`
- `Invoice`
- `Payment`
- `User` (partitioned per hospital; Super Admin has `hospitalId = null`)

### C. Indirect Tenant-Owned Models
Models that inherit tenancy transitively through parent relationships:
- `DoctorAvailability` (via `doctor.hospitalId`)
- `DoctorLeave` (via `doctor.hospitalId`)
- `Vital` (via `record.hospitalId`)
- `Diagnosis` (via `record.hospitalId`)
- `Allergy` (via `patient.hospitalId`)
- `Attachment` (via `record.hospitalId`)
- `PrescriptionItem` (via `prescription.hospitalId`)
- `MedicineBatch` (via `medicine.hospitalId`)
- `LabOrderItem` (via `order.hospitalId`)
- `InvoiceItem` (via `invoice.hospitalId`)
- `RefreshSession` (via `user.hospitalId`)

### D. System & Audit Models
- `Notification` (carries optional `hospitalId?` and recipient `userId`)
- `AuditLog` (carries optional `hospitalId?`, actor `userId`, entity metadata, and IP/User-Agent)

---

## 2. Authentication & Tenant Context Pipeline

### Normal Hospital Staff / Patients:
1. Client sends Bearer JWT from Supabase Auth (`Authorization: Bearer <token>`).
2. `SupabaseAuthGuard` verifies token with Supabase Admin API and resolves the local PostgreSQL `User`.
3. `request.user` is populated with the database user; `request.hospitalId` is established strictly from `dbUser.hospitalId`.
4. `TenantGuard` verifies that any incoming `hospitalId` in route parameters, query parameters, or request body strictly matches `user.hospitalId`. Contradictory values throw `403 Forbidden`.
5. `TenantContextInterceptor` binds `request.hospitalId`, `request.user.id`, and roles into `AsyncLocalStorage` (`tenantStorage.run(...)`) for the duration of the request.
6. `PrismaService` executes all model operations through `prisma-tenant.extension.ts`, which extracts `effectiveTenantId` from `AsyncLocalStorage`.

### Super Admin:
1. Authenticated `SUPER_ADMIN` user has `hospitalId = null`.
2. To operate on tenant data, Super Admin must explicitly provide the target hospital via the `X-Hospital-Id` HTTP header.
3. `TenantGuard` validates that the target hospital exists in the database and has `status = ACTIVE`.
4. If `X-Hospital-Id` is missing, `request.hospitalId` remains `null`. The Prisma tenant extension strictly blocks any tenant-scoped write or mutation with `403 Forbidden` (`Tenant context required: Super Admin must specify target hospital via X-Hospital-Id header`).

---

## 3. Database Layer Enforcement (`prisma-tenant.extension.ts`)

The extension intercepts all operations across all models using Prisma Client Extensions (`$extends`):

### Read Protections:
- `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`: Automatically injects `hospitalId: effectiveTenantId` for direct models, and relation joins (`record: { hospitalId: effectiveTenantId }`) for indirect models. Explicit conflicting filters throw `ForbiddenException`.
- `findUnique`, `findUniqueOrThrow`: Automatically routed to `findFirst` with tenant filtering. Cross-tenant unique ID queries return `null` or throw `NotFoundException`.

### Write Protections:
- `create`: Injects trusted `hospitalId`. Validates that all referenced foreign keys (`patientId`, `doctorId`, `departmentId`, `encounterId`, etc.) belong to the active hospital. Cross-tenant foreign key references throw `ForbiddenException`.
- `createMany`: Validates and sets `hospitalId` on all batch items.
- `update`: Verifies target record belongs to the active hospital before mutation. Prevents modifying `hospitalId` across tenant boundaries.
- `delete`: Verifies target record belongs to the active hospital before deletion.
- `updateMany`, `deleteMany`: Scoped strictly by `hospitalId`.
- `upsert`: Enforces tenant validation on both create and update branches.

---

## 4. Request Concurrency Safety
Tenant context is managed exclusively through Node.js `node:async_hooks.AsyncLocalStorage`.
- **Zero Global State**: No singleton variables, module-level variables, or `global` properties are used.
- **Asynchronous Isolation**: Interleaved concurrent requests for Hospital A and Hospital B running simultaneously across the Node event loop are completely isolated.

---

## 5. Implementation Status Distinction

### [IMPLEMENTED] (Verified via Automated Tests):
- `AsyncLocalStorage` tenant context storage (`apps/api/src/database/tenant-context.ts`)
- Global Prisma Client Tenant Extension (`apps/api/src/database/prisma-tenant.extension.ts`)
- Proxy-delegated `PrismaService` with helper methods (`apps/api/src/database/prisma.service.ts`)
- Global `TenantContextInterceptor` registered in `AppModule`
- Super Admin target hospital validation in `TenantGuard`
- 12 automated integration tests passing in CI/local (`apps/api/test/tenant-isolation.spec.ts`)

### [PLANNED / FUTURE]:
- PostgreSQL Native Row-Level Security (RLS) policies with transaction-local session variables (`SET LOCAL app.current_hospital_id`) as defense-in-depth behind Prisma.
- Clinical domain services (Patients, Doctors, Appointments, EMR, Pharmacy, Billing).
- Automated audit log interceptor capturing old/new JSON diffs on mutations.

