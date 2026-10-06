-- =============================================================================
-- Phase 3: Clinical & Appointment Hardening Migration
-- 1. Update unique_doctor_active_slot to exclude NO_SHOW so no-show appointments release doctor slots
-- 2. Enforce unique amendmentNumber per MedicalRecord for immutability & strict sequence integrity
-- =============================================================================

DROP INDEX IF EXISTS "unique_doctor_active_slot";
CREATE UNIQUE INDEX "unique_doctor_active_slot"
ON "Appointment" ("doctorId", "appointmentDate", "startTime")
WHERE "status" NOT IN ('CANCELLED', 'NO_SHOW');

CREATE UNIQUE INDEX IF NOT EXISTS "MedicalRecordAmendment_recordId_amendmentNumber_key"
ON "MedicalRecordAmendment"("recordId", "amendmentNumber");
