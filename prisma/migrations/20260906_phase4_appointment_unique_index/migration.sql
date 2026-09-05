-- =============================================================================
-- Phase 4: Appointment Booking — ADR-002 Layer 2
-- Partial unique index enforcing maximum ONE active booking per doctor slot.
--
-- KNOWN LIMITATION (Phase 4):
--   DoctorAvailability.maxBookingsPerSlot is a stored metadata field but
--   cannot be enforced at capacity > 1 while this index exists.
--   The appointment booking service explicitly rejects booking attempts on
--   slots where maxBookingsPerSlot > 1, returning HTTP 422.
--   Changing this behaviour requires a new ADR and schema revision.
--
-- This index EXCLUDES CANCELLED appointments so that a cancelled slot may be
-- re-booked without violating the constraint.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "unique_doctor_active_slot"
ON "Appointment" ("doctorId", "appointmentDate", "startTime")
WHERE "status" NOT IN ('CANCELLED');
