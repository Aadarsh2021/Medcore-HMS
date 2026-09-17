# Phase 9 — Billing, Invoicing & Payments: Implementation Reference

**Project**: MedCore HMS  
**Phase**: Phase 9 — Billing, Invoicing & Payments  
**Date**: September 17, 2026  

---

## 1. Subsystem Architecture & Components

```
apps/api/src/modules/billing/
├── dto/
│   └── index.ts                 # Validated request DTOs
├── financial-calculator.ts      # Server-authoritative decimal arithmetic
├── invoice-number.service.ts    # Concurrency-safe sequential identifiers
├── idempotency.service.ts       # Multi-tenant SHA-256 idempotency engine
├── payment-provider.service.ts  # Gateway abstraction & HMAC webhook authentication
├── billing.service.ts           # Core financial lifecycle & row locking
├── billing.controller.ts        # REST endpoints with RBAC & Tenant guards
└── billing.module.ts            # NestJS module definition
```

---

## 2. Key Technical Implementation Details

### 2.1 Concurrency-Safe Sequential Identifiers
Both `InvoiceNumberCounter` and `PaymentNumberCounter` use atomic PostgreSQL `UPSERT` queries with `RETURNING`:
```sql
INSERT INTO "InvoiceNumberCounter" ("id", "hospitalId", "year", "current")
VALUES (gen_random_uuid(), $1, $2, 1)
ON CONFLICT ("hospitalId", "year")
DO UPDATE SET "current" = "InvoiceNumberCounter"."current" + 1
RETURNING "current";
```
This guarantees zero duplicate invoice numbers (`INV-YYYY-000001`) or payment receipts (`PAY-YYYY-000001`) under heavy parallel load.

### 2.2 Payment Row Locking Pattern
To eliminate double payments and race condition overpayments, `recordPayment` acquires a PostgreSQL row lock within an interactive transaction:
```sql
SELECT "id", "hospitalId", "status", "totalAmount", "paidAmount"
FROM "Invoice"
WHERE "id" = $1 AND "hospitalId" = $2
FOR UPDATE;
```
Transactions enforce that `paymentAmount <= (totalAmount - paidAmount)`.

### 2.3 Idempotency Replay Mechanics
- Client submits `Idempotency-Key` header.
- Endpoint calculates `SHA-256(endpoint + canonicalJson(payload))`.
- If key matches previous request, saved status and body are replayed without re-executing mutations.
- If payload differs, returns HTTP 409 `ConflictException`.

### 2.4 Refund Invariants
- `refundAmount > 0`
- `refundAmount <= (payment.amount - sum(existingRefunds))`
- `invoice.refundedAmount + refundAmount <= invoice.paidAmount`
- If payment is fully refunded, status transitions to `REFUNDED`.
- If invoice was `PAID`, status transitions back to `PARTIALLY_PAID`.
