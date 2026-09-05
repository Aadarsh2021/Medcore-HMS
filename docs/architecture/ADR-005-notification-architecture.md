# ADR-005: Event-Driven Notification Architecture

## Status
Accepted

## Context
Hospital workflows trigger immediate multi-channel notifications: appointment confirmations, 24-hour reminders, approved lab reports, prescription readiness alerts, and critical emergency notices.
Delivery channels have diverse latency and failure modes (e.g. SMS provider downtime, email bounce, client offline).

## Decision
We implemented an **Asynchronous Event Bus with BullMQ Queue Workers and Multi-Channel Fan-Out**.

```
[ Domain Action (e.g. Lab Approved) ]
                  |
                  v
[ NestJS EventEmitter2 / Domain Event ]
                  |
                  v
     [ BullMQ Notification Queue ]
       /           |           \
      v            v            v
 [ In-App ]    [ Email ]     [ SMS ]
(Socket.IO)    (Resend)     (Twilio)
```

### Key Principles:
1. **Non-Blocking Execution**:
   Emitting a notification event inside a request handler completes immediately. Heavy network calls to third-party SMS or email gateways execute in BullMQ workers without impacting API latency.
2. **Channel Isolation**:
   Each channel operates in its own queue/job handler. If an SMS fails due to a network provider timeout, it retries with exponential backoff and does not block the real-time Socket.IO alert or email dispatch.
3. **Auditability**:
   Every notification is persisted in the database `Notification` table with its delivery status (`PENDING`, `SENT`, `FAILED`, `READ`).

## Consequences
- Resilient notification delivery with automatic retry mechanisms.
- Decoupled domain services that do not hold external third-party provider dependencies directly.
