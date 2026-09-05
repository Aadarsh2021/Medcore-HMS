# ADR-002: Appointment Concurrency Strategy

## Status
Accepted

## Context
In high-volume hospital outpatient departments (OPD), popular clinicians experience booking surges where multiple patients or receptionists simultaneously attempt to book the exact same 30-minute time slot. Double-booking doctors causes clinical delays, patient distress, and operational chaos.

## Decision
We selected a **Pessimistic PostgreSQL Locking (`SELECT FOR UPDATE`) within an Interactive Prisma Transaction, supported by a Database Unique Partial Index**.

### Why This Approach Was Chosen:
1. **Optimistic Locking Limitation**:
   Optimistic locking with version counters (`version: { increment: 1 }`) detects conflicts *after* the fact and requires client retries. In slot booking where the resource does not yet exist as a row until booked, optimistic locking requires locking an auxiliary slot table.
2. **Distributed Redis Locks (Redlock) Trade-off**:
   While Redis locks provide fast ephemeral reservation, they introduce split-brain risks if Redis restarts or connectivity drops. The relational database remains the ultimate source of truth.
3. **The Multi-Layer Strategy**:
   - **Layer 1 (Database Pessimistic Lock)**: Within `prisma.$transaction`, query active appointments for `(doctorId, appointmentDate, startTime)` with `FOR UPDATE`. If an active appointment exists, throw `409 Conflict`.
   - **Layer 2 (PostgreSQL Unique Partial Index)**:
     `CREATE UNIQUE INDEX "unique_doctor_active_slot" ON "Appointment" ("doctorId", "appointmentDate", "startTime") WHERE "status" NOT IN ('CANCELLED');`
     Even in the event of an application race condition, PostgreSQL relational integrity will reject the second transaction with code `23505` (Prisma `P2002`).
   - **Layer 3 (Ephemeral Soft Hold)**: A 5-minute Redis key (`slot_hold:{doctorId}:{slot}`) temporarily displays the slot as "held" on the frontend during patient checkout.

## Consequences
- Guaranteed zero double-booking under extreme concurrent load.
- Short lock duration (sub-10ms) prevents database connection contention.
