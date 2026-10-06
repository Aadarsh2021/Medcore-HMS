# MedCore HMS — REST API Specification & Endpoints

## 1. Overview & Interactive Documentation

MedCore HMS exposes a strongly-typed RESTful API built on NestJS 10.

- **Development API Base URL**: `http://localhost:3001/api`
- **Swagger / OpenAPI Documentation**: `http://localhost:3001/api/docs`
- **OpenAPI JSON Spec**: `http://localhost:3001/api/docs-json`

---

## 2. Request Headers & Global Invariants

All API requests (except public endpoints such as `/auth/login` and `/health/*`) must supply the following standard HTTP headers:

| Header Name | Format / Example | Description |
|---|---|---|
| `Authorization` | `Bearer <supabase_jwt>` | Cryptographically signed user authentication token |
| `x-hospital-id` | `hosp_clx8910abcdef` | Active tenant identifier (Required for multi-tenant isolation) |
| `x-correlation-id` | `c72b8d4e-5e36-4074-b51f-6a77d1ff04d8` | Optional distributed tracing ID (auto-generated if omitted) |
| `Content-Type` | `application/json` | Required for all `POST`, `PUT`, `PATCH` request payloads |

---

## 3. Core API Endpoint Groups

### 3.1 Authentication & Profile (`/api/auth`)
- `POST /api/auth/register` — Register new user account with Supabase Auth
- `POST /api/auth/login` — Sign in and receive session JWT
- `GET /api/auth/me` — Retrieve current authenticated user profile and roles
- `POST /api/auth/refresh` — Refresh expired session access token

### 3.2 Hospitals & Multi-Tenancy (`/api/hospitals`)
- `GET /api/hospitals` — List all registered hospitals (Super Admin only)
- `POST /api/hospitals` — Provision new hospital tenant
- `GET /api/hospitals/:id` — Get hospital details
- `PATCH /api/hospitals/:id` — Update hospital branding and operational metadata

### 3.3 Departments (`/api/departments`)
- `GET /api/departments` — List departments for the current hospital
- `POST /api/departments` — Create new department
- `GET /api/departments/:id` — Retrieve department details
- `PATCH /api/departments/:id` — Update department details

### 3.4 Doctors & Staff (`/api/doctors`)
- `GET /api/doctors` — List doctors filtered by department, availability
- `POST /api/doctors` — Onboard new doctor profile and schedule
- `GET /api/doctors/:id` — Retrieve doctor credentials and working hours
- `GET /api/doctors/:id/slots` — Get available consultation appointment slots

### 3.5 Patient Management (`/api/patients`)
- `GET /api/patients` — Search patients by name, UHID, phone number (paginated)
- `POST /api/patients` — Register new patient with atomic deterministic UHID generation
- `GET /api/patients/:id` — Fetch complete patient demographic and medical profile
- `PATCH /api/patients/:id` — Update patient contact or insurance information

### 3.6 Appointments (`/api/appointments`)
- `GET /api/appointments` — List appointments filtered by date range, doctor, status
- `POST /api/appointments` — Book new appointment with concurrency conflict check
- `GET /api/appointments/:id` — Retrieve appointment details
- `PATCH /api/appointments/:id/status` — Update appointment status (`CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW`)
- `POST /api/appointments/:id/reschedule` — Reschedule appointment to a new slot

### 3.7 Clinical Encounters (`/api/encounters`)
- `GET /api/encounters` — List encounters by patient, doctor, or date
- `POST /api/encounters` — Start new consultation encounter
- `GET /api/encounters/:id` — Retrieve encounter, clinical notes, vitals
- `POST /api/encounters/:id/vitals` — Record patient vital signs (BP, Pulse, Temp, SpO2)
- `POST /api/encounters/:id/diagnoses` — Attach ICD-10 clinical diagnoses
- `POST /api/encounters/:id/complete` — Finalize and lock clinical encounter

### 3.8 Medical Records (`/api/medical-records`)
- `GET /api/medical-records/patient/:patientId` — Comprehensive longitudinal medical history
- `POST /api/medical-records/attachments` — Associate diagnostic attachments to patient record

### 3.9 Prescriptions (`/api/prescriptions`)
- `GET /api/prescriptions` — List prescriptions filtered by patient or encounter
- `POST /api/prescriptions` — Issue prescription with itemized medications and dosages
- `GET /api/prescriptions/:id` — Retrieve prescription details
- `GET /api/prescriptions/:id/pdf` — Stream generated digital prescription PDF

### 3.10 Laboratory & Diagnostics (`/api/laboratory`)
- `GET /api/laboratory/tests` — Test catalog with reference ranges
- `POST /api/laboratory/orders` — Order laboratory tests for patient encounter
- `POST /api/laboratory/specimens/collect` — Specimen accessioning with barcode generation
- `POST /api/laboratory/results` — Record laboratory test results
- `POST /api/laboratory/results/:id/verify` — Lab supervisor result verification and critical alert broadcast

### 3.11 Pharmacy & Inventory (`/api/pharmacy`)
- `GET /api/pharmacy/items` — Pharmacy inventory catalog and current stock
- `POST /api/pharmacy/items` — Register new pharmaceutical item
- `POST /api/pharmacy/batches` — Receive new medicine batch with expiry and lot number
- `POST /api/pharmacy/dispense` — Dispense medications against prescription using FEFO logic
- `GET /api/pharmacy/alerts/expiring` — List medications nearing expiry threshold

### 3.12 Billing & Invoicing (`/api/billing`)
- `GET /api/billing/invoices` — List invoices by status (`DRAFT`, `ISSUED`, `PAID`)
- `POST /api/billing/invoices` — Generate itemized patient bill
- `POST /api/billing/invoices/:id/pay` — Record manual or POS payment
- `POST /api/billing/checkout/session` — Create Stripe / Razorpay online checkout session
- `POST /api/billing/webhooks/stripe` — Public webhook listener for Stripe payment events
- `POST /api/billing/webhooks/razorpay` — Public webhook listener for Razorpay payment events

### 3.13 Rooms & Inpatient Beds (`/api/rooms-beds`)
- `GET /api/rooms-beds/wards` — List hospital wards
- `GET /api/rooms-beds/rooms` — List rooms and bed counts
- `GET /api/rooms-beds/beds` — Bed inventory with real-time status (`AVAILABLE`, `OCCUPIED`, `MAINTENANCE`)
- `POST /api/rooms-beds/admit` — Atomically admit patient to bed
- `POST /api/rooms-beds/transfer` — Transfer patient between beds
- `POST /api/rooms-beds/discharge` — Discharge patient and flag bed for sanitation

### 3.14 Emergency Triage (`/api/triage`)
- `GET /api/triage/queue` — Real-time emergency queue sorted by acuity
- `POST /api/triage/assess` — Record emergency triage assessment (ESI Levels 1–5)
- `PATCH /api/triage/:id/assign` — Assign emergency doctor

### 3.15 Clinical Dictionary (`/api/clinical-dictionary`)
- `GET /api/clinical-dictionary/icd10` — Search standardized ICD-10 diagnostic codes
- `GET /api/clinical-dictionary/drugs` — Search generic medication formulations

### 3.16 Notifications (`/api/notifications`)
- `GET /api/notifications` — Get current user notifications
- `PATCH /api/notifications/:id/read` — Mark notification as read
- `POST /api/notifications/dispatch` — Dispatch multi-channel notification (Internal)

### 3.17 Audit Trail (`/api/audit`)
- `GET /api/audit` — Query immutable audit logs by actor, entity, date range (Admin only)

### 3.18 Analytics & KPI (`/api/analytics`)
- `GET /api/analytics/overview` — High-level hospital KPI dashboard
- `GET /api/analytics/occupancy` — Bed occupancy rates and average length of stay (ALOS)
- `GET /api/analytics/financial` — Revenue, outstanding receivables, and collection trends

### 3.19 Object Storage (`/api/storage`)
- `POST /api/storage/presigned-upload` — Generate S3 pre-signed upload URL for patient attachment
- `GET /api/storage/presigned-download` — Generate S3 pre-signed download URL

### 3.20 System Health & Readiness (`/api/health`)
- `GET /api/health/live` — Basic liveness probe (HTTP 200 OK)
- `GET /api/health/ready` — Readiness probe checking PostgreSQL and Redis connectivity
