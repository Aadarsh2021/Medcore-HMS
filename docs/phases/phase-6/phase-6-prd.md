# PHASE 6 — PRODUCT REQUIREMENTS DOCUMENT (PRD)
# MedCore HMS — Prescription Management & Clinical Medication Ordering

**Status:** APPROVED FOR PLANNING  
**Phase:** 6  
**Document Version:** 1.0.0  

---

## 1. Feature Overview

The Prescription Management & Clinical Medication Ordering module enables licensed healthcare providers (Doctors) to safely, efficiently, and legally prescribe medications to patients during clinical encounters. Prescriptions are formulated in draft mode during the encounter, validated against clinical standards (dosage, form, frequency, duration, route, instructions), digitally signed upon finalization, and rendered into a tamper-evident, professional PDF document securely stored in private cloud storage.

---

## 2. Core Functional Requirements

### FR-1: Searchable Medicine Master
- Doctors must be able to search the hospital's medicine catalog in real time.
- Search must support case-insensitive querying by brand name or generic compound name.
- Results must be paginated and capped (maximum 50 results per query) to prevent unbounded memory usage.
- Catalog items provide pre-populated dosage forms (Tablet, Capsule, Syrup, Injection, etc.) and strengths.
- Custom doctor-entered medicines must be supported as a clinical fallback for unlisted compounds.

### FR-2: Prescription Formulation & Draft Lifecycle
- A prescription can only be drafted when an encounter is in `IN_PROGRESS` status.
- Only the assigned doctor of the encounter may formulate the prescription.
- A draft prescription may have items added, updated, or removed freely during the encounter.
- Each item must capture:
  - Medicine name & form
  - Strength (e.g., 500 mg, 10 mg/ml)
  - Dosage (e.g., "1 tablet", "5 ml")
  - Frequency (OD, BD, TDS, QID, PRN, SOS, STAT)
  - Duration in days (minimum 1 day)
  - Route (Oral, IV, IM, Topical, Inhalation, etc.)
  - Specific patient instructions (e.g., "Take after food with plenty of water")
  - Calculated or prescribed quantity

### FR-3: Digital Signature & Finalization
- Finalizing a prescription atomically locks the prescription against any further edits.
- Requires at least one valid medication item.
- Generates a collision-free, human-readable prescription number: `RX-{HOSPITAL_CODE}-{YYYY}-{SEQUENTIAL_6_DIGIT}`.
- Applies the attending doctor's digital sign-off, embedding the doctor's name, medical council license number, and signature graphic.
- Generates the official clinical PDF and uploads it to private S3.

### FR-4: Clinical Immutability & Audited Voiding
- Once in `ISSUED` status, the prescription is **immutable**.
- An `ISSUED` prescription cannot be edited or deleted via API.
- If an error was made, the prescribing doctor or hospital administrator can **void/cancel** the prescription by providing an explicit, non-empty clinical justification (minimum 5 characters).
- Voiding transitions the status to `CANCELLED`, records `voidedAt`, `voidReason`, and `voidedById`, and writes an immutable audit record. The original prescription remains preserved in patient history.

### FR-5: Secure PDF Generation & Access
- The prescription PDF must contain:
  - Official hospital header (Name, Address, Registration, Contact)
  - Patient banner (Name, Age, Gender, UHID, Date)
  - Doctor banner (Name, Department, Medical License Number)
  - Rx medication order table
  - Doctor signature overlay + license seal
  - Tamper-evident verification hash
- The PDF binary is never stored in PostgreSQL.
- Access to the PDF is restricted to authorized roles via 15-minute temporary pre-signed S3 download URLs.

### FR-6: Patient Access
- Patients can view their own `ISSUED` and `CANCELLED` prescriptions.
- Patients **cannot** view draft prescriptions of other or ongoing encounters.
- Patients can download their finalized prescription PDFs.
- Patients cannot create, edit, finalize, or void prescriptions.

---

## 3. Explicit Non-Goals (Out of Scope for Phase 6)

1. **Pharmacy Inventory & Dispensing:** Stock level decrementing, batch allocation, expiry checking, quarantine, and FIFO dispensing belong strictly to Phase 7/8 (Pharmacy).
2. **Billing & Payments:** Invoicing, consultation fee collection, insurance claims, and payment gateways belong to the Billing module.
3. **External Notifications:** WhatsApp, SMS, or email dispatch of prescriptions belong to the Notifications module.
4. **Drug-Drug Interaction AI:** Automated clinical rule-checking against international pharmacology databases is out of scope for this version.
