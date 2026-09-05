# PHASE 6 — IMPLEMENTATION PLAN
# MedCore HMS — Prescription Management & Clinical Medication Ordering

**Status:** AWAITING IMPLEMENTATION APPROVAL  
**Document Version:** 1.0.0  

---

## 1. Safety & Architecture Invariants

- **Phase 4 & Phase 5 Freeze:** Phase 4 Appointment Booking and Phase 5 Clinical Encounters & EMR remain strictly frozen.
- **Medication History ≠ Prescription:** `MedicationHistory` (patient chronic history) and `Prescription` (acute clinical order) remain completely separate models.
- **Pharmacy & Billing Out of Scope:** Dispensing, batch stock deduction, FIFO fulfillment, and invoices are strictly deferred to future Pharmacy and Billing phases.

---

## 2. The 15 Implementation Steps

1. **Step 1: Database Schema & Migration**
   - Extend `PrescriptionStatus` with `DRAFT` status.
   - Extend `Prescription` with `prescriptionNumber` (unique per hospital), `issuedAt`, `voidedAt`, `voidReason`, `voidedById`.
   - Extend `PrescriptionItem` with snapshot fields (`medicineName`, `form`, `strength`, `quantity`).
   - Run `prisma migrate dev --name add_phase_6_prescription_lifecycle`.

2. **Step 2: Shared TypeScript Contracts (`@medcore/types`)**
   - Define prescription request and response DTOs, enums (`PrescriptionStatus`, `PrescriptionFrequency`).

3. **Step 3: Seed Hospital Essential Medicines**
   - Add 30+ WHO / NLEM essential medicines per hospital tenant in `prisma/seed.ts`.

4. **Step 4: Medicine Master Search Module**
   - Build `GET /api/medicines/search` with case-insensitive `ILIKE` / `contains` querying, bounded pagination (max 50).

5. **Step 5: Prescription Domain Service & Draft Management**
   - Implement `getOrCreateDraft` for active encounters. Doctor authorization enforced.

6. **Step 6: Prescription Items & Dosage Management**
   - Implement atomic item replacement on draft prescriptions with validation.

7. **Step 7: Immutability & Finalization Workflow**
   - Implement `finalizePrescription`: assign sequential `prescriptionNumber`, set `ISSUED`, lock record against mutation.

8. **Step 8: Audited Voiding / Cancellation Workflow**
   - Implement `voidPrescription` requiring clinical justification, marking `CANCELLED`, preserving audit trail.

9. **Step 9: Deterministic PDF Generation (`pdfkit`)**
   - Build `PrescriptionPdfService` compiling vector PDF with hospital letterhead, Rx table, and doctor digital signature.

10. **Step 10: S3 PDF Storage & Pre-signed URL Retrieval**
    - Connect with `StorageService` to store PDF at `prescriptions/{hospitalId}/{patientId}/{prescriptionNumber}.pdf` and generate 15-minute temporary URLs.

11. **Step 11: API Controller & Route Guards**
    - Implement `PrescriptionsController` with `SupabaseAuthGuard`, `RolesGuard`, and `TenantGuard`.

12. **Step 12: Automated Integration Tests**
    - Implement `apps/api/test/prescriptions.e2e-spec.ts` covering all 24 test cases.

13. **Step 13: Doctor Clinical Workspace Frontend**
    - Integrate medicine search autocomplete, item builder, and "Finalize & Sign" button into `DoctorClinicalWorkspacePage`.

14. **Step 14: Patient Portal Finalized Prescription View**
    - Provide patient self-service view for finalized prescriptions and signed PDF download.

15. **Step 15: Full Regression & Verification**
    - Run all test suites (120+ existing tests + Phase 6 tests) and verify all builds pass.
