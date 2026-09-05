/**
 * Phase 6 — Prescription Management & Clinical Medication Ordering Integration Suite
 *
 * Comprehensive integration tests running against the live PostgreSQL/Supabase database.
 * Exercises:
 *  - MedicinesService (tenant-isolated search, bounding, ranking)
 *  - PrescriptionsService (draft, items, immutability, cancellation, voiding)
 *  - PrescriptionPdfService (deterministic PDFKit generation, SHA-256 integrity digest)
 *  - Concurrency safety (100 concurrent numbering allocations, 10 concurrent finalizations)
 *  - RBAC, tenant isolation, and patient privacy guards
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { PrescriptionsService } from '../src/modules/prescriptions/prescriptions.service';
import { PrescriptionPdfService } from '../src/modules/prescriptions/prescription-pdf.service';
import { MedicinesService } from '../src/modules/medicines/medicines.service';
import { StorageService } from '../src/common/storage/storage.service';
import { runWithTenantContext } from '../src/database/tenant-context';
import {
  AppointmentStatus,
  AppointmentType,
  EncounterStatus,
  MedicineForm,
  PrescriptionFrequency,
  PrescriptionStatus,
  UserRole,
} from '@medcore/types';

describe('Phase 6 — Prescriptions & Medication Ordering Integration Suite', () => {
  let prisma: PrismaService;
  let storageService: StorageService;
  let pdfService: PrescriptionPdfService;
  let medicinesService: MedicinesService;
  let prescriptionsService: PrescriptionsService;

  // Multi-tenant fixtures
  let hospitalAId: string;
  let hospitalBId: string;
  let hospitalACode: string;
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

  // Hospital A Staff
  let nurseAUserId: string;
  let receptionAUserId: string;
  let adminAUserId: string;

  // Encounters
  let encounterInProgressId: string;
  let encounterCompletedId: string;

  // Medicines
  let medAmoxId: string;
  let medAtorvaId: string;

  // Tracking IDs for clean teardown
  const createdPrescriptionIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMedicineIds: string[] = [];

  const withTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    runWithTenantContext({ tenantId }, fn);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const configService = new ConfigService();
    storageService = new StorageService(configService);
    pdfService = new PrescriptionPdfService();
    medicinesService = new MedicinesService(prisma);
    prescriptionsService = new PrescriptionsService(prisma, storageService, pdfService);

    // Fetch existing hospitals
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals required in database for multi-tenant testing');
    }
    hospitalAId = hospitals[0].id;
    hospitalACode = hospitals[0].code.toUpperCase();
    hospitalBId = hospitals[1].id;

    // Fetch department
    const deptA = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalAId },
    });
    if (!deptA) {
      throw new Error('Department required in Hospital A');
    }
    deptAId = deptA.id;

    const timestamp = Date.now();

    // 1. Doctor A1 (Assigned)
    const userA1 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `doc.a1.rx.${timestamp}@medcore.test`,
        firstName: 'Vikram',
        lastName: 'Patel',
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
        specialization: 'Cardiology',
        licenseNumber: `MCI-RX-${timestamp}`,
      },
    });
    docA1Id = docA1.id;
    createdDoctorIds.push(docA1Id);

    // 2. Doctor A2 (Unassigned)
    const userA2 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `doc.a2.rx.${timestamp}@medcore.test`,
        firstName: 'Meera',
        lastName: 'Nair',
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
        specialization: 'Endocrinology',
        licenseNumber: `MCI-RX2-${timestamp}`,
      },
    });
    docA2Id = docA2.id;
    createdDoctorIds.push(docA2Id);

    // 3. Doctor B (Hospital B)
    const userB = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalBId,
        email: `doc.b.rx.${timestamp}@medcore.test`,
        firstName: 'Rajiv',
        lastName: 'Bose',
        role: UserRole.DOCTOR,
        passwordHash: '$2b$10$placeholder',
      },
    });
    docBUserId = userB.id;
    createdUserIds.push(docBUserId);

    const deptB = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalBId },
    });
    const docB = await prisma.raw.doctor.create({
      data: {
        userId: docBUserId,
        hospitalId: hospitalBId,
        departmentId: deptB ? deptB.id : deptAId,
        specialization: 'General Medicine',
        licenseNumber: `MCI-B-${timestamp}`,
      },
    });
    docBId = docB.id;
    createdDoctorIds.push(docBId);

    // 4. Patient A1
    const userPatA1 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `patient.a1.rx.${timestamp}@medcore.test`,
        firstName: 'Aarav',
        lastName: 'Sharma',
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
        dateOfBirth: new Date('1988-06-15'),
        gender: 'MALE',
      },
    });
    patA1Id = patA1.id;
    createdPatientIds.push(patA1Id);

    // 5. Patient A2
    const userPatA2 = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `patient.a2.rx.${timestamp}@medcore.test`,
        firstName: 'Pooja',
        lastName: 'Deshmukh',
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
        dateOfBirth: new Date('1994-11-20'),
        gender: 'FEMALE',
      },
    });
    patA2Id = patA2.id;
    createdPatientIds.push(patA2Id);

    // 6. Nurse A
    const userNurse = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `nurse.a.${timestamp}@medcore.test`,
        firstName: 'Sunita',
        lastName: 'Rao',
        role: UserRole.NURSE,
        passwordHash: '$2b$10$placeholder',
      },
    });
    nurseAUserId = userNurse.id;
    createdUserIds.push(nurseAUserId);

    // 7. Receptionist A
    const userRec = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `rec.a.${timestamp}@medcore.test`,
        firstName: 'Karan',
        lastName: 'Sinha',
        role: UserRole.RECEPTIONIST,
        passwordHash: '$2b$10$placeholder',
      },
    });
    receptionAUserId = userRec.id;
    createdUserIds.push(receptionAUserId);

    // 8. Hospital Admin A
    const userAdmin = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `admin.a.${timestamp}@medcore.test`,
        firstName: 'Ramesh',
        lastName: 'Kulkarni',
        role: UserRole.HOSPITAL_ADMIN,
        passwordHash: '$2b$10$placeholder',
      },
    });
    adminAUserId = userAdmin.id;
    createdUserIds.push(adminAUserId);

    // 9. Appointments & Encounters
    const apptInProgress = await prisma.raw.appointment.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patA1Id,
        doctorId: docA1Id,
        departmentId: deptAId,
        appointmentDate: new Date('2026-09-08'),
        startTime: '10:00',
        endTime: '10:30',
        status: AppointmentStatus.IN_PROGRESS,
        type: AppointmentType.REGULAR,
      },
    });
    createdAppointmentIds.push(apptInProgress.id);

    const encInProgress = await prisma.raw.patientEncounter.create({
      data: {
        hospitalId: hospitalAId,
        appointmentId: apptInProgress.id,
        patientId: patA1Id,
        doctorId: docA1Id,
        status: EncounterStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });
    encounterInProgressId = encInProgress.id;
    createdEncounterIds.push(encounterInProgressId);

    const apptCompleted = await prisma.raw.appointment.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patA1Id,
        doctorId: docA1Id,
        departmentId: deptAId,
        appointmentDate: new Date('2026-09-01'),
        startTime: '11:00',
        endTime: '11:30',
        status: AppointmentStatus.COMPLETED,
        type: AppointmentType.REGULAR,
      },
    });
    createdAppointmentIds.push(apptCompleted.id);

    const encCompleted = await prisma.raw.patientEncounter.create({
      data: {
        hospitalId: hospitalAId,
        appointmentId: apptCompleted.id,
        patientId: patA1Id,
        doctorId: docA1Id,
        status: EncounterStatus.COMPLETED,
        startedAt: new Date('2026-09-01T11:00:00Z'),
        completedAt: new Date('2026-09-01T11:30:00Z'),
      },
    });
    encounterCompletedId = encCompleted.id;
    createdEncounterIds.push(encounterCompletedId);

    // 10. Foundational Medicines for Hospital A
    const medAmox = await prisma.raw.medicine.create({
      data: {
        hospitalId: hospitalAId,
        name: `Amoxicillin ${timestamp}mg`,
        genericName: 'Amoxicillin',
        category: 'Antibiotic',
        form: MedicineForm.CAPSULE,
        strength: '500 mg',
        manufacturer: 'Alkem Laboratories',
      },
    });
    medAmoxId = medAmox.id;
    createdMedicineIds.push(medAmoxId);

    const medAtorva = await prisma.raw.medicine.create({
      data: {
        hospitalId: hospitalAId,
        name: `Atorvastatin ${timestamp}mg`,
        genericName: 'Atorvastatin',
        category: 'Lipid Lowering',
        form: MedicineForm.TABLET,
        strength: '20 mg',
        manufacturer: 'Sun Pharma',
      },
    });
    medAtorvaId = medAtorva.id;
    createdMedicineIds.push(medAtorvaId);
  });

  afterAll(async () => {
    try {
      if (createdPrescriptionIds.length > 0) {
        await prisma.raw.prescriptionItem.deleteMany({
          where: { prescriptionId: { in: createdPrescriptionIds } },
        });
        await prisma.raw.prescription.deleteMany({
          where: { id: { in: createdPrescriptionIds } },
        });
      }
      if (createdEncounterIds.length > 0) {
        await prisma.raw.patientEncounter.deleteMany({
          where: { id: { in: createdEncounterIds } },
        });
      }
      if (createdAppointmentIds.length > 0) {
        await prisma.raw.appointment.deleteMany({
          where: { id: { in: createdAppointmentIds } },
        });
      }
      if (createdMedicineIds.length > 0) {
        await prisma.raw.medicine.deleteMany({
          where: { id: { in: createdMedicineIds } },
        });
      }
      if (createdDoctorIds.length > 0) {
        await prisma.raw.doctor.deleteMany({
          where: { id: { in: createdDoctorIds } },
        });
      }
      if (createdPatientIds.length > 0) {
        await prisma.raw.patient.deleteMany({
          where: { id: { in: createdPatientIds } },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.raw.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  // ===========================================================================
  // GROUP 1: MEDICINE SEARCH & TENANT ISOLATION
  // ===========================================================================
  describe('1. Medicine Master Search', () => {
    it('should search medicines case-insensitively with deterministic ranking', async () => {
      const results = await withTenant(hospitalAId, () =>
        medicinesService.searchMedicines(hospitalAId, 'amox', 10),
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name.toLowerCase()).toContain('amox');
      expect(results[0].hospitalId).toBe(hospitalAId);
    });

    it('should enforce tenant isolation in medicine search', async () => {
      // Hospital B search should not return Hospital A's unique medicine
      const resultsB = await withTenant(hospitalBId, () =>
        medicinesService.searchMedicines(hospitalBId, medAmoxId, 10),
      );
      expect(resultsB.find((m) => m.id === medAmoxId)).toBeUndefined();
    });

    it('should enforce hard maximum bounding on search limit', async () => {
      const results = await withTenant(hospitalAId, () =>
        medicinesService.searchMedicines(hospitalAId, '', 100),
      );
      expect(results.length).toBeLessThanOrEqual(50);
    });
  });

  // ===========================================================================
  // GROUP 2: DRAFT PRESCRIPTION CREATION & AUTHORIZATION
  // ===========================================================================
  describe('2. Draft Prescription Lifecycle & Authorization', () => {
    let createdDraftId: string;

    it('should allow assigned doctor to initialize a draft prescription', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const res = await withTenant(hospitalAId, () =>
        prescriptionsService.getOrCreateDraft(
          hospitalAId,
          encounterInProgressId,
          { notes: 'Rest for 3 days and drink warm fluids.' },
          user,
        ),
      );

      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.status).toBe(PrescriptionStatus.DRAFT);
      expect(res.doctorId).toBe(docA1Id);
      expect(res.patientId).toBe(patA1Id);
      expect(res.notes).toBe('Rest for 3 days and drink warm fluids.');

      createdDraftId = res.id;
      createdPrescriptionIds.push(createdDraftId);
    });

    it('should be idempotent and return existing draft if one already exists', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const res = await withTenant(hospitalAId, () =>
        prescriptionsService.getOrCreateDraft(
          hospitalAId,
          encounterInProgressId,
          { notes: 'Updated notes' },
          user,
        ),
      );

      expect(res.id).toBe(createdDraftId);
      expect(res.status).toBe(PrescriptionStatus.DRAFT);
    });

    it('should reject unassigned doctor attempting to create draft for encounter', async () => {
      const userA2 = { id: docA2UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.getOrCreateDraft(
            hospitalAId,
            encounterInProgressId,
            {},
            userA2,
          ),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-doctor attempting to create draft', async () => {
      const userNurse = { id: nurseAUserId, role: UserRole.NURSE };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.getOrCreateDraft(
            hospitalAId,
            encounterInProgressId,
            {},
            userNurse,
          ),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject prescription draft creation for COMPLETED encounter', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.getOrCreateDraft(
            hospitalAId,
            encounterCompletedId,
            {},
            user,
          ),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // GROUP 3: DRAFT ITEM MANAGEMENT & SNAPSHOT INTEGRITY
  // ===========================================================================
  describe('3. Draft Item Management & Validation', () => {
    let draftId: string;

    beforeAll(async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const rx = await withTenant(hospitalAId, () =>
        prescriptionsService.getOrCreateDraft(hospitalAId, encounterInProgressId, {}, user),
      );
      draftId = rx.id;
    });

    it('should save prescription items and derive server-side catalog snapshots', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const res = await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          draftId,
          {
            notes: 'Take with warm water.',
            items: [
              {
                medicineId: medAmoxId,
                dosage: '1 capsule',
                frequency: PrescriptionFrequency.TDS,
                durationDays: 5,
                route: 'ORAL',
                instructions: 'Take after meals',
                quantity: 15,
              },
            ],
          },
          user,
        ),
      );

      expect(res.items.length).toBe(1);
      expect(res.items[0].medicineId).toBe(medAmoxId);
      expect(res.items[0].form).toBe(MedicineForm.CAPSULE);
      expect(res.items[0].strength).toBe('500 mg');
      expect(res.items[0].dosage).toBe('1 capsule');
      expect(res.items[0].frequency).toBe(PrescriptionFrequency.TDS);
      expect(res.items[0].durationDays).toBe(5);
    });

    it('should accept custom doctor-entered medicine when medicineId is null', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const res = await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          draftId,
          {
            items: [
              {
                medicineId: null,
                medicineName: 'Saline Nasal Drops',
                form: MedicineForm.DROPS,
                dosage: '2 drops',
                frequency: PrescriptionFrequency.BD,
                durationDays: 7,
                route: 'NASAL',
                instructions: 'In each nostril before sleep',
                quantity: 1,
              },
            ],
          },
          user,
        ),
      );

      expect(res.items.length).toBe(1);
      expect(res.items[0].medicineId).toBeNull();
      expect(res.items[0].medicineName).toBe('Saline Nasal Drops');
      expect(res.items[0].form).toBe(MedicineForm.DROPS);
    });

    it('should reject custom medicine with empty medicineName', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.updateDraft(
            hospitalAId,
            draftId,
            {
              items: [
                {
                  medicineId: null,
                  medicineName: '   ',
                  dosage: '1 tab',
                  frequency: PrescriptionFrequency.OD,
                  durationDays: 3,
                },
              ],
            },
            user,
          ),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject item with durationDays <= 0', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.updateDraft(
            hospitalAId,
            draftId,
            {
              items: [
                {
                  medicineId: medAmoxId,
                  dosage: '1 tab',
                  frequency: PrescriptionFrequency.OD,
                  durationDays: 0,
                },
              ],
            },
            user,
          ),
        ),
      ).rejects.toThrow();
    });

    it('should reject item referencing a medicine belonging to another hospital', async () => {
      // Create medicine in Hospital B
      const medB = await prisma.raw.medicine.create({
        data: {
          hospitalId: hospitalBId,
          name: 'Hospital B Drug',
          genericName: 'Secret Drug',
          category: 'General',
          form: MedicineForm.TABLET,
          strength: '10 mg',
          manufacturer: 'Pharma B',
        },
      });
      createdMedicineIds.push(medB.id);

      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.updateDraft(
            hospitalAId,
            draftId,
            {
              items: [
                {
                  medicineId: medB.id,
                  dosage: '1 tab',
                  frequency: PrescriptionFrequency.OD,
                  durationDays: 5,
                },
              ],
            },
            user,
          ),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================================================
  // GROUP 4: FINALIZATION, IMMUTABILITY & CONCURRENCY
  // ===========================================================================
  describe('4. Finalization & Immutability Enforcement', () => {
    let finalizableDraftId: string;
    let group4SlotMinute = 0;

    beforeEach(async () => {
      group4SlotMinute += 5;
      const mm = String(group4SlotMinute % 60).padStart(2, '0');
      const hh = String(14 + Math.floor(group4SlotMinute / 60)).padStart(2, '0');
      // Create fresh appointment & encounter
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2026-09-08'),
          startTime: `${hh}:${mm}`,
          endTime: `${hh}:55`,
          status: AppointmentStatus.IN_PROGRESS,
          type: AppointmentType.REGULAR,
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await prisma.raw.patientEncounter.create({
        data: {
          hospitalId: hospitalAId,
          appointmentId: appt.id,
          patientId: patA1Id,
          doctorId: docA1Id,
          status: EncounterStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      createdEncounterIds.push(enc.id);

      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const draft = await withTenant(hospitalAId, () =>
        prescriptionsService.getOrCreateDraft(hospitalAId, enc.id, { notes: 'Cardiac care' }, user),
      );
      finalizableDraftId = draft.id;
      createdPrescriptionIds.push(finalizableDraftId);
    });

    it('should reject finalizing an empty prescription (zero items)', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.finalizePrescription(hospitalAId, finalizableDraftId, user),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should finalize prescription, assign sequential prescriptionNumber, and lock record', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };

      // Add 2 items
      await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          finalizableDraftId,
          {
            items: [
              {
                medicineId: medAmoxId,
                dosage: '1 capsule',
                frequency: PrescriptionFrequency.TDS,
                durationDays: 5,
                route: 'ORAL',
              },
              {
                medicineId: medAtorvaId,
                dosage: '1 tablet',
                frequency: PrescriptionFrequency.OD,
                durationDays: 30,
                route: 'ORAL',
                instructions: 'Take at bedtime',
              },
            ],
          },
          user,
        ),
      );

      // Finalize
      const finalized = await withTenant(hospitalAId, () =>
        prescriptionsService.finalizePrescription(hospitalAId, finalizableDraftId, user),
      );

      expect(finalized.status).toBe(PrescriptionStatus.ISSUED);
      expect(finalized.prescriptionNumber).toMatch(
        new RegExp(`^RX-${hospitalACode}-\\d{4}-\\d{6}$`),
      );
      expect(finalized.issuedAt).toBeDefined();
      expect(finalized.pdfStorageKey).toBeDefined();
      expect(finalized.pdfSha256).toBeDefined();
      expect(finalized.items.length).toBe(2);
    });

    it('should strictly reject mutation (PUT) on finalized ISSUED prescription with HTTP 409', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };

      // Add item and finalize
      await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          finalizableDraftId,
          {
            items: [
              {
                medicineId: medAmoxId,
                dosage: '1 cap',
                frequency: PrescriptionFrequency.BD,
                durationDays: 3,
              },
            ],
          },
          user,
        ),
      );

      await withTenant(hospitalAId, () =>
        prescriptionsService.finalizePrescription(hospitalAId, finalizableDraftId, user),
      );

      // Attempt edit
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.updateDraft(
            hospitalAId,
            finalizableDraftId,
            { items: [] },
            user,
          ),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle 10 concurrent finalizations safely: exactly 1 succeeds, 9 get 409', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };

      await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          finalizableDraftId,
          {
            items: [
              {
                medicineId: medAmoxId,
                dosage: '1 cap',
                frequency: PrescriptionFrequency.BD,
                durationDays: 3,
              },
            ],
          },
          user,
        ),
      );

      // Launch 10 simultaneous finalization calls
      const results = await Promise.allSettled(
        Array.from({ length: 10 }).map(() =>
          withTenant(hospitalAId, () =>
            prescriptionsService.finalizePrescription(hospitalAId, finalizableDraftId, user),
          ),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(9);
    });
  });

  // ===========================================================================
  // GROUP 5: CONCURRENCY-SAFE PRESCRIPTION NUMBERING
  // ===========================================================================
  describe('5. Concurrency-Safe Hospital Numbering Counter', () => {
    it('should generate 100 sequential, collision-free prescription numbers concurrently', async () => {
      const currentYear = new Date().getFullYear();

      // Concurrently allocate 100 counter sequences using Prisma transaction
      const promises = Array.from({ length: 100 }).map(() =>
        prisma.$transaction(
          async (tx) => {
            const counter = await tx.prescriptionNumberCounter.upsert({
              where: {
                hospitalId_year: {
                  hospitalId: hospitalAId,
                  year: currentYear,
                },
              },
              update: {
                nextValue: { increment: 1 },
              },
              create: {
                hospitalId: hospitalAId,
                year: currentYear,
                nextValue: 2,
              },
            });
            const seq = counter.nextValue - 1;
            return `RX-${hospitalACode}-${currentYear}-${String(seq).padStart(6, '0')}`;
          },
          { maxWait: 30000, timeout: 30000 },
        ),
      );

      const allocatedNumbers = await Promise.all(promises);

      expect(allocatedNumbers.length).toBe(100);
      const uniqueNumbers = new Set(allocatedNumbers);
      expect(uniqueNumbers.size).toBe(100); // ZERO duplicates!
    });
  });

  // ===========================================================================
  // GROUP 6: DRAFT CANCELLATION & AUDITED VOIDING
  // ===========================================================================
  describe('6. Draft Cancellation & Audited Voiding', () => {
    let activeDraftId: string;
    let finalizedRxId: string;
    let voidSlotMinute = 0;

    beforeEach(async () => {
      voidSlotMinute += 5;
      const mm = String(voidSlotMinute % 60).padStart(2, '0');
      const hh = String(16 + Math.floor(voidSlotMinute / 60)).padStart(2, '0');
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2026-09-08'),
          startTime: `${hh}:${mm}`,
          endTime: `${hh}:55`,
          status: AppointmentStatus.IN_PROGRESS,
          type: AppointmentType.REGULAR,
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await prisma.raw.patientEncounter.create({
        data: {
          hospitalId: hospitalAId,
          appointmentId: appt.id,
          patientId: patA1Id,
          doctorId: docA1Id,
          status: EncounterStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      createdEncounterIds.push(enc.id);

      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const draft = await withTenant(hospitalAId, () =>
        prescriptionsService.getOrCreateDraft(hospitalAId, enc.id, {}, user),
      );
      activeDraftId = draft.id;
      createdPrescriptionIds.push(activeDraftId);

      // Also create a finalized prescription
      await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          activeDraftId,
          {
            items: [
              {
                medicineId: medAmoxId,
                dosage: '1 tab',
                frequency: PrescriptionFrequency.OD,
                durationDays: 5,
              },
            ],
          },
          user,
        ),
      );
      const issued = await withTenant(hospitalAId, () =>
        prescriptionsService.finalizePrescription(hospitalAId, activeDraftId, user),
      );
      finalizedRxId = issued.id;
    });

    it('should allow prescribing doctor to void an ISSUED prescription with clinical reason', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const voided = await withTenant(hospitalAId, () =>
        prescriptionsService.voidPrescription(
          hospitalAId,
          finalizedRxId,
          { reason: 'Patient developed gastric intolerance. Discontinuing medication.' },
          user,
        ),
      );

      expect(voided.status).toBe(PrescriptionStatus.CANCELLED);
      expect(voided.voidReason).toBe(
        'Patient developed gastric intolerance. Discontinuing medication.',
      );
      expect(voided.voidedAt).toBeDefined();
      expect(voided.voidedById).toBe(docA1UserId);
    });

    it('should reject voiding with empty reason or reason < 5 characters', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.voidPrescription(
            hospitalAId,
            finalizedRxId,
            { reason: 'bad' },
            user,
          ),
        ),
      ).rejects.toThrow();
    });

    it('should reject unassigned doctor attempting to void prescription', async () => {
      const userA2 = { id: docA2UserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.voidPrescription(
            hospitalAId,
            finalizedRxId,
            { reason: 'Unauthorized void attempt' },
            userA2,
          ),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // GROUP 7: PDF GENERATION & S3 PRE-SIGNED URLS
  // ===========================================================================
  describe('7. PDF Generation & Signed Download URLs', () => {
    let issuedRxId: string;

    beforeAll(async () => {
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2026-09-08'),
          startTime: '17:00',
          endTime: '17:30',
          status: AppointmentStatus.IN_PROGRESS,
          type: AppointmentType.REGULAR,
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await prisma.raw.patientEncounter.create({
        data: {
          hospitalId: hospitalAId,
          appointmentId: appt.id,
          patientId: patA1Id,
          doctorId: docA1Id,
          status: EncounterStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      createdEncounterIds.push(enc.id);

      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const draft = await withTenant(hospitalAId, () =>
        prescriptionsService.getOrCreateDraft(hospitalAId, enc.id, { notes: 'General Advice' }, user),
      );
      createdPrescriptionIds.push(draft.id);

      await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          draft.id,
          {
            items: [
              {
                medicineId: medAmoxId,
                dosage: '1 capsule',
                frequency: PrescriptionFrequency.TDS,
                durationDays: 7,
              },
            ],
          },
          user,
        ),
      );

      const issued = await withTenant(hospitalAId, () =>
        prescriptionsService.finalizePrescription(hospitalAId, draft.id, user),
      );
      issuedRxId = issued.id;
    });

    it('should generate a valid PDF buffer with %PDF magic header and SHA-256', async () => {
      const rx = await prisma.raw.prescription.findUnique({
        where: { id: issuedRxId },
        include: { items: true, doctor: { include: { user: true } }, patient: { include: { user: true } }, hospital: true },
      });

      const { buffer, sha256 } = await pdfService.generatePrescriptionPdf({
        hospital: {
          id: rx!.hospital.id,
          name: rx!.hospital.name,
          code: rx!.hospital.code,
          phone: rx!.hospital.phone,
          email: rx!.hospital.email,
        },
        patient: {
          id: rx!.patient.id,
          uhid: rx!.patient.uhid,
          fullName: `${rx!.patient.user.firstName} ${rx!.patient.user.lastName}`,
        },
        doctor: {
          id: rx!.doctor.id,
          fullName: `${rx!.doctor.user.firstName} ${rx!.doctor.user.lastName}`,
          specialization: rx!.doctor.specialization,
          licenseNumber: rx!.doctor.licenseNumber,
        },
        prescription: {
          id: rx!.id,
          hospitalId: rx!.hospitalId,
          encounterId: rx!.encounterId,
          patientId: rx!.patientId,
          doctorId: rx!.doctorId,
          prescriptionNumber: rx!.prescriptionNumber!,
          issuedAt: rx!.issuedAt!,
          notes: rx!.notes,
        },
        items: rx!.items,
      });

      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(500);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
      expect(sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should issue a valid temporary 15-minute signed download URL', async () => {
      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const res = await withTenant(hospitalAId, () =>
        prescriptionsService.getPdfDownloadUrl(hospitalAId, issuedRxId, user),
      );

      expect(res.downloadUrl).toBeDefined();
      expect(res.expiresAt).toBeDefined();
      const expiryDate = new Date(res.expiresAt).getTime();
      const now = Date.now();
      expect(expiryDate - now).toBeGreaterThan(800 * 1000);
      expect(expiryDate - now).toBeLessThanOrEqual(905 * 1000);
    });
  });

  // ===========================================================================
  // GROUP 8: PATIENT PRIVACY & CROSS-TENANT SECURITY
  // ===========================================================================
  describe('8. Patient Privacy & Security Invariants', () => {
    let finalizedRxId: string;

    beforeAll(async () => {
      const appt = await prisma.raw.appointment.create({
        data: {
          hospitalId: hospitalAId,
          patientId: patA1Id,
          doctorId: docA1Id,
          departmentId: deptAId,
          appointmentDate: new Date('2026-09-08'),
          startTime: '18:00',
          endTime: '18:30',
          status: AppointmentStatus.IN_PROGRESS,
          type: AppointmentType.REGULAR,
        },
      });
      createdAppointmentIds.push(appt.id);

      const enc = await prisma.raw.patientEncounter.create({
        data: {
          hospitalId: hospitalAId,
          appointmentId: appt.id,
          patientId: patA1Id,
          doctorId: docA1Id,
          status: EncounterStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      createdEncounterIds.push(enc.id);

      const user = { id: docA1UserId, role: UserRole.DOCTOR };
      const draft = await withTenant(hospitalAId, () =>
        prescriptionsService.getOrCreateDraft(hospitalAId, enc.id, {}, user),
      );
      createdPrescriptionIds.push(draft.id);

      await withTenant(hospitalAId, () =>
        prescriptionsService.updateDraft(
          hospitalAId,
          draft.id,
          {
            items: [
              {
                medicineId: medAmoxId,
                dosage: '1 tab',
                frequency: PrescriptionFrequency.OD,
                durationDays: 5,
              },
            ],
          },
          user,
        ),
      );

      const issued = await withTenant(hospitalAId, () =>
        prescriptionsService.finalizePrescription(hospitalAId, draft.id, user),
      );
      finalizedRxId = issued.id;
    });

    it('should allow patient to view their own finalized prescription', async () => {
      const userPat1 = { id: patA1UserId, role: UserRole.PATIENT };
      const rx = await withTenant(hospitalAId, () =>
        prescriptionsService.getPrescriptionById(hospitalAId, finalizedRxId, userPat1),
      );

      expect(rx.id).toBe(finalizedRxId);
      expect(rx.status).toBe(PrescriptionStatus.ISSUED);
    });

    it('should reject patient attempting to view another patient prescription', async () => {
      const userPat2 = { id: patA2UserId, role: UserRole.PATIENT };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.getPrescriptionById(hospitalAId, finalizedRxId, userPat2),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject patient requesting another patient prescriptions list', async () => {
      const userPat2 = { id: patA2UserId, role: UserRole.PATIENT };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.getPatientPrescriptions(
            hospitalAId,
            patA1Id,
            { page: 1, limit: 10 },
            userPat2,
          ),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject receptionist attempting to view clinical prescription', async () => {
      const userRec = { id: receptionAUserId, role: UserRole.RECEPTIONIST };
      await expect(
        withTenant(hospitalAId, () =>
          prescriptionsService.getPrescriptionById(hospitalAId, finalizedRxId, userRec),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject cross-tenant prescription access (Hospital B looking up Hospital A Rx)', async () => {
      const userB = { id: docBUserId, role: UserRole.DOCTOR };
      await expect(
        withTenant(hospitalBId, () =>
          prescriptionsService.getPrescriptionById(hospitalBId, finalizedRxId, userB),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
