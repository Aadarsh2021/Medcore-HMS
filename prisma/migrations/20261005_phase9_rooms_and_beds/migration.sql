-- ==============================================================================
-- Migration: 20261005_phase9_rooms_and_beds
-- Description: Inpatient Wards, Rooms, Beds & Concurrency-Safe Bed Assignment
-- ==============================================================================

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE "RoomType" AS ENUM ('GENERAL_WARD', 'SEMI_PRIVATE', 'PRIVATE', 'ICU', 'NICU', 'EMERGENCY', 'OPERATION_THEATER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'RESERVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Rooms Table
CREATE TABLE IF NOT EXISTS "Room" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "departmentId" TEXT,
    "roomNumber" TEXT NOT NULL,
    "name" TEXT,
    "type" "RoomType" NOT NULL DEFAULT 'GENERAL_WARD',
    "floor" TEXT,
    "building" TEXT,
    "dailyRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- 3. Create Beds Table
CREATE TABLE IF NOT EXISTS "Bed" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bedNumber" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "currentPatientId" TEXT,
    "currentEncounterId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- 4. Create BedAssignment Table
CREATE TABLE IF NOT EXISTS "BedAssignment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "encounterId" TEXT,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "dischargeReason" TEXT,
    "admittedById" TEXT,
    "dischargedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedAssignment_pkey" PRIMARY KEY ("id")
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "Room_hospitalId_idx" ON "Room"("hospitalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Room_hospitalId_roomNumber_key" ON "Room"("hospitalId", "roomNumber");

CREATE INDEX IF NOT EXISTS "Bed_hospitalId_status_idx" ON "Bed"("hospitalId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Bed_hospitalId_roomId_bedNumber_key" ON "Bed"("hospitalId", "roomId", "bedNumber");

CREATE INDEX IF NOT EXISTS "BedAssignment_hospitalId_patientId_idx" ON "BedAssignment"("hospitalId", "patientId");
CREATE INDEX IF NOT EXISTS "BedAssignment_bedId_idx" ON "BedAssignment"("bedId");

-- 6. Foreign Keys
DO $$ BEGIN
    ALTER TABLE "Room" ADD CONSTRAINT "Room_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Room" ADD CONSTRAINT "Room_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Bed" ADD CONSTRAINT "Bed_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Bed" ADD CONSTRAINT "Bed_currentPatientId_fkey" FOREIGN KEY ("currentPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Bed" ADD CONSTRAINT "Bed_currentEncounterId_fkey" FOREIGN KEY ("currentEncounterId") REFERENCES "PatientEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "BedAssignment" ADD CONSTRAINT "BedAssignment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "PatientEncounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
