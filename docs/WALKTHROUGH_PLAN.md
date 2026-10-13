# MedCore HMS — Video Walkthrough Plan (5–8 Minutes)

This structured walkthrough script covers the complete clinical, operational, and financial lifecycle of MedCore HMS across multiple user roles.

---

## Video Specifications
- **Duration**: 6 minutes 30 seconds (within the 5–8 minute PRD requirement)
- **Resolution**: 1080p 60fps
- **Audio**: Clear clinical/technical narration with microphone
- **Environment**: Staging web frontend connected to live Supabase backend

---

## Scene-by-Scene Script

### 0:00 – 0:45 | Part 1: Executive Overview & Multi-Tenancy
- **Screen**: Landing page and Login screen (`/login`).
- **Narration**:
  > "Welcome to MedCore HMS, an enterprise multi-tenant cloud-native Hospital Management System. MedCore HMS connects outpatient registration, clinical EMR, diagnostic laboratory orders, pharmacy inventory with FEFO dispensing, itemized billing, and inpatient beds under a unified platform."
- **Action**: Highlight the Hospital Tenant selector, demonstrating that users log into scoped tenants (e.g., Metro General Hospital vs. Apex Super Speciality).

### 0:45 – 1:45 | Part 2: Outpatient Registration & UHID Generation (Receptionist)
- **Screen**: Receptionist Dashboard -> Patient Registration (`/dashboard/patients/new`).
- **Narration**:
  > "Logging in as the Reception Desk, we register a new patient. The system collects demographics, emergency contacts, and structured addresses. Upon submission, our concurrency-safe PostgreSQL sequence automatically issues a strictly unique, collision-free UHID: METRO-2026-00021."
- **Action**: Register demo patient, verify instantaneous UHID generation, and navigate to the appointment booking calendar to schedule a consultation with Dr. Rajesh Sharma.

### 1:45 – 3:00 | Part 3: Clinical Encounter, EMR & Prescriptions (Doctor)
- **Screen**: Doctor Portal (`/dashboard/clinical` & `/dashboard/appointments/detail`).
- **Narration**:
  > "Switching to the Doctor portal, Dr. Sharma sees today's appointment queue. Clicking 'Start Encounter' atomically transitions the appointment to IN_PROGRESS. We record clinical vitals — height and weight are entered, and BMI is computed server-side to prevent tampering."
- **Action**:
  - Add chief complaint and differential diagnosis mapped to ICD-10 (`J06.9 - Acute Upper Respiratory Infection`).
  - Add prescription item: Amoxicillin 500mg, form Tablet, frequency TDS for 5 days.
  - Order Diagnostic Lab Test: Complete Blood Count (CBC).
  - Click 'Finalize Encounter'. Point out that finalized clinical records are immutable and append-only.

### 3:00 – 4:00 | Part 4: Laboratory Processing & Pathologist Certification (Lab Tech & Doctor)
- **Screen**: Laboratory Module (`/dashboard/laboratory`).
- **Narration**:
  > "In the Laboratory module, the technician views the pending sample queue. The CBC order has accession number ACC-2026-000042. The sample is collected and processed. Results are entered into structured parameters: Haemoglobin, WBC, and Platelets."
- **Action**:
  - Show out-of-range value triggering automated red `CRITICAL` panic flag.
  - Doctor reviews the report and applies certification. Explain that row-locking prevents duplicate concurrent approvals.

### 4:00 – 4:45 | Part 5: Pharmacy Inventory & FEFO Dispensing (Pharmacist)
- **Screen**: Pharmacy Inventory (`/dashboard/pharmacy`).
- **Narration**:
  > "At the Pharmacy, the dispensing queue displays Dr. Sharma's issued prescription. MedCore HMS enforces First-Expired, First-Out (FEFO) dispensing. Expired batches are automatically quarantined and cannot be dispensed."
- **Action**: Dispense the prescription, showing live inventory deduction and batch allocation.

### 4:45 – 5:30 | Part 6: Itemized Billing & Payment Settlement (Accountant)
- **Screen**: Billing Dashboard (`/dashboard/billing/invoices`).
- **Narration**:
  > "The billing module aggregates charges across all rendered services: consultation fee, lab test, and dispensed pharmacy items into a single itemized invoice."
- **Action**:
  - View the generated invoice `INV-2026-000105`.
  - Demonstrate payment recording via UPI/Card and explain Stripe/Razorpay cryptographic webhook verification with HMAC.
  - Show status update to `PAID`.

### 5:30 – 6:15 | Part 7: Patient Self-Service Portal & Hospital Admin KPIs
- **Screen**: Patient Portal (`/dashboard/reports`) & Hospital Admin Dashboard (`/dashboard/admin`).
- **Narration**:
  > "In the Patient Portal, patients securely access their own certified lab reports, download signed prescription PDFs, and view payment receipts. Crucially, strict tenant and ownership authorization blocks patients from accessing any other patient's data."
  > "Finally, the Hospital Admin dashboard provides executive visibility into patient volume charts, department bed occupancy heatmaps, and low-stock inventory warnings."

### 6:15 – 6:30 | Part 8: Conclusion & Verification
- **Screen**: Terminal showing test suite regression (410 tests passing).
- **Narration**:
  > "MedCore HMS is backed by 410 automated tests covering tenant boundaries, concurrency safety, and clinical immutability. The architecture is production-ready and fully certified against the PRD."
