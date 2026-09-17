# Phase 9 — Billing, Invoicing & Payments: Role-Based Access Control (RBAC)

## 1. Overview & Principle of Least Privilege

Healthcare financial transactions require strict role separation between revenue cycle staff (Accountants, Cashiers), clinical staff (Doctors, Nurses, Pharmacists, Lab Techs), facility governance (Hospital Admins), and patient self-service.

Under MedCore HMS security governance:
1. **Financial Operations Authority**: Only `ACCOUNTANT` and `HOSPITAL_ADMIN` have unrestricted financial management rights (creating invoices, issuing invoices, voiding, recording payments, issuing refunds, and viewing revenue ledgers).
2. **Operational Cashiering Boundary**: `RECEPTIONIST` can create routine invoices for walk-ins and collect payments against issued invoices. Receptionists **cannot** issue refunds or void invoices without supervisory approval.
3. **Clinical Billing Boundary**: `DOCTOR` may inspect billing records associated with their clinical encounters, but **cannot** edit financial totals, void invoices, collect payments, or issue refunds.
4. **Specialized Clinical Restraints**: `LAB_TECHNICIAN`, `PHARMACIST`, and `NURSE` are blocked from unrestricted billing administration.
5. **Patient Privacy**: `PATIENT` can only view invoices and payment history belonging strictly to their own patient profile.

---

## 2. Definitive RBAC Permission Matrix

| Billing Action / Endpoint | SUPER_ADMIN | HOSPITAL_ADMIN | ACCOUNTANT | RECEPTIONIST | DOCTOR | PATIENT | LAB_TECH | PHARMACIST | NURSE |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Create Invoice** (`POST /invoices`) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Invoices Queue** (`GET /invoices`) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **View Single Invoice** (`GET /invoices/:id`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (Own only) | ❌ | ❌ | ❌ |
| **Update Draft** (`PUT /invoices/:id`) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Issue Invoice** (`POST /invoices/:id/issue`) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Void Invoice** (`POST /invoices/:id/void`) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Record Payment** (`POST /invoices/:id/payments`) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Payments** (`GET /invoices/:id/payments`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (Own only) | ❌ | ❌ | ❌ |
| **Issue Refund** (`POST /payments/:id/refund`) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Patient Invoices** (`GET /patients/:id/invoices`) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (Own only) | ❌ | ❌ | ❌ |
| **Revenue Summary** (`GET /reports/summary`) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Inbound Webhook** (`POST /webhooks/:provider`) | N/A (HMAC Signature Verified) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

---

## 3. Multi-Layered Enforcement Architecture

1. **Route Level Guards**:
   - `SupabaseAuthGuard`: Validates cryptographic authenticity of Supabase JWT.
   - `RolesGuard`: Verifies caller's active role against `@Roles(...)` metadata.
   - `TenantGuard`: Enforces active facility tenancy and validates `x-hospital-id`.
2. **Service Level Authorization Checks**:
   - `getInvoiceById`: Enforces caller ownership when `actor.role === UserRole.PATIENT`. Cross-patient access attempts throw HTTP 403 `ForbiddenException`.
   - `voidInvoice`: Enforces unrefunded payment checks.
   - `createRefund`: Verifies target payment and invoice exist in the caller's active hospital.
3. **Database Extension Isolation**:
   - `prisma-tenant.extension.ts`: Automatically injects `hospitalId` on read/write queries for all billing models (`Invoice`, `InvoiceItem`, `Payment`, `Refund`, `InvoiceNumberCounter`, `PaymentNumberCounter`, `IdempotencyRecord`).
