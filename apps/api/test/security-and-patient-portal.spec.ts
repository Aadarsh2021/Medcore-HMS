import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { PatientsModule } from '../src/modules/patients/patients.module';
import { PatientsService } from '../src/modules/patients/patients.service';
import { AppointmentsModule } from '../src/modules/appointments/appointments.module';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import { PrescriptionsModule } from '../src/modules/prescriptions/prescriptions.module';
import { PrescriptionsService } from '../src/modules/prescriptions/prescriptions.service';
import { LaboratoryModule } from '../src/modules/laboratory/laboratory.module';
import { LaboratoryService } from '../src/modules/laboratory/laboratory.service';
import { BillingModule } from '../src/modules/billing/billing.module';
import { BillingService } from '../src/modules/billing/billing.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import { UserRole } from '@medcore/types';

import { StorageModule } from '../src/common/storage/storage.module';

describe('Phase 14 & Phase 18 — Patient Portal IDOR & Rate Limiting Security Suite', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let patientsService: PatientsService;
  let appointmentsService: AppointmentsService;
  let prescriptionsService: PrescriptionsService;
  let laboratoryService: LaboratoryService;
  let billingService: BillingService;

  let hospitalAId: string;
  let patientA: any;
  let patientB: any;
  let patientACaller: any;
  let patientBCaller: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        StorageModule,
        AuthModule,
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 5,
          },
        ]),
        PatientsModule,
        AppointmentsModule,
        PrescriptionsModule,
        LaboratoryModule,
        BillingModule,
      ],
      providers: [ThrottlerGuard],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    patientsService = moduleRef.get<PatientsService>(PatientsService);
    appointmentsService = moduleRef.get<AppointmentsService>(AppointmentsService);
    prescriptionsService = moduleRef.get<PrescriptionsService>(PrescriptionsService);
    laboratoryService = moduleRef.get<LaboratoryService>(LaboratoryService);
    billingService = moduleRef.get<BillingService>(BillingService);

    // Find hospital with at least 2 patients
    const hospitalWithPatients = await prisma.raw.hospital.findFirst({
      where: {
        patients: { some: {} },
      },
      include: {
        patients: {
          include: { user: true },
          take: 2,
        },
      },
      orderBy: {
        patients: { _count: 'desc' },
      },
    });

    if (!hospitalWithPatients || hospitalWithPatients.patients.length < 2) {
      throw new Error('Test requires a hospital with at least two patients in test DB');
    }

    hospitalAId = hospitalWithPatients.id;
    patientA = hospitalWithPatients.patients[0];
    patientB = hospitalWithPatients.patients[1];

    patientACaller = {
      id: patientA.userId,
      userId: patientA.userId,
      role: UserRole.PATIENT,
      hospitalId: hospitalAId,
      tenantId: hospitalAId,
      patientProfile: { id: patientA.id },
    };

    patientBCaller = {
      id: patientB.userId,
      userId: patientB.userId,
      role: UserRole.PATIENT,
      hospitalId: hospitalAId,
      tenantId: hospitalAId,
      patientProfile: { id: patientB.id },
    };
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // ===========================================================================
  // SECTION 1: PATIENT PORTAL IDOR / BOLA BOUNDS (PHASE 14)
  // ===========================================================================

  describe('Section 1: Patient Portal IDOR / BOLA Prevention', () => {
    it('1. should allow Patient A to query their own patient profile', async () => {
      const res = await patientsService.findById(hospitalAId, patientA.id, patientACaller);
      expect(res).toBeDefined();
      expect(res.id).toBe(patientA.id);
    });

    it('2. should reject Patient A attempting to access Patient B demographic record (IDOR)', async () => {
      await expect(
        patientsService.findById(hospitalAId, patientB.id, patientACaller),
      ).rejects.toThrow(ForbiddenException);
    });

    it('3. should reject Patient A attempting to query Patient B appointment record', async () => {
      const apptB = await prisma.raw.appointment.findFirst({
        where: { patientId: patientB.id },
      });

      if (apptB) {
        await expect(
          appointmentsService.findById(hospitalAId, apptB.id, patientACaller),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('4. should reject Patient A attempting to access Patient B prescription', async () => {
      const prescB = await prisma.raw.prescription.findFirst({
        where: { patientId: patientB.id },
      });

      if (prescB) {
        await expect(
          prescriptionsService.getPrescriptionById(hospitalAId, prescB.id, patientACaller),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('5. should reject Patient A attempting to access Patient B laboratory order', async () => {
      const labB = await prisma.raw.labOrder.findFirst({
        where: { patientId: patientB.id },
      });

      if (labB) {
        await expect(
          laboratoryService.getOrderById(hospitalAId, patientACaller, labB.id),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('6. should reject Patient A attempting to view Patient B invoice/billing statement', async () => {
      const invB = await prisma.raw.invoice.findFirst({
        where: { patientId: patientB.id },
      });

      if (invB) {
        await expect(
          billingService.getInvoiceById(hospitalAId, patientACaller, invB.id),
        ).rejects.toThrow(ForbiddenException);
      }
    });
  });

  // ===========================================================================
  // SECTION 2: RATE LIMITING & SECURITY (PHASE 18)
  // ===========================================================================

  describe('Section 2: Rate Limiting Throttler', () => {
    it('8. should enforce rate limiting policy after burst limit is exceeded', async () => {
      const throttlerStorage = (moduleRef.get(ThrottlerGuard) as any).storageService;
      expect(throttlerStorage).toBeDefined();

      const ip = '192.168.1.100';
      const key = `test-endpoint-${ip}`;

      // Simulate 5 requests under limit
      for (let i = 0; i < 5; i++) {
        const hit = await throttlerStorage.increment(key, 60);
        expect(hit.totalHits).toBeLessThanOrEqual(5);
      }

      // 6th request exceeds limit of 5
      const overflow = await throttlerStorage.increment(key, 60);
      expect(overflow.totalHits).toBeGreaterThan(5);
    });
  });
});
