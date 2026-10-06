import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { ClinicalDictionaryService } from '../src/modules/clinical-dictionary/clinical-dictionary.service';
import { ClinicalDictionaryController } from '../src/modules/clinical-dictionary/clinical-dictionary.controller';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { AnalyticsController } from '../src/modules/analytics/analytics.controller';
import { SupabaseService } from '../src/modules/auth/supabase.service';
import { UserRole } from '@medcore/types';

describe('Phase 15 & Phase 16 — Analytics & ICD-10 Clinical Dictionary Suite', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let dictionaryService: ClinicalDictionaryService;
  let dictionaryController: ClinicalDictionaryController;
  let analyticsService: AnalyticsService;
  let analyticsController: AnalyticsController;

  let hospitalAId: string;
  let hospitalBId: string;
  let superAdminUser: any;
  let hospitalAdminA: any;
  let doctorA: any;
  let patientA: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
      ],
      providers: [
        ClinicalDictionaryService,
        ClinicalDictionaryController,
        AnalyticsService,
        AnalyticsController,
        SupabaseService,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    dictionaryService = moduleRef.get<ClinicalDictionaryService>(ClinicalDictionaryService);
    dictionaryController = moduleRef.get<ClinicalDictionaryController>(ClinicalDictionaryController);
    analyticsService = moduleRef.get<AnalyticsService>(AnalyticsService);
    analyticsController = moduleRef.get<AnalyticsController>(AnalyticsController);

    // Fetch hospitals
    const hospitals = await prisma.raw.hospital.findMany({ take: 2 });
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // Fetch users for different roles
    const adminA = await prisma.raw.user.findFirst({
      where: { hospitalId: hospitalAId, role: UserRole.HOSPITAL_ADMIN as any },
    });
    hospitalAdminA = { id: adminA?.id || 'admin-a', hospitalId: hospitalAId, role: UserRole.HOSPITAL_ADMIN };

    const docA = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    doctorA = { id: docA?.userId || 'doc-a', hospitalId: hospitalAId, role: UserRole.DOCTOR };

    const patA = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    patientA = { id: patA?.userId || 'pat-a', hospitalId: hospitalAId, role: UserRole.PATIENT };

    superAdminUser = { id: 'super-admin-root', role: UserRole.SUPER_ADMIN, hospitalId: null };
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // ===========================================================================
  // SECTION 1: ICD-10 CLINICAL DICTIONARY (PHASE 16)
  // ===========================================================================

  describe('Section 1: ICD-10 Clinical Dictionary', () => {
    it('1. should return common ICD-10 codes when queried with empty search', () => {
      const res = dictionaryController.searchIcd10();
      expect(res.success).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);
      expect(res.data.every((item: any) => item.code && item.description)).toBe(true);
    });

    it('2. should find ICD-10 codes by exact code or prefix (e.g. E11, I10, J06)', () => {
      const e11Results = dictionaryController.searchIcd10('E11');
      expect(e11Results.success).toBe(true);
      expect(e11Results.data.some((d: any) => d.code === 'E11.9')).toBe(true);

      const i10Results = dictionaryController.searchIcd10('I10');
      expect(i10Results.data.some((d: any) => d.code === 'I10')).toBe(true);
    });

    it('3. should find ICD-10 codes by clinical description (e.g. hypertension, asthma)', () => {
      const hyperResults = dictionaryController.searchIcd10('hypertension');
      expect(hyperResults.data.length).toBeGreaterThan(0);
      expect(hyperResults.data[0].code).toBe('I10');

      const asthmaResults = dictionaryController.searchIcd10('asthma');
      expect(asthmaResults.data.some((d: any) => d.code === 'J45.909')).toBe(true);
    });

    it('4. should retrieve single ICD-10 entry by exact code', () => {
      const res = dictionaryController.getIcd10ByCode('J06.9');
      expect(res.success).toBe(true);
      expect(res.data.code).toBe('J06.9');
      expect(res.data.category).toBe('Respiratory System');
    });

    it('5. should return 404 NotFoundException for non-existent ICD-10 code', () => {
      expect(() => dictionaryController.getIcd10ByCode('NON_EXISTENT_CODE')).toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================================================
  // SECTION 2: ANALYTICS & REPORTING ENGINE (PHASE 15)
  // ===========================================================================

  describe('Section 2: Multi-Tenant Analytics & Reporting', () => {
    it('6. should allow Super Admin to query system-wide analytics overview', async () => {
      const res = await analyticsController.getSystemOverview(superAdminUser);
      expect(res.success).toBe(true);
      expect(res.data.totalHospitals).toBeGreaterThanOrEqual(1);
      expect(res.data.totalUsers).toBeGreaterThanOrEqual(1);
      expect(res.data.financials).toBeDefined();
    });

    it('7. should allow Hospital Admin to retrieve their own hospital analytics report', async () => {
      const res = await analyticsController.getHospitalAnalytics(hospitalAdminA);
      expect(res.success).toBe(true);
      expect(res.data.hospitalId).toBe(hospitalAId);
      expect(res.data.operational).toBeDefined();
      expect(res.data.operational.totalAppointments).toBeGreaterThanOrEqual(0);
      expect(res.data.departments).toBeInstanceOf(Array);
      expect(res.data.pharmacy).toBeDefined();
      expect(res.data.billing).toBeDefined();
    });

    it('8. should allow Super Admin to query specific hospital analytics with parameter', async () => {
      const res = await analyticsController.getHospitalAnalytics(superAdminUser, hospitalAId);
      expect(res.success).toBe(true);
      expect(res.data.hospitalId).toBe(hospitalAId);
    });

    it('9. should reject Hospital Admin attempting to query another hospital analytics (tenant isolation)', async () => {
      await expect(
        analyticsController.getHospitalAnalytics(hospitalAdminA, hospitalBId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('10. should reject non-administrative users attempting to view system analytics', async () => {
      await expect(analyticsController.getSystemOverview(hospitalAdminA)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(analyticsController.getSystemOverview(doctorA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('11. should accurately compute financial metrics and collection efficiency', async () => {
      const data = await analyticsService.getHospitalAnalytics(hospitalAId);

      expect(typeof data.billing.grossBilledAmount).toBe('number');
      expect(typeof data.billing.collectedAmount).toBe('number');
      expect(typeof data.billing.outstandingBalance).toBe('number');
      expect(typeof data.billing.collectionEfficiency).toBe('number');

      // Outstanding balance should equal gross - collected (>= 0)
      if (data.billing.grossBilledAmount >= data.billing.collectedAmount) {
        expect(data.billing.outstandingBalance).toBeCloseTo(
          data.billing.grossBilledAmount - data.billing.collectedAmount,
          1,
        );
      }
    });
  });
});
