import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AppointmentsModule } from '../src/modules/appointments/appointments.module';
import { AppointmentsController } from '../src/modules/appointments/appointments.controller';
import { BillingModule } from '../src/modules/billing/billing.module';
import { BillingController } from '../src/modules/billing/billing.controller';
import { StorageModule } from '../src/common/storage/storage.module';
import { UserRole } from '@medcore/types';

describe('Phase 7 — RBAC Role Access & Multi-Tenant Authorization Regression Suite', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let billingController: BillingController;
  let appointmentsController: AppointmentsController;

  let hospitalAId: string;
  let patientA: any;
  let patientB: any;
  let doctorA: any;

  // Mock Request User Callers for all PRD Roles
  let patientACaller: any;
  let patientBCaller: any;
  let doctorACaller: any;
  let receptionistCaller: any;
  let nurseCaller: any;
  let accountantCaller: any;
  let hospitalAdminCaller: any;
  let superAdminCaller: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        StorageModule,
        AuthModule,
        AppointmentsModule,
        BillingModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    billingController = moduleRef.get<BillingController>(BillingController);
    appointmentsController = moduleRef.get<AppointmentsController>(AppointmentsController);

    // Locate hospital with sufficient seeded patients and doctors
    const hospital = await prisma.raw.hospital.findFirst({
      where: {
        code: 'METRO-MUM-01',
      },
      include: {
        patients: {
          include: { user: true },
          take: 2,
        },
        doctors: {
          include: { user: true },
          take: 1,
        },
      },
    });

    if (!hospital || hospital.patients.length < 2 || hospital.doctors.length < 1) {
      throw new Error('Test requires a hospital with at least 2 patients and 1 doctor in DB');
    }

    hospitalAId = hospital.id;
    patientA = hospital.patients[0];
    patientB = hospital.patients[1];
    doctorA = hospital.doctors[0];

    patientACaller = {
      id: patientA.userId,
      role: UserRole.PATIENT,
      hospitalId: hospitalAId,
      patientProfile: { id: patientA.id, uhid: patientA.uhid },
    };

    patientBCaller = {
      id: patientB.userId,
      role: UserRole.PATIENT,
      hospitalId: hospitalAId,
      patientProfile: { id: patientB.id, uhid: patientB.uhid },
    };

    doctorACaller = {
      id: doctorA.userId,
      role: UserRole.DOCTOR,
      hospitalId: hospitalAId,
      doctorProfile: { id: doctorA.id },
    };

    receptionistCaller = {
      id: 'mock-receptionist-id',
      role: UserRole.RECEPTIONIST,
      hospitalId: hospitalAId,
    };

    nurseCaller = {
      id: 'mock-nurse-id',
      role: UserRole.NURSE,
      hospitalId: hospitalAId,
    };

    accountantCaller = {
      id: 'mock-accountant-id',
      role: UserRole.ACCOUNTANT,
      hospitalId: hospitalAId,
    };

    hospitalAdminCaller = {
      id: 'mock-hosp-admin-id',
      role: UserRole.HOSPITAL_ADMIN,
      hospitalId: hospitalAId,
    };

    superAdminCaller = {
      id: 'mock-super-admin-id',
      role: UserRole.SUPER_ADMIN,
      hospitalId: null,
    };
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // ===========================================================================
  // SECTION 1: BILLING INVOICES ACCESS (GET /api/billing/invoices)
  // Staff Ledger Guard Verification
  // ===========================================================================

  describe('1. Facility Invoices Ledger (GET /api/billing/invoices)', () => {
    it('1.1 should allow ACCOUNTANT to query hospital invoices', async () => {
      const res = await billingController.getInvoices(
        { user: accountantCaller },
        hospitalAId,
        {},
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('1.2 should allow HOSPITAL_ADMIN to query hospital invoices', async () => {
      const res = await billingController.getInvoices(
        { user: hospitalAdminCaller },
        hospitalAId,
        {},
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('1.3 should allow RECEPTIONIST to query hospital invoices', async () => {
      const res = await billingController.getInvoices(
        { user: receptionistCaller },
        hospitalAId,
        {},
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('1.4 should allow DOCTOR to query hospital invoices', async () => {
      const res = await billingController.getInvoices(
        { user: doctorACaller },
        hospitalAId,
        {},
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('1.5 should allow SUPER_ADMIN to query hospital invoices with header override', async () => {
      const res = await billingController.getInvoices(
        { user: superAdminCaller },
        hospitalAId,
        {},
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('1.6 should confirm Roles metadata on getInvoices excludes PATIENT role', () => {
      const roles = Reflect.getMetadata('roles', billingController.getInvoices);
      expect(roles).toBeDefined();
      expect(roles).not.toContain(UserRole.PATIENT);
      expect(roles).toContain(UserRole.ACCOUNTANT);
      expect(roles).toContain(UserRole.HOSPITAL_ADMIN);
      expect(roles).toContain(UserRole.RECEPTIONIST);
      expect(roles).toContain(UserRole.DOCTOR);
      expect(roles).toContain(UserRole.SUPER_ADMIN);
    });
  });

  // ===========================================================================
  // SECTION 2: PATIENT INVOICES ACCESS (GET /api/billing/patients/:patientId/invoices)
  // Scoped Patient Invoice & IDOR Prevention Verification
  // ===========================================================================

  describe('2. Patient-Scoped Invoices (GET /api/billing/patients/:patientId/invoices)', () => {
    it('2.1 should allow PATIENT to query own invoices using "me" identifier', async () => {
      const res = await billingController.getPatientInvoices(
        { user: patientACaller },
        hospitalAId,
        'me',
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
      // All returned invoices must belong to Patient A
      for (const inv of res.items) {
        expect(inv.patientId).toBe(patientA.id);
      }
    });

    it('2.2 should allow PATIENT to query own invoices using their own patient UUID', async () => {
      const res = await billingController.getPatientInvoices(
        { user: patientACaller },
        hospitalAId,
        patientA.id,
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
      for (const inv of res.items) {
        expect(inv.patientId).toBe(patientA.id);
      }
    });

    it('2.3 should REJECT Patient A querying Patient B invoices (IDOR prevention)', async () => {
      await expect(
        billingController.getPatientInvoices(
          { user: patientACaller },
          hospitalAId,
          patientB.id,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('2.4 should reject non-patient staff using "me" identifier without patient profile', async () => {
      await expect(
        billingController.getPatientInvoices(
          { user: accountantCaller },
          hospitalAId,
          'me',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('2.5 should allow ACCOUNTANT to query any patient invoices by UUID', async () => {
      const res = await billingController.getPatientInvoices(
        { user: accountantCaller },
        hospitalAId,
        patientA.id,
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('2.6 should allow HOSPITAL_ADMIN to query any patient invoices by UUID', async () => {
      const res = await billingController.getPatientInvoices(
        { user: hospitalAdminCaller },
        hospitalAId,
        patientA.id,
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('2.7 should allow DOCTOR to query patient invoices by UUID', async () => {
      const res = await billingController.getPatientInvoices(
        { user: doctorACaller },
        hospitalAId,
        patientA.id,
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });

    it('2.8 should allow SUPER_ADMIN to query patient invoices with hospital override', async () => {
      const res = await billingController.getPatientInvoices(
        { user: superAdminCaller },
        hospitalAId,
        patientA.id,
      );
      expect(res).toBeDefined();
      expect(res.items).toBeInstanceOf(Array);
    });
  });

  // ===========================================================================
  // SECTION 3: APPOINTMENTS ACCESS & SCOPING (GET /api/appointments)
  // Scoped Outpatient Scheduling Verification
  // ===========================================================================

  describe('3. Role-Scoped Outpatient Appointments (GET /api/appointments)', () => {
    it('3.1 should allow PATIENT to query appointments, scoped strictly to their own ID', async () => {
      const res = await appointmentsController.list(
        hospitalAId,
        {},
        patientACaller,
      );
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.data).toBeInstanceOf(Array);
      // All returned records must belong to patient A
      for (const apt of res.data) {
        expect(apt.patientId).toBe(patientA.id);
      }
    });

    it('3.2 should allow DOCTOR to query appointments, scoped strictly to their assigned doctor ID', async () => {
      const res = await appointmentsController.list(
        hospitalAId,
        {},
        doctorACaller,
      );
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.data).toBeInstanceOf(Array);
      for (const apt of res.data) {
        expect(apt.doctorId).toBe(doctorA.id);
      }
    });

    it('3.3 should allow RECEPTIONIST to list hospital appointments', async () => {
      const res = await appointmentsController.list(
        hospitalAId,
        {},
        receptionistCaller,
      );
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.data).toBeInstanceOf(Array);
    });

    it('3.4 should allow NURSE to list hospital appointments', async () => {
      const res = await appointmentsController.list(
        hospitalAId,
        {},
        nurseCaller,
      );
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.data).toBeInstanceOf(Array);
    });

    it('3.5 should allow HOSPITAL_ADMIN to list hospital appointments', async () => {
      const res = await appointmentsController.list(
        hospitalAId,
        {},
        hospitalAdminCaller,
      );
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.data).toBeInstanceOf(Array);
    });

    it('3.6 should allow SUPER_ADMIN to list appointments with tenant context', async () => {
      const res = await appointmentsController.list(
        hospitalAId,
        {},
        superAdminCaller,
      );
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
      expect(res.data).toBeInstanceOf(Array);
    });

    it('3.7 should reject appointment queries when tenant context is missing', async () => {
      await expect(
        appointmentsController.list(null, {}, receptionistCaller),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
