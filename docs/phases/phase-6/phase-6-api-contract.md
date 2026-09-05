# PHASE 6 — API CONTRACT SPECIFICATION
# MedCore HMS — Prescription Management & Clinical Medication Ordering

**Status:** APPROVED FOR PLANNING  
**Document Version:** 1.0.0  

---

## 1. Global Standards

- **Base URL:** `/api`
- **Security:** Bearer Token (Supabase JWT)
- **Tenant Context:** Inferred from user JWT or `X-Hospital-Id` header for Super Admins
- **Envelope:** `{ success: true, data: ... }` on success, standard RFC 7807 error format on failure

---

## 2. Endpoints Specification

### 2.1 Search Medicines Catalog
- **Method:** `GET`
- **Route:** `/api/medicines/search`
- **Roles:** `DOCTOR`, `NURSE`, `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Query Parameters:**
  - `q` (string, required, min 1 char) — Case-insensitive search string matching medicine brand name or generic compound
  - `limit` (number, optional, default 20, max 50)
- **Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "c1f7b0a8-...",
      "name": "Amoxicillin 500mg",
      "genericName": "Amoxicillin",
      "category": "Antibiotic",
      "form": "CAPSULE",
      "strength": "500 mg",
      "manufacturer": "Cipla"
    }
  ]
}
```

---

### 2.2 Create or Get Draft Prescription for Encounter
- **Method:** `POST`
- **Route:** `/api/encounters/:encounterId/prescriptions`
- **Roles:** `DOCTOR` (Assigned to encounter only)
- **Description:** Initializes a draft prescription for an active encounter. Idempotent: returns existing draft if one already exists.
- **Request Body (Optional):**
```json
{
  "notes": "Take plenty of fluids. Rest for 3 days."
}
```
- **Response (201 Created / 200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "e9b2c140-...",
    "hospitalId": "hosp-1...",
    "encounterId": "enc-1...",
    "patientId": "pat-1...",
    "doctorId": "doc-1...",
    "prescriptionNumber": null,
    "status": "DRAFT",
    "notes": "Take plenty of fluids. Rest for 3 days.",
    "items": [],
    "createdAt": "2026-09-05T10:00:00.000Z"
  }
}
```

---

### 2.3 Update Draft Prescription Items & Notes
- **Method:** `PUT`
- **Route:** `/api/prescriptions/:id`
- **Roles:** `DOCTOR` (Assigned to encounter only)
- **Description:** Updates items and notes on a `DRAFT` prescription. Replaces current items atomically. Rejected with 409 if prescription is `ISSUED` or `CANCELLED`.
- **Request Body:**
```json
{
  "notes": "Take after meals. Avoid driving after night dose.",
  "items": [
    {
      "medicineId": "c1f7b0a8-...",
      "medicineName": "Amoxicillin 500mg",
      "form": "CAPSULE",
      "strength": "500 mg",
      "dosage": "1 capsule",
      "frequency": "TDS",
      "durationDays": 5,
      "route": "ORAL",
      "instructions": "Take after food with water",
      "quantity": 15
    },
    {
      "medicineId": null,
      "medicineName": "Paracetamol 650mg",
      "form": "TABLET",
      "strength": "650 mg",
      "dosage": "1 tablet",
      "frequency": "SOS",
      "durationDays": 3,
      "route": "ORAL",
      "instructions": "Take if temperature > 100 F",
      "quantity": 6
    }
  ]
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "e9b2c140-...",
    "status": "DRAFT",
    "notes": "Take after meals. Avoid driving after night dose.",
    "items": [ ... ],
    "updatedAt": "2026-09-05T10:05:00.000Z"
  }
}
```

---

### 2.4 Finalize Prescription (Sign & Generate PDF)
- **Method:** `POST`
- **Route:** `/api/prescriptions/:id/finalize`
- **Roles:** `DOCTOR` (Assigned to encounter only)
- **Description:** Atomically seals the prescription. Generates `prescriptionNumber`, compiles PDF with doctor digital signature overlay, stores PDF in S3, and marks status as `ISSUED`.
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "e9b2c140-...",
    "prescriptionNumber": "RX-MGH-2026-000001",
    "status": "ISSUED",
    "issuedAt": "2026-09-05T10:10:00.000Z",
    "signedPdfUrl": "prescriptions/hosp-1/pat-1/RX-MGH-2026-000001.pdf",
    "items": [ ... ]
  }
}
```

---

### 2.5 Void / Cancel Finalized Prescription
- **Method:** `POST`
- **Route:** `/api/prescriptions/:id/void`
- **Roles:** `DOCTOR` (Original prescribing doctor), `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Description:** Formally cancels an `ISSUED` prescription. Requires clinical justification.
- **Request Body:**
```json
{
  "reason": "Patient reported adverse stomach irritation to Amoxicillin. Switching to Azithromycin."
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "e9b2c140-...",
    "status": "CANCELLED",
    "voidedAt": "2026-09-05T11:00:00.000Z",
    "voidReason": "Patient reported adverse stomach irritation to Amoxicillin. Switching to Azithromycin."
  }
}
```

---

### 2.6 Get Authorized 15-Minute Signed PDF Download URL
- **Method:** `GET`
- **Route:** `/api/prescriptions/:id/pdf/url`
- **Roles:** `DOCTOR`, `NURSE`, `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`, `PATIENT` (Own only)
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://medcore-storage.s3.ap-south-1.amazonaws.com/prescriptions/...?.X-Amz-Signature=...",
    "expiresAt": "2026-09-05T10:25:00.000Z"
  }
}
```

---

### 2.7 Get Paginated Patient Prescriptions
- **Method:** `GET`
- **Route:** `/api/patients/:patientId/prescriptions`
- **Roles:** `DOCTOR`, `NURSE`, `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`, `PATIENT` (Own only)
- **Query Parameters:**
  - `page` (number, default 1)
  - `limit` (number, default 10, max 50)
  - `status` (optional: `ISSUED`, `CANCELLED`)
- **Response (200 OK):**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```
