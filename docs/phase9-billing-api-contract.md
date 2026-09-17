# Phase 9 — Billing, Invoicing & Payments: API Contract

## 1. Overview
The Billing, Invoicing & Payments API exposes endpoints under `/api/billing/` for managing the complete healthcare revenue lifecycle: itemized invoice creation, server-authoritative financial calculation, invoice issuance and voiding, concurrency-safe payment collection, partial payments, audited refunds, webhook ingestion, patient invoice self-service, and financial summary reporting.

All endpoints (except public webhooks) require:
- `Authorization: Bearer <supabase_jwt>`
- `x-hospital-id: <hospital_uuid>` (when accessed by staff / multi-tenant users)

---

## 2. API Endpoints

### 2.1 Invoices

#### `POST /api/billing/invoices`
Creates an itemized patient invoice in `DRAFT` status with server-authoritative financial computation.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `SUPER_ADMIN`
- **Request Body**:
```json
{
  "patientId": "uuid",
  "appointmentId": "uuid (optional)",
  "encounterId": "uuid (optional)",
  "dueDate": "2026-10-01T00:00:00.000Z (optional)",
  "notes": "Post-procedure outpatient billing (optional)",
  "items": [
    {
      "type": "CONSULTATION",
      "description": "Cardiology Specialist Consultation",
      "quantity": 1,
      "unitPrice": 800.0,
      "discount": 50.0,
      "tax": 37.5
    },
    {
      "type": "LAB_TEST",
      "description": "Lipid Profile Test",
      "quantity": 1,
      "unitPrice": 450.0,
      "discount": 0.0,
      "tax": 22.5
    }
  ]
}
```
- **Response Shape** (HTTP 201):
```json
{
  "id": "uuid",
  "hospitalId": "uuid",
  "patientId": "uuid",
  "patientUhid": "UHID-2026-0001",
  "patientName": "Rohan Kapoor",
  "patientPhone": "+91 9876543210",
  "appointmentId": "uuid",
  "encounterId": "uuid",
  "invoiceNumber": "INV-2026-000001",
  "currency": "INR",
  "subtotal": 1250.0,
  "discountAmount": 50.0,
  "taxAmount": 60.0,
  "totalAmount": 1260.0,
  "paidAmount": 0.0,
  "refundedAmount": 0.0,
  "outstandingAmount": 1260.0,
  "status": "DRAFT",
  "issueDate": null,
  "dueDate": "2026-10-01T00:00:00.000Z",
  "notes": "Post-procedure outpatient billing",
  "items": [
    {
      "id": "uuid",
      "type": "CONSULTATION",
      "description": "Cardiology Specialist Consultation",
      "quantity": 1,
      "unitPrice": 800.0,
      "discount": 50.0,
      "tax": 37.5,
      "totalPrice": 787.5
    }
  ],
  "payments": [],
  "refunds": [],
  "createdAt": "2026-09-17T11:00:00.000Z",
  "updatedAt": "2026-09-17T11:00:00.000Z"
}
```

#### `GET /api/billing/invoices`
Queries invoices with filtering and bounded pagination.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `DOCTOR`, `SUPER_ADMIN`
- **Query Parameters**:
  - `status` (`DRAFT` | `ISSUED` | `PARTIALLY_PAID` | `PAID` | `VOID`)
  - `patientId` (uuid)
  - `search` (string: invoice number, patient name, patient UHID)
  - `startDate` / `endDate` (ISO date string)
  - `page` (number, default 1)
  - `limit` (number, default 20, max 100)

#### `GET /api/billing/invoices/:id`
Retrieves comprehensive details for a single invoice.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `DOCTOR`, `PATIENT`, `SUPER_ADMIN`
- Enforces patient identity verification when caller is `PATIENT`.

#### `PUT /api/billing/invoices/:id`
Updates an unissued invoice draft. Once `ISSUED`, line items and prices are immutable.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `SUPER_ADMIN`

#### `POST /api/billing/invoices/:id/issue`
Finalizes and issues an invoice, locking line items permanently and permitting payments.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `SUPER_ADMIN`

#### `POST /api/billing/invoices/:id/void`
Voids an uncollected or fully refunded invoice.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Request Body**:
```json
{
  "reason": "Duplicate bill entered in error"
}
```

---

### 2.2 Payments

#### `POST /api/billing/invoices/:id/payments`
Records a payment transaction against an issued invoice with row-level locking.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `SUPER_ADMIN`
- **Headers**:
  - `Idempotency-Key: <unique_key>` (optional, prevents double deduction)
- **Request Body**:
```json
{
  "amount": 500.0,
  "method": "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "INSURANCE",
  "provider": "MANUAL",
  "transactionReference": "UPI/987654321/HDFC",
  "idempotencyKey": "idem_abc123 (optional)"
}
```
- **Response Shape** (HTTP 201):
```json
{
  "payment": {
    "id": "uuid",
    "hospitalId": "uuid",
    "invoiceId": "uuid",
    "paymentNumber": "PAY-2026-000001",
    "amount": 500.0,
    "currency": "INR",
    "method": "UPI",
    "status": "SUCCESS",
    "provider": "MANUAL",
    "transactionReference": "UPI/987654321/HDFC",
    "paidAt": "2026-09-17T11:15:00.000Z",
    "createdAt": "2026-09-17T11:15:00.000Z"
  },
  "invoice": {
    "id": "uuid",
    "invoiceNumber": "INV-2026-000001",
    "totalAmount": 1260.0,
    "paidAmount": 500.0,
    "outstandingAmount": 760.0,
    "status": "PARTIALLY_PAID"
  }
}
```

#### `GET /api/billing/invoices/:id/payments`
Returns all payment transactions associated with the invoice.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `RECEPTIONIST`, `DOCTOR`, `PATIENT`, `SUPER_ADMIN`

---

### 2.3 Refunds

#### `POST /api/billing/payments/:id/refund`
Issues a partial or full refund against a completed payment.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Headers**:
  - `Idempotency-Key: <unique_key>` (optional)
- **Request Body**:
```json
{
  "amount": 200.0,
  "reason": "Unused medication return approved by pharmacy",
  "idempotencyKey": "idem_ref_123 (optional)"
}
```
- **Response Shape** (HTTP 201):
```json
{
  "refund": {
    "id": "uuid",
    "hospitalId": "uuid",
    "paymentId": "uuid",
    "invoiceId": "uuid",
    "amount": 200.0,
    "reason": "Unused medication return approved by pharmacy",
    "status": "SUCCESS",
    "processedAt": "2026-09-17T11:20:00.000Z",
    "createdAt": "2026-09-17T11:20:00.000Z"
  },
  "invoice": {
    "id": "uuid",
    "invoiceNumber": "INV-2026-000001",
    "paidAmount": 500.0,
    "refundedAmount": 200.0,
    "status": "PARTIALLY_PAID"
  }
}
```

---

### 2.4 Webhooks

#### `POST /api/billing/webhooks/:provider`
Public webhook endpoint for asynchronous payment confirmation from external gateways (Razorpay, Stripe).
- **Headers**:
  - Stripe: `Stripe-Signature: t=...,v1=...`
  - Razorpay: `X-Razorpay-Signature: ...`
- **Behavior**:
  - Rejects unauthenticated or invalid HMAC signatures with HTTP 401.
  - Enforces event idempotency: duplicate event IDs return `{ "status": "IGNORED_DUPLICATE" }`.
  - Reconciles payment and invoice status in an interactive transaction.

---

### 2.5 Patient Billing Self-Service

#### `GET /api/billing/patients/:patientId/invoices`
Returns invoices belonging strictly to the requested patient.
- **Roles**: `PATIENT`, `ACCOUNTANT`, `HOSPITAL_ADMIN`, `DOCTOR`, `SUPER_ADMIN`
- Patients cannot access records of any other patient.

---

### 2.6 Financial Reporting

#### `GET /api/billing/reports/summary`
Returns aggregate hospital billing analytics.
- **Roles**: `ACCOUNTANT`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Response Shape**:
```json
{
  "totalInvoiced": 458000.0,
  "totalPaid": 395000.0,
  "totalOutstanding": 63000.0,
  "totalRefunded": 4500.0,
  "invoiceCount": 342
}
```
