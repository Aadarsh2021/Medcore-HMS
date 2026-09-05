-- =============================================================================
-- Phase 5: Clinical Encounters & EMR Models
-- Adds VaccinationHistory, FamilyHistory, MedicationHistory, and MedicalRecordAmendment
-- =============================================================================

-- CreateEnum
CREATE TYPE "AmendmentType" AS ENUM ('ADDENDUM', 'CORRECTION', 'LATE_ENTRY');

-- CreateEnum
CREATE TYPE "AmendmentSection" AS ENUM ('CLINICAL_NOTES', 'DIAGNOSIS', 'TREATMENT_PLAN', 'OTHER');

-- CreateTable
CREATE TABLE "VaccinationHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "vaccineName" TEXT NOT NULL,
    "administeredDate" TIMESTAMP(3) NOT NULL,
    "batchNumber" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaccinationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "condition" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordId" TEXT,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "route" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecordAmendment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "amendedById" TEXT NOT NULL,
    "amendmentNumber" INTEGER NOT NULL,
    "amendmentType" "AmendmentType" NOT NULL DEFAULT 'ADDENDUM',
    "section" "AmendmentSection" NOT NULL DEFAULT 'CLINICAL_NOTES',
    "reason" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalRecordAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaccinationHistory_patientId_idx" ON "VaccinationHistory"("patientId");

-- CreateIndex
CREATE INDEX "FamilyHistory_patientId_idx" ON "FamilyHistory"("patientId");

-- CreateIndex
CREATE INDEX "MedicationHistory_patientId_idx" ON "MedicationHistory"("patientId");

-- CreateIndex
CREATE INDEX "MedicalRecordAmendment_recordId_idx" ON "MedicalRecordAmendment"("recordId");

-- AddForeignKey
ALTER TABLE "VaccinationHistory" ADD CONSTRAINT "VaccinationHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationHistory" ADD CONSTRAINT "VaccinationHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyHistory" ADD CONSTRAINT "FamilyHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyHistory" ADD CONSTRAINT "FamilyHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationHistory" ADD CONSTRAINT "MedicationHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationHistory" ADD CONSTRAINT "MedicationHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordAmendment" ADD CONSTRAINT "MedicalRecordAmendment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "MedicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordAmendment" ADD CONSTRAINT "MedicalRecordAmendment_amendedById_fkey" FOREIGN KEY ("amendedById") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
