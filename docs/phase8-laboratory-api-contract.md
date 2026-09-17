# Phase 8 — Laboratory & Diagnostics API Contract

## 1. Overview
The Laboratory & Diagnostics API exposes endpoints under `/api/laboratory/` for diagnostic test catalog querying, multi-test diagnostic order management, specimen collection & accession tracking, server-authoritative result evaluation, Pathologist certification, clinical amendments, and patient report access.

All endpoints require:
- `Authorization: Bearer <supabase_jwt>`
- `x-hospital-id: <hospital_uuid>` (when accessed by staff / multi-tenant users)

---

## 2. Endpoints

### 2.1 Test Catalog
#### `GET /api/laboratory/catalog`
- **Query Parameters**:
  - `search` (optional, string): Filter by test name or code.
  - `categoryId` (optional, string): Filter by category ID.
  - `page` (optional, number): Default 1.
  - `limit` (optional, number): Default 50.
- **Roles**: `DOCTOR`, `LAB_TECHNICIAN`, `NURSE`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Response Shape**:
```json
{
  "items": [
    {
      "id": "uuid",
      "hospitalId": "uuid",
      "categoryId": "uuid",
      "categoryName": "Hematology",
      "name": "Complete Blood Count (Hemoglobin)",
      "code": "CBC-HB-001",
      "description": "Measures total hemoglobin concentration",
      "price": 350.0,
      "sampleType": "Venous Whole Blood (EDTA)",
      "turnaroundTime": "2-4 hours",
      "referenceRangeMin": 13.5,
      "referenceRangeMax": 17.5,
      "criticalLow": 7.0,
      "criticalHigh": 20.0,
      "unit": "g/dL",
      "isActive": true
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```

---

### 2.2 Diagnostic Orders
#### `POST /api/laboratory/orders`
- **Roles**: `DOCTOR`, `SUPER_ADMIN`
- **Request Body**:
```json
{
  "patientId": "uuid",
  "doctorId": "uuid",
  "encounterId": "uuid",
  "priority": "ROUTINE" | "URGENT" | "STAT",
  "specimenType": "Venous Whole Blood (EDTA)",
  "clinicalNotes": "Evaluation for chronic fatigue and pallor",
  "items": [
    {
      "testId": "uuid"
    }
  ]
}
```
- **Response Shape**:
```json
{
  "id": "uuid",
  "orderNumber": "LAB-2026-000001",
  "hospitalId": "uuid",
  "patientId": "uuid",
  "patientName": "Aarav Sharma",
  "doctorId": "uuid",
  "doctorName": "Dr. Sunanda Pillai",
  "encounterId": "uuid",
  "status": "ORDERED",
  "priority": "ROUTINE",
  "specimenType": "Venous Whole Blood (EDTA)",
  "clinicalNotes": "Evaluation for chronic fatigue and pallor",
  "createdAt": "2026-09-17T10:00:00.000Z",
  "tests": [
    {
      "id": "uuid",
      "testId": "uuid",
      "name": "Complete Blood Count (Hemoglobin)",
      "code": "CBC-HB-001",
      "price": 350.0,
      "unit": "g/dL",
      "referenceRange": "13.5 - 17.5"
    }
  ]
}
```

#### `GET /api/laboratory/orders`
- **Query Parameters**:
  - `status` (optional, `LabOrderStatus`)
  - `priority` (optional, `LabPriority`)
  - `patientId` (optional, string)
  - `search` (optional, string)
  - `startDate` / `endDate` (optional, ISO date)
  - `page` (optional, number)
  - `limit` (optional, number)
- **Roles**: `DOCTOR`, `LAB_TECHNICIAN`, `NURSE`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`

#### `GET /api/laboratory/orders/:id`
- **Roles**: `DOCTOR`, `LAB_TECHNICIAN`, `NURSE`, `HOSPITAL_ADMIN`, `PATIENT`, `SUPER_ADMIN`
- Returns comprehensive order response including ordered tests, collected specimens, accession numbers, results, interpretation flags, and clinical amendments.

---

### 2.3 Specimen Intake & Tracking
#### `POST /api/laboratory/orders/:id/specimen`
- **Roles**: `LAB_TECHNICIAN`, `NURSE`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Request Body**:
```json
{
  "specimenType": "Venous Whole Blood (EDTA)",
  "notes": "Collected from left median cubital vein"
}
```
- Transitions order state: `ORDERED` -> `SAMPLE_COLLECTED`.
- Generates collision-free hospital-scoped accession sequence: `ACC-YYYY-000001`.

#### `POST /api/laboratory/orders/:id/reject-specimen`
- **Roles**: `LAB_TECHNICIAN`, `NURSE`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Request Body**:
```json
{
  "rejectionReason": "Severe hemolyzed specimen unsuitable for automated hematology analyzer"
}
```
- Transitions order state to `REJECTED`. Rejection reason is strictly mandatory.

---

### 2.4 Laboratory Processing & Result Entry
#### `POST /api/laboratory/orders/:id/process`
- **Roles**: `LAB_TECHNICIAN`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- Transitions order state: `SAMPLE_COLLECTED` -> `PROCESSING`.

#### `POST /api/laboratory/orders/:id/results`
- **Roles**: `LAB_TECHNICIAN`, `DOCTOR`, `SUPER_ADMIN`
- **Request Body**:
```json
{
  "notes": "Sample analyzed on Sysmex XN-1000",
  "results": [
    {
      "testItemId": "uuid",
      "resultValue": 14.2,
      "resultText": "Normal red cell indices"
    }
  ]
}
```
- **Server-Authoritative Evaluation**: Server evaluates `resultValue` against persisted `LabTest` ranges (`referenceRangeMin`, `referenceRangeMax`, `criticalLow`, `criticalHigh`) and assigns flag (`NORMAL`, `LOW`, `HIGH`, `CRITICAL`, `ABNORMAL`). Any client-supplied flags are ignored.
- Transitions order state: `PROCESSING` -> `COMPLETED`.

---

### 2.5 Pathologist Certification & Clinical Amendments
#### `POST /api/laboratory/orders/:id/approve`
- **Roles**: `DOCTOR` (Pathologist / Diagnostic certifying physician)
- **Request Body**:
```json
{
  "clinicalNotes": "Verified and approved by Pathologist"
}
```
- Transitions order state: `COMPLETED` -> `APPROVED`.
- Locks report. Post-approval results are strictly immutable.

#### `POST /api/laboratory/orders/:id/amend`
- **Roles**: `DOCTOR`
- **Request Body**:
```json
{
  "testItemId": "uuid",
  "newValue": 14.8,
  "reason": "Recalibration adjustment following secondary run verification"
}
```
- Records immutable `LabResultAmendment` audit row preserving:
  - `previousValue`
  - `newValue`
  - `reason` (mandatory clinical explanation)
  - `amendedBy` (physician user ID)
  - `amendedAt` (timestamp)

---

### 2.6 Order Cancellation
#### `POST /api/laboratory/orders/:id/cancel`
- **Roles**: `DOCTOR`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Request Body**:
```json
{
  "reason": "Duplicate order placed by clinical resident"
}
```
- Permitted only for unfinalized orders prior to completion. Cannot cancel `APPROVED` orders.

---

### 2.7 Patient Self-Service Access
#### `GET /api/laboratory/patient/reports`
- **Roles**: `PATIENT`
- Scoped strictly to calling patient's `patientId` and filtered exclusively for `APPROVED` diagnostic reports. Unapproved orders are never returned.
