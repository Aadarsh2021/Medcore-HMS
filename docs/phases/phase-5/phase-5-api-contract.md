# PHASE 5 — REVISED API CONTRACT SPECIFICATION
# Clinical Encounters & Electronic Medical Records (EMR)

**Version:** 2.0.0 (Hardened)  
**Status:** APPROVED FOR IMPLEMENTATION  
**Standard Envelope:** `{ "success": true, "data": T, "message"?: string }`  
**Paginated Envelope:** `{ "success": true, "data": T[], "meta": { "page": number, "limit": number, "total": number, "totalPages": number } }`  
**Error Envelope:** `{ "success": false, "error": { "code": string, "message": string, "details"?: any } }`  

---

## 1. Encounters API (`/api/encounters` & `/api/appointments`)

### 1.1 Start Clinical Encounter
- **Endpoint:** `POST /api/appointments/:appointmentId/encounter`
- **RBAC:** `DOCTOR` (Assigned Doctor Only)
- **Status Codes:**
  - `201 Created` / `200 OK`: Encounter started or existing encounter returned (idempotent).
  - `400 Bad Request` / `422 Unprocessable`: Appointment is `CANCELLED` or `NO_SHOW`.
  - `403 Forbidden`: Authenticated doctor is not assigned to this appointment.
  - `404 Not Found`: Appointment not found or belongs to another hospital.

### 1.2 Get Encounter Details
- **Endpoint:** `GET /api/encounters/:id`
- **RBAC:** `DOCTOR` (Tenant), `NURSE` (Tenant), `HOSPITAL_ADMIN` (Tenant), `SUPER_ADMIN` (with header), `PATIENT` (Own record only)
- **Response Shape:**
```json
{
  "success": true,
  "data": {
    "id": "enc-001",
    "hospitalId": "hosp-001",
    "appointmentId": "apt-001",
    "patientId": "pat-001",
    "doctorId": "doc-001",
    "status": "IN_PROGRESS",
    "startedAt": "2026-09-06T09:30:00.000Z",
    "completedAt": null,
    "medicalRecord": {
      "id": "rec-001",
      "chiefComplaint": "Persistent dry cough",
      "presentingSymptoms": "Cough for 4 days",
      "clinicalNotes": "Pharynx mildly congested",
      "treatmentPlan": "Rest, hydration, paracetamol SOS",
      "followUpDate": "2026-09-13T00:00:00.000Z",
      "vitals": [],
      "diagnoses": [],
      "attachments": [],
      "amendments": []
    }
  }
}
```

### 1.3 Record Vitals
- **Endpoint:** `POST /api/encounters/:id/vitals`
- **RBAC:** `DOCTOR` (Assigned), `NURSE`
- **Request Body:**
```json
{
  "bpSystolic": 120,
  "bpDiastolic": 80,
  "heartRate": 74,
  "temperature": 37.0,
  "spo2": 99,
  "respiratoryRate": 16,
  "heightCm": 175.0,
  "weightKg": 70.0,
  "notes": "Patient calm, seated"
}
```
- **Note:** BMI is computed on the server. Client-provided `bmi` is ignored.

### 1.4 Add Diagnosis
- **Endpoint:** `POST /api/encounters/:id/diagnoses`
- **RBAC:** `DOCTOR` (Assigned)
- **Request Body:**
```json
{
  "code": "J06.9",
  "description": "Acute upper respiratory infection, unspecified",
  "type": "CONFIRMED",
  "isPrimary": true,
  "notes": "Viral etiology suspected"
}
```

### 1.5 Update Draft Clinical Notes & Treatment Plan
- **Endpoint:** `PUT /api/encounters/:id/notes`
- **RBAC:** `DOCTOR` (Assigned)
- **Behavior:** Only allowed while encounter is `IN_PROGRESS`. If encounter is `COMPLETED`, returns `409 Conflict`.
- **Request Body:**
```json
{
  "chiefComplaint": "Persistent dry cough with low-grade fever",
  "presentingSymptoms": "Cough for 4 days",
  "clinicalNotes": "Chest clear, pharynx congested",
  "treatmentPlan": "Oral hydration, paracetamol 650mg SOS",
  "followUpDate": "2026-09-13T00:00:00.000Z"
}
```

### 1.6 Upload Clinical Attachment
- **Endpoint:** `POST /api/encounters/:id/attachments`
- **RBAC:** `DOCTOR` (Assigned)
- **Content-Type:** `multipart/form-data` (file <= 20MB, approved MIME types)
- **Response:**
```json
{
  "success": true,
  "data": {
    "id": "att-001",
    "recordId": "rec-001",
    "fileName": "Chest_XRay_PA.pdf",
    "fileType": "application/pdf",
    "fileSize": 2048500,
    "uploadedAt": "2026-09-06T09:35:00.000Z"
  },
  "message": "Attachment uploaded successfully"
}
```

### 1.7 Get Attachment Pre-Signed Download URL
- **Endpoint:** `GET /api/encounters/:id/attachments/:attachmentId/url`
- **RBAC:** `DOCTOR` (Tenant), `NURSE` (Tenant), `HOSPITAL_ADMIN` (Tenant), `PATIENT` (Own only)
- **Response:**
```json
{
  "success": true,
  "data": {
    "signedUrl": "https://s3.aws-region.amazonaws.com/medcore-attachments/...expiry-signature...",
    "expiresAt": "2026-09-06T09:50:00.000Z"
  }
}
```

### 1.8 Complete Clinical Encounter
- **Endpoint:** `POST /api/encounters/:id/complete`
- **RBAC:** `DOCTOR` (Assigned)
- **Validation:**
  - Status must be `IN_PROGRESS`.
  - `chiefComplaint` must be non-empty.
  - At least 1 diagnosis must be recorded.
- **Behavior:** Atomically transitions encounter to `COMPLETED`, appointment to `COMPLETED`, locks base medical record.

### 1.9 Submit Additive Medical Record Amendment
- **Endpoint:** `POST /api/encounters/:id/amendments`
- **RBAC:** `DOCTOR` (Assigned)
- **Behavior:** Never modifies the original record. Appends an immutable amendment row.
- **Request Body:**
```json
{
  "amendmentType": "ADDENDUM",
  "section": "CLINICAL_NOTES",
  "reason": "Late lab report received showing mild bacterial co-infection",
  "content": "Added Amoxicillin 500mg TDS for 5 days as per sputum culture"
}
```
- **Response:**
```json
{
  "success": true,
  "data": {
    "id": "amend-001",
    "recordId": "rec-001",
    "amendedById": "doc-001",
    "amendmentNumber": 1,
    "amendmentType": "ADDENDUM",
    "section": "CLINICAL_NOTES",
    "reason": "Late lab report received showing mild bacterial co-infection",
    "content": "Added Amoxicillin 500mg TDS for 5 days as per sputum culture",
    "createdAt": "2026-09-06T11:00:00.000Z"
  },
  "message": "Clinical amendment recorded successfully"
}
```

---

## 2. Longitudinal Patient Records API (`/api/medical-records/patients/:patientId`)

### 2.1 Get Patient Clinical Summary
- **Endpoint:** `GET /api/medical-records/patients/:patientId/summary`
- **RBAC:** `DOCTOR` (Tenant), `NURSE` (Tenant), `HOSPITAL_ADMIN` (Tenant), `PATIENT` (Own only)
- **Response:** Returns patient demographics, active allergies, active medications, vaccinations, family history, and 5 most recent encounters.

### 2.2 Get Paginated Encounter History
- **Endpoint:** `GET /api/medical-records/patients/:patientId/encounters`
- **Query Params:** `page` (default 1), `limit` (default 10, max 50), `status`, `from`, `to`
- **Response:** Paginated array of past encounters with diagnoses.

### 2.3 Get Paginated Vitals History
- **Endpoint:** `GET /api/medical-records/patients/:patientId/vitals`
- **Query Params:** `from`, `to`, `limit` (default 50)
- **Response:** Time-series array of recorded vitals for clinical trending charts.

### 2.4 Add Patient Allergy
- **Endpoint:** `POST /api/medical-records/patients/:patientId/allergies`
- **RBAC:** `DOCTOR` (Tenant)
- **Request Body:** `{ "allergen": "Penicillin", "reaction": "Hives", "severity": "SEVERE" }`

### 2.5 Add Patient Medication History
- **Endpoint:** `POST /api/medical-records/patients/:patientId/medications`
- **RBAC:** `DOCTOR` (Tenant)
- **Request Body:** `{ "medicationName": "Metformin", "dosage": "500mg", "frequency": "BD", "isActive": true }`

### 2.6 Add Patient Vaccination Record
- **Endpoint:** `POST /api/medical-records/patients/:patientId/vaccinations`
- **RBAC:** `DOCTOR` (Tenant), `NURSE` (Tenant)
- **Request Body:** `{ "vaccineName": "Covishield COVID-19", "administeredDate": "2021-06-15", "batchNumber": "4121Z023" }`

### 2.7 Add Patient Family History Record
- **Endpoint:** `POST /api/medical-records/patients/:patientId/family-history`
- **RBAC:** `DOCTOR` (Tenant)
- **Request Body:** `{ "condition": "Diabetes", "relationship": "Father", "notes": "Type 2 diabetes" }`
