import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { PatientsService } from '../src/modules/patients/patients.service';
import { SupabaseService } from '../src/modules/auth/supabase.service';
import { runWithTenantContext, runWithSystemContext } from '../src/database/tenant-context';
import { Gender, BloodGroup, UserRole } from '@medcore/types';
import { CreatePatientDto } from '../src/modules/patients/dto/create-patient.dto';
import { UpdatePatientDto } from '../src/modules/patients/dto/update-patient.dto';
import { PatientQueryDto } from '../src/modules/patients/dto/patient-query.dto';

describe('Phase 2 — Patient Management Module Tests', () => {
  let prisma: PrismaService;
  let patientsService: PatientsService;
  let hospitalAId: string;
  let hospitalBId: string;
  let seededPatientAId: string;
  let seededPatientAUhid: string;
  let seededPatientBId: string;

  const createdTestPatientIds: string[] = [];
  const createdTestUserIds: string[] = [];
  const createdTestAddressIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // Look up existing seeded hospitals
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });

    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals must exist in DB for testing.');
    }

    hospitalAId = hospitals[0].id; // Metro General Hospital
    hospitalBId = hospitals[1].id; // Apex Super Speciality

    // Get seeded patient in Hospital A
    const patientA = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    if (!patientA) {
      throw new Error('Expected at least one seeded patient in Hospital A.');
    }
    seededPatientAId = patientA.id;
    seededPatientAUhid = patientA.uhid;

    // Get or ensure seeded patient in Hospital B
    let patientB = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalBId },
      include: { user: true },
    });
    if (!patientB) {
      const userB = await prisma.raw.user.create({
        data: {
          hospitalId: hospitalBId,
          email: `seed.apex.patient.${Date.now()}@medcore.io`,
          passwordHash: '$2b$10$fakehashfortesting123',
          role: 'PATIENT',
          firstName: 'ApexPatient',
          lastName: 'HospitalB',
          isEmailVerified: true,
        },
      });
      patientB = await prisma.raw.patient.create({
        data: {
          userId: userB.id,
          hospitalId: hospitalBId,
          uhid: 'APEX-2026-00001',
          dateOfBirth: new Date('1988-08-08'),
          gender: Gender.FEMALE,
        },
        include: { user: true },
      });
    }
    seededPatientBId = patientB.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: SupabaseService,
          useValue: {
            adminClient: null,
            verifyAccessToken: jest.fn(),
          },
        },
      ],
    }).compile();

    patientsService = moduleFixture.get<PatientsService>(PatientsService);
  });

  afterAll(async () => {
    // Clean up all dynamically created test records safely
    for (const pid of createdTestPatientIds) {
      try {
        await prisma.raw.patient.delete({ where: { id: pid } });
      } catch (_) {}
    }
    for (const uid of createdTestUserIds) {
      try {
        await prisma.raw.user.delete({ where: { id: uid } });
      } catch (_) {}
    }
    for (const aid of createdTestAddressIds) {
      try {
        await prisma.raw.address.delete({ where: { id: aid } });
      } catch (_) {}
    }
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. PATIENT REGISTRATION
  // ============================================================================
  describe('1. Patient Registration', () => {
    it('should successfully register a patient with demographics, address, emergency contact and server-generated UHID', async () => {
      const testEmail = `reg.test.${Date.now()}@medcore.io`;
      const dto: CreatePatientDto = {
        firstName: 'Devendra',
        lastName: 'Fadnavis',
        email: testEmail,
        phone: '+91 98200 44556',
        dateOfBirth: '1970-07-22',
        gender: Gender.MALE,
        bloodGroup: BloodGroup.O_POSITIVE,
        allergiesSummary: 'Sulfa drugs (mild urticaria)',
        emergencyContact: {
          name: 'Amruta Fadnavis',
          phone: '+91 98200 44557',
          relation: 'Spouse',
        },
        address: {
          street: '10 Ramdas Hill, Civil Lines',
          city: 'Nagpur',
          state: 'Maharashtra',
          postalCode: '440001',
          country: 'India',
        },
      };

      const result = await patientsService.register(hospitalAId, dto);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      createdTestPatientIds.push(result.id);
      createdTestUserIds.push(result.user.id);
      if (result.address?.id) {
        createdTestAddressIds.push(result.address.id);
      }

      // Check server-generated UHID format: METRO-2026-XXXXX
      expect(result.uhid).toMatch(/^METRO-\d{4}-\d{5}$/);
      expect(result.hospitalId).toBe(hospitalAId);
      expect(result.gender).toBe(Gender.MALE);
      expect(result.bloodGroup).toBe(BloodGroup.O_POSITIVE);
      expect(result.allergiesSummary).toBe('Sulfa drugs (mild urticaria)');
      expect(result.emergencyContactName).toBe('Amruta Fadnavis');
      expect(result.emergencyContactPhone).toBe('+91 98200 44557');
      expect(result.emergencyContactRelation).toBe('Spouse');

      // User account checks (no password exposed)
      expect(result.user.email).toBe(testEmail);
      expect(result.user.firstName).toBe('Devendra');
      expect(result.user.lastName).toBe('Fadnavis');
      expect(result.user.phone).toBe('+91 98200 44556');
      expect((result.user as any).passwordHash).toBeUndefined();

      // Address checks
      expect(result.address).toBeDefined();
      expect(result.address?.city).toBe('Nagpur');
      expect(result.address?.state).toBe('Maharashtra');
    });

    it('should reject registration if email is already registered as a patient (409 Conflict)', async () => {
      const duplicateDto: CreatePatientDto = {
        firstName: 'Duplicate',
        lastName: 'Patient',
        email: 'patient.arjun@gmail.com', // Already seeded patient in Metro
        dateOfBirth: '1984-06-15',
        gender: Gender.MALE,
      };

      let error: any = null;
      try {
        await patientsService.register(hospitalAId, duplicateDto);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('PATIENT_ALREADY_EXISTS');
    });

    it('should reject registration if tenant context is missing', async () => {
      const dto: CreatePatientDto = {
        firstName: 'No',
        lastName: 'Tenant',
        email: `no.tenant.${Date.now()}@medcore.io`,
        dateOfBirth: '1990-01-01',
        gender: Gender.OTHER,
      };

      let error: any = null;
      try {
        await patientsService.register(null, dto);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toContain('Tenant context missing');
    });
  });

  // ============================================================================
  // 2. CONCURRENCY-SAFE UHID GENERATOR (20 SIMULTANEOUS REGISTRATIONS)
  // ============================================================================
  describe('2. UHID Concurrency Generation (20 Concurrent Requests)', () => {
    it('should execute 20 simultaneous registrations for the same hospital producing 20 unique UHIDs with zero collisions', async () => {
      const concurrentTasks = Array.from({ length: 20 }, (_, i) => {
        const dto: CreatePatientDto = {
          firstName: `ConcurrentPatient${i}`,
          lastName: 'StressTest',
          email: `concurrent.stress.${Date.now()}.${i}.${Math.random()}@medcore.io`,
          dateOfBirth: '1992-04-12',
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          bloodGroup: BloodGroup.A_POSITIVE,
        };

        return patientsService.register(hospitalAId, dto);
      });

      const startTime = Date.now();
      const results = await Promise.all(concurrentTasks);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(20);

      // Track IDs for cleanup
      for (const r of results) {
        createdTestPatientIds.push(r.id);
        createdTestUserIds.push(r.user.id);
      }

      // Collect all generated UHIDs
      const uhids = results.map((r) => r.uhid);
      const uniqueUhids = new Set(uhids);

      // Assert 100% uniqueness
      expect(uniqueUhids.size).toBe(20);

      // Assert all follow format METRO-YYYY-XXXXX
      for (const uhid of uhids) {
        expect(uhid).toMatch(/^METRO-\d{4}-\d{5}$/);
      }

      console.log(`[PASS] 20 concurrent registrations completed in ${duration}ms with 20 unique UHIDs!`);
    }, 45000);
  });

  // ============================================================================
  // 3. PATIENT LISTING, PAGINATION, SEARCH, AND FILTERS
  // ============================================================================
  describe('3. Patient Listing, Pagination, Search & Filters', () => {
    const receptionistCaller = {
      id: 'mock-reception-id',
      role: UserRole.RECEPTIONIST,
      hospitalId: hospitalAId,
    };

    it('should return paginated list of patients with standard envelope metadata', async () => {
      const query: PatientQueryDto = { page: 1, limit: 5 };
      const response = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
        () => patientsService.findAll(hospitalAId, query, receptionistCaller),
      );

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.meta).toBeDefined();
      expect(response.meta.page).toBe(1);
      expect(response.meta.limit).toBe(5);
      expect(response.meta.total).toBeGreaterThanOrEqual(1);
      expect(response.meta.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('should search patients by name (case-insensitive)', async () => {
      const query: PatientQueryDto = { search: 'arjun' };
      const response = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
        () => patientsService.findAll(hospitalAId, query, receptionistCaller),
      );

      expect(response.data.length).toBeGreaterThanOrEqual(1);
      expect(response.data.some((p) => p.firstName.toLowerCase().includes('arjun'))).toBe(true);
    });

    it('should search patients by exact UHID', async () => {
      const query: PatientQueryDto = { search: seededPatientAUhid };
      const response = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
        () => patientsService.findAll(hospitalAId, query, receptionistCaller),
      );

      expect(response.data.length).toBe(1);
      expect(response.data[0].uhid).toBe(seededPatientAUhid);
    });

    it('should filter patients by gender', async () => {
      const query: PatientQueryDto = { gender: Gender.MALE };
      const response = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
        () => patientsService.findAll(hospitalAId, query, receptionistCaller),
      );

      expect(response.data.length).toBeGreaterThanOrEqual(1);
      for (const p of response.data) {
        expect(p.gender).toBe(Gender.MALE);
      }
    });

    it('should filter patients by blood group', async () => {
      const query: PatientQueryDto = { bloodGroup: BloodGroup.B_POSITIVE };
      const response = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
        () => patientsService.findAll(hospitalAId, query, receptionistCaller),
      );

      expect(response.data.length).toBeGreaterThanOrEqual(1);
      for (const p of response.data) {
        expect(p.bloodGroup).toBe(BloodGroup.B_POSITIVE);
      }
    });

    it('should block PATIENT role from listing all patients directory (403 Forbidden)', async () => {
      const patientCaller = {
        id: 'patient-user-id',
        role: UserRole.PATIENT,
        hospitalId: hospitalAId,
      };

      let error: any = null;
      try {
        await patientsService.findAll(hospitalAId, { page: 1, limit: 20 }, patientCaller);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toContain('Access denied');
    });
  });

  // ============================================================================
  // 4. PATIENT DETAILS & SELF-ACCESS
  // ============================================================================
  describe('4. Patient Details & Self-Access', () => {
    const receptionistCaller = {
      id: 'mock-reception-id',
      role: UserRole.RECEPTIONIST,
      hospitalId: hospitalAId,
    };

    it('should retrieve full patient details for authorized staff without exposing sensitive credentials', async () => {
      const patient = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
        () => patientsService.findById(hospitalAId, seededPatientAId, receptionistCaller),
      );

      expect(patient).toBeDefined();
      expect(patient.id).toBe(seededPatientAId);
      expect(patient.uhid).toBe(seededPatientAUhid);
      expect(patient.user).toBeDefined();
      expect(patient.user.email).toBe('patient.arjun@gmail.com');
      expect((patient.user as any).passwordHash).toBeUndefined();
      expect((patient.user as any).supabaseAuthId).toBeUndefined();
    });

    it('should allow a PATIENT user to access their OWN patient record', async () => {
      const selfPatientCaller = {
        id: 'patient-user-arjun',
        role: UserRole.PATIENT,
        hospitalId: hospitalAId,
        patientProfile: { id: seededPatientAId },
      };

      const patient = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.PATIENT, userId: selfPatientCaller.id },
        () => patientsService.findById(hospitalAId, seededPatientAId, selfPatientCaller),
      );

      expect(patient).toBeDefined();
      expect(patient.id).toBe(seededPatientAId);
    });

    it('should block a PATIENT user from accessing ANOTHER patient record (403 Forbidden)', async () => {
      const attackerPatientCaller = {
        id: 'attacker-patient-id',
        role: UserRole.PATIENT,
        hospitalId: hospitalAId,
        patientProfile: { id: 'different-patient-profile-id' }, // Different patient!
      };

      let error: any = null;
      try {
        await runWithTenantContext(
          { tenantId: hospitalAId, role: UserRole.PATIENT, userId: attackerPatientCaller.id },
          () => patientsService.findById(hospitalAId, seededPatientAId, attackerPatientCaller),
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toContain('Patients may only access their own clinical records');
    });

    it('should return 404 Not Found for non-existent patient ID', async () => {
      let error: any = null;
      try {
        await runWithTenantContext(
          { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
          () => patientsService.findById(hospitalAId, '00000000-0000-0000-0000-000000000000', receptionistCaller),
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(NotFoundException);
    });
  });

  // ============================================================================
  // 5. DEMOGRAPHIC UPDATES
  // ============================================================================
  describe('5. Demographic Updates', () => {
    const receptionistCaller = {
      id: 'mock-reception-id',
      role: UserRole.RECEPTIONIST,
      hospitalId: hospitalAId,
    };

    it('should update patient demographics and address safely', async () => {
      // Create a dedicated patient to update
      const created = await patientsService.register(hospitalAId, {
        firstName: 'Sanjay',
        lastName: 'Raut',
        email: `sanjay.update.${Date.now()}@medcore.io`,
        dateOfBirth: '1961-11-15',
        gender: Gender.MALE,
        bloodGroup: BloodGroup.A_POSITIVE,
      });
      createdTestPatientIds.push(created.id);
      createdTestUserIds.push(created.user.id);

      const updateDto: UpdatePatientDto = {
        firstName: 'Sanjay-Updated',
        phone: '+91 98200 99999',
        bloodGroup: BloodGroup.AB_POSITIVE,
        allergiesSummary: 'Updated allergy summary',
        emergencyContact: {
          name: 'Sunil Raut',
          phone: '+91 98200 88888',
          relation: 'Brother',
        },
      };

      const updated = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
        () => patientsService.update(hospitalAId, created.id, updateDto, receptionistCaller),
      );

      expect(updated.user.firstName).toBe('Sanjay-Updated');
      expect(updated.user.phone).toBe('+91 98200 99999');
      expect(updated.bloodGroup).toBe(BloodGroup.AB_POSITIVE);
      expect(updated.allergiesSummary).toBe('Updated allergy summary');
      expect(updated.emergencyContactName).toBe('Sunil Raut');
      // UHID must remain immutable
      expect(updated.uhid).toBe(created.uhid);
      expect(updated.hospitalId).toBe(hospitalAId);
    });

    it('should block a PATIENT user from directly updating demographic records (403 Forbidden)', async () => {
      const patientCaller = {
        id: 'patient-id',
        role: UserRole.PATIENT,
        hospitalId: hospitalAId,
      };

      let error: any = null;
      try {
        await patientsService.update(
          hospitalAId,
          seededPatientAId,
          { firstName: 'MaliciousChange' },
          patientCaller,
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(ForbiddenException);
    });
  });

  // ============================================================================
  // 6. SOFT DELETE
  // ============================================================================
  describe('6. Soft Delete', () => {
    const adminCaller = {
      id: 'admin-metro-id',
      role: UserRole.HOSPITAL_ADMIN,
      hospitalId: hospitalAId,
    };
    const receptionistCaller = {
      id: 'receptionist-id',
      role: UserRole.RECEPTIONIST,
      hospitalId: hospitalAId,
    };

    it('should soft-delete a patient (set deletedAt) and exclude from active listing', async () => {
      // Create patient to soft-delete
      const patientToDelete = await patientsService.register(hospitalAId, {
        firstName: 'DeleteMe',
        lastName: 'Patient',
        email: `delete.me.${Date.now()}@medcore.io`,
        dateOfBirth: '1999-09-09',
        gender: Gender.FEMALE,
      });
      createdTestPatientIds.push(patientToDelete.id);
      createdTestUserIds.push(patientToDelete.user.id);

      // 1. Deletion by Hospital Admin succeeds
      const deleteResult = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.HOSPITAL_ADMIN },
        () => patientsService.softDelete(hospitalAId, patientToDelete.id, adminCaller),
      );

      expect(deleteResult.id).toBe(patientToDelete.id);
      expect(deleteResult.deletedAt).toBeDefined();

      // 2. Patient row is physically preserved in the database
      const rowInDb = await prisma.raw.patient.findUnique({
        where: { id: patientToDelete.id },
      });
      expect(rowInDb).toBeDefined();
      expect(rowInDb?.deletedAt).not.toBeNull();

      // 3. Excluded from normal active patient list
      const activeList = await runWithTenantContext(
        { tenantId: hospitalAId, role: UserRole.HOSPITAL_ADMIN },
        () =>
          patientsService.findAll(
            hospitalAId,
            { search: 'DeleteMe', includeDeleted: false },
            adminCaller,
          ),
      );
      expect(activeList.data.some((p) => p.id === patientToDelete.id)).toBe(false);

      // 4. Normal findById returns 404 for deactivated patient
      let findError: any = null;
      try {
        await runWithTenantContext(
          { tenantId: hospitalAId, role: UserRole.RECEPTIONIST },
          () =>
            patientsService.findById(
              hospitalAId,
              patientToDelete.id,
              receptionistCaller,
            ),
        );
      } catch (err) {
        findError = err;
      }
      expect(findError).toBeDefined();
      expect(findError).toBeInstanceOf(NotFoundException);
    });

    it('should reject soft-delete attempt by non-admin roles (403 Forbidden)', async () => {
      let error: any = null;
      try {
        await patientsService.softDelete(
          hospitalAId,
          seededPatientAId,
          receptionistCaller, // Receptionist cannot delete patients
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toContain('Only Hospital Administrators can deactivate');
    });
  });

  // ============================================================================
  // 7. TENANT ISOLATION (PATIENT DOMAIN)
  // ============================================================================
  describe('7. Tenant Isolation (Patient Domain)', () => {
    const adminMetroCaller = {
      id: 'admin-metro',
      role: UserRole.HOSPITAL_ADMIN,
      hospitalId: hospitalAId,
    };
    const adminApexCaller = {
      id: 'admin-apex',
      role: UserRole.HOSPITAL_ADMIN,
      hospitalId: hospitalBId,
    };

    it('Hospital A cannot retrieve Hospital B patient by ID', async () => {
      let error: any = null;
      try {
        await runWithTenantContext(
          { tenantId: hospitalAId, role: UserRole.HOSPITAL_ADMIN },
          () =>
            patientsService.findById(
              hospitalAId,
              seededPatientBId, // Patient in Hospital B!
              adminMetroCaller,
            ),
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(NotFoundException);
    });

    it('Hospital A cannot update Hospital B patient', async () => {
      let error: any = null;
      try {
        await runWithTenantContext(
          { tenantId: hospitalAId, role: UserRole.HOSPITAL_ADMIN },
          () =>
            patientsService.update(
              hospitalAId,
              seededPatientBId,
              { firstName: 'HackedName' },
              adminMetroCaller,
            ),
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(NotFoundException);
    });

    it('Hospital A cannot soft-delete Hospital B patient', async () => {
      let error: any = null;
      try {
        await runWithTenantContext(
          { tenantId: hospitalAId, role: UserRole.HOSPITAL_ADMIN },
          () =>
            patientsService.softDelete(
              hospitalAId,
              seededPatientBId,
              adminMetroCaller,
            ),
        );
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(NotFoundException);

      // Verify Hospital B patient remains active and un-deleted
      const checkB = await prisma.raw.patient.findUnique({
        where: { id: seededPatientBId },
      });
      expect(checkB?.deletedAt).toBeNull();
    });

    it('Hospital B cannot view Hospital A patients in listing', async () => {
      const response = await runWithTenantContext(
        { tenantId: hospitalBId, role: UserRole.HOSPITAL_ADMIN },
        () =>
          patientsService.findAll(
            hospitalBId,
            { search: 'Arjun' },
            adminApexCaller,
          ),
      );

      // Arjun is in Hospital A, so Hospital B receives 0 results
      expect(response.data).toHaveLength(0);
      expect(response.meta.total).toBe(0);
    });
  });
});
