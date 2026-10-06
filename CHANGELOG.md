# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-06

### Added
- **Multi-Tenant Clinical Architecture**: Strict row-level multi-tenancy enforced at the application and Prisma Client extension layers.
- **Supabase Authentication**: End-to-end integration with Supabase Auth including token parsing, session refreshment, and role metadata mapping.
- **Role-Based Access Control (RBAC)**: Support for 9 first-class operational roles (Super Admin, Hospital Admin, Doctor, Nurse, Receptionist, Lab Technician, Pharmacist, Accountant, Patient).
- **Concurrency-Safe UHID Generator**: Deterministic monotonic UHID generation protected against race conditions under concurrent burst registrations.
- **Clinical Encounters & EMR**: Complete clinical encounter lifecycle, vitals recording with BMI calculation, ICD-10 diagnostic coding, and signed prescription generation with PDFKit.
- **Diagnostic Laboratory**: Comprehensive laboratory workflow including order placement, barcode specimen accessioning, reference range validation, and critical alert broadcasting.
- **Pharmacy & Batch Inventory**: FIFO and FEFO batch inventory management, expiration tracking, and atomic stock decrement checks.
- **Consolidated Billing & Payments**: Itemized patient billing combining consultations, lab tests, and medications with Stripe and Razorpay webhook integrations.
- **Inpatient Bed Management**: Hierarchical Ward -> Room -> Bed system with atomic occupancy status transitions.
- **Emergency Triage**: Emergency Severity Index (ESI 1–5) queue and doctor allocation workflow.
- **Background Jobs (BullMQ & Redis)**: Automated background workers for appointment reminders, expired drug batches, low stock alerts, and no-show reconciliation.
- **Realtime WebSockets (Socket.IO)**: Realtime push notification gateway with tenant and user room isolation.
- **Medical File Storage**: S3-compatible medical document storage with path traversal protection, MIME whitelisting, and temporary pre-signed URLs.
- **System Observability & Health**: Endpoints for liveness (`/health/live`) and readiness (`/health/ready`) probes, along with correlation ID logging.
- **Production Deployment Configuration**: Complete Docker Compose stack with Nginx reverse proxy and Firebase Hosting static export configuration.
- **Testing & Quality Assurance**: 20 integration and end-to-end test suites comprising 401 verified passing tests with zero skips and zero failures.
