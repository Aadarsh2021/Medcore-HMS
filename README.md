# MedCore HMS — Hospital Management System

> **Enterprise Cloud-Native Healthcare & Hospital Operations Platform**  
> Modeled after modern clinical standards (Epic Systems, Practo, Cerner) with 3NF relational PostgreSQL data modeling, row-level multi-tenancy, append-only Electronic Medical Records (EMR), FIFO batch pharmacy inventory, and concurrency-safe appointment booking.

---

## 🏥 System Overview

MedCore HMS digitizes end-to-end hospital workflows across outpatient (OPD) and inpatient care. Designed as a SaaS platform, it supports multi-tenant operations where independent clinics and hospital networks operate under strict tenant isolation.

### Core Capabilities:
- **Multi-Tenancy**: Row-level tenancy enforced at the ORM layer with `hospitalId` scoping and dedicated isolation tests.
- **Role-Based Access Control (RBAC)**: 9 distinct roles with granular server-side permissions:
  - `SUPER_ADMIN`: Cross-hospital platform governance & analytics.
  - `HOSPITAL_ADMIN`: Hospital settings, departments, staff, and billing rules.
  - `DOCTOR`: Encounter queue, clinical EMR, ICD-10 diagnoses, and signed digital prescriptions.
  - `NURSE`: Triage intake, vitals recording with automated BMI calculation.
  - `RECEPTIONIST`: Patient registration, conflict-free scheduling, counter billing.
  - `LAB_TECHNICIAN`: Specimen collection, structured results, and reference range validation.
  - `PHARMACIST`: FIFO prescription fulfillment, batch expiry tracking, and low-stock alerts.
  - `ACCOUNTANT`: Multi-department invoice aggregation, payment reconciliation, and financial reports.
  - `PATIENT`: Self-service portal for appointments, diagnostic reports, and payment checkout.
- **Appointment Concurrency Engine**: PostgreSQL `SELECT FOR UPDATE` pessimistic locking combined with a partial database unique index to eliminate double-booking.
- **Append-Only Medical Records**: HIPAA-aligned append-only clinical history with ICD-10 codes, allergy tracking, and automated vital calculations.
- **First-In, First-Out (FIFO) Pharmacy**: Oldest unexpired batches dispensed first; expired batches quarantined.
- **Consolidated Billing**: Invoicing engine that aggregates consultation fees, lab orders, and pharmacy dispensations into a single itemized invoice with Stripe/Razorpay webhooks.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router, React 19, Server Components), Tailwind CSS, shadcn/ui, TanStack Query, Zustand, Recharts |
| **Backend** | NestJS (Modular Architecture), TypeScript, Prisma ORM, Passport.js, JWT, BullMQ, Socket.IO |
| **Database** | PostgreSQL 16 (Relational 3NF, Row Locks, Foreign Key Constraints) |
| **Cache & Queues** | Redis 7 (Session Store, Token Rotation, BullMQ Jobs, Ephemeral Slot Holds) |
| **Edge & Infra** | Nginx Reverse Proxy, Docker & Docker Compose |

---

## 🏗️ Monorepo Architecture

```
medcore-hms/
├── apps/
│   ├── api/                  # NestJS API (Port 3001)
│   └── web/                  # Next.js 15 App Router Frontend (Port 3000)
├── packages/
│   ├── types/                # Shared TypeScript contracts, DTOs & enums
│   └── config/               # Shared tsconfig, ESLint & Prettier
├── prisma/
│   ├── schema.prisma         # 29 Relational models in 3NF
│   └── seed.ts               # Realistic multi-hospital clinical seed
├── infrastructure/
│   ├── docker/               # Multi-stage Dockerfiles
│   └── nginx/                # Nginx reverse proxy & rate limiter
└── docs/
    ├── architecture/         # ADR-001 through ADR-005
    └── database/             # ERD & schema dictionary
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js**: >= 20.x (Node 22 LTS recommended)
- **pnpm**: >= 9.x / 11.x
- **Docker Desktop** (for PostgreSQL 16 & Redis 7)

### 2. Environment Configuration
```bash
# Clone the repository
git clone <repo-url>
cd "Medcore Hms"

# Copy environment variables
cp .env.example .env
```

### 3. Start Database & Cache
```bash
# Launch PostgreSQL 16 and Redis 7
docker compose up -d
```

### 4. Install Dependencies & Generate Database
```bash
# Install dependencies across all workspaces
pnpm install

# Generate Prisma Client & push schema
pnpm --filter @medcore/api prisma:generate
pnpm --filter @medcore/api prisma:push

# Seed realistic clinical demonstration data
pnpm --filter @medcore/api prisma:seed
```

### 5. Start Development Servers
```bash
# Terminal 1: Backend NestJS API (http://localhost:3001)
pnpm dev:api

# Terminal 2: Frontend Next.js Web (http://localhost:3000)
pnpm dev:web
```

- **Interactive API Documentation (Swagger)**: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)
- **Frontend Clinical Portal**: [http://localhost:3000](http://localhost:3000)

---

## 🔑 Demo Credentials (Seeded)

All demo accounts share the password: `Password123!`

| Role | Email | Hospital / Scope |
| :--- | :--- | :--- |
| **Super Admin** | `superadmin@medcore.io` | Global Platform |
| **Hospital Admin** | `admin.metro@medcore.io` | Metro General Hospital |
| **Doctor (Cardiology)** | `dr.sharma@metrogeneral.org` | Metro General Hospital |
| **Doctor (Medicine)** | `dr.menon@metrogeneral.org` | Metro General Hospital |
| **Nurse** | `nurse.sunita@metrogeneral.org` | Metro General Hospital |
| **Receptionist** | `reception.rahul@metrogeneral.org` | Metro General Hospital |
| **Lab Technician** | `lab.tech@metrogeneral.org` | Metro General Hospital |
| **Pharmacist** | `pharmacy.priya@metrogeneral.org` | Metro General Hospital |
| **Accountant** | `accounts.amit@metrogeneral.org` | Metro General Hospital |
| **Patient** | `patient.arjun@gmail.com` | Metro General Hospital |

---

## 📐 Architecture Decision Records (ADRs)

Detailed rationale for critical engineering decisions:
- [ADR-001: Multi-Tenancy Strategy](docs/architecture/ADR-001-multi-tenancy-strategy.md)
- [ADR-002: Appointment Concurrency Strategy](docs/architecture/ADR-002-appointment-concurrency-strategy.md)
- [ADR-003: Authentication & Session Strategy](docs/architecture/ADR-003-authentication-session-strategy.md)
- [ADR-004: Medical File Storage Strategy](docs/architecture/ADR-004-file-storage-strategy.md)
- [ADR-005: Event-Driven Notification Architecture](docs/architecture/ADR-005-notification-architecture.md)

---

## 📜 License
Private & Confidential — MedCore HMS.
