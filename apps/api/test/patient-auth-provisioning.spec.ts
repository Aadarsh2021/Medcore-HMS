import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadGatewayException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { PatientsService, SUPABASE_MANAGED_PASSWORD_HASH } from '../src/modules/patients/patients.service';
import { SupabaseService } from '../src/modules/auth/supabase.service';
import { Gender, BloodGroup, UserRole } from '@medcore/types';
import { CreatePatientDto } from '../src/modules/patients/dto/create-patient.dto';

describe('Phase 2 — Patient Authentication Provisioning & Consistency Tests', () => {
  let prisma: PrismaService;
  let supabaseService: SupabaseService;
  let patientsService: PatientsService;
  let hospitalId: string;

  const createdPatientIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdAddressIds: string[] = [];
  const createdSupabaseUserIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
        }),
      ],
      providers: [PrismaService, SupabaseService, PatientsService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    patientsService = module.get<PatientsService>(PatientsService);

    await prisma.$connect();

    const hospital = await prisma.raw.hospital.findFirst({
      where: { status: 'ACTIVE' },
    });
    if (!hospital) {
      throw new Error('No active hospital found for testing');
    }
    hospitalId = hospital.id;
  });

  afterAll(async () => {
    // 1. Clean up PostgreSQL test records
    for (const pid of createdPatientIds) {
      try {
        await prisma.raw.patient.delete({ where: { id: pid } });
      } catch (_) {}
    }
    for (const uid of createdUserIds) {
      try {
        await prisma.raw.user.delete({ where: { id: uid } });
      } catch (_) {}
    }
    for (const aid of createdAddressIds) {
      try {
        await prisma.raw.address.delete({ where: { id: aid } });
      } catch (_) {}
    }

    // 2. Clean up Supabase Auth identities
    for (const sId of createdSupabaseUserIds) {
      try {
        await supabaseService.adminClient.auth.admin.deleteUser(sId);
      } catch (_) {}
    }
  });

  describe('1. Synchronous Supabase Auth Provisioning & Credential Isolation', () => {
    it('should provision a real Supabase Auth identity, link supabaseAuthId, and store placeholder passwordHash in PostgreSQL', async () => {
      const testEmail = `sb.auth.test.${Date.now()}@medcore.io`;
      const testPassword = 'SecurePassword123!';

      const dto: CreatePatientDto = {
        firstName: 'Aarav',
        lastName: 'Sharma',
        email: testEmail,
        password: testPassword,
        phone: '+91 99887 76655',
        dateOfBirth: '1995-03-12',
        gender: Gender.MALE,
        bloodGroup: BloodGroup.A_POSITIVE,
        emergencyContact: {
          name: 'Pooja Sharma',
          phone: '+91 99887 76656',
          relation: 'Sister',
        },
      };

      const result = await patientsService.register(hospitalId, dto);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      createdPatientIds.push(result.id);
      createdUserIds.push(result.user.id);

      // Verify PostgreSQL User record
      const dbUser = await prisma.raw.user.findUnique({
        where: { id: result.user.id },
      });
      expect(dbUser).toBeDefined();
      expect(dbUser!.email).toBe(testEmail);
      expect(dbUser!.role).toBe(UserRole.PATIENT);
      expect(dbUser!.supabaseAuthId).toBeDefined();
      expect(dbUser!.supabaseAuthId).not.toBeNull();
      createdSupabaseUserIds.push(dbUser!.supabaseAuthId!);

      // Verify NO dual password: passwordHash is the unmatchable placeholder, not a bcrypt hash of testPassword
      expect(dbUser!.passwordHash).toBe(SUPABASE_MANAGED_PASSWORD_HASH);

      // Verify real Supabase identity in auth.users
      const { data: sbUser, error: sbError } =
        await supabaseService.adminClient.auth.admin.getUserById(dbUser!.supabaseAuthId!);
      expect(sbError).toBeNull();
      expect(sbUser.user).toBeDefined();
      expect(sbUser.user.id).toBe(dbUser!.supabaseAuthId);
      expect(sbUser.user.email).toBe(testEmail);
      expect(sbUser.user.user_metadata.role).toBe(UserRole.PATIENT);
      expect(sbUser.user.user_metadata.hospitalId).toBe(hospitalId);

      // Verify API response sanitization: never leak credentials
      expect((result.user as any).password).toBeUndefined();
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result.user as any).supabaseAuthId).toBeUndefined();
    });
  });

  describe('2. Transactional Rollback & Compensation Strategy', () => {
    it('should roll back and delete newly created Supabase Auth identity if database transaction fails', async () => {
      const testEmail = `sb.rollback.test.${Date.now()}@medcore.io`;
      let createdSbId: string | null = null;

      // Mock database transaction failure by spying on prisma.raw.$transaction
      jest.spyOn(prisma.raw, '$transaction').mockImplementationOnce(async () => {
        // Find the Supabase user that was created right before transaction
        const { data } = await supabaseService.adminClient.auth.admin.listUsers();
        const found = (data?.users as any[])?.find(u => u.email === testEmail);
        if (found) {
          createdSbId = found.id;
        }
        throw new Error('Simulated database deadlock / constraint failure');
      });

      const dto: CreatePatientDto = {
        firstName: 'Rollback',
        lastName: 'Patient',
        email: testEmail,
        password: 'TempPassword123!',
        dateOfBirth: '1990-01-01',
        gender: Gender.FEMALE,
      };

      await expect(patientsService.register(hospitalId, dto)).rejects.toThrow(
        'Simulated database deadlock / constraint failure',
      );

      // Compensation verification: The Supabase user must be deleted/rolled back!
      if (createdSbId) {
        const { data: checkData, error } =
          await supabaseService.adminClient.auth.admin.getUserById(createdSbId);
        expect(error || !checkData.user).toBeTruthy();
      }

      // Verify NO dangling PostgreSQL user was created
      const dbUser = await prisma.raw.user.findUnique({
        where: { email: testEmail },
      });
      expect(dbUser).toBeNull();
    });

    it('should reject registration if Supabase identity creation fails and leave no local record', async () => {
      const testEmail = `sb.fail.test.${Date.now()}@medcore.io`;

      const originalCreateUser = supabaseService.adminClient.auth.admin.createUser.bind(
        supabaseService.adminClient.auth.admin,
      );
      jest
        .spyOn(supabaseService.adminClient.auth.admin, 'createUser')
        .mockRejectedValueOnce(new Error('Supabase Auth service unreachable'));

      const dto: CreatePatientDto = {
        firstName: 'Fail',
        lastName: 'Patient',
        email: testEmail,
        password: 'TempPassword123!',
        dateOfBirth: '1990-01-01',
        gender: Gender.OTHER,
      };

      await expect(patientsService.register(hospitalId, dto)).rejects.toThrow(
        BadGatewayException,
      );

      // Verify NO PostgreSQL user was created
      const dbUser = await prisma.raw.user.findUnique({
        where: { email: testEmail },
      });
      expect(dbUser).toBeNull();

      // Restore mock
      jest
        .spyOn(supabaseService.adminClient.auth.admin, 'createUser')
        .mockImplementation(originalCreateUser);
    });
  });
});
