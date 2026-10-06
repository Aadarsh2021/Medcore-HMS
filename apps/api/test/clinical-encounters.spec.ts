/**
 * Phase 5 — Clinical Encounters & EMR Integration Tests
 *
 * Tests run against the live PostgreSQL/Supabase database.
 * Exercises EncountersService, MedicalRecordsService, and StorageService
 * with real Prisma transactions, multi-tenancy, and audit logging.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AddDiagnosisDto } from '../src/modules/encounters/dto/add-diagnosis.dto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { EncountersService } from '../src/modules/encounters/encounters.service';
import { MedicalRecordsService } from '../src/modules/medical-records/medical-records.service';
import { StorageService } from '../src/common/storage/storage.service';
import { runWithTenantContext } from '../src/database/tenant-context';
import {
  AllergySeverity,
  AmendmentSection,
  AmendmentType,
  AppointmentStatus,
  AppointmentType,
  DiagnosisType,
  EncounterStatus,
  UserRole,
} from '@medcore/types';

describe('Phase 5 — Clinical Encounters & EMR Integration Suite', () => {
  let prisma: PrismaService;
  let encountersService: EncountersService;
  let medicalRecordsService: MedicalRecordsService;
  let storageService: StorageService;

  // Multi-tenant fixtures
  let hospitalAId: string;
  let hospitalBId: string;
  let deptAId: string;

  // Hospital A Doctor 1 (Assigned)
  let docA1Id: string;
  let docA1UserId: string;

  // Hospital A Doctor 2 (Unassigned)
  let docA2Id: string;
  let docA2UserId: string;

  // Hospital B Doctor
  let docBId: string;
  let docBUserId: string;

  // Hospital A Patients
  let patA1Id: string;
  let patA1UserId: string;
  let patA2Id: string;
  let patA2UserId: string;

  // Hospital A Receptionist User
  let recAUserId: string;

  // Appointments
  let appointmentA1Id: string;
  let appointmentCancelledId: string;
  let appointmentNoShowId: string;

  // Tracking IDs for clean teardown
  const createdAppointmentIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdUserIds: string[] = [];

  const withTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    runWithTenantContext({ tenantId }, fn);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const configService = new ConfigService();
    storageService = new StorageService(configService);
    encountersService = new EncountersService(prisma, storageService);
    medicalRecordsService = new MedicalRecordsService(prisma);

    // Fetch existing hospitals from seed
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals required in database. Run seed first.');
    }
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // Fetch existing department in Hospital A
    const deptA = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalAId },
    });
    if (!deptA) {
      throw new Error('Department required in Hospital A.');
    }
    deptAId = deptA.id;

    const timestamp = Date.now();

    // 1. Create Doc A1 (Assigned)
    const userA1 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `doc.a1.${timestamp}@hospital-a.com`,
        firstName: 'Siddharth',
        lastName: 'Mukherjee',
        role: UserRole.DOCTOR,
        passwordHash: '$2b$10$placeholder',
      },
    });
    docA1UserId = userA1.id;
    createdUserIds.push(docA1UserId);

    const docA1 = await prisma.raw.doctor.create({
      data: {
        userId: docA1UserId,
        hospitalId: hospitalAId,
        departmentId: deptAId,
        specialization: 'Internal Medicine',
        licenseNumber: `LIC-A1-${timestamp}`,
      },
    });
    docA1Id = docA1.id;
    createdDoctorIds.push(docA1Id);

    // 2. Create Doc A2 (Unassigned)
    const userA2 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `doc.a2.${timestamp}@hospital-a.com`,
        firstName: 'Ananya',
        lastName: 'Roy',
        role: UserRole.DOCTOR,
        passwordHash: '$2b$10$placeholder',
      },
    });
    docA2UserId = userA2.id;
    createdUserIds.push(docA2UserId);

    const docA2 = await prisma.raw.doctor.create({
      data: {
        userId: docA2UserId,
        hospitalId: hospitalAId,
        departmentId: deptAId,
        specialization: 'Pulmonology',
        licenseNumber: `LIC-A2-${timestamp}`,
      },
    });
    docA2Id = docA2.id;
    createdDoctorIds.push(docA2Id);

    // 3. Create Doc B (Hospital B)
    const deptB = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalBId },
    });
    const userB = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalBId,
        email: `doc.b.${timestamp}@hospital-b.com`,
        firstName: 'Vikram',
        lastName: 'Bose',
        role: UserRole.DOCTOR,
        passwordHash: '$2b$10$placeholder',
      },
    });
    docBUserId = userB.id;
    createdUserIds.push(docBUserId);

    const docB = await prisma.raw.doctor.create({
      data: {
        userId: docBUserId,
        hospitalId: hospitalBId,
        departmentId: deptB ? deptB.id : deptAId,
        specialization: 'General Surgery',
        licenseNumber: `LIC-B-${timestamp}`,
      },
    });
    docBId = docB.id;
    createdDoctorIds.push(docBId);

    // 4. Create Patient A1
    const userPatA1 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `patient.a1.${timestamp}@gmail.com`,
        firstName: 'Rohan',
        lastName: 'Mehta',
        role: UserRole.PATIENT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    patA1UserId = userPatA1.id;
    createdUserIds.push(patA1UserId);

    const patA1 = await prisma.raw.patient.create({
      data: {
        userId: patA1UserId,
        hospitalId: hospitalAId,
        uhid: `UHID-A1-${timestamp}`,
        gender: 'MALE',
        dateOfBirth: new Date('1990-05-14'),
      },
    });
    patA1Id = patA1.id;
    createdPatientIds.push(patA1Id);

    // 5. Create Patient A2
    const userPatA2 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `patient.a2.${timestamp}@gmail.com`,
        firstName: 'Sunita',
        lastName: 'Verma',
        role: UserRole.PATIENT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    patA2UserId = userPatA2.id;
    createdUserIds.push(patA2UserId);

    const patA2 = await prisma.raw.patient.create({
      data: {
        userId: patA2UserId,
        hospitalId: hospitalAId,
        uhid: `UHID-A2-${timestamp}`,
        gender: 'FEMALE',
        dateOfBirth: new Date('1985-11-20'),
      },
    });
    patA2Id = patA2.id;
    createdPatientIds.push(patA2Id);

    // 6. Create Receptionist User
    const userRec = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `receptionist.${timestamp}@hospital-a.com`,
        firstName: 'Pooja',
        lastName: 'Sharma',
        role: UserRole.RECEPTIONIST,
        passwordHash: '$2b$10$placeholder',
      },
    });
    recAUserId = userRec.id;
    createdUserIds.push(recAUserId);

    // 7. Create Scheduled Appointments in Hospital A
    const appt1 = await prisma.raw.appointment.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patA1Id,
        doctorId: docA1Id,
        departmentId: deptAId,
        appointmentDate: new Date('2027-02-01'),
        startTime: '10:00',
        endTime: '10:30',
        status: AppointmentStatus.CONFIRMED,
        reason: 'Persistent fever and cough',
      },
    });
    appointmentA1Id = appt1.id;
    createdAppointmentIds.push(appointmentA1Id);

    const apptCancelled = await prisma.raw.appointment.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patA1Id,
        doctorId: docA1Id,
        departmentId: deptAId,
        appointmentDate: new Date('2027-02-01'),
        startTime: '11:00',
        endTime: '11:30',
        status: AppointmentStatus.CANCELLED,
        reason: 'Patient cancelled visit',
      },
    });
    appointmentCancelledId = apptCancelled.id;
    createdAppointmentIds.push(appointmentCancelledId);

    const apptNoShow = await prisma.raw.appointment.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patA1Id,
        doctorId: docA1Id,
        departmentId: deptAId,
        appointmentDate: new Date('2027-02-01'),
        startTime: '11:30',
        endTime: '12:00',
        status: AppointmentStatus.NO_SHOW,
        reason: 'Patient did not arrive',
      },
    });
    appointmentNoShowId = apptNoShow.id;
    createdAppointmentIds.push(appointmentNoShowId);
  });

  afterAll(async () => {
    // Teardown created clinical records
    if (prisma) {
      await prisma.raw.medicalRecordAmendment.deleteMany({
        where: { amendedById: { in: createdDoctorIds } },
      });
      await prisma.raw.attachment.deleteMany({
        where: { record: { patientId: { in: createdPatientIds } } },
      });
      await prisma.raw.diagnosis.deleteMany({
        where: { record: { patientId: { in: createdPatientIds } } },
      });
      await prisma.raw.vital.deleteMany({
        where: { record: { patientId: { in: createdPatientIds } } },
      });
      await prisma.raw.vaccinationHistory.deleteMany({
        where: { patientId: { in: createdPatientIds } },
      });
      await prisma.raw.familyHistory.deleteMany({
        where: { patientId: { in: createdPatientIds } },
      });
      await prisma.raw.medicationHistory.deleteMany({
        where: { patientId: { in: createdPatientIds } },
      });
      await prisma.raw.allergy.deleteMany({
        where: { patientId: { in: createdPatientIds } },
      });
      await prisma.raw.medicalRecord.deleteMany({
        where: { patientId: { in: createdPatientIds } },
      });
      await prisma.raw.patientEncounter.deleteMany({
        where: { appointmentId: { in: createdAppointmentIds } },
      });
      await prisma.raw.appointment.deleteMany({
        where: { id: { in: createdAppointmentIds } },
      });
      await prisma.raw.doctor.deleteMany({
        where: { id: { in: createdDoctorIds } },
      });
      await prisma.raw.patient.deleteMany({
        where: { id: { in: createdPatientIds } },
      });
      await prisma.raw.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.raw.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.$disconnect();
    }
  });

  // ===========================================================================
  // SECTION A: Clinical Encounter Lifecycle & Completion Invariants
  // ===========================================================================
  describe('A. Clinical Encounter Lifecycle & Invariants', () => {
    let activeEncounterId: string;

    it('A1: should successfully start an encounter and atomically transition appointment to IN_PROGRESS', async () => {
      const encounter = await withTenant(hospitalAId, () =>
        encountersService.startEncounter(hospitalAId, appointmentA1Id, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      expect(encounter).toBeDefined();
      expect(encounter.status).toBe(EncounterStatus.IN_PROGRESS);
      expect(encounter.startedAt).toBeTruthy();
      expect(encounter.medicalRecord).toBeDefined();
      expect(encounter.medicalRecord?.chiefComplaint).toBe('Persistent fever and cough');

      activeEncounterId = encounter.id;

      // Verify appointment transitioned to IN_PROGRESS
      const appt = await prisma.raw.appointment.findUniqueOrThrow({
        where: { id: appointmentA1Id },
      });
      expect(appt.status).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('A2: should be idempotent when starting an existing encounter', async () => {
      const encounter = await withTenant(hospitalAId, () =>
        encountersService.startEncounter(hospitalAId, appointmentA1Id, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      expect(encounter.id).toBe(activeEncounterId);
      expect(encounter.status).toBe(EncounterStatus.IN_PROGRESS);
    });

    it('A3: should reject starting encounter on a CANCELLED appointment with 422', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          encountersService.startEncounter(hospitalAId, appointmentCancelledId, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('A4: should reject starting encounter on a NO_SHOW appointment with 422', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          encountersService.startEncounter(hospitalAId, appointmentNoShowId, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('A5: should reject unassigned doctor from starting the encounter with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          encountersService.startEncounter(hospitalAId, appointmentA1Id, {
            id: docA2UserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('A6: should reject completing encounter with 0 diagnoses with 422', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          encountersService.completeEncounter(hospitalAId, activeEncounterId, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('A7: should successfully add diagnosis and complete encounter atomically', async () => {
      // Add valid diagnosis
      const diag = await withTenant(hospitalAId, () =>
        encountersService.addDiagnosis(
          hospitalAId,
          activeEncounterId,
          {
            code: 'J06.9',
            description: 'Acute upper respiratory infection',
            type: DiagnosisType.CONFIRMED,
            isPrimary: true,
          },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );
      expect(diag.code).toBe('J06.9');

      // Complete encounter
      const completion = await withTenant(hospitalAId, () =>
        encountersService.completeEncounter(hospitalAId, activeEncounterId, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      expect(completion.status).toBe(EncounterStatus.COMPLETED);
      expect(completion.completedAt).toBeTruthy();

      // Verify appointment atomically completed
      const appt = await prisma.raw.appointment.findUniqueOrThrow({
        where: { id: appointmentA1Id },
      });
      expect(appt.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('A8: should reject completing an already completed encounter with 400', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          encountersService.completeEncounter(hospitalAId, activeEncounterId, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // SECTION B: Strict Append-Only Immutability & Additive Amendments
  // ===========================================================================
  describe('B. Strict Append-Only Immutability & Additive Amendments', () => {
    let completedEncounterId: string;
    let initialNotes: string;

    beforeAll(async () => {
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2027-02-02'),
          startTime: '09:00',
          endTime: '09:30',
          status: AppointmentStatus.CONFIRMED,
          reason: 'Initial consultation',
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await withTenant(hospitalAId, () =>
        encountersService.startEncounter(hospitalAId, appt.id, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );
      completedEncounterId = enc.id;

      // Update draft notes
      initialNotes = 'Initial diagnostic evaluation: bilateral breath sounds clear.';
      await withTenant(hospitalAId, () =>
        encountersService.updateNotes(
          hospitalAId,
          completedEncounterId,
          { clinicalNotes: initialNotes, treatmentPlan: 'Steam inhalation' },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      // Add diagnosis & complete
      await withTenant(hospitalAId, () =>
        encountersService.addDiagnosis(
          hospitalAId,
          completedEncounterId,
          { code: 'R05', description: 'Cough', type: DiagnosisType.PROVISIONAL },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      await withTenant(hospitalAId, () =>
        encountersService.completeEncounter(hospitalAId, completedEncounterId, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );
    });

    it('B1: should reject direct mutation on finalized medical record with 409 Conflict', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          encountersService.updateNotes(
            hospitalAId,
            completedEncounterId,
            { clinicalNotes: 'Malicious rewrite of medical history' },
            { id: docA1UserId, role: UserRole.DOCTOR },
          ),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('B2: should create additive amendment while leaving original record 100% untouched', async () => {
      const amendment1 = await withTenant(hospitalAId, () =>
        encountersService.createAmendment(
          hospitalAId,
          completedEncounterId,
          {
            amendmentType: AmendmentType.ADDENDUM,
            section: AmendmentSection.CLINICAL_NOTES,
            reason: 'Received late sputum test results from laboratory',
            content: 'Sputum culture confirms normal flora. No antibiotics indicated.',
          },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      expect(amendment1.amendmentNumber).toBe(1);
      expect(amendment1.reason).toContain('late sputum test');

      // Verify original MedicalRecord is completely unchanged in DB
      const recordInDb = await prisma.raw.medicalRecord.findFirstOrThrow({
        where: { encounterId: completedEncounterId },
      });
      expect(recordInDb.clinicalNotes).toBe(initialNotes);
      expect(recordInDb.treatmentPlan).toBe('Steam inhalation');
    });

    it('B3: should increment amendmentNumber on subsequent amendments and preserve full history', async () => {
      const amendment2 = await withTenant(hospitalAId, () =>
        encountersService.createAmendment(
          hospitalAId,
          completedEncounterId,
          {
            amendmentType: AmendmentType.CORRECTION,
            section: AmendmentSection.TREATMENT_PLAN,
            reason: 'Correction of follow-up advice per patient request',
            content: 'Advised follow-up in 10 days instead of 7 days.',
          },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      expect(amendment2.amendmentNumber).toBe(2);

      // Verify query returns original record plus all amendments in order
      const encounter = await withTenant(hospitalAId, () =>
        encountersService.getEncounter(hospitalAId, completedEncounterId, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      expect(encounter.medicalRecord?.clinicalNotes).toBe(initialNotes);
      expect(encounter.medicalRecord?.amendments.length).toBe(2);
      expect(encounter.medicalRecord?.amendments[0].amendmentNumber).toBe(1);
      expect(encounter.medicalRecord?.amendments[1].amendmentNumber).toBe(2);
    });

    it('B4: should reject unauthorized doctor from creating an amendment with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          encountersService.createAmendment(
            hospitalAId,
            completedEncounterId,
            {
              reason: 'Unauthorized intervention',
              content: 'Should fail',
            },
            { id: docA2UserId, role: UserRole.DOCTOR },
          ),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('B5: should reject cross-hospital amendment attempt with 404', async () => {
      await expect(
        withTenant(hospitalBId, () =>
          encountersService.createAmendment(
            hospitalBId,
            completedEncounterId,
            {
              reason: 'Cross hospital edit',
              content: 'Should fail',
            },
            { id: docBUserId, role: UserRole.DOCTOR },
          ),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // SECTION C: Patient & Tenant Isolation
  // ===========================================================================
  describe('C. Patient & Tenant Isolation', () => {
    it('C1: should allow patient to view their own clinical summary', async () => {
      const summary = await withTenant(hospitalAId, () =>
        medicalRecordsService.getPatientSummary(hospitalAId, patA1Id, {
          id: patA1UserId,
          role: UserRole.PATIENT,
        }),
      );

      expect(summary).toBeDefined();
      expect(summary.patient.id).toBe(patA1Id);
    });

    it('C2: should strictly reject patient attempting to access another patient summary with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          medicalRecordsService.getPatientSummary(hospitalAId, patA2Id, {
            id: patA1UserId,
            role: UserRole.PATIENT,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('C3: should reject receptionist from accessing clinical patient records with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          medicalRecordsService.getPatientSummary(hospitalAId, patA1Id, {
            id: recAUserId,
            role: UserRole.RECEPTIONIST,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('C4: should isolate Hospital A clinical records from Hospital B queries', async () => {
      await expect(
        withTenant(hospitalBId, () =>
          medicalRecordsService.getPatientSummary(hospitalBId, patA1Id, {
            id: docBUserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // SECTION D: Clinical Vitals & Server-Computed BMI
  // ===========================================================================
  describe('D. Clinical Vitals & Server-Side BMI Calculation', () => {
    let testEncounterId: string;

    beforeAll(async () => {
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2027-02-03'),
          startTime: '14:00',
          endTime: '14:30',
          status: AppointmentStatus.CONFIRMED,
          reason: 'Vitals testing',
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await withTenant(hospitalAId, () =>
        encountersService.startEncounter(hospitalAId, appt.id, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );
      testEncounterId = enc.id;
    });

    it('D1: should calculate BMI accurately on the server (height: 180cm, weight: 81kg -> 25.0)', async () => {
      const vital = await withTenant(hospitalAId, () =>
        encountersService.recordVitals(
          hospitalAId,
          testEncounterId,
          {
            heightCm: 180,
            weightKg: 81,
            bpSystolic: 120,
            bpDiastolic: 80,
            heartRate: 72,
          },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      expect(vital.bmi).toBe(25.0);
    });

    it('D2: should strictly ignore client-supplied BMI value and compute server-side', async () => {
      const vital = await withTenant(hospitalAId, () =>
        encountersService.recordVitals(
          hospitalAId,
          testEncounterId,
          {
            heightCm: 170,
            weightKg: 68,
            bmi: 99.9, // Spoofed client value
          },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      // Expected: 68 / (1.7^2) = 23.529 -> 23.5
      expect(vital.bmi).toBe(23.5);
      expect(vital.bmi).not.toBe(99.9);
    });

    it('D3: should preserve historical vitals across successive recordings (append-only)', async () => {
      await withTenant(hospitalAId, () =>
        encountersService.recordVitals(
          hospitalAId,
          testEncounterId,
          { heartRate: 88, notes: 'Post exertion' },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      const encounter = await withTenant(hospitalAId, () =>
        encountersService.getEncounter(hospitalAId, testEncounterId, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      // Should have 3 distinct vitals rows
      expect(encounter.medicalRecord?.vitals.length).toBe(3);
    });
  });

  // ===========================================================================
  // SECTION E: Longitudinal Safety Records & S3 Attachments
  // ===========================================================================
  describe('E. Longitudinal Records & S3 File Storage', () => {
    it('E1: should record patient allergy with severity and reaction', async () => {
      const allergy = await withTenant(hospitalAId, () =>
        medicalRecordsService.addAllergy(hospitalAId, patA1Id, {
          allergen: 'Amoxicillin',
          reaction: 'Severe urticaria',
          severity: AllergySeverity.SEVERE,
        }),
      );

      expect(allergy.allergen).toBe('Amoxicillin');
      expect(allergy.severity).toBe(AllergySeverity.SEVERE);
    });

    it('E2: should record longitudinal past medication history', async () => {
      const med = await withTenant(hospitalAId, () =>
        medicalRecordsService.addMedicationHistory(hospitalAId, patA1Id, {
          medicationName: 'Metformin',
          dosage: '500mg',
          frequency: 'Twice daily',
          route: 'Oral',
          isActive: true,
        }),
      );

      expect(med.medicationName).toBe('Metformin');
      expect(med.isActive).toBe(true);
    });

    it('E3: should record immunization history', async () => {
      const vax = await withTenant(hospitalAId, () =>
        medicalRecordsService.addVaccination(hospitalAId, patA1Id, {
          vaccineName: 'Hepatitis B',
          administeredDate: '2022-03-10',
          batchNumber: 'HEP-9921',
        }),
      );

      expect(vax.vaccineName).toBe('Hepatitis B');
      expect(vax.batchNumber).toBe('HEP-9921');
    });

    it('E4: should record family history risk condition', async () => {
      const fam = await withTenant(hospitalAId, () =>
        medicalRecordsService.addFamilyHistory(hospitalAId, patA1Id, {
          condition: 'Cardiovascular Disease',
          relationship: 'Paternal Grandfather',
          notes: 'Myocardial infarction at age 62',
        }),
      );

      expect(fam.condition).toBe('Cardiovascular Disease');
      expect(fam.relationship).toBe('Paternal Grandfather');
    });

    it('E5: should validate S3 attachment upload and reject disallowed scripts (.sh / .exe)', async () => {
      const fakeScript = {
        originalname: 'exploit.sh',
        mimetype: 'application/x-sh',
        size: 500,
        buffer: Buffer.from('#!/bin/bash\necho bad'),
      };

      expect(() => storageService.validateFile(fakeScript)).toThrow();
    });

    it('E6: should generate an authorized S3 pre-signed download URL valid for 15 minutes (900s)', async () => {
      const signedUrl = await storageService.getSignedDownloadUrl(
        'attachments/hosp-a/pat-1/test-file.pdf',
        900,
      );

      expect(signedUrl).toBeDefined();
      expect(signedUrl).toMatch(/X-Amz-Expires=900|expiresAt=/);
    });
  });

  // ===========================================================================
  // SECTION F: Concurrent Clinical Mutations & Race Condition Resilience
  // ===========================================================================
  describe('F. Concurrent Clinical Mutations & Race Condition Resilience', () => {
    let completedEncounterId: string;

    beforeAll(async () => {
      // Create and complete an encounter for concurrent amendment testing
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2027-03-01'),
          startTime: '09:00',
          endTime: '09:30',
          status: AppointmentStatus.CONFIRMED,
          reason: 'Severe migraine for concurrency test',
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await withTenant(hospitalAId, () =>
        encountersService.startEncounter(hospitalAId, appt.id, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      await withTenant(hospitalAId, () =>
        encountersService.addDiagnosis(
          hospitalAId,
          enc.id,
          {
            code: 'G43.909',
            description: 'Migraine, unspecified, not intractable',
            type: DiagnosisType.CONFIRMED,
            isPrimary: true,
          },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      await withTenant(hospitalAId, () =>
        encountersService.completeEncounter(hospitalAId, enc.id, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      completedEncounterId = enc.id;
    });

    it('F1: should safely handle simultaneous concurrent amendments to the same record with distinct monotonic amendment numbers', async () => {
      // Launch 2 simultaneous amendments via Promise.all
      const [amendment1, amendment2] = await Promise.all([
        withTenant(hospitalAId, () =>
          encountersService.createAmendment(
            hospitalAId,
            completedEncounterId,
            {
              amendmentType: AmendmentType.ADDENDUM,
              section: AmendmentSection.CLINICAL_NOTES,
              reason: 'Concurrent addendum 1',
              content: 'Patient reported secondary symptom A',
            },
            { id: docA1UserId, role: UserRole.DOCTOR },
          ),
        ),
        withTenant(hospitalAId, () =>
          encountersService.createAmendment(
            hospitalAId,
            completedEncounterId,
            {
              amendmentType: AmendmentType.ADDENDUM,
              section: AmendmentSection.CLINICAL_NOTES,
              reason: 'Concurrent addendum 2',
              content: 'Patient reported secondary symptom B',
            },
            { id: docA1UserId, role: UserRole.DOCTOR },
          ),
        ),
      ]);

      expect(amendment1).toBeDefined();
      expect(amendment2).toBeDefined();
      expect(amendment1.id).not.toBe(amendment2.id);

      // Amendment numbers must be strictly distinct and sequential (1 and 2)
      const numbers = [amendment1.amendmentNumber, amendment2.amendmentNumber].sort((a, b) => a - b);
      expect(numbers[0]).toBe(1);
      expect(numbers[1]).toBe(2);

      // Verify in DB that exactly 2 amendments exist with amendment numbers 1 and 2
      const amendmentsInDb = await prisma.raw.medicalRecordAmendment.findMany({
        where: { recordId: amendment1.recordId },
        orderBy: { amendmentNumber: 'asc' },
      });
      expect(amendmentsInDb.length).toBe(2);
      expect(amendmentsInDb.map((a) => a.amendmentNumber)).toEqual([1, 2]);
    });

    it('F2: should prevent simultaneous concurrent completions on the same in-progress encounter (exactly 1 succeeds)', async () => {
      // Create fresh encounter
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2027-03-02'),
          startTime: '10:00',
          endTime: '10:30',
          status: AppointmentStatus.CONFIRMED,
          reason: 'Checkup for concurrent completion',
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await withTenant(hospitalAId, () =>
        encountersService.startEncounter(hospitalAId, appt.id, {
          id: docA1UserId,
          role: UserRole.DOCTOR,
        }),
      );

      await withTenant(hospitalAId, () =>
        encountersService.addDiagnosis(
          hospitalAId,
          enc.id,
          {
            code: 'Z00.00',
            description: 'General adult medical examination',
            type: DiagnosisType.CONFIRMED,
            isPrimary: true,
          },
          { id: docA1UserId, role: UserRole.DOCTOR },
        ),
      );

      // Fire 2 concurrent completeEncounter requests
      const results = await Promise.allSettled([
        withTenant(hospitalAId, () =>
          encountersService.completeEncounter(hospitalAId, enc.id, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
        withTenant(hospitalAId, () =>
          encountersService.completeEncounter(hospitalAId, enc.id, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 1 must succeed and exactly 1 must be rejected
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // The rejected one should throw BadRequestException
      const reason = (rejected[0] as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(BadRequestException);
    });

    it('F3: should handle simultaneous concurrent startEncounter calls idempotently', async () => {
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2027-03-03'),
          startTime: '11:00',
          endTime: '11:30',
          status: AppointmentStatus.CONFIRMED,
          reason: 'Concurrent start check',
        },
      });
      createdAppointmentIds.push(appt.id);

      // Launch 2 simultaneous startEncounter calls
      const [start1, start2] = await Promise.all([
        withTenant(hospitalAId, () =>
          encountersService.startEncounter(hospitalAId, appt.id, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
        withTenant(hospitalAId, () =>
          encountersService.startEncounter(hospitalAId, appt.id, {
            id: docA1UserId,
            role: UserRole.DOCTOR,
          }),
        ),
      ]);

      expect(start1.id).toBe(start2.id);
      expect(start1.status).toBe(EncounterStatus.IN_PROGRESS);
      expect(start2.status).toBe(EncounterStatus.IN_PROGRESS);
    });
  });

  // ===========================================================================
  // SECTION G: Diagnosis & ICD-10 Validation
  // ===========================================================================
  describe('G. Diagnosis Support & ICD-10 Format Validation', () => {
    it('G1: should validate valid ICD-10 codes (e.g. J06.9, E11.9, I10, A00) and reject malformed codes', async () => {
      const validDto = plainToInstance(AddDiagnosisDto, {
        code: 'J06.9',
        description: 'Acute upper respiratory infection',
      });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);

      const validDto2 = plainToInstance(AddDiagnosisDto, {
        code: 'I10',
        description: 'Essential (primary) hypertension',
      });
      const validErrors2 = await validate(validDto2);
      expect(validErrors2.length).toBe(0);

      const invalidDto = plainToInstance(AddDiagnosisDto, {
        code: 'INVALID_ICD_CODE',
        description: 'Bad code format',
      });
      const invalidErrors = await validate(invalidDto);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors[0].constraints?.matches).toBeDefined();

      const invalidDto2 = plainToInstance(AddDiagnosisDto, {
        code: '123.45',
        description: 'Numeric starting code is not ICD-10',
      });
      const invalidErrors2 = await validate(invalidDto2);
      expect(invalidErrors2.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // SECTION H: Non-Clinical Roles Access Restriction (RBAC)
  // ===========================================================================
  describe('H. Strict Clinical RBAC Restrictions', () => {
    it('H1: should reject RECEPTIONIST attempting to access clinical patient summary with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          medicalRecordsService.getPatientSummary(hospitalAId, patA1Id, {
            id: recAUserId,
            role: UserRole.RECEPTIONIST,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('H2: should reject ACCOUNTANT attempting to access clinical patient summary with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          medicalRecordsService.getPatientSummary(hospitalAId, patA1Id, {
            id: 'mock-accountant-id',
            role: UserRole.ACCOUNTANT,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('H3: should reject PHARMACIST attempting to access clinical patient summary with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          medicalRecordsService.getPatientSummary(hospitalAId, patA1Id, {
            id: 'mock-pharmacist-id',
            role: UserRole.PHARMACIST,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('H4: should reject LAB_TECHNICIAN attempting to access clinical patient summary with 403', async () => {
      await expect(
        withTenant(hospitalAId, () =>
          medicalRecordsService.getPatientSummary(hospitalAId, patA1Id, {
            id: 'mock-labtech-id',
            role: UserRole.LAB_TECHNICIAN,
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // SECTION I: Audit Logging & Sensitive Data Redaction
  // ===========================================================================
  describe('I. Clinical Audit Trails & Data Protection', () => {
    it('I1: should produce verified audit log entries for clinical operations with actor and tenant attribution', async () => {
      const logs = await prisma.raw.auditLog.findMany({
        where: {
          hospitalId: hospitalAId,
          userId: docA1UserId,
        },
      });

      expect(logs.length).toBeGreaterThan(0);
      const entityNames = logs.map((l) => l.entityName);
      expect(entityNames).toContain('PatientEncounter');
      expect(entityNames).toContain('MedicalRecordAmendment');
    });

    it('I2: audit log changesJson must NOT contain credentials, password hashes, or bearer tokens', async () => {
      const logs = await prisma.raw.auditLog.findMany({
        where: {
          hospitalId: hospitalAId,
          userId: docA1UserId,
        },
      });

      for (const log of logs) {
        const jsonStr = JSON.stringify(log.changesJson || {});
        expect(jsonStr).not.toContain('password');
        expect(jsonStr).not.toContain('token');
        expect(jsonStr).not.toContain('secret');
      }
    });
  });
});
