import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { DoctorsService, SUPABASE_MANAGED_PASSWORD_HASH } from '../src/modules/doctors/doctors.service';
import { SchedulingService } from '../src/modules/doctors/scheduling.service';
import { SupabaseService } from '../src/modules/auth/supabase.service';
import { runWithTenantContext, runWithSystemContext } from '../src/database/tenant-context';
import { UserRole } from '@medcore/types';
import { CreateDoctorDto } from '../src/modules/doctors/dto/create-doctor.dto';
import { UpdateDoctorDto } from '../src/modules/doctors/dto/update-doctor.dto';
import { SetDoctorAvailabilityDto } from '../src/modules/doctors/dto/doctor-availability.dto';
import { CreateDoctorLeaveDto } from '../src/modules/doctors/dto/doctor-leave.dto';

describe('Phase 3 — Doctor Management & Scheduling Module Tests', () => {
  let prisma: PrismaService;
  let doctorsService: DoctorsService;
  let schedulingService: SchedulingService;

  let hospitalAId: string;
  let hospitalBId: string;
  let deptAId: string;
  let deptBId: string;
  let inactiveDeptAId: string;

  const createdDoctorIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdDeptIds: string[] = [];

  const withTenant = <T>(tenantId: string, fn: () => Promise<T>) => runWithTenantContext({ tenantId }, fn);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    schedulingService = new SchedulingService();

    // Mock SupabaseService for unit/integration testing
    const mockSupabaseService = {
      adminClient: {
        auth: {
          admin: {
            createUser: jest.fn().mockImplementation(() =>
              Promise.resolve({
                data: {
                  user: {
                    id:
                      'mock-sb-doc-' +
                      Math.random().toString(36).substring(2) +
                      '-' +
                      Date.now(),
                  },
                },
                error: null,
              }),
            ),
            deleteUser: jest.fn().mockResolvedValue({ error: null }),
            listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          },
        },
      },
    } as unknown as SupabaseService;

    doctorsService = new DoctorsService(
      prisma,
      mockSupabaseService,
      schedulingService,
    );

    // Fetch existing hospitals
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });

    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals must exist in DB for testing.');
    }

    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;


    await prisma.raw.hospital.update({
      where: { id: hospitalAId },
      data: {
        settings: { timezone: 'Asia/Kolkata' },
      },
    });

    // Ensure active departments in Hospital A and Hospital B
    let deptA = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalAId, isActive: true },
    });
    if (!deptA) {
      deptA = await prisma.raw.department.create({
        data: {
          hospitalId: hospitalAId,
          name: 'Cardiology Test Dept',
          code: 'CARD-' + Date.now().toString().slice(-4),
          isActive: true,
        },
      });
      createdDeptIds.push(deptA.id);
    }
    deptAId = deptA.id;

    let deptB = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalBId, isActive: true },
    });
    if (!deptB) {
      deptB = await prisma.raw.department.create({
        data: {
          hospitalId: hospitalBId,
          name: 'Neurology Test Dept B',
          code: 'NEUR-' + Date.now().toString().slice(-4),
          isActive: true,
        },
      });
      createdDeptIds.push(deptB.id);
    }
    deptBId = deptB.id;

    // Create an inactive department in Hospital A for validation testing
    const inactiveDept = await prisma.raw.department.create({
      data: {
        hospitalId: hospitalAId,
        name: 'Inactive Test Dept',
        code: 'INACT-' + Date.now().toString().slice(-4),
        isActive: false,
      },
    });
    createdDeptIds.push(inactiveDept.id);
    inactiveDeptAId = inactiveDept.id;
  });

  afterAll(async () => {
    // Teardown test data
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

    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. Doctor Registration & Department Cross-Tenant Integrity
  // ============================================================================
  describe('1. Doctor Registration & Cross-Tenant Department Validation', () => {
    it('should successfully register a doctor with active department in same hospital', async () => {
      const email = `dr.test.${Date.now()}@medcore-test.com`;
      const licenseNumber = `LIC-A-${Date.now()}`;

      const dto: CreateDoctorDto = {
        email,
        firstName: 'Arya',
        lastName: 'Sharma',
        phone: '+919876543210',
        departmentId: deptAId,
        specialization: 'Cardiologist',
        licenseNumber,
        consultationFee: 75.0,
        bio: 'Experienced cardiologist.',
      };

      const doctor = await withTenant(hospitalAId, async () => {
        return doctorsService.create(hospitalAId, dto);
      });

      expect(doctor).toBeDefined();
      expect(doctor.id).toBeDefined();
      expect(doctor.hospitalId).toBe(hospitalAId);
      expect(doctor.departmentId).toBe(deptAId);
      expect(doctor.consultationFee).toBe(75.0);
      expect(doctor.user.email).toBe(email);
      expect(doctor.isAvailable).toBe(true);

      createdDoctorIds.push(doctor.id);
      createdUserIds.push(doctor.userId);

      // Verify User record in DB has SUPABASE_MANAGED_PASSWORD_HASH and DOCTOR role
      const userRecord = await prisma.raw.user.findUnique({
        where: { id: doctor.userId },
      });
      expect(userRecord).toBeDefined();
      expect(userRecord?.role).toBe(UserRole.DOCTOR);
      expect(userRecord?.passwordHash).toBe(SUPABASE_MANAGED_PASSWORD_HASH);
    });

    it('should REJECT registration when department belongs to a DIFFERENT hospital tenant', async () => {
      const email = `dr.cross.${Date.now()}@medcore-test.com`;
      const licenseNumber = `LIC-CROSS-${Date.now()}`;

      const dto: CreateDoctorDto = {
        email,
        firstName: 'Cross',
        lastName: 'Tenant',
        departmentId: deptBId, // Belongs to Hospital B!
        specialization: 'Neurologist',
        licenseNumber,
      };

      // Attempting to register in Hospital A referencing Hospital B department
      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.create(hospitalAId, dto);
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should REJECT registration when department is INACTIVE', async () => {
      const email = `dr.inactive.${Date.now()}@medcore-test.com`;
      const licenseNumber = `LIC-INACT-${Date.now()}`;

      const dto: CreateDoctorDto = {
        email,
        firstName: 'Inactive',
        lastName: 'DeptDoc',
        departmentId: inactiveDeptAId, // Inactive department
        specialization: 'General',
        licenseNumber,
      };

      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.create(hospitalAId, dto);
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should REJECT duplicate licenseNumber within the SAME hospital', async () => {
      const email1 = `dr.lic1.${Date.now()}@medcore-test.com`;
      const email2 = `dr.lic2.${Date.now()}@medcore-test.com`;
      const sharedLicense = `LIC-DUP-${Date.now()}`;

      const dto1: CreateDoctorDto = {
        email: email1,
        firstName: 'First',
        lastName: 'Doctor',
        departmentId: deptAId,
        specialization: 'Surgeon',
        licenseNumber: sharedLicense,
      };

      const doc1 = await withTenant(hospitalAId, async () => {
        return doctorsService.create(hospitalAId, dto1);
      });
      createdDoctorIds.push(doc1.id);
      createdUserIds.push(doc1.userId);

      const dto2: CreateDoctorDto = {
        email: email2,
        firstName: 'Second',
        lastName: 'Doctor',
        departmentId: deptAId,
        specialization: 'Surgeon',
        licenseNumber: sharedLicense, // duplicate in Hospital A
      };

      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.create(hospitalAId, dto2);
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ============================================================================
  // 2. Doctor Search, Pagination & Patient Visibility RBAC
  // ============================================================================
  describe('2. Doctor Search, Pagination & Patient Visibility', () => {
    it('should list doctors with pagination, search, and department filter', async () => {
      const result = await withTenant(hospitalAId, async () => {
        return doctorsService.findAll(
          hospitalAId,
          { page: 1, limit: 10, departmentId: deptAId },
          UserRole.HOSPITAL_ADMIN,
        );
      });

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.data.every((d) => d.departmentId === deptAId)).toBe(true);
    });

    it('PATIENT role can list active doctors', async () => {
      const patientView = await withTenant(hospitalAId, async () => {
        return doctorsService.findAll(
          hospitalAId,
          { page: 1, limit: 10 },
          UserRole.PATIENT,
        );
      });

      expect(patientView.success).toBe(true);
      expect(patientView.data.every((d) => d.isAvailable === true)).toBe(true);
    });

    it('PATIENT role can retrieve individual doctor profile', async () => {
      const docId = createdDoctorIds[0];
      const profile = await withTenant(hospitalAId, async () => {
        return doctorsService.findById(hospitalAId, docId, UserRole.PATIENT);
      });

      expect(profile).toBeDefined();
      expect(profile.id).toBe(docId);
      expect(profile.isAvailable).toBe(true);
    });
  });

  // ============================================================================
  // 3. RBAC: DOCTOR Self-Update Allowlist vs Forbidden Admin Fields
  // ============================================================================
  describe('3. DOCTOR Self-Update Allowlist vs Restricted Fields', () => {
    let testDocId: string;
    let testDocUserId: string;

    beforeAll(async () => {
      const doc = await withTenant(hospitalAId, async () => {
        return doctorsService.create(hospitalAId, {
          email: `dr.selfupdate.${Date.now()}@medcore-test.com`,
          firstName: 'Self',
          lastName: 'Updater',
          departmentId: deptAId,
          specialization: 'Pediatrician',
          licenseNumber: `LIC-SELF-${Date.now()}`,
          consultationFee: 60.0,
        });
      });
      testDocId = doc.id;
      testDocUserId = doc.userId;
      createdDoctorIds.push(testDocId);
      createdUserIds.push(testDocUserId);
    });

    it('DOCTOR self-update with bio, signatureUrl, and phone SUCCEEDS', async () => {
      const updated = await withTenant(hospitalAId, async () => {
        return doctorsService.update(
          hospitalAId,
          testDocId,
          {
            bio: 'Updated bio by doctor themselves.',
            signatureUrl: 'https://storage.medcore.com/signatures/dr-self.png',
            phone: '+919999888877',
          },
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });

      expect(updated.bio).toBe('Updated bio by doctor themselves.');
      expect(updated.signatureUrl).toBe(
        'https://storage.medcore.com/signatures/dr-self.png',
      );
      expect(updated.user.phone).toBe('+919999888877');
    });

    it('DOCTOR self-update attempting to modify consultationFee throws 403 Forbidden', async () => {
      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.update(
            hospitalAId,
            testDocId,
            { consultationFee: 200.0 } as any,
            { id: testDocUserId, role: UserRole.DOCTOR },
          );
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DOCTOR self-update attempting to modify specialization throws 403 Forbidden', async () => {
      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.update(
            hospitalAId,
            testDocId,
            { specialization: 'Neurologist' } as any,
            { id: testDocUserId, role: UserRole.DOCTOR },
          );
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DOCTOR self-update attempting to modify departmentId throws 403 Forbidden', async () => {
      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.update(
            hospitalAId,
            testDocId,
            { departmentId: deptAId } as any,
            { id: testDocUserId, role: UserRole.DOCTOR },
          );
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DOCTOR attempting to update ANOTHER doctor throws 403 Forbidden', async () => {
      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.update(
            hospitalAId,
            testDocId,
            { bio: 'Malicious update attempt' },
            { id: 'different-user-id', role: UserRole.DOCTOR },
          );
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('HOSPITAL_ADMIN can update administrative fields (consultationFee, isAvailable)', async () => {
      const adminUpdated = await withTenant(hospitalAId, async () => {
        return doctorsService.update(
          hospitalAId,
          testDocId,
          { consultationFee: 120.0, isAvailable: true },
          { id: 'admin-user-id', role: UserRole.HOSPITAL_ADMIN },
        );
      });

      expect(adminUpdated.consultationFee).toBe(120.0);
    });
  });

  // ============================================================================
  // 4. Availability Windows & Advisory Lock Concurrency
  // ============================================================================
  describe('4. Availability Management & Overlap Invariants', () => {
    let testDocId: string;
    let testDocUserId: string;

    beforeAll(async () => {
      const doc = await withTenant(hospitalAId, async () => {
        return doctorsService.create(hospitalAId, {
          email: `dr.avail.${Date.now()}@medcore-test.com`,
          firstName: 'Avail',
          lastName: 'Doc',
          departmentId: deptAId,
          specialization: 'General',
          licenseNumber: `LIC-AVL-${Date.now()}`,
        });
      });
      testDocId = doc.id;
      testDocUserId = doc.userId;
      createdDoctorIds.push(testDocId);
      createdUserIds.push(testDocUserId);
    });

    it('should REJECT overlapping windows on the same weekday', async () => {
      const dto: SetDoctorAvailabilityDto = {
        windows: [
          {
            dayOfWeek: 1, // Monday
            startTime: '09:00',
            endTime: '13:00',
            slotDurationMinutes: 30,
          },
          {
            dayOfWeek: 1, // Monday
            startTime: '12:00', // Overlaps with 09:00-13:00!
            endTime: '15:00',
            slotDurationMinutes: 30,
          },
        ],
      };

      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.setAvailability(
            hospitalAId,
            testDocId,
            dto,
            { id: testDocUserId, role: UserRole.DOCTOR },
          );
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should ALLOW adjacent windows on the same weekday (e.g. 09:00-13:00 and 13:00-17:00)', async () => {
      const dto: SetDoctorAvailabilityDto = {
        windows: [
          {
            dayOfWeek: 1, // Monday
            startTime: '09:00',
            endTime: '13:00',
            slotDurationMinutes: 30,
            maxBookingsPerSlot: 1,
          },
          {
            dayOfWeek: 1, // Monday
            startTime: '13:00', // Perfectly adjacent to 13:00!
            endTime: '17:00',
            slotDurationMinutes: 30,
            maxBookingsPerSlot: 1,
          },
        ],
      };

      const result = await withTenant(hospitalAId, async () => {
        return doctorsService.setAvailability(
          hospitalAId,
          testDocId,
          dto,
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });

      expect(result.doctorId).toBe(testDocId);
      expect(result.windows.length).toBe(2);
      expect(result.windows[0].startTime).toBe('09:00');
      expect(result.windows[0].endTime).toBe('13:00');
      expect(result.windows[1].startTime).toBe('13:00');
      expect(result.windows[1].endTime).toBe('17:00');
    });

    it('should serialize concurrent availability updates using advisory lock without deadlocks', async () => {
      // Launch 5 concurrent availability updates for the same doctor
      const updatePromises = Array.from({ length: 5 }, (_, i) => {
        const dto: SetDoctorAvailabilityDto = {
          windows: [
            {
              dayOfWeek: 2, // Tuesday
              startTime: `0${8 + (i % 2)}:00`,
              endTime: '12:00',
              slotDurationMinutes: 30,
            },
          ],
        };
        return withTenant(hospitalAId, () =>
          doctorsService.setAvailability(hospitalAId, testDocId, dto, {
            id: testDocUserId,
            role: UserRole.DOCTOR,
          }),
        );
      });

      const results = await Promise.all(updatePromises);
      expect(results.length).toBe(5);

      // Verify DB state is consistent
      const finalWindows = await withTenant(hospitalAId, () =>
        doctorsService.getAvailability(hospitalAId, testDocId),
      );
      expect(finalWindows.windows.length).toBe(1);
    });
  });

  // ============================================================================
  // 5. Doctor Leave Management
  // ============================================================================
  describe('5. Doctor Leave Management & Date Range Validation', () => {
    let testDocId: string;
    let testDocUserId: string;

    beforeAll(async () => {
      const doc = await withTenant(hospitalAId, async () => {
        return doctorsService.create(hospitalAId, {
          email: `dr.leave.${Date.now()}@medcore-test.com`,
          firstName: 'Leave',
          lastName: 'Doc',
          departmentId: deptAId,
          specialization: 'General',
          licenseNumber: `LIC-LV-${Date.now()}`,
        });
      });
      testDocId = doc.id;
      testDocUserId = doc.userId;
      createdDoctorIds.push(testDocId);
      createdUserIds.push(testDocUserId);
    });

    it('should REJECT leave when startDate >= endDate', async () => {
      const dto: CreateDoctorLeaveDto = {
        startDate: '2026-10-15T12:00:00Z',
        endDate: '2026-10-15T10:00:00Z', // endDate earlier than startDate!
        reason: 'Invalid leave',
      };

      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.createLeave(
            hospitalAId,
            testDocId,
            dto,
            { id: testDocUserId, role: UserRole.DOCTOR },
          );
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create and retrieve a valid doctor leave', async () => {
      const dto: CreateDoctorLeaveDto = {
        startDate: '2026-10-15T09:00:00Z',
        endDate: '2026-10-15T17:00:00Z',
        reason: 'Medical conference',
      };

      const leave = await withTenant(hospitalAId, async () => {
        return doctorsService.createLeave(
          hospitalAId,
          testDocId,
          dto,
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });

      expect(leave).toBeDefined();
      expect(leave.id).toBeDefined();
      expect(leave.doctorId).toBe(testDocId);
      expect(leave.reason).toBe('Medical conference');

      const leaves = await withTenant(hospitalAId, async () => {
        return doctorsService.getLeaves(hospitalAId, testDocId);
      });

      expect(leaves.some((l) => l.id === leave.id)).toBe(true);

      // Delete leave
      const deleteResult = await withTenant(hospitalAId, async () => {
        return doctorsService.deleteLeave(
          hospitalAId,
          testDocId,
          leave.id,
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });
      expect(deleteResult.success).toBe(true);
    });
  });

  // ============================================================================
  // 6. Deterministic Pure-Schedule Slot Generation & Interval Overlap
  // ============================================================================
  describe('6. Deterministic Slot Generation & Partial-Day Leave Overlap', () => {
    let testDocId: string;
    let testDocUserId: string;

    beforeAll(async () => {
      const doc = await withTenant(hospitalAId, async () => {
        return doctorsService.create(hospitalAId, {
          email: `dr.slots.${Date.now()}@medcore-test.com`,
          firstName: 'SlotMaster',
          lastName: 'Doc',
          departmentId: deptAId,
          specialization: 'Physician',
          licenseNumber: `LIC-SLT-${Date.now()}`,
        });
      });
      testDocId = doc.id;
      testDocUserId = doc.userId;
      createdDoctorIds.push(testDocId);
      createdUserIds.push(testDocUserId);

      // Configure availability on Monday (dayOfWeek = 1): 09:00 to 12:00 (30-min slots)
      // 6 potential slots: 09:00-09:30, 09:30-10:00, 10:00-10:30, 10:30-11:00, 11:00-11:30, 11:30-12:00
      await withTenant(hospitalAId, async () => {
        return doctorsService.setAvailability(
          hospitalAId,
          testDocId,
          {
            windows: [
              {
                dayOfWeek: 1, // Monday
                startTime: '09:00',
                endTime: '12:00',
                slotDurationMinutes: 30,
              },
            ],
          },
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });
    });

    it('should generate all 6 slots for a Monday when no leaves exist', async () => {
      // 2026-10-12 is a Monday
      const slotResponse = await withTenant(hospitalAId, async () => {
        return doctorsService.getAvailableSlots(hospitalAId, testDocId, {
          date: '2026-10-12',
        });
      });

      expect(slotResponse.doctorId).toBe(testDocId);
      expect(slotResponse.date).toBe('2026-10-12');
      expect(slotResponse.timezone).toBe('Asia/Kolkata');
      expect(slotResponse.slots.length).toBe(6);
      expect(slotResponse.slots[0]).toEqual({ startTime: '09:00', endTime: '09:30' });
      expect(slotResponse.slots[5]).toEqual({ startTime: '11:30', endTime: '12:00' });
    });

    it('REGRESSION: Arbitrary client slotDurationMinutes cannot override doctor configured schedule granularity', async () => {
      // Client attempts to pass an arbitrary 15-minute slotDurationMinutes query
      const slotResponse = await withTenant(hospitalAId, async () => {
        return doctorsService.getAvailableSlots(hospitalAId, testDocId, {
          date: '2026-10-12',
          slotDurationMinutes: 15,
        } as any);
      });

      // Must strictly adhere to the persisted 30-minute window configuration (6 slots, not 12)
      expect(slotResponse.slotDurationMinutes).toBe(30);
      expect(slotResponse.slots.length).toBe(6);
      expect(slotResponse.slots[0]).toEqual({ startTime: '09:00', endTime: '09:30' });
      expect(slotResponse.slots[1]).toEqual({ startTime: '09:30', endTime: '10:00' });
    });

    it('should block ONLY the intersecting slots for a partial-day leave', async () => {
      // In Asia/Kolkata (UTC+5:30):
      // 10:00 AM IST to 11:00 AM IST corresponds to 04:30 UTC to 05:30 UTC
      const leaveStartUtc = schedulingService.parseLocalTimeToUtc(
        '2026-10-12',
        '10:00',
        'Asia/Kolkata',
      );
      const leaveEndUtc = schedulingService.parseLocalTimeToUtc(
        '2026-10-12',
        '11:00',
        'Asia/Kolkata',
      );

      const leave = await withTenant(hospitalAId, async () => {
        return doctorsService.createLeave(
          hospitalAId,
          testDocId,
          {
            startDate: leaveStartUtc.toISOString(),
            endDate: leaveEndUtc.toISOString(),
            reason: 'Partial day training',
          },
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });

      const slotResponse = await withTenant(hospitalAId, async () => {
        return doctorsService.getAvailableSlots(hospitalAId, testDocId, {
          date: '2026-10-12',
        });
      });

      // 10:00-10:30 and 10:30-11:00 should be blocked
      // 4 slots remaining: 09:00-09:30, 09:30-10:00, 11:00-11:30, 11:30-12:00
      expect(slotResponse.slots.length).toBe(4);
      expect(slotResponse.slots).toEqual([
        { startTime: '09:00', endTime: '09:30' },
        { startTime: '09:30', endTime: '10:00' },
        { startTime: '11:00', endTime: '11:30' },
        { startTime: '11:30', endTime: '12:00' },
      ]);

      // Clean up the leave
      await withTenant(hospitalAId, async () => {
        return doctorsService.deleteLeave(
          hospitalAId,
          testDocId,
          leave.id,
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });
    });

    it('should return empty slots when full-day leave covers the schedule window', async () => {
      const fullDayStart = schedulingService.parseLocalTimeToUtc(
        '2026-10-12',
        '00:00',
        'Asia/Kolkata',
      );
      const fullDayEnd = schedulingService.parseLocalTimeToUtc(
        '2026-10-12',
        '23:59',
        'Asia/Kolkata',
      );

      const leave = await withTenant(hospitalAId, async () => {
        return doctorsService.createLeave(
          hospitalAId,
          testDocId,
          {
            startDate: fullDayStart.toISOString(),
            endDate: fullDayEnd.toISOString(),
            reason: 'Full day vacation',
          },
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });

      const slotResponse = await withTenant(hospitalAId, async () => {
        return doctorsService.getAvailableSlots(hospitalAId, testDocId, {
          date: '2026-10-12',
        });
      });

      expect(slotResponse.slots.length).toBe(0);

      // Clean up
      await withTenant(hospitalAId, async () => {
        return doctorsService.deleteLeave(
          hospitalAId,
          testDocId,
          leave.id,
          { id: testDocUserId, role: UserRole.DOCTOR },
        );
      });
    });

    it('should return empty slots on a day with no configured availability', async () => {
      // 2026-10-13 is a Tuesday (no availability configured)
      const slotResponse = await withTenant(hospitalAId, async () => {
        return doctorsService.getAvailableSlots(hospitalAId, testDocId, {
          date: '2026-10-13',
        });
      });

      expect(slotResponse.slots.length).toBe(0);
    });
  });

  // ============================================================================
  // 7. Soft Delete & Inactive Doctor Slot Invariants
  // ============================================================================
  describe('7. Doctor Soft Delete & Deactivation Invariants', () => {
    let testDocId: string;

    beforeAll(async () => {
      const doc = await withTenant(hospitalAId, async () => {
        return doctorsService.create(hospitalAId, {
          email: `dr.deact.${Date.now()}@medcore-test.com`,
          firstName: 'Deact',
          lastName: 'Doc',
          departmentId: deptAId,
          specialization: 'General',
          licenseNumber: `LIC-DCT-${Date.now()}`,
        });
      });
      testDocId = doc.id;
      createdDoctorIds.push(testDocId);
      createdUserIds.push(doc.userId);
    });

    it('Hospital Admin can soft-delete doctor', async () => {
      const result = await withTenant(hospitalAId, async () => {
        return doctorsService.softDelete(hospitalAId, testDocId);
      });

      expect(result.success).toBe(true);

      const dbDoc = await prisma.raw.doctor.findUnique({
        where: { id: testDocId },
      });
      expect(dbDoc?.deletedAt).not.toBeNull();
      expect(dbDoc?.isAvailable).toBe(false);
    });

    it('Soft-deleted doctor is excluded from queries and slot generation', async () => {
      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.findById(hospitalAId, testDocId);
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        withTenant(hospitalAId, async () => {
          return doctorsService.getAvailableSlots(hospitalAId, testDocId, {
            date: '2026-10-12',
          });
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
