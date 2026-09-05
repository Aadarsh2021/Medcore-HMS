# PHASE 6 — COMPREHENSIVE TEST PLAN
# MedCore HMS — Prescription Management & Clinical Medication Ordering

**Status:** APPROVED FOR PLANNING  
**Document Version:** 1.0.0  

---

## 1. Test Architecture & Coverage Matrix

Testing for Phase 6 spans 10 critical verification areas:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PHASE 6 TEST SPECIFICATION                      │
├────────────────────────┬───────────────────────────────────────────────┤
│ Group A: Auth & RBAC   │ Doctor assignment, patient isolation, staff   │
│ Group B: Draft Life    │ Create, item upsert, empty reject, discard    │
│ Group C: Finalization  │ Validation, number allocation, PDF generation │
│ Group D: Immutability  │ Reject edit/delete on ISSUED records (409)    │
│ Group E: Voiding       │ Reason validation, status change, audit log   │
│ Group F: Medicine Cat  │ Bounded pagination, case-insensitive search   │
│ Group G: PDF & S3      │ Buffer compilation, signed URL expiry (15m)   │
│ Group H: Tenancy       │ Hospital A vs Hospital B isolation            │
│ Group I: Patient View  │ Patient sees own ISSUED, denied draft/others  │
│ Group J: Regression    │ 120/120 Phase 1–5 tests continue to pass      │
└────────────────────────┴───────────────────────────────────────────────┘
```

---

## 2. Test Cases Breakdown

### Group A: Authentication, Authorization & Roles
1. **`test_doctor_assignment_enforced`**: Doctor A cannot create or finalize a prescription for Doctor B's encounter.
2. **`test_unauthorized_role_rejected`**: Nurse or Receptionist attempting to create or finalize prescription receives HTTP 403.
3. **`test_patient_mutation_rejected`**: Patient attempting to modify prescription receives HTTP 403.

### Group B: Draft Lifecycle & Item Validation
4. **`test_draft_creation_success`**: Assigned doctor initializes draft prescription for `IN_PROGRESS` encounter.
5. **`test_draft_item_upsert`**: Doctor adds 2 items with valid dosage, frequency, and instructions.
6. **`test_empty_prescription_finalization_rejected`**: Finalizing a draft with zero items is rejected with HTTP 422.
7. **`test_invalid_item_duration_rejected`**: Item with `durationDays <= 0` is rejected with HTTP 400.

### Group C: Finalization & Sequential Numbering
8. **`test_prescription_finalization_success`**: Draft transitions to `ISSUED`, receives sequential `prescriptionNumber` (`RX-MGH-2026-000001`), generates PDF, and uploads to S3.
9. **`test_double_finalization_concurrency`**: Two concurrent finalization requests result in exactly one successful transition; second returns HTTP 409 or existing record.
10. **`test_encounter_not_in_progress_rejected`**: Finalizing prescription for `COMPLETED` encounter is rejected.

### Group D: Immutability Enforcement
11. **`test_issued_prescription_edit_rejected`**: `PUT /api/prescriptions/:id` on `ISSUED` prescription returns HTTP 409 Conflict.
12. **`test_issued_prescription_delete_rejected`**: `DELETE /api/prescriptions/:id` on `ISSUED` prescription returns HTTP 409 Conflict.

### Group E: Voiding & Audited Cancellation
13. **`test_void_prescription_success`**: Doctor voids `ISSUED` prescription with valid reason. Status changes to `CANCELLED`, audit entry logged.
14. **`test_void_empty_reason_rejected`**: Voiding without reason or reason < 5 chars returns HTTP 400.
15. **`test_unauthorized_void_rejected`**: Unrelated doctor cannot void prescription.

### Group F: Medicine Catalog & Search
16. **`test_medicine_search_case_insensitive`**: Searching "amox" matches "Amoxicillin 500mg".
17. **`test_medicine_search_bounded_pagination`**: Request with `limit=100` is clamped to 50 results.

### Group G: PDF Generation & S3 Storage
18. **`test_pdf_buffer_generated`**: PDF generator outputs valid `%PDF-1.x` buffer with letterhead and signature.
19. **`test_signed_download_url_expiry`**: Generated pre-signed URL contains valid expiration token.

### Group H: Tenant Isolation
20. **`test_cross_tenant_prescription_access_rejected`**: Hospital B doctor cannot view or download Hospital A prescription (HTTP 404/403).

### Group I: Patient Self-Service Access
21. **`test_patient_can_view_own_issued_prescription`**: Patient retrieves own `ISSUED` prescription and download URL.
22. **`test_patient_cannot_view_draft`**: Patient querying draft prescription receives HTTP 403/404.
23. **`test_patient_cannot_view_other_patient_rx`**: Patient A querying Patient B prescription receives HTTP 403 Forbidden.

### Group J: Full Phase 1–5 Regression
24. **`test_phase_1_to_5_regression`**: Run existing 120 tests to ensure zero regressions across Auth, Patients, Doctors, Appointments, and EMR.
