import { PrismaService } from '../src/database/prisma.service';
import { runWithTenantContext, runWithSystemContext } from '../src/database/tenant-context';
import { ForbiddenException } from '@nestjs/common';

describe('Phase 1 — Production Multi-Tenant Data Isolation Tests', () => {
  let prisma: PrismaService;
  let hospitalAId: string;
  let hospitalBId: string;
  let patientAId: string;
  let patientBId: string;
  let doctorAId: string;
  let departmentAId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // Look up existing seeded hospitals and patients safely in system mode
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });

    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals must exist in the database for tenant isolation tests.');
    }

    hospitalAId = hospitals[0].id; // Metro General Hospital
    hospitalBId = hospitals[1].id; // Apex Super Speciality

    // Get an existing patient in Hospital A
    const patientA = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalAId },
    });

    if (!patientA) {
      throw new Error('Expected at least one patient in Hospital A for testing.');
    }
    patientAId = patientA.id;

    // Check if Hospital B has a patient; if not, create one safely for testing
    let patientB = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalBId },
    });

    if (!patientB) {
      // Find or create a test user for Patient B
      let userB = await prisma.raw.user.findFirst({
        where: { hospitalId: hospitalBId, role: 'PATIENT' },
      });
      if (!userB) {
        userB = await prisma.raw.user.create({
          data: {
            hospitalId: hospitalBId,
            email: `test.patient.b.${Date.now()}@medcore.io`,
            passwordHash: '$2b$10$fakehashfortestisolationpurposesonly123',
            role: 'PATIENT',
            firstName: 'TestPatient',
            lastName: 'ApexHospitalB',
            isEmailVerified: true,
          },
        });
      }

      patientB = await prisma.raw.patient.create({
        data: {
          userId: userB.id,
          hospitalId: hospitalBId,
          uhid: `APEX-${Date.now().toString().slice(-6)}`,
          dateOfBirth: new Date('1990-01-01'),
          gender: 'FEMALE',
        },
      });
    }
    patientBId = patientB.id;

    // Get a doctor and department in Hospital A for relation testing
    const docA = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalAId },
    });
    doctorAId = docA?.id || '';

    const deptA = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalAId },
    });
    departmentAId = deptA?.id || '';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ----------------------------------------------------------------------------
  // TEST 1 — Hospital A READS Hospital A
  // ----------------------------------------------------------------------------
  it('TEST 1: Hospital A user successfully reads Hospital A patient', async () => {
    const patient = await prisma.withTenant(hospitalAId, async () => {
      return (prisma as any).patient.findUnique({
        where: { id: patientAId },
      });
    });

    expect(patient).toBeDefined();
    expect(patient).not.toBeNull();
    expect(patient?.id).toBe(patientAId);
    expect(patient?.hospitalId).toBe(hospitalAId);
  });

  // ----------------------------------------------------------------------------
  // TEST 2 — Hospital A READS Hospital B
  // ----------------------------------------------------------------------------
  it('TEST 2: Hospital A user cannot read Hospital B patient (returns null / denied)', async () => {
    const patient = await prisma.withTenant(hospitalAId, async () => {
      return (prisma as any).patient.findUnique({
        where: { id: patientBId },
      });
    });

    // Cross-tenant read is isolated: returns null
    expect(patient).toBeNull();

    // Verify findMany also denies / filters out Hospital B patient
    const patients = await prisma.withTenant(hospitalAId, async () => {
      return (prisma as any).patient.findMany({
        where: { id: patientBId },
      });
    });

    expect(patients).toHaveLength(0);
  });

  // ----------------------------------------------------------------------------
  // TEST 3 — Hospital A UPDATES Hospital B
  // ----------------------------------------------------------------------------
  it('TEST 3: Hospital A user cannot update Hospital B patient (throws ForbiddenException)', async () => {
    const originalPatientB = await prisma.raw.patient.findUnique({
      where: { id: patientBId },
    });

    let errorThrown: any = null;
    try {
      await prisma.withTenant(hospitalAId, async () => {
        return (prisma as any).patient.update({
          where: { id: patientBId },
          data: { emergencyContactName: 'HackedContact' },
        });
      });
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown).toBeInstanceOf(ForbiddenException);

    // Verify Hospital B data remains completely unchanged
    const afterAttempt = await prisma.raw.patient.findUnique({
      where: { id: patientBId },
    });
    expect(afterAttempt?.emergencyContactName).toBe(originalPatientB?.emergencyContactName);
  });

  // ----------------------------------------------------------------------------
  // TEST 4 — Hospital A DELETES Hospital B
  // ----------------------------------------------------------------------------
  it('TEST 4: Hospital A user cannot delete Hospital B patient (throws ForbiddenException)', async () => {
    let errorThrown: any = null;
    try {
      await prisma.withTenant(hospitalAId, async () => {
        return (prisma as any).patient.delete({
          where: { id: patientBId },
        });
      });
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown).toBeInstanceOf(ForbiddenException);

    // Verify Hospital B record still exists in database
    const patientBCheck = await prisma.raw.patient.findUnique({
      where: { id: patientBId },
    });
    expect(patientBCheck).toBeDefined();
    expect(patientBCheck?.id).toBe(patientBId);
  });

  // ----------------------------------------------------------------------------
  // TEST 5 — Cross-tenant hospitalId injection
  // ----------------------------------------------------------------------------
  it('TEST 5: Cross-tenant hospitalId injection in query or create is rejected', async () => {
    // Attempt to query with explicit contradictory hospitalId in filter
    let queryError: any = null;
    try {
      await prisma.withTenant(hospitalAId, async () => {
        return (prisma as any).patient.findMany({
          where: { hospitalId: hospitalBId },
        });
      });
    } catch (err) {
      queryError = err;
    }
    expect(queryError).toBeDefined();
    expect(queryError).toBeInstanceOf(ForbiddenException);

    // Attempt to create a record passing a different hospitalId in data payload
    let createError: any = null;
    try {
      await prisma.withTenant(hospitalAId, async () => {
        return (prisma as any).department.create({
          data: {
            hospitalId: hospitalBId, // Injected foreign hospitalId
            name: 'Malicious Injected Department',
            code: 'INJECT-01',
          },
        });
      });
    } catch (err) {
      createError = err;
    }
    expect(createError).toBeDefined();
    expect(createError).toBeInstanceOf(ForbiddenException);
  });

  // ----------------------------------------------------------------------------
  // TEST 6 — Concurrent tenant requests
  // ----------------------------------------------------------------------------
  it('TEST 6: Concurrent requests for Hospital A and Hospital B do not leak context', async () => {
    const concurrentRequests = Array.from({ length: 8 }, (_, i) => {
      const isHospitalA = i % 2 === 0;
      const tenantId = isHospitalA ? hospitalAId : hospitalBId;

      return prisma.withTenant(tenantId, async () => {
        // Add random asynchronous delay to force event-loop interleaving
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 25));
        const patients = await (prisma as any).patient.findMany();
        // Every single returned patient must strictly match this request's tenant
        for (const p of patients) {
          if (p.hospitalId !== tenantId) {
            throw new Error(`LEAK: Request for ${tenantId} received record belonging to ${p.hospitalId}`);
          }
        }
        return { index: i, tenantId, count: patients.length };
      });
    });

    const results = await Promise.all(concurrentRequests);
    expect(results).toHaveLength(8);
    for (const res of results) {
      expect(res.count).toBeGreaterThanOrEqual(1);
    }
  });

  // ----------------------------------------------------------------------------
  // TEST 7 — SUPER_ADMIN explicit target
  // ----------------------------------------------------------------------------
  it('TEST 7: SUPER_ADMIN with explicit target hospital accesses target records', async () => {
    // Super Admin explicitly targeting Hospital B
    const result = await runWithTenantContext(
      {
        tenantId: hospitalBId,
        isSuperAdmin: true,
      },
      async () => {
        return (prisma as any).patient.findUnique({
          where: { id: patientBId },
        });
      },
    );

    expect(result).toBeDefined();
    expect(result?.id).toBe(patientBId);
    expect(result?.hospitalId).toBe(hospitalBId);
  });

  // ----------------------------------------------------------------------------
  // TEST 8 — SUPER_ADMIN without target
  // ----------------------------------------------------------------------------
  it('TEST 8: SUPER_ADMIN without target hospital is blocked from tenant-scoped writes', async () => {
    let error: any = null;
    try {
      await runWithTenantContext(
        {
          tenantId: null, // No target hospital specified
          isSuperAdmin: true,
        },
        async () => {
          return (prisma as any).department.create({
            data: {
              name: 'Unscoped Department',
              code: 'UNSCOPED-99',
            },
          });
        },
      );
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toContain('Super Admin must specify target hospital');
  });

  // ----------------------------------------------------------------------------
  // TEST 9 — Cross-tenant relation reference
  // ----------------------------------------------------------------------------
  it('TEST 9: Creating record in Hospital A referencing Hospital B entity is denied', async () => {
    let error: any = null;
    try {
      await prisma.withTenant(hospitalAId, async () => {
        // Attempt to create an Appointment in Hospital A referencing Hospital B's patient
        return (prisma as any).appointment.create({
          data: {
            patientId: patientBId, // Hospital B's patient!
            doctorId: doctorAId,
            departmentId: departmentAId,
            appointmentDate: new Date('2026-10-15'),
            startTime: '10:00',
            endTime: '10:30',
          },
        });
      });
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toContain('Cross-tenant relation violation');
  });

  // ----------------------------------------------------------------------------
  // TEST 10 — Aggregation / count isolation
  // ----------------------------------------------------------------------------
  it('TEST 10: Aggregation and count operations are strictly scoped to tenant', async () => {
    const totalSystemCount = await prisma.raw.patient.count();

    const hospitalACount = await prisma.withTenant(hospitalAId, async () => {
      return (prisma as any).patient.count();
    });

    const hospitalBCount = await prisma.withTenant(hospitalBId, async () => {
      return (prisma as any).patient.count();
    });

    // Counts must be strictly isolated
    expect(hospitalACount).toBeGreaterThanOrEqual(1);
    expect(hospitalBCount).toBeGreaterThanOrEqual(1);
    expect(hospitalACount + hospitalBCount).toBe(totalSystemCount);
  });

  // ----------------------------------------------------------------------------
  // AUTH REGRESSION TESTS
  // ----------------------------------------------------------------------------
  it('TEST 11: Auth Regression — getDemoAccounts returns configured accounts', async () => {
    // getDemoAccounts runs publicly / in unconstrained mode
    const accounts = await prisma.withSystem(async () => {
      return (prisma as any).user.findMany({
        where: { isActive: true },
        select: {
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          hospital: {
            select: { name: true, code: true },
          },
        },
      });
    });

    expect(accounts).toBeDefined();
    expect(accounts.length).toBeGreaterThanOrEqual(10);
    expect(accounts.some((a: any) => a.email === 'admin.metro@medcore.io')).toBe(true);
    expect(accounts.some((a: any) => a.email === 'superadmin@medcore.io')).toBe(true);
  });

  it('TEST 12: Auth Regression — getMe retrieves user profile and tenant details', async () => {
    // User profile lookup for an authenticated user
    const adminMetro = await prisma.raw.user.findFirst({
      where: { email: 'admin.metro@medcore.io' },
    });

    expect(adminMetro).toBeDefined();

    const userProfile = await runWithTenantContext(
      {
        tenantId: adminMetro!.hospitalId,
        userId: adminMetro!.id,
        role: adminMetro!.role,
      },
      async () => {
        return (prisma as any).user.findUnique({
          where: { id: adminMetro!.id },
          include: {
            hospital: {
              select: {
                id: true,
                name: true,
                slug: true,
                code: true,
                status: true,
                subscriptionTier: true,
              },
            },
            doctorProfile: true,
            patientProfile: true,
          },
        });
      },
    );

    expect(userProfile).toBeDefined();
    expect(userProfile?.email).toBe('admin.metro@medcore.io');
    expect(userProfile?.hospital?.name).toContain('Metro General');
  });
});

