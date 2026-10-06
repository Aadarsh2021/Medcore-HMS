# MedCore HMS — Testing & Quality Assurance Architecture

## 1. Overview & Verification Summary

MedCore HMS maintains an exhaustive end-to-end and integration test suite executing against a live PostgreSQL 16 database. 

### Verified Quality Metrics:
- **Total Test Suites**: 20 / 20 PASS
- **Total Tests**: 401 / 401 PASS
- **Test Failures**: 0
- **Test Skips**: 0
- **ESLint Errors**: 0
- **TypeScript Errors (API & Web)**: 0
- **Prisma Schema & Migrations**: 10 / 10 Fully Applied

---

## 2. Test Execution Command

The entire integration test suite is executed sequentially with:

```bash
pnpm --filter @medcore/api test -- --runInBand
```

> [!NOTE]
> `--runInBand` is required when running against real database instances to prevent cross-suite transaction collisions and database pool exhaustion.

---

## 3. Test Suites Directory & Scope

| # | Test Suite File | Domain / Subsystem | Verification Scope |
|---|---|---|---|
| 1 | `appointment-booking.spec.ts` | Scheduling | Slot allocation, double-booking prevention, cancellation |
| 2 | `billing-management.spec.ts` | Financial | Invoice line-item calculations, payments, refund reconciliation |
| 3 | `clinical-encounters.spec.ts` | Clinical | Patient encounters, vitals recording, ICD-10 diagnoses |
| 4 | `laboratory-management.spec.ts` | Diagnostics | Lab test catalog, orders, barcode accessioning, result validation |
| 5 | `patient-management.spec.ts` | Registry | Demographics, 20-thread concurrent UHID generation, search |
| 6 | `pharmacy-management.spec.ts` | Inventory | Stock batch tracking, FEFO dispensing, expiration filtering |
| 7 | `prescriptions.e2e-spec.ts` | Medications | Prescription creation, validation, PDFKit streaming |
| 8 | `analytics-and-dictionary.spec.ts` | Intelligence | KPI aggregation, bed occupancy statistics, ICD-10 dictionary |
| 9 | `bullmq-jobs.spec.ts` | Background Workers | Queue dispatch, retry backoff, deterministic job deduplication |
| 10 | `health-and-readiness.spec.ts` | Ops / SRE | Liveness `/health/live` and readiness `/health/ready` probes |
| 11 | `hospitals-and-departments.spec.ts` | Multi-Tenancy | Hospital tenant lifecycle, department assignment, staff linkage |
| 12 | `notifications-and-jobs.spec.ts` | Communications | Email/SMS dispatch triggers, in-app notification state |
| 13 | `realtime-and-storage.spec.ts` | Socket / S3 | Socket room authorization, S3 signed URLs, MIME validation |
| 14 | `rooms-and-beds.spec.ts` | Inpatient | Ward/Room hierarchies, atomic bed occupancy, patient transfers |
| 15 | `security-and-patient-portal.spec.ts` | Security | RBAC enforcement across 9 roles, tenant boundary guards, IDOR |
| 16 | `triage-emergency.spec.ts` | Emergency | ESI acuity classification (Levels 1–5), queue prioritization |
| 17 | `audit-logging.spec.ts` | Compliance | Immutable audit event persistence, IP and actor tracing |
| 18 | `auth-guard.spec.ts` | Authentication | Supabase JWT verification, expired token rejection |
| 19 | `storage-security.spec.ts` | Storage Security | Path traversal blocking, 20 MB file size limit, malicious script rejection |
| 20 | `payment-webhooks.spec.ts` | Payments | Stripe & Razorpay HMAC signature validation, invoice settlement |

---

## 4. Key Concurrency & Hardening Tests

### 4.1 UHID Concurrency Test
- **Location**: `apps/api/test/patient-management.spec.ts`
- **Scenario**: Dispatches 20 simultaneous patient registration requests within the same millisecond window.
- **Verification Criteria**:
  - All 20 registrations succeed (HTTP 201 Created).
  - All 20 generated UHIDs are strictly distinct and follow the monotonic sequence format `UHID-YYYYMM-XXXXX`.
  - Zero database deadlocks or transaction timeouts.
- **Database Connection Tuning**: Verified with connection parameters `connection_limit=10&pool_timeout=45`.

### 4.2 Appointment Overlap Concurrency Test
- **Location**: `apps/api/test/appointment-booking.spec.ts`
- **Scenario**: Two concurrent requests attempt to reserve the same doctor at the exact same start time.
- **Verification Criteria**:
  - Exactly one request succeeds with HTTP 201.
  - The second request is rejected with HTTP 409 Conflict.
  - Doctor schedule slot remains consistent without data corruption.

### 4.3 Bed Double-Allocation Concurrency Test
- **Location**: `apps/api/test/rooms-and-beds.spec.ts`
- **Scenario**: Two clinical admission requests simultaneously target the same vacant inpatient bed.
- **Verification Criteria**:
  - Only one patient is assigned to the bed (`status = OCCUPIED`).
  - The conflicting request receives an explicit `ConflictException`.
  - The bed's current occupancy count remains exactly 1.

---

## 5. Continuous Integration (CI) Automation

The testing suite runs automatically on every pull request and push to `main` via GitHub Actions (`.github/workflows/ci.yml`).
The workflow:
1. Provisions PostgreSQL 16 and Redis 7 service containers.
2. Applies all Prisma migrations (`npx prisma migrate deploy`).
3. Executes monorepo linting (`pnpm lint`).
4. Typechecks API and Web applications (`tsc --noEmit`).
5. Runs the full test suite with `--runInBand`.
6. Compiles production bundles for API and Web.
