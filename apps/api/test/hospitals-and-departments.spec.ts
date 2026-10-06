import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { HospitalsService } from '../src/modules/hospitals/hospitals.service';
import { HospitalsController } from '../src/modules/hospitals/hospitals.controller';
import { DepartmentsService } from '../src/modules/departments/departments.service';
import { DepartmentsController } from '../src/modules/departments/departments.controller';
import { UserRole } from '@medcore/types';
import * as bcrypt from 'bcrypt';

describe('Phase 7 & Phase 8 — Hospital Onboarding & Department Architecture Suite', () => {
  let prisma: PrismaService;
  let hospitalsService: HospitalsService;
  let hospitalsController: HospitalsController;
  let departmentsService: DepartmentsService;
  let departmentsController: DepartmentsController;

  let superAdminUser: { id: string; role: string };
  let hospitalAdminA: { id: string; role: string; hospitalId: string };
  let doctorA: { id: string; role: string; hospitalId: string; doctorId: string };

  let hospitalAId: string;
  let hospitalBId: string;

  const createdHospitalIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdDepartmentIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    hospitalsService = new HospitalsService(prisma);
    hospitalsController = new HospitalsController(hospitalsService);
    departmentsService = new DepartmentsService(prisma);
    departmentsController = new DepartmentsController(departmentsService);

    // 1. Fetch existing hospitals
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals required for multi-tenant onboarding & department tests');
    }
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // 2. Fetch or create Super Admin
    let superAdmin = await prisma.raw.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN as any },
    });
    if (!superAdmin) {
      superAdmin = await prisma.raw.user.create({
        data: {
          email: `superadmin_hosp_${Date.now()}@medcore.org`,
          passwordHash: await bcrypt.hash('Password123!', 10),
          role: UserRole.SUPER_ADMIN as any,
          firstName: 'Global',
          lastName: 'SuperAdmin',
          isEmailVerified: true,
        },
      });
      createdUserIds.push(superAdmin.id);
    }
    superAdminUser = { id: superAdmin.id, role: UserRole.SUPER_ADMIN };

    // 3. Fetch Hospital Admin for Hospital A
    const adminA = await prisma.raw.user.findFirst({
      where: { hospitalId: hospitalAId, role: UserRole.HOSPITAL_ADMIN as any },
    });
    if (!adminA) {
      throw new Error('Hospital A admin required');
    }
    hospitalAdminA = { id: adminA.id, role: UserRole.HOSPITAL_ADMIN, hospitalId: hospitalAId };

    // 4. Fetch Doctor for Hospital A
    const docA = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    if (!docA) {
      throw new Error('Doctor in Hospital A required');
    }
    doctorA = {
      id: docA.userId,
      role: UserRole.DOCTOR,
      hospitalId: hospitalAId,
      doctorId: docA.id,
    };
  });

  afterAll(async () => {
    // Teardown created departments
    if (createdDepartmentIds.length > 0) {
      await prisma.raw.department.deleteMany({
        where: { id: { in: createdDepartmentIds } },
      });
    }

    // Teardown created hospitals (and cascaded users)
    if (createdHospitalIds.length > 0) {
      await prisma.raw.user.deleteMany({
        where: { hospitalId: { in: createdHospitalIds } },
      });
      await prisma.raw.hospital.deleteMany({
        where: { id: { in: createdHospitalIds } },
      });
    }

    if (createdUserIds.length > 0) {
      await prisma.raw.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    await prisma.$disconnect();
  });

  // ===========================================================================
  // SECTION 1: HOSPITAL ONBOARDING (PHASE 7)
  // ===========================================================================

  it('1. should allow Super Admin to successfully onboard a new hospital tenant with initial administrator', async () => {
    const timestamp = Date.now();
    const onboardDto = {
      name: `St. Jude Medical Institute ${timestamp}`,
      slug: `st-jude-${timestamp}`,
      code: `SJM-${timestamp.toString().slice(-4)}`,
      email: `contact@stjude${timestamp}.org`,
      phone: '+91 22 5555 1234',
      website: 'https://stjude-medical.org',
      subscriptionTier: 'ENTERPRISE',
      address: {
        street: '100 Marine Drive',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400020',
        country: 'India',
      },
      initialAdmin: {
        firstName: 'Priya',
        lastName: 'Nambiar',
        email: `admin@stjude${timestamp}.org`,
        password: 'AdminSecurePassword123!',
        phone: '+91 98200 11223',
      },
    };

    const response = await hospitalsController.onboard(superAdminUser, onboardDto);

    expect(response.success).toBe(true);
    expect(response.data.hospital.id).toBeDefined();
    expect(response.data.hospital.code).toBe(onboardDto.code);
    expect(response.data.hospital.status).toBe('ACTIVE');
    expect(response.data.initialAdmin.email).toBe(onboardDto.initialAdmin.email);
    expect(response.data.initialAdmin.role).toBe(UserRole.HOSPITAL_ADMIN);

    createdHospitalIds.push(response.data.hospital.id);
    createdUserIds.push(response.data.initialAdmin.id);

    // Verify initial admin password was hashed with bcrypt
    const dbAdmin = await prisma.raw.user.findUnique({
      where: { id: response.data.initialAdmin.id },
    });
    expect(dbAdmin).toBeDefined();
    expect(dbAdmin?.passwordHash).not.toBe(onboardDto.initialAdmin.password);
    const passwordMatch = await bcrypt.compare(onboardDto.initialAdmin.password, dbAdmin!.passwordHash);
    expect(passwordMatch).toBe(true);

    // Verify audit log
    const audit = await prisma.raw.auditLog.findFirst({
      where: { entityId: response.data.hospital.id, entityName: 'Hospital' },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(superAdminUser.id);
  });

  it('2. should reject hospital onboarding when attempted by non-Super Admin (Doctor or Hospital Admin)', async () => {
    const onboardDto = {
      name: 'Unauthorized Clinic',
      slug: `unauth-${Date.now()}`,
      code: `UNA-${Date.now().toString().slice(-4)}`,
      email: `unauth@clinic.org`,
      phone: '+91 22 1111 2222',
      initialAdmin: {
        firstName: 'Rogue',
        lastName: 'Admin',
        email: `rogue@clinic.org`,
        password: 'Password123!',
      },
    };

    await expect(
      hospitalsController.onboard({ id: doctorA.id, role: UserRole.DOCTOR }, onboardDto),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      hospitalsController.onboard({ id: hospitalAdminA.id, role: UserRole.HOSPITAL_ADMIN }, onboardDto),
    ).rejects.toThrow(ForbiddenException);
  });

  it('3. should reject hospital onboarding with duplicate slug or code', async () => {
    const existing = await prisma.raw.hospital.findUnique({ where: { id: hospitalAId } });

    const duplicateSlugDto = {
      name: 'Duplicate Slug Hospital',
      slug: existing!.slug,
      code: `DUP-${Date.now().toString().slice(-4)}`,
      email: `dup@test.org`,
      phone: '+91 22 9999 8888',
      initialAdmin: {
        firstName: 'Admin',
        lastName: 'Test',
        email: `unique_admin_${Date.now()}@test.org`,
        password: 'Password123!',
      },
    };

    await expect(hospitalsController.onboard(superAdminUser, duplicateSlugDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('4. should reject hospital onboarding with duplicate admin email', async () => {
    const existingAdmin = await prisma.raw.user.findUnique({ where: { id: hospitalAdminA.id } });

    const duplicateEmailDto = {
      name: 'Duplicate Admin Hospital',
      slug: `dup-admin-${Date.now()}`,
      code: `DPA-${Date.now().toString().slice(-4)}`,
      email: `dup-admin-hosp-${Date.now()}@test.org`,
      phone: '+91 22 9999 8888',
      initialAdmin: {
        firstName: 'Admin',
        lastName: 'Test',
        email: existingAdmin!.email,
        password: 'Password123!',
      },
    };

    await expect(hospitalsController.onboard(superAdminUser, duplicateEmailDto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('5. should allow Super Admin to list all hospitals and Hospital Admin to view only their own hospital', async () => {
    const superAdminList = await hospitalsController.getHospitals(superAdminUser, {});
    expect(superAdminList.success).toBe(true);
    expect(superAdminList.data.length).toBeGreaterThanOrEqual(2);

    const hospitalAdminList = await hospitalsController.getHospitals(hospitalAdminA, {});
    expect(hospitalAdminList.success).toBe(true);
    expect(hospitalAdminList.data.length).toBe(1);
    expect(hospitalAdminList.data[0].id).toBe(hospitalAId);
  });

  it('6. should enforce tenant boundary on getHospitalById (Hospital Admin cannot view Hospital B)', async () => {
    // Hospital Admin A views Hospital A -> Success
    const viewA = await hospitalsController.getHospitalById(hospitalAId, hospitalAdminA);
    expect(viewA.success).toBe(true);
    expect(viewA.data.id).toBe(hospitalAId);

    // Hospital Admin A views Hospital B -> 403 Forbidden
    await expect(
      hospitalsController.getHospitalById(hospitalBId, hospitalAdminA),
    ).rejects.toThrow(ForbiddenException);
  });

  // ===========================================================================
  // SECTION 2: DEPARTMENTS ARCHITECTURE (PHASE 8)
  // ===========================================================================

  it('7. should allow Hospital Admin to create a new department with unique code and head doctor', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const createDto = {
      name: `Department of Neurology ${timestamp}`,
      code: `NEURO_${timestamp}`,
      description: 'Comprehensive neurological diagnostic and therapeutic unit',
      headDoctorId: doctorA.doctorId,
      isActive: true,
    };

    const response = await departmentsController.create(hospitalAId, hospitalAdminA, createDto);

    expect(response.success).toBe(true);
    expect(response.data.id).toBeDefined();
    expect(response.data.hospitalId).toBe(hospitalAId);
    expect(response.data.code).toBe(createDto.code);
    expect(response.data.headDoctorId).toBe(doctorA.doctorId);
    expect(response.data.headDoctorName).toContain('Dr.');

    createdDepartmentIds.push(response.data.id);

    // Verify audit log
    const audit = await prisma.raw.auditLog.findFirst({
      where: { entityId: response.data.id, entityName: 'Department' },
    });
    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(hospitalAdminA.id);
  });

  it('8. should reject department creation with duplicate code within the same hospital', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const createDto = {
      name: `Nephrology Unit ${timestamp}`,
      code: `NEPH_${timestamp}`,
      description: 'Renal care',
    };

    const first = await departmentsController.create(hospitalAId, hospitalAdminA, createDto);
    createdDepartmentIds.push(first.data.id);

    await expect(
      departmentsController.create(hospitalAId, hospitalAdminA, createDto),
    ).rejects.toThrow(ConflictException);
  });

  it('9. should reject department creation with head doctor belonging to another hospital', async () => {
    // Find doctor from Hospital B
    const docB = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalBId },
    });

    if (docB) {
      const crossTenantDto = {
        name: `Cross-Tenant Test Dept ${Date.now()}`,
        code: `XTD_${Date.now().toString().slice(-4)}`,
        headDoctorId: docB.id,
      };

      await expect(
        departmentsController.create(hospitalAId, hospitalAdminA, crossTenantDto),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('10. should list departments with active doctor counts and census figures for hospital', async () => {
    const listRes = await departmentsController.list(hospitalAId, 'true');
    expect(listRes.success).toBe(true);
    expect(Array.isArray(listRes.data)).toBe(true);
    expect(listRes.data.length).toBeGreaterThan(0);

    const firstDept = listRes.data[0];
    expect(firstDept.id).toBeDefined();
    expect(firstDept.name).toBeDefined();
    expect(typeof firstDept.doctorCount).toBe('number');
    expect(typeof firstDept.activeAppointmentsToday).toBe('number');
  });

  it('11. should allow department retrieval by ID and reject cross-tenant department access', async () => {
    const dept = await departmentsService.createDepartment(hospitalAId, hospitalAdminA, {
      name: `Oncology Dept ${Date.now()}`,
      code: `ONC_${Date.now().toString().slice(-4)}`,
    });
    createdDepartmentIds.push(dept.id);

    // Hospital A accesses own department -> Success
    const ownAccess = await departmentsController.getById(hospitalAId, dept.id);
    expect(ownAccess.success).toBe(true);
    expect(ownAccess.data.id).toBe(dept.id);

    // Hospital B attempts to access Hospital A's department -> 404 NotFoundException (tenant scoped)
    await expect(departmentsController.getById(hospitalBId, dept.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('12. should allow updating department details, code, and active status', async () => {
    const dept = await departmentsService.createDepartment(hospitalAId, hospitalAdminA, {
      name: `Temporary Unit ${Date.now()}`,
      code: `TMP_${Date.now().toString().slice(-4)}`,
    });
    createdDepartmentIds.push(dept.id);

    const updateRes = await departmentsController.update(hospitalAId, hospitalAdminA, dept.id, {
      name: 'Permanent Medical Unit',
      description: 'Updated comprehensive description',
      isActive: false,
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.data.name).toBe('Permanent Medical Unit');
    expect(updateRes.data.isActive).toBe(false);

    // Verify audit log
    const audit = await prisma.raw.auditLog.findFirst({
      where: { entityId: dept.id, entityName: 'Department', action: 'UPDATE' },
    });
    expect(audit).toBeDefined();
  });

  it('13. should safely delete or deactivate a department', async () => {
    const dept = await departmentsService.createDepartment(hospitalAId, hospitalAdminA, {
      name: `Disposable Unit ${Date.now()}`,
      code: `DISP_${Date.now().toString().slice(-4)}`,
    });

    const deleteRes = await departmentsController.delete(hospitalAId, hospitalAdminA, dept.id);
    expect(deleteRes.success).toBe(true);

    const verifyDeleted = await prisma.raw.department.findUnique({
      where: { id: dept.id },
    });
    expect(verifyDeleted).toBeNull();
  });
});
