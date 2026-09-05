# PHASE 6 — TECHNICAL ARCHITECTURE SPECIFICATION
# MedCore HMS — Prescription Management & Clinical Medication Ordering

**Status:** APPROVED FOR PLANNING  
**Document Version:** 1.0.0  

---

## 1. System Context & Domain Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLINICAL WORKSPACE (WEB)                        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                    POST /api/encounters/:id/prescriptions
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         PRESCRIPTIONS MODULE                           │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │   Medicine Master      │         │   Prescription Lifecycle      │  │
│  │   Search Service       │         │   (Draft -> Issued -> Cancel) │  │
│  └────────────────────────┘         └───────────────────────────────┘  │
│                                                     │                  │
│                                                     ▼                  │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │  StorageService (S3)   │ ◄────── │   PrescriptionPdfService      │  │
│  │  (Pre-signed 15m URLs) │         │   (Deterministic pdfkit)      │  │
│  └────────────────────────┘         └───────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  POSTGRESQL MULTI-TENANT DATABASE                      │
│     Prescription ───► PrescriptionItem ───► Medicine (Snapshot)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Domain Entities & Database Schema

### 2.1 Prisma Schema Extension

```prisma
enum PrescriptionStatus {
  DRAFT
  ISSUED
  DISPENSED
  CANCELLED
}

enum PrescriptionFrequency {
  OD    // Once Daily
  BD    // Twice Daily
  TDS   // Three Times Daily
  QID   // Four Times Daily
  PRN   // As Needed
  SOS   // In Emergency
  STAT  // Immediately
}

model Prescription {
  id                 String             @id @default(uuid())
  hospitalId         String
  hospital           Hospital           @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  encounterId        String             @unique
  encounter          PatientEncounter   @relation(fields: [encounterId], references: [id], onDelete: Cascade)
  patientId          String
  patient            Patient            @relation(fields: [patientId], references: [id], onDelete: Cascade)
  doctorId           String
  doctor             Doctor             @relation(fields: [doctorId], references: [id], onDelete: Cascade)
  
  prescriptionNumber String?            // e.g. "RX-MGH-2026-000001"
  notes              String?            // General advice / dietary instructions
  signedPdfUrl       String?            // S3 object key or canonical storage path
  status             PrescriptionStatus @default(DRAFT)
  
  issuedAt           DateTime?
  voidedAt           DateTime?
  voidReason         String?
  voidedById         String?

  items              PrescriptionItem[]

  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  @@unique([hospitalId, prescriptionNumber])
  @@index([hospitalId, patientId])
  @@index([hospitalId, status])
}

model PrescriptionItem {
  id                String                @id @default(uuid())
  prescriptionId    String
  prescription      Prescription          @relation(fields: [prescriptionId], references: [id], onDelete: Cascade)
  medicineId        String?
  medicine          Medicine?             @relation(fields: [medicineId], references: [id], onDelete: SetNull)
  
  medicineName      String                // Snapshot of medicine name
  form              MedicineForm          @default(TABLET)
  strength          String?               // e.g. "500 mg"
  dosage            String                // e.g. "1 tablet"
  frequency         PrescriptionFrequency @default(BD)
  durationDays      Int                   @default(5)
  route             String                @default("ORAL")
  instructions      String?               // e.g. "Take after food"
  quantity          Int?                  // e.g. 10
  dispensedQuantity Int                   @default(0) // Future pharmacy integration

  createdAt         DateTime              @default(now())

  @@index([prescriptionId])
}
```

---

## 3. Key Architectural Decisions (ADR Summaries)

### ADR-007: Prescription Immutability & Lifecycle
- **Context:** Medical prescriptions are legal clinical instruments. Once an order is signed and handed to a patient, altering it introduces malpractice and patient safety hazards.
- **Decision:** When a prescription is in `DRAFT` status, it can be updated and deleted by the assigned doctor. Once `POST /api/prescriptions/:id/finalize` is invoked, the status transitions to `ISSUED` and the record becomes 100% immutable. Any mutation attempt on an `ISSUED` prescription is rejected with HTTP 409 Conflict.
- **Voiding:** If a mistake is discovered, the prescription must be formally cancelled with an audited reason. The original record remains intact in the patient's record.

### ADR-008: Deterministic PDF Generation Engine
- **Context:** PRD suggests PDF generation. Puppeteer requires downloading headless Chromium (~300MB), often failing in lean Alpine Docker images, minimal cloud runners, and memory-constrained environments.
- **Decision:** Use `pdfkit`. It runs natively in pure Node.js, generates vector-quality PDFs in milliseconds, handles embedded images (doctor signature graphic), and has zero external system dependencies.

### ADR-009: Prescription Numbering & Concurrency
- **Context:** Prescriptions require human-identifiable, sequential reference codes per hospital.
- **Decision:** Format: `RX-{HOSPITAL_CODE}-{YYYY}-{SEQUENTIAL_6_DIGIT}` (e.g. `RX-MGH-2026-000001`). Enforced via database transaction and unique constraint `@@unique([hospitalId, prescriptionNumber])`.
