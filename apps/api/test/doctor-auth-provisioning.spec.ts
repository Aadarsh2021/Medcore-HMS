import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../src/database/prisma.service';
import { DoctorsService, SUPABASE_MANAGED_PASSWORD_HASH } from '../src/modules/doctors/doctors.service';
import { SchedulingService } from '../src/modules/doctors/scheduling.service';
import { SupabaseService } from '../src/modules/auth/supabase.service';
import { SupabaseAuthGuard } from '../src/modules/auth/guards/supabase-auth.guard';
import { UserRole } from '@medcore/types';
import { CreateDoctorDto } from '../src/modules/doctors/dto/create-doctor.dto';

describe('Phase 3 — Doctor Authentication & Identity Provisioning E2E Boundary Tests', () => {
  let prisma: PrismaService;
  let supabaseService: SupabaseService;
  let doctorsService: DoctorsService;
  let schedulingService: SchedulingService;
  let supabaseAuthGuard: SupabaseAuthGuard;

  let hospitalId: string;
  let departmentId: string;

  const createdDoctorIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSupabaseUserIds: string[] = [];
  const createdDeptIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [
        PrismaService,
        SupabaseService,
        SchedulingService,
        DoctorsService,
        Reflector,
        SupabaseAuthGuard,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    schedulingService = module.get<SchedulingService>(SchedulingService);
    doctorsService = module.get<DoctorsService>(DoctorsService);
    supabaseAuthGuard = module.get<SupabaseAuthGuard>(SupabaseAuthGuard);

    await prisma.$connect();

    // Look up active hospital
    const hospital = await prisma.raw.hospital.findFirst({
      where: { status: 'ACTIVE' },
    });
    if (!hospital) {
      throw new Error('No active hospital found for testing.');
    }
    hospitalId = hospital.id;

    // Look up or create an active department for testing
    let dept = await prisma.raw.department.findFirst({
      where: { hospitalId, isActive: true },
    });
    if (!dept) {
      dept = await prisma.raw.department.create({
        data: {
          hospitalId,
          name: 'Endocrinology Test Dept',
          code: 'ENDO-' + Date.now().toString().slice(-4),
          isActive: true,
        },
      });
      createdDeptIds.push(dept.id);
    }
    departmentId = dept.id;
  });

  afterAll(async () => {
    // 1. Clean up PostgreSQL Doctor and User records
    if (createdDoctorIds.length > 0) {
      await prisma.raw.doctorLeave.deleteMany({
        where: { doctorId: { in: createdDoctorIds } },
      });
      await prisma.raw.doctorAvailability.deleteMany({
        where: { doctorId: { in: createdDoctorIds } },
      });
      await prisma.raw.doctor.deleteMany({
        where: { id: { in: createdDoctorIds } },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.raw.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    if (createdDeptIds.length > 0) {
      await prisma.raw.department.deleteMany({
        where: { id: { in: createdDeptIds } },
      });
    }

    // 2. Clean up Supabase Auth identities
    for (const sId of createdSupabaseUserIds) {
      try {
        await supabaseService.adminClient.auth.admin.deleteUser(sId);
      } catch (_) {}
    }

    await prisma.$disconnect();
  });

  describe('Doctor Identity Lifecycle: Provisioning → Supabase Auth → Sign In → Guard Validation', () => {
    it('should provision doctor, authenticate with initial credentials, issue JWT, and pass SupabaseAuthGuard', async () => {
      const testEmail = `dr.auth.e2e.${Date.now()}@medcore-test.com`;
      const testPassword = 'DoctorSecurePass123!';
      const licenseNumber = `LIC-AUTH-${Date.now()}`;

      // 1. Create Doctor
      const dto: CreateDoctorDto = {
        email: testEmail,
        password: testPassword,
        firstName: 'Vikram',
        lastName: 'Ambekar',
        phone: '+91 98111 22334',
        departmentId,
        specialization: 'Endocrinologist',
        licenseNumber,
        consultationFee: 90.0,
        bio: 'Consultant Endocrinologist',
      };

      const doctor = await doctorsService.create(hospitalId, dto);

      expect(doctor).toBeDefined();
      expect(doctor.id).toBeDefined();
      expect(doctor.userId).toBeDefined();
      createdDoctorIds.push(doctor.id);
      createdUserIds.push(doctor.userId);

      // 2. Verify User record in PostgreSQL
      const dbUser = await prisma.raw.user.findUnique({
        where: { id: doctor.userId },
        include: { doctorProfile: true },
      });
      expect(dbUser).toBeDefined();
      expect(dbUser!.email).toBe(testEmail);
      expect(dbUser!.role).toBe(UserRole.DOCTOR);
      expect(dbUser!.hospitalId).toBe(hospitalId);
      expect(dbUser!.supabaseAuthId).toBeDefined();
      expect(dbUser!.supabaseAuthId).not.toBeNull();
      createdSupabaseUserIds.push(dbUser!.supabaseAuthId!);

      // Verify NO plaintext/bcrypt password stored in local DB: must be placeholder
      expect(dbUser!.passwordHash).toBe(SUPABASE_MANAGED_PASSWORD_HASH);

      // 3. Verify Supabase Auth user in auth.users
      const { data: sbUser, error: sbError } =
        await supabaseService.adminClient.auth.admin.getUserById(
          dbUser!.supabaseAuthId!,
        );
      expect(sbError).toBeNull();
      expect(sbUser.user).toBeDefined();
      expect(sbUser.user!.email).toBe(testEmail);
      expect(sbUser.user!.user_metadata.role).toBe(UserRole.DOCTOR);
      expect(sbUser.user!.user_metadata.hospitalId).toBe(hospitalId);

      // 4. Authenticate using signInWithPassword with the supplied credentials
      const { data: authData, error: signInError } =
        await supabaseService.anonClient.auth.signInWithPassword({
          email: testEmail,
          password: testPassword,
        });

      expect(signInError).toBeNull();
      expect(authData).toBeDefined();
      expect(authData.session).toBeDefined();
      expect(typeof authData.session?.access_token).toBe('string');
      expect(authData.session!.access_token.length).toBeGreaterThan(20);

      const accessToken = authData.session!.access_token;

      // 5. Pass JWT to NestJS SupabaseAuthGuard
      const mockRequest: any = {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      };

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;

      const canActivate = await supabaseAuthGuard.canActivate(mockExecutionContext);
      expect(canActivate).toBe(true);

      // 6. Verify local User/Doctor resolved and attached to request context
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user.id).toBe(dbUser!.id);
      expect(mockRequest.user.email).toBe(testEmail);
      expect(mockRequest.user.role).toBe(UserRole.DOCTOR);
      expect(mockRequest.user.hospitalId).toBe(hospitalId);
      expect(mockRequest.user.doctorProfile).toBeDefined();
      expect(mockRequest.user.doctorProfile.id).toBe(doctor.id);
      expect(mockRequest.user.doctorProfile.licenseNumber).toBe(licenseNumber);
      expect(mockRequest.user.doctorProfile.specialization).toBe('Endocrinologist');
    });
  });
});
