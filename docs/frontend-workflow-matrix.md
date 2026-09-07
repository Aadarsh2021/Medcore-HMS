# MedCore HMS — Frontend Workflow Matrix

This matrix documents the complete end-to-end user workflows across all MedCore HMS functional modules.

---

## 1. Module Workflow Specifications

### 1.1 Patient Management
- **Role**: `RECEPTIONIST`, `DOCTOR`, `NURSE`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Patients (`/dashboard/patients`)
- **List/Queue**: Searchable patient table with UHID, phone, gender, age, blood group, and registration date.
- **Detail**: `/dashboard/patients/detail?id=<uuid>` (Patient 360 view with Overview, Appointments, Encounters, Prescriptions, Lab Reports, Billing, Documents).
- **Primary Action**: "Register Patient" $\to$ Multi-step intake wizard (`/dashboard/patients/new`).
- **Validation**: Mandatory first name, last name, phone regex, valid birth date, emergency contact phone.
- **Confirmation**: Registration preview dialog displaying generated UHID format (`MGH-2025-XXXXXX`).
- **Success**: UHID generated and patient saved; automated toast notification.
- **Next Action**: Prompt to "Book Outpatient Consultation" or "Open Patient 360".
- **Backend Status**: **Production API Connected** (`POST /api/patients`, `GET /api/patients`).

---

### 1.2 Outpatient Appointments
- **Role**: `RECEPTIONIST`, `DOCTOR`, `NURSE`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Appointments (`/dashboard/appointments`)
- **List/Queue**: Calendar view and chronological daily OPD consultation queue with status badges (`SCHEDULED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
- **Detail**: `/dashboard/appointments/detail?id=<uuid>` showing appointment details, clinical notes, and quick action buttons.
- **Primary Action**: "Book Appointment" $\to$ Booking wizard (`/dashboard/appointments/new`).
- **Validation**: Patient selected, doctor selected, dynamic slot selection based on doctor's `slotDurationMinutes`.
- **Confirmation**: Conflict verification (Layer 2 unique index protection against concurrent double-booking).
- **Success**: Appointment confirmed; notification dispatched.
- **Next Action**: "Check-In Patient" upon hospital arrival or "Start Consultation" (if Doctor).
- **Backend Status**: **Production API Connected** (`POST /api/appointments`, `GET /api/appointments`).

---

### 1.3 Clinical Consultation & EMR
- **Role**: `DOCTOR`, `NURSE`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Clinical Workspace (`/dashboard/clinical`)
- **List/Queue**: Active encounter queue with checked-in outpatient arrivals.
- **Detail**: Dense Clinical Workstation containing:
  - Patient banner with age, gender, blood group, allergies, and warning alerts
  - Vitals entry form (BP, Pulse, RR, Temp, SpO2, Height, Weight, computed BMI)
  - Chief complaint and clinical history notes
  - ICD-10 search with primary and secondary diagnosis assignment
  - Medication ordering section (integrated prescription drafting)
  - Treatment plan and follow-up date scheduling
- **Primary Action**: "Finalize & Sign Encounter".
- **Validation**: Primary diagnosis required; at least one clinical note required.
- **Confirmation**: Irreversible finalization dialog explicitly warning of medical-legal immutability.
- **Success**: Encounter locked as `COMPLETED`; generates signed clinical record.
- **Next Action**: Any post-completion revisions require the formal "Addendum / Correction / Late Entry" amendment workflow.
- **Backend Status**: **Production API Connected** (`/api/encounters/*`).

---

### 1.4 Electronic Prescriptions
- **Role**: `DOCTOR`, `PHARMACIST`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Prescriptions (`/dashboard/prescriptions`)
- **List/Queue**: Register of all issued prescriptions with patient UHID, doctor name, and status (`DRAFT`, `ISSUED`, `PARTIALLY_DISPENSED`, `DISPENSED`, `CANCELLED`).
- **Detail**: `/dashboard/prescriptions/detail?id=<uuid>` showing medication items, dosages, frequencies, and fulfillment progress.
- **Primary Action**: Prescribe medication during encounter or from detail view.
- **Validation**: Dosage, frequency (e.g. 1-0-1), route, duration, and quantity validation.
- **Confirmation**: Finalize prescription lock.
- **Success**: Prescription transitioned to `ISSUED`; immutable official record created.
- **Next Action**: View/Print official Prescription PDF or send to Central Pharmacy Queue.
- **Backend Status**: **Production API Connected** (`/api/prescriptions/*`).

---

### 1.5 Central Pharmacy & Inventory Management
- **Role**: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Pharmacy Hub (`/dashboard/pharmacy`)
- **List/Queue**:
  - Prescription dispensing queue
  - Formulary stock overview with low-stock status
  - Physical batch table with FEFO sort order
  - Append-only stock movement ledger
- **Detail**:
  - Dispense Plan modal with authoritative FEFO primary & FIFO tie-breaker batch allocations
  - Batch detail drawer with quarantine audit status
- **Primary Action**:
  - Concurrency-safe Dispense (`POST /api/pharmacy/prescriptions/:id/dispense`)
  - Vendor Goods Receipt Note intake (`POST /api/pharmacy/stock-receipts`)
  - Physical stock adjustment (`POST /api/pharmacy/batches/:id/adjust`)
  - Batch quarantine toggle (`POST /api/pharmacy/batches/:id/quarantine`)
  - Dispense returns (`POST /api/pharmacy/returns`)
- **Validation**: Rejection of expired stock, quarantined batches, and over-dispensing.
- **Confirmation**: Modal preview of batch deductions and new prescription status (`PARTIALLY_DISPENSED` or `DISPENSED`).
- **Success**: Materialized batch balances updated and immutable `StockMovement` records written.
- **Next Action**: Generate patient dispensing receipt or restock batches.
- **Backend Status**: **Production API Connected (Phase 7)** (`/api/pharmacy/*`).

---

### 1.6 Diagnostic Pathology Laboratory
- **Role**: `LAB_TECHNICIAN`, `DOCTOR`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Laboratory (`/dashboard/laboratory`)
- **List/Queue**: Order worklist partitioned by tabs: All Orders, Specimen Collection, In Analysis, Pathologist Sign-off, Approved Reports.
- **Detail**: Order inspection modal displaying specimen tube type, collection time, test panels, units, and reference ranges.
- **Primary Action**:
  - "Collect Specimen" $\to$ Assign barcode/accession number
  - "Enter Results" $\to$ Numerical/qualitative entry with automated `NORMAL`, `HIGH`, `LOW`, `CRITICAL` flags
  - "Approve Report" $\to$ Senior pathologist digital sign-off
- **Validation**: Numerical sanity validation against biological plausibility limits.
- **Confirmation**: Critical panic value warnings highlighted in red with mandatory verbal readback acknowledgment.
- **Success**: Report transitioned to `APPROVED`; released to Patient and Ordering Doctor.
- **Next Action**: Patient can download Certified Lab Report; Doctor receives notification.
- **Backend Status**: **Development Adapter (Phase 8 Pending)**. Explicitly marked with "Adapter Mode" notice.

---

### 1.7 Billing & Cashier Desk
- **Role**: `ACCOUNTANT`, `PATIENT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Billing & Cashier (`/dashboard/billing`)
- **List/Queue**: Tabbed invoice register: All Invoices, Unpaid & Outstanding, Settled & Paid, Insurance/TPA Claims.
- **Detail**: Drawer showing itemized charges: Consultation, Diagnostic Lab Tests, Pharmacy Medications, Room charges, Subtotal, 5% GST, and Balance Due.
- **Primary Action**: "Process Payment" (Cash, Card, UPI, Bank Transfer, Insurance Pre-Auth).
- **Validation**: Amount cannot exceed balance due; reference number required for electronic transactions.
- **Confirmation**: Cashier settlement preview with GST calculation.
- **Success**: Payment recorded; generated printable receipt voucher.
- **Next Action**: Print receipt or submit TPA insurance claim.
- **Backend Status**: **Development Adapter (Phase 9 Pending)**. Explicitly marked with **"Payment Integration Pending"** badge.

---

### 1.8 Reports & Analytics
- **Role**: `HOSPITAL_ADMIN`, `ACCOUNTANT`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Reports & Analytics (`/dashboard/reports`)
- **List/Queue**: Tabbed analytics suites: Operational & Census, Department Utilization, Pharmacy & Stock Audits, Financial & Collections.
- **Detail**: Interactive charts, hour-of-day arrival distributions, average wait times, bed occupancy, doctor utilization, batch expiry brackets.
- **Primary Action**: Filter by Date Range, Department, and Attending Clinician.
- **Export**: "Download PDF Report" and "Export CSV".
- **Backend Status**: **Development Adapter / Executive Preview**.

---

### 1.9 Hospital Administration & Staff Directory
- **Role**: `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Entry**: Sidebar $\to$ Administration (`/dashboard/admin`)
- **List/Queue**: Tabbed views: Staff Directory, Departments, Facility Config, Audit Trail.
- **Detail**: Staff member detail, permissions assignment, department head designation, and audit log history.
- **Primary Action**: "Create Staff User" & "Assign Role".
- **Validation**: Corporate email format, strong password, role selection, department assignment.
- **Success**: Staff profile provisioned.
- **Backend Status**: **UI Complete / Role Guards Active**.

---

### 1.10 Settings
- **Role**: All Roles (tailored by permissions)
- **Entry**: Sidebar $\to$ Settings (`/dashboard/settings`)
- **Tabs**: User Profile, Hospital Parameters, Alerts & Notifications, Security & Auth.
- **Primary Action**: Update personal profile, change notification preferences, or configure OPD slot defaults.
- **Validation**: Required fields, email format.
- **Success**: Saved confirmation banner.
- **Backend Status**: **UI Complete**.
