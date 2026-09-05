# PHASE 6 — ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
# MedCore HMS — Prescription Management & Clinical Medication Ordering

**Status:** APPROVED FOR PLANNING  
**Document Version:** 1.0.0  

---

## 1. System Roles in MedCore HMS

1. `SUPER_ADMIN`: Platform-level operator.
2. `HOSPITAL_ADMIN`: Hospital branch administrator.
3. `DOCTOR`: Attending licensed physician.
4. `NURSE`: Ward and clinic nurse.
5. `RECEPTIONIST`: Front desk registration and scheduling.
6. `PHARMACIST`: Pharmacy manager and medication dispenser.
7. `PATIENT`: Verified patient user.

---

## 2. Comprehensive RBAC Permissions Matrix

| Operation / Endpoint | SUPER_ADMIN | HOSPITAL_ADMIN | DOCTOR (Assigned) | DOCTOR (Other) | NURSE | RECEPTIONIST | PHARMACIST | PATIENT |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Search Medicines**<br>`GET /api/medicines/search` | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | DENY | ALLOW | DENY |
| **Create Draft Prescription**<br>`POST /api/encounters/:id/prescriptions` | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| **Get Draft Prescription**<br>`GET /api/prescriptions/:id` (DRAFT) | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| **Update Draft Items & Notes**<br>`PUT /api/prescriptions/:id` | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| **Finalize Prescription & Sign**<br>`POST /api/prescriptions/:id/finalize` | DENY | DENY | ALLOW | DENY | DENY | DENY | DENY | DENY |
| **Void / Cancel Prescription**<br>`POST /api/prescriptions/:id/void` | ALLOW | ALLOW | ALLOW (Author) | DENY | DENY | DENY | DENY | DENY |
| **View Finalized Prescription**<br>`GET /api/prescriptions/:id` (ISSUED) | ALLOW | ALLOW | ALLOW | ALLOW (Tenant) | ALLOW (Tenant) | DENY | ALLOW (Tenant) | ALLOW (Own Only) |
| **Get Signed PDF Download URL**<br>`GET /api/prescriptions/:id/pdf/url` | ALLOW | ALLOW | ALLOW | ALLOW (Tenant) | ALLOW (Tenant) | DENY | ALLOW (Tenant) | ALLOW (Own Only) |
| **List Patient Prescriptions**<br>`GET /api/patients/:patientId/prescriptions` | ALLOW | ALLOW | ALLOW | ALLOW (Tenant) | ALLOW (Tenant) | DENY | ALLOW (Tenant) | ALLOW (Own Only) |

---

## 3. Enforcement Layers

1. **Authentication:** All endpoints require a valid Supabase JWT Bearer token via `SupabaseAuthGuard`.
2. **Tenant Isolation:** Enforced via `TenantGuard`. Users cannot access prescriptions belonging to another hospital tenant under any circumstance.
3. **Role Validation:** Enforced via NestJS `@Roles(...)` decorator and `RolesGuard`.
4. **Clinical Object Ownership:**
   - For `POST /api/encounters/:id/prescriptions` and `POST /api/prescriptions/:id/finalize`: Controller verifies `authenticatedDoctor.id === encounter.doctorId`.
   - For `GET /api/patients/:patientId/prescriptions`: If caller is a `PATIENT`, controller enforces `authenticatedPatient.id === patientId`.
