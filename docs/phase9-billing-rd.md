# Phase 9 — Billing, Invoicing & Payments: Research & Discovery (R&D)

**Project**: MedCore HMS  
**Phase**: Phase 9 — Billing, Invoicing & Payments  
**Date**: September 17, 2026  
**Status**: COMPLETE

---

## 1. Existing Capabilities & Repository Findings

### 1.1 Database Schema (`prisma/schema.prisma`)
- Basic `Invoice`, `InvoiceItem`, and `Payment` models exist from earlier bootstrap definitions, but lack enterprise financial robustness:
  - `Invoice` has basic decimal fields (`subtotal`, `taxAmount`, `discountAmount`, `totalAmount`, `paidAmount`) and `status` (`DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`).
  - Missing on `Invoice`: `refundedAmount`, `currency`, `issuedAt`, `issuedById`, `voidedAt`, `voidedById`, `voidReason`, `notes`, `createdById`.
  - Missing on `InvoiceItem`: Line-item `discount`, line-item `tax`, cross-service linkage fields (`prescriptionId`, `dispenseId`, `labOrderId`, `labTestId`, `appointmentId`, `encounterId`).
  - Missing on `Payment`: `paymentNumber` / receipt sequence, `provider` (`MANUAL`, `RAZORPAY`, `STRIPE`), `providerPaymentId`, `providerOrderId`, `failureReason`, `createdById`.
  - Completely missing models:
    - `Refund`: Crucial for clinical/financial reversals without destroying original payments or mutating historical invoices.
    - `PaymentProviderEvent` / `WebhookEvent`: Necessary for secure, idempotent webhook processing.
    - `InvoiceNumberCounter` & `PaymentNumberCounter`: Necessary for concurrency-safe sequential identifiers (`INV-YYYY-000001`, `PAY-YYYY-000001`).
    - `IdempotencyRecord`: Necessary for tenant-scoped, replay-safe financial mutations.
- Enums:
  - `InvoiceStatus` (`DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`).
  - `InvoiceItemType` (`CONSULTATION`, `LAB_TEST`, `PHARMACY`, `PROCEDURE`, `ROOM`, `OTHER`).
  - `PaymentMethod` (`CASH`, `CARD`, `STRIPE`, `RAZORPAY`, `BANK_TRANSFER`, `INSURANCE`). Needs `UPI`.
  - `PaymentStatus` (`PENDING`, `SUCCESS`, `FAILED`, `REFUNDED`). Needs `PROCESSING` for asynchronous gateway lifecycles.

### 1.2 Tenant Isolation (`apps/api/src/database/prisma-tenant.extension.ts`)
- `Invoice` and `Payment` are already registered in `DIRECT_TENANT_MODELS`.
- `InvoiceItem` is registered in `INDIRECT_TENANT_MODELS`.
- `IdempotencyRecord` was already reserved in `DIRECT_TENANT_MODELS`.
- Needs registration:
  - `Refund` (Direct tenant model: `hospitalId`).
  - `PaymentProviderEvent` (Direct tenant model or system event).
  - `InvoiceNumberCounter` (Direct tenant model).
  - `PaymentNumberCounter` (Direct tenant model).
  - `RELATION_TENANT_CONSTRAINTS`: Ensure `Refund` requires matching `invoiceId` and `paymentId` within the active hospital tenant; ensure `InvoiceItem` references belong to the same hospital.

### 1.3 Backend Modules (`apps/api/src/modules/`)
- `apps/api/src/modules/payments/` exists as an empty placeholder.
- We will consolidate Phase 9 under `apps/api/src/modules/billing/` containing:
  - `billing.controller.ts`: Invoices, payments, refunds, webhooks, patient billing, reports.
  - `billing.service.ts`: Core state machine, transactional payment execution with row locks, refund validations, audit trails.
  - `invoice-number.service.ts`: Atomic PostgreSQL sequence generation for `INV-YYYY-000001` and `PAY-YYYY-000001`.
  - `financial-calculator.ts`: Server-authoritative decimal arithmetic (zero JavaScript float rounding errors).
  - `idempotency.service.ts`: Multi-tenant idempotency engine with SHA-256 payload matching and replay.
  - `payment-provider.service.ts`: Provider abstraction (Gateway Order Creation, Webhook Signature Verification, Webhook Ingestion, Refund Dispatch) supporting `MANUAL`, `RAZORPAY`, and `STRIPE` without fake production success.
  - `dto/`: Strict DTOs using `class-validator` and `class-transformer`.

### 1.4 Frontend State (`apps/web/src/lib/api/billing.service.ts` & `BillingHubContent.tsx`)
- Frontend currently relies on an in-memory mock adapter (`SEED_INVOICES`, fake Math.random receipts).
- The UI exposes an invoice list, invoice detail drawer, status filtering, payment modal with cash/card/UPI/insurance options, line-item display, and receipt viewing.
- We will replace the in-memory adapter with live API calls to `/api/billing/` via `apiClient`, faithfully preserving server-calculated totals, real receipts, real error states, and zero fake payment success.

### 1.5 Shared Types (`packages/types/src/index.ts`)
- Contains basic `InvoiceStatus`, `InvoiceItemType`, `PaymentMethod`, `PaymentStatus`.
- Will be expanded to include:
  - `PaymentMethod.UPI = 'UPI'`
  - `PaymentStatus.PROCESSING = 'PROCESSING'`
  - `RefundStatus` (`PENDING`, `SUCCESS`, `FAILED`)
  - Contracts: `InvoiceResponse`, `InvoiceLineItemContract`, `PaymentResponse`, `RefundResponse`, `BillingSummaryResponse`, `CreateInvoiceRequest`, `RecordPaymentRequest`, `CreateRefundRequest`, `ProcessWebhookRequest`.

---

## 2. Key Architecture Decisions

1. **Monetary Precision & Decimal Safety**:
   - Financial arithmetic is handled using Prisma `Decimal` (backed by PostgreSQL `NUMERIC(12, 2)`).
   - In JavaScript/TypeScript services, calculations use strict decimal handling (or string cents/basis points) to eliminate IEEE-754 floating-point inaccuracies.
   - Server strictly recomputes:
     - `lineSubtotal = quantity * unitPrice`
     - `lineTotal = lineSubtotal - lineDiscount + lineTax`
     - `invoiceSubtotal = sum(lineSubtotal)`
     - `invoiceTaxAmount = sum(lineTax)`
     - `invoiceDiscountAmount = sum(lineDiscount)`
     - `invoiceTotalAmount = invoiceSubtotal - invoiceDiscountAmount + invoiceTaxAmount`
     - `outstandingAmount = totalAmount - paidAmount`
   - Client-provided totals, taxes, or discounts are strictly ignored or validated against server calculation.

2. **Invoice State Machine & Immutability**:
   - Lifecycle: `DRAFT` -> `ISSUED` -> `PARTIALLY_PAID` -> `PAID`.
   - Exceptions: `VOID` (only allowable before any payments or after full refunds, with mandatory `voidReason`).
   - Immutability: Once an invoice is `ISSUED`, line items, quantities, and prices cannot be modified. Payments can only be collected against `ISSUED` or `PARTIALLY_PAID` invoices.

3. **Concurrency & Anti-Overpayment**:
   - In interactive transactions, the invoice row is locked via `SELECT ... FOR UPDATE`.
   - If concurrent payments arrive for the same invoice, the second transaction sees the updated `paidAmount` and `status`.
   - If the requested payment exceeds the remaining `outstandingAmount`, the transaction rejects with HTTP 400 `BadRequestException('Payment exceeds outstanding balance')`.

4. **Tenant-Scoped Idempotency**:
   - Mutation endpoints accept optional `Idempotency-Key` header or payload `idempotencyKey`.
   - Hashed with SHA-256 along with hospital ID and canonical payload.
   - If retried with same payload: returns saved response without duplicate financial mutations.
   - If retried with conflicting payload: returns HTTP 409 `ConflictException`.

5. **Payment Gateway Provider Abstraction**:
   - The system introduces a clean `PaymentProvider` interface.
   - For offline/cash/direct transactions: processed as `MANUAL` with immediate audit.
   - For gateway transactions (`RAZORPAY`, `STRIPE`): records `PENDING`/`PROCESSING`, generates order reference, and awaits signed webhook verification.
   - Zero fabricated gateway transactions or fake success status.

6. **Audit & Zero Leakage**:
   - Every invoice issuance, payment recording, void, refund, and webhook processing is logged to `AuditLog`.
   - No payment secrets, card numbers, CVVs, or gateway private keys are ever stored or logged.
