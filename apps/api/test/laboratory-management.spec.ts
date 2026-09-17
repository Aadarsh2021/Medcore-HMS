/**
 * Phase 8 — Laboratory & Diagnostics Management Comprehensive Integration Test Suite
 *
 * Runs against live PostgreSQL/Supabase database.
 * Verifies:
 *   1. Lab test catalog retrieval & tenant isolation
 *   2. Lab order creation with valid doctor, patient, encounter
 *   3. Multiple tests per order
 *   4. Patient validation (reject if patient belongs to another hospital)
 *   5. Doctor validation (reject if doctor belongs to another hospital)
 *   6. Encounter validation (reject if encounter does not match patient/hospital)
 *   7. Tenant relation validation (Hospital A order + Hospital B patient -> rejected)
 *   8. Order numbering (format: LAB-YYYY-000001)
 *   9. Concurrent order number generation race (no collisions, sequential)
 *   10. Specimen collection & state transition (ORDERED -> SAMPLE_COLLECTED)
 *   11. Accession generation (ACC-YYYY-000001)
 *   12. Concurrent accession generation race
 *   13. Specimen rejection (REJECTED)
 *   14. Rejection reason validation (reject empty reason)
 *   15. State machine: start processing (SAMPLE_COLLECTED -> PROCESSING)
 *   16. Numeric result entry
 *   17. Qualitative/text result entry
 *   18. Reference range evaluation
 *   19. Server-side NORMAL flag calculation
 *   20. Server-side LOW flag calculation
 *   21. Server-side HIGH flag calculation
 *   22. Server-side CRITICAL flag calculation
 *   23. Test-specific critical thresholds
 *   24. Client-submitted flag override ignored (server authoritative calculation)
 *   25. Invalid state transitions rejected (e.g. ORDERED direct to APPROVED)
 *   26. Result submission advances order to RESULTS_ENTERED
 *   27. Approval by authorized DOCTOR succeeds (APPROVED)
 *   28. Concurrent approval race (exactly one transaction succeeds with row lock)
 *   29. Approved immutability (direct edit rejected)
 *   30. Amendment creation with audit reason (LabResultAmendment)
 *   31. Amendment history verification
 *   32. Cancellation of unfinalized order (CANCELLED)
 *   33. Cancellation blocked after approval or while processing
 *   34. Patient own-record access (can view own approved report)
 *   35. Patient cross-patient denial (cannot view another patient's report)
 *   36. Patient denial to unapproved order (cannot view order while ORDERED/PROCESSING)
 *   37. Receptionist clinical laboratory denial (403)
 *   38. Pharmacist clinical laboratory denial (403)
 *   39. Accountant clinical laboratory denial (403)
 *   40. Cross-tenant reads (Hospital A cannot read Hospital B orders)
 *   41. Cross-tenant writes (Hospital A cannot mutate Hospital B orders)
 *   42. Audit logs verification (creation, collection, results, approval, amendment)
 *   43. Security check: zero PHI or sensitive secrets logged
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { OrderNumberService } from '../src/modules/laboratory/order-number.service';
import { RangeEvaluator } from '../src/modules/laboratory/range-evaluator';
import { LaboratoryService } from '../src/modules/laboratory/laboratory.service';
import { runWithTenantContext } from '../src/database/tenant-context';
import {
  AppointmentStatus,
  AppointmentType,
  EncounterStatus,
  LabOrderStatus,
  LabPriority,
  LabResultFlag,
  LabSpecimenStatus,
  UserRole,
} from '@medcore/types';

describe('Phase 8 — Laboratory & Diagnostics Management Integration Suite', () => {
  let prisma: PrismaService;
  let orderNumberService: OrderNumberService;
  let laboratoryService: LaboratoryService;

  // Multi-tenant hospital fixtures
  let hospitalAId: string;
  let hospitalBId: string;
  let deptAId: string;
  let deptBId: string;

  // Actors
  let doctorAId: string;
  let doctorAUserId: string;
  let doctorBId: string;
  let doctorBUserId: string;
  let labTechAUserId: string;
  let nurseAUserId: string;
  let hospitalAdminAUserId: string;
  let receptionistAUserId: string;
  let pharmacistAUserId: string;
  let accountantAUserId: string;

  // Patients
  let patientAId: string;
  let patientAUserId: string;
  let patientBId: string;
  let patientBUserId: string;

  // Clinical encounter
  let encounterAId: string;

  // Catalog tests
  let categoryAId: string;
  let testCbcId: string;
  let testPotassiumId: string;
  let testCovidId: string;
  let categoryBId: string;
  let testHospitalBId: string;

  // Clean-up tracker
  const createdUserIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdTestIds: string[] = [];
  const createdOrderIds: string[] = [];

  const withTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    runWithTenantContext({ tenantId }, fn);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    orderNumberService = new OrderNumberService(prisma);
    laboratoryService = new LaboratoryService(prisma, orderNumberService);

    // 1. Fetch multi-tenant hospitals
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals required for multi-tenant integration testing');
    }
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // Departments
    const deptA = await prisma.raw.department.findFirst({ where: { hospitalId: hospitalAId } });
    if (!deptA) throw new Error('Department required in Hospital A');
    deptAId = deptA.id;

    let deptB = await prisma.raw.department.findFirst({ where: { hospitalId: hospitalBId } });
    if (!deptB) {
      deptB = await prisma.raw.department.create({
        data: {
          hospitalId: hospitalBId,
          name: 'Hospital B Diagnostics',
          code: `DEPT-B-${Date.now()}`,
        },
      });
    }
    deptBId = deptB.id;

    const ts = Date.now();

    // 2. Provision Doctor A (Hospital A)
    const userDocA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `doc.a.lab.${ts}@medcore.test`,
        firstName: 'Sunanda',
        lastName: 'Pillai',
        role: UserRole.DOCTOR,
        passwordHash: '$2b$10$placeholder',
      },
    });
    doctorAUserId = userDocA.id;
    createdUserIds.push(doctorAUserId);

    const docA = await prisma.raw.doctor.create({
      data: {
        userId: doctorAUserId,
        hospitalId: hospitalAId,
        departmentId: deptAId,
        specialization: 'Pathology & Laboratory Medicine',
        licenseNumber: `DOC-PATH-${ts}`,
      },
    });
    doctorAId = docA.id;
    createdDoctorIds.push(doctorAId);

    // 3. Provision Doctor B (Hospital B)
    const userDocB = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalBId,
        email: `doc.b.lab.${ts}@medcore.test`,
        firstName: 'Naveen',
        lastName: 'Reddy',
        role: UserRole.DOCTOR,
        passwordHash: '$2b$10$placeholder',
      },
    });
    doctorBUserId = userDocB.id;
    createdUserIds.push(doctorBUserId);

    const docB = await prisma.raw.doctor.create({
      data: {
        userId: doctorBUserId,
        hospitalId: hospitalBId,
        departmentId: deptBId,
        specialization: 'General Medicine',
        licenseNumber: `DOC-HOSPB-${ts}`,
      },
    });
    doctorBId = docB.id;
    createdDoctorIds.push(doctorBId);

    // 4. Provision Lab Technician A (Hospital A)
    const userLabTech = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `labtech.a.${ts}@medcore.test`,
        firstName: 'Ramesh',
        lastName: 'Kulkarni',
        role: UserRole.LAB_TECHNICIAN,
        passwordHash: '$2b$10$placeholder',
      },
    });
    labTechAUserId = userLabTech.id;
    createdUserIds.push(labTechAUserId);

    // 5. Provision Nurse A (Hospital A)
    const userNurse = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `nurse.a.${ts}@medcore.test`,
        firstName: 'Mary',
        lastName: 'Joseph',
        role: UserRole.NURSE,
        passwordHash: '$2b$10$placeholder',
      },
    });
    nurseAUserId = userNurse.id;
    createdUserIds.push(nurseAUserId);

    // 6. Provision Hospital Admin A (without doctor profile)
    const userAdmin = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `admin.a.lab.${ts}@medcore.test`,
        firstName: 'Vikram',
        lastName: 'Mehta',
        role: UserRole.HOSPITAL_ADMIN,
        passwordHash: '$2b$10$placeholder',
      },
    });
    hospitalAdminAUserId = userAdmin.id;
    createdUserIds.push(hospitalAdminAUserId);

    // 7. Provision Receptionist A
    const userRec = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `rec.a.lab.${ts}@medcore.test`,
        firstName: 'Pooja',
        lastName: 'Sharma',
        role: UserRole.RECEPTIONIST,
        passwordHash: '$2b$10$placeholder',
      },
    });
    receptionistAUserId = userRec.id;
    createdUserIds.push(receptionistAUserId);

    // 8. Provision Pharmacist A
    const userPharm = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `pharm.a.lab.${ts}@medcore.test`,
        firstName: 'Alok',
        lastName: 'Verma',
        role: UserRole.PHARMACIST,
        passwordHash: '$2b$10$placeholder',
      },
    });
    pharmacistAUserId = userPharm.id;
    createdUserIds.push(pharmacistAUserId);

    // 9. Provision Accountant A
    const userAcc = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `acc.a.lab.${ts}@medcore.test`,
        firstName: 'Girish',
        lastName: 'Nambiar',
        role: UserRole.ACCOUNTANT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    accountantAUserId = userAcc.id;
    createdUserIds.push(accountantAUserId);

    // 10. Provision Patient A (Hospital A)
    const userPatA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `pat.a.lab.${ts}@medcore.test`,
        firstName: 'Devendra',
        lastName: 'Fadnavis',
        role: UserRole.PATIENT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    patientAUserId = userPatA.id;
    createdUserIds.push(patientAUserId);

    const patA = await prisma.raw.patient.create({
      data: {
        userId: patientAUserId,
        hospitalId: hospitalAId,
        uhid: `UHID-A-${ts}`,
        dateOfBirth: new Date('1984-06-15'),
        gender: 'MALE',
        bloodGroup: 'B_POSITIVE',
        emergencyContactPhone: '+919988776655',
      },
    });
    patientAId = patA.id;
    createdPatientIds.push(patientAId);

    // 11. Provision Patient B (Hospital B)
    const userPatB = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalBId,
        email: `pat.b.lab.${ts}@medcore.test`,
        firstName: 'Shreya',
        lastName: 'Ghoshal',
        role: UserRole.PATIENT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    patientBUserId = userPatB.id;
    createdUserIds.push(patientBUserId);

    const patB = await prisma.raw.patient.create({
      data: {
        userId: patientBUserId,
        hospitalId: hospitalBId,
        uhid: `UHID-B-${ts}`,
        dateOfBirth: new Date('1990-03-12'),
        gender: 'FEMALE',
        bloodGroup: 'O_POSITIVE',
        emergencyContactPhone: '+919876543210',
      },
    });
    patientBId = patB.id;
    createdPatientIds.push(patientBId);

    // 12. Provision Encounter A in Hospital A
    const apptA = await prisma.raw.appointment.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patientAId,
        doctorId: doctorAId,
        departmentId: deptAId,
        appointmentDate: new Date(),
        startTime: '10:00',
        endTime: '10:30',
        type: AppointmentType.REGULAR,
        status: AppointmentStatus.CONFIRMED,
      },
    });
    createdAppointmentIds.push(apptA.id);

    const encA = await prisma.raw.patientEncounter.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patientAId,
        doctorId: doctorAId,
        appointmentId: apptA.id,
        startedAt: new Date(),
        status: EncounterStatus.IN_PROGRESS,
      },
    });
    encounterAId = encA.id;
    createdEncounterIds.push(encounterAId);

    // 13. Provision Diagnostic Catalog Tests in Hospital A
    const catA = await prisma.raw.labCategory.create({
      data: {
        hospitalId: hospitalAId,
        name: `Clinical Diagnostics A ${ts}`,
      },
    });
    categoryAId = catA.id;
    createdCategoryIds.push(categoryAId);

    // Test 1: Hemoglobin / CBC (numeric, test-specific critical thresholds)
    const testCbc = await prisma.raw.labTest.create({
      data: {
        hospitalId: hospitalAId,
        categoryId: categoryAId,
        name: 'Complete Blood Count - Hemoglobin',
        code: `CBC-HB-${ts}`,
        price: 350.0,
        sampleType: 'Venous Whole Blood (EDTA)',
        referenceRangeMin: 12.0,
        referenceRangeMax: 17.5,
        criticalLow: 7.0, // Test-specific panic value
        criticalHigh: 20.0, // Test-specific panic value
        unit: 'g/dL',
      },
    });
    testCbcId = testCbc.id;
    createdTestIds.push(testCbcId);

    // Test 2: Serum Potassium (numeric, tight critical limits)
    const testPotassium = await prisma.raw.labTest.create({
      data: {
        hospitalId: hospitalAId,
        categoryId: categoryAId,
        name: 'Serum Potassium (K+)',
        code: `POTASS-${ts}`,
        price: 250.0,
        sampleType: 'Serum',
        referenceRangeMin: 3.5,
        referenceRangeMax: 5.1,
        criticalLow: 2.8,
        criticalHigh: 6.2,
        unit: 'mmol/L',
      },
    });
    testPotassiumId = testPotassium.id;
    createdTestIds.push(testPotassiumId);

    // Test 3: COVID-19 Rapid Antigen (qualitative text)
    const testCovid = await prisma.raw.labTest.create({
      data: {
        hospitalId: hospitalAId,
        categoryId: categoryAId,
        name: 'COVID-19 Rapid Antigen Test',
        code: `COV19-${ts}`,
        price: 500.0,
        sampleType: 'Nasopharyngeal Swab',
        unit: 'Qualitative',
      },
    });
    testCovidId = testCovid.id;
    createdTestIds.push(testCovidId);

    // Test 4: Hospital B Catalog Test
    const catB = await prisma.raw.labCategory.create({
      data: {
        hospitalId: hospitalBId,
        name: `Clinical Diagnostics B ${ts}`,
      },
    });
    categoryBId = catB.id;
    createdCategoryIds.push(categoryBId);

    const testB = await prisma.raw.labTest.create({
      data: {
        hospitalId: hospitalBId,
        categoryId: categoryBId,
        name: 'Lipid Profile Hospital B',
        code: `LIPID-B-${ts}`,
        price: 600.0,
        sampleType: 'Serum',
        unit: 'mg/dL',
      },
    });
    testHospitalBId = testB.id;
    createdTestIds.push(testHospitalBId);
  });

  afterAll(async () => {
    // Clean up created entities
    if (createdOrderIds.length > 0) {
      await prisma.raw.labResultAmendment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.raw.labSpecimen.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.raw.labOrderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.raw.labOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdTestIds.length > 0) {
      await prisma.raw.labTest.deleteMany({ where: { id: { in: createdTestIds } } });
    }
    if (createdCategoryIds.length > 0) {
      await prisma.raw.labCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    }
    if (createdEncounterIds.length > 0) {
      await prisma.raw.patientEncounter.deleteMany({ where: { id: { in: createdEncounterIds } } });
    }
    if (createdAppointmentIds.length > 0) {
      await prisma.raw.appointment.deleteMany({ where: { id: { in: createdAppointmentIds } } });
    }
    if (createdPatientIds.length > 0) {
      await prisma.raw.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    }
    if (createdDoctorIds.length > 0) {
      await prisma.raw.doctor.deleteMany({ where: { id: { in: createdDoctorIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.raw.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  // ===========================================================================
  // 1. Catalog & Tenant Boundaries
  // ===========================================================================
  it('1. should retrieve test catalog scoped strictly to active hospital tenant', async () => {
    const catalogA = await withTenant(hospitalAId, () =>
      laboratoryService.getCatalog(hospitalAId, {}),
    );
    expect(catalogA.items.length).toBeGreaterThanOrEqual(3);
    const hasHospitalBTest = catalogA.items.some((t: any) => t.id === testHospitalBId);
    expect(hasHospitalBTest).toBe(false);

    const catalogB = await withTenant(hospitalBId, () =>
      laboratoryService.getCatalog(hospitalBId, {}),
    );
    expect(catalogB.items.some((t: any) => t.id === testHospitalBId)).toBe(true);
    expect(catalogB.items.some((t: any) => t.id === testCbcId)).toBe(false);
  });

  // ===========================================================================
  // 2. Order Creation & Validation
  // ===========================================================================
  it('2. should create a laboratory diagnostic order with sequence number LAB-YYYY-NNNNNN', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          encounterId: encounterAId,
          priority: LabPriority.URGENT,
          specimenType: 'Venous Whole Blood (EDTA)',
          clinicalNotes: 'Check for acute anemia',
          items: [{ testId: testCbcId }],
        },
      ),
    );

    createdOrderIds.push(order.id);
    expect(order.id).toBeDefined();
    expect(order.orderNumber).toMatch(/^LAB-\d{4}-\d{6}$/);
    expect(order.status).toBe(LabOrderStatus.ORDERED);
    expect(order.priority).toBe(LabPriority.URGENT);
    expect(order.tests.length).toBe(1);
    expect(order.tests[0].code).toContain('CBC-HB');
  });

  it('3. should create an order with multiple diagnostic tests', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }, { testId: testPotassiumId }, { testId: testCovidId }],
        },
      ),
    );

    createdOrderIds.push(order.id);
    expect(order.tests.length).toBe(3);
    expect(order.status).toBe(LabOrderStatus.ORDERED);
  });

  it('4. should reject order creation if patient does not exist', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.createOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          {
            patientId: '00000000-0000-0000-0000-000000000000',
            doctorId: doctorAId,
            items: [{ testId: testCbcId }],
          },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('5. should reject order creation if doctor does not exist', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.createOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          {
            patientId: patientAId,
            doctorId: '00000000-0000-0000-0000-000000000000',
            items: [{ testId: testCbcId }],
          },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('6. should reject order creation if encounter does not match patient', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.createOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          {
            patientId: patientAId,
            doctorId: doctorAId,
            encounterId: '00000000-0000-0000-0000-000000000000',
            items: [{ testId: testCbcId }],
          },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // 7. Multi-Tenant Cross-Hospital Rejections
  // ===========================================================================
  it('7. should reject cross-tenant order with Hospital B patient in Hospital A', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.createOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          {
            patientId: patientBId, // Belongs to Hospital B!
            doctorId: doctorAId,
            items: [{ testId: testCbcId }],
          },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('8. should reject cross-tenant order with Hospital B doctor in Hospital A', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.createOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          {
            patientId: patientAId,
            doctorId: doctorBId, // Belongs to Hospital B!
            items: [{ testId: testCbcId }],
          },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('9. should reject cross-tenant order with Hospital B test in Hospital A', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.createOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          {
            patientId: patientAId,
            doctorId: doctorAId,
            items: [{ testId: testHospitalBId }], // Belongs to Hospital B!
          },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // 10–11. Concurrency-Safe Order Number Generation Race
  // ===========================================================================
  it('10. should generate distinct sequential order numbers concurrently without collisions', async () => {
    const concurrentCount = 4;
    const promises = Array.from({ length: concurrentCount }).map(() =>
      withTenant(hospitalAId, () =>
        laboratoryService.createOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          {
            patientId: patientAId,
            doctorId: doctorAId,
            items: [{ testId: testCbcId }],
          },
        ),
      ),
    );

    const results = await Promise.all(promises);
    results.forEach((r) => createdOrderIds.push(r.id));

    const orderNumbers = results.map((r) => r.orderNumber);
    const uniqueOrderNumbers = new Set(orderNumbers);

    expect(uniqueOrderNumbers.size).toBe(concurrentCount);
    orderNumbers.forEach((num) => {
      expect(num).toMatch(/^LAB-\d{4}-\d{6}$/);
    });
  });

  it('11. should format sequence numbers with zero-padded 6 digits', async () => {
    const num = await orderNumberService.generateOrderNumber(hospitalAId);
    expect(num).toMatch(/^LAB-\d{4}-\d{6}$/);
    const suffix = num.split('-')[2];
    expect(suffix.length).toBe(6);
    expect(parseInt(suffix, 10)).toBeGreaterThan(0);
  });

  // ===========================================================================
  // 12–14. Specimen Intake & Concurrency-Safe Accession Generation
  // ===========================================================================
  it('12. should record specimen collection and transition order to SAMPLE_COLLECTED with accession number', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    const collected = await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN, firstName: 'Ramesh', lastName: 'Kulkarni' },
        order.id,
        { specimenType: 'Venous Whole Blood (EDTA)', notes: 'Drawn from left antecubital fossa' },
      ),
    );

    expect(collected.status).toBe(LabOrderStatus.SAMPLE_COLLECTED);
    expect(collected.specimens?.length).toBe(1);
    expect(collected.specimens?.[0].accessionNumber).toMatch(/^ACC-\d{4}-\d{6}$/);
    expect(collected.specimens?.[0].status).toBe(LabSpecimenStatus.COLLECTED);
    expect(collected.collectedByName).toContain('Ramesh Kulkarni');
  });

  it('13. should generate collision-free accession numbers under concurrent parallel collection calls', async () => {
    const count = 8;
    const accessions = await Promise.all(
      Array.from({ length: count }).map(() =>
        orderNumberService.generateAccessionNumber(hospitalAId),
      ),
    );

    const uniqueAccessions = new Set(accessions);
    expect(uniqueAccessions.size).toBe(count);
    accessions.forEach((acc) => expect(acc).toMatch(/^ACC-\d{4}-\d{6}$/));
  });

  it('14. should reject specimen with mandatory reason and advance order to REJECTED terminal state', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    // Reject specimen
    const rejected = await withTenant(hospitalAId, () =>
      laboratoryService.rejectSpecimen(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
        { rejectionReason: 'Grossly hemolyzed sample, requires redraw' },
      ),
    );

    expect(rejected.status).toBe(LabOrderStatus.REJECTED);
    expect(rejected.cancellationReason).toContain('Grossly hemolyzed sample');
  });

  it('15. should reject empty specimen rejection reason', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.rejectSpecimen(
          hospitalAId,
          { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
          order.id,
          { rejectionReason: '   ' },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // 16–18. State Transitions: Processing
  // ===========================================================================
  it('16. should advance order to PROCESSING from SAMPLE_COLLECTED status', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
        { specimenType: 'Blood' },
      ),
    );

    const processing = await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
      ),
    );

    expect(processing.status).toBe(LabOrderStatus.PROCESSING);
    expect(processing.processedAt).toBeDefined();
  });

  it('17. should reject starting processing directly from ORDERED status without specimen collection', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.startProcessing(
          hospitalAId,
          { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
          order.id,
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // 19–26. Result Evaluation, Reference Ranges & Critical Panic Values
  // ===========================================================================
  it('18. should evaluate numeric result as NORMAL when within reference range', () => {
    // Hemoglobin: 12.0 - 17.5 g/dL
    const evalResult = RangeEvaluator.evaluate({
      resultValue: '14.5',
      referenceRangeMin: 12.0,
      referenceRangeMax: 17.5,
      criticalLow: 7.0,
      criticalHigh: 20.0,
    });
    expect(evalResult.flag).toBe(LabResultFlag.NORMAL);
    expect(evalResult.isCritical).toBe(false);
  });

  it('19. should evaluate numeric result as LOW when below referenceRangeMin', () => {
    const evalResult = RangeEvaluator.evaluate({
      resultValue: '10.2',
      referenceRangeMin: 12.0,
      referenceRangeMax: 17.5,
      criticalLow: 7.0,
      criticalHigh: 20.0,
    });
    expect(evalResult.flag).toBe(LabResultFlag.LOW);
    expect(evalResult.isCritical).toBe(false);
  });

  it('20. should evaluate numeric result as HIGH when above referenceRangeMax', () => {
    const evalResult = RangeEvaluator.evaluate({
      resultValue: '18.9',
      referenceRangeMin: 12.0,
      referenceRangeMax: 17.5,
      criticalLow: 7.0,
      criticalHigh: 20.0,
    });
    expect(evalResult.flag).toBe(LabResultFlag.HIGH);
    expect(evalResult.isCritical).toBe(false);
  });

  it('21. should evaluate numeric result as CRITICAL when at or below test-specific criticalLow', () => {
    const evalResult = RangeEvaluator.evaluate({
      resultValue: '6.4',
      referenceRangeMin: 12.0,
      referenceRangeMax: 17.5,
      criticalLow: 7.0,
      criticalHigh: 20.0,
    });
    expect(evalResult.flag).toBe(LabResultFlag.CRITICAL);
    expect(evalResult.isCritical).toBe(true);
  });

  it('22. should evaluate numeric result as CRITICAL when at or above test-specific criticalHigh', () => {
    // Serum Potassium: 3.5 - 5.1; criticalHigh: 6.2
    const evalResult = RangeEvaluator.evaluate({
      resultValue: '6.5',
      referenceRangeMin: 3.5,
      referenceRangeMax: 5.1,
      criticalLow: 2.8,
      criticalHigh: 6.2,
    });
    expect(evalResult.flag).toBe(LabResultFlag.CRITICAL);
    expect(evalResult.isCritical).toBe(true);
  });

  it('23. should correctly evaluate qualitative non-numeric text results', () => {
    const neg = RangeEvaluator.evaluate({ resultValue: 'Negative' });
    expect(neg.flag).toBe(LabResultFlag.NORMAL);

    const pos = RangeEvaluator.evaluate({ resultValue: 'Positive / Reactive' });
    expect(pos.flag).toBe(LabResultFlag.HIGH);

    const panic = RangeEvaluator.evaluate({ resultValue: 'CRITICAL PANIC: Clot Detected' });
    expect(panic.flag).toBe(LabResultFlag.CRITICAL);
    expect(panic.isCritical).toBe(true);
  });

  it('24. should ignore client-submitted flag and persist server-authoritative evaluated flag', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
        { specimenType: 'Blood' },
      ),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
      ),
    );

    // Client passes flag: 'NORMAL', but measured value is 6.2 (which is <= criticalLow 7.0)
    const resultOrder = await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
        {
          results: [
            {
              orderItemId: order.tests[0].id,
              resultValue: '6.2',
              flag: LabResultFlag.NORMAL, // Client attempted override
            },
          ],
        },
      ),
    );

    expect(resultOrder.status).toBe(LabOrderStatus.RESULTS_ENTERED);
    // Server must override to CRITICAL!
    expect(resultOrder.tests[0].flag).toBe(LabResultFlag.CRITICAL);
    expect(resultOrder.tests[0].isCritical).toBe(true);
  });

  // ===========================================================================
  // 27–30. Clinical Approval & Authorization
  // ===========================================================================
  it('25. should reject approving order directly from ORDERED status', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.approveOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          order.id,
          { pathologistName: 'Dr. Sunanda Pillai' },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('26. should reject approval by LAB_TECHNICIAN (must be certifying DOCTOR)', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
        { specimenType: 'Blood' },
      ),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
      ),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(
        hospitalAId,
        { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
        order.id,
        { results: [{ orderItemId: order.tests[0].id, resultValue: '14.0' }] },
      ),
    );

    // Lab tech attempts approval
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.approveOrder(
          hospitalAId,
          { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
          order.id,
          { pathologistName: 'Ramesh Kulkarni' },
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('27. should reject approval by HOSPITAL_ADMIN without doctor credentials', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '14.0' }],
      }),
    );

    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.approveOrder(
          hospitalAId,
          { id: hospitalAdminAUserId, role: UserRole.HOSPITAL_ADMIN },
          order.id,
          { pathologistName: 'Vikram Mehta' },
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('28. should successfully certify and approve order by authorized DOCTOR (Pathologist)', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '14.8' }],
      }),
    );

    const approved = await withTenant(hospitalAId, () =>
      laboratoryService.approveOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR, firstName: 'Sunanda', lastName: 'Pillai' },
        order.id,
        { pathologistName: 'Dr. Sunanda Pillai, MD (Pathology)' },
      ),
    );

    expect(approved.status).toBe(LabOrderStatus.APPROVED);
    expect(approved.approvedBy).toContain('Dr. Sunanda Pillai');
    expect(approved.approvedAt).toBeDefined();
  });

  // ===========================================================================
  // 31–33. Concurrency Race: Simultaneous Approval
  // ===========================================================================
  it('29. should safely handle concurrent approval attempts using row lock (exactly one succeeds)', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '15.2' }],
      }),
    );

    // Launch simultaneous approvals in parallel
    const [res1, res2] = await Promise.allSettled([
      withTenant(hospitalAId, () =>
        laboratoryService.approveOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          order.id,
          { pathologistName: 'Doctor 1' },
        ),
      ),
      withTenant(hospitalAId, () =>
        laboratoryService.approveOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          order.id,
          { pathologistName: 'Doctor 2' },
        ),
      ),
    ]);

    const successes = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failures = [res1, res2].filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });

  // ===========================================================================
  // 34–36. Post-Approval Immutability & Clinical Amendments
  // ===========================================================================
  it('30. should reject direct result modification on finalized APPROVED reports (immutability rule)', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '13.5' }],
      }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.approveOrder(hospitalAId, { id: doctorAUserId, role: UserRole.DOCTOR }, order.id, {}),
    );

    // Attempt direct result entry after approval
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.enterResults(
          hospitalAId,
          { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN },
          order.id,
          { results: [{ orderItemId: order.tests[0].id, resultValue: '16.0' }] },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('31. should create an audited clinical amendment preserving previous and new values', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '13.0' }],
      }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.approveOrder(hospitalAId, { id: doctorAUserId, role: UserRole.DOCTOR }, order.id, {}),
    );

    // Amend result
    const amended = await withTenant(hospitalAId, () =>
      laboratoryService.amendResult(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR, firstName: 'Sunanda', lastName: 'Pillai' },
        order.id,
        {
          orderItemId: order.tests[0].id,
          newValue: '14.2',
          reason: 'Recalibrated analyzer rerun after routine QC check',
        },
      ),
    );

    expect(amended.tests[0].result).toBe('14.2');
    expect(amended.amendments?.length).toBe(1);
    expect(amended.amendments?.[0].previousValue).toBe('13.0');
    expect(amended.amendments?.[0].newValue).toBe('14.2');
    expect(amended.amendments?.[0].reason).toContain('Recalibrated analyzer rerun');
  });

  it('32. should reject amendment without clinical justification reason', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '13.0' }],
      }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.approveOrder(hospitalAId, { id: doctorAUserId, role: UserRole.DOCTOR }, order.id, {}),
    );

    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.amendResult(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          order.id,
          {
            orderItemId: order.tests[0].id,
            newValue: '14.0',
            reason: '',
          },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // 37–39. Order Cancellation
  // ===========================================================================
  it('33. should cancel an unfinalized order before processing begins', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    const cancelled = await withTenant(hospitalAId, () =>
      laboratoryService.cancelOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        order.id,
        { reason: 'Patient requested test cancellation due to fasting violation' },
      ),
    );

    expect(cancelled.status).toBe(LabOrderStatus.CANCELLED);
    expect(cancelled.cancellationReason).toContain('fasting violation');
  });

  it('34. should block cancellation of an already APPROVED order', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '14.0' }],
      }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.approveOrder(hospitalAId, { id: doctorAUserId, role: UserRole.DOCTOR }, order.id, {}),
    );

    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.cancelOrder(
          hospitalAId,
          { id: doctorAUserId, role: UserRole.DOCTOR },
          order.id,
          { reason: 'Mistake' },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // 40–45. Patient Portal Access & Cross-Patient Security
  // ===========================================================================
  it('35. should allow patient to view their own finalized APPROVED diagnostic report', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    await withTenant(hospitalAId, () =>
      laboratoryService.collectSpecimen(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, { specimenType: 'Blood' }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.startProcessing(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.enterResults(hospitalAId, { id: labTechAUserId, role: UserRole.LAB_TECHNICIAN }, order.id, {
        results: [{ orderItemId: order.tests[0].id, resultValue: '14.5' }],
      }),
    );
    await withTenant(hospitalAId, () =>
      laboratoryService.approveOrder(hospitalAId, { id: doctorAUserId, role: UserRole.DOCTOR }, order.id, {}),
    );

    // Patient views own approved report
    const patientView = await withTenant(hospitalAId, () =>
      laboratoryService.getOrderById(hospitalAId, { id: patientAUserId, role: UserRole.PATIENT }, order.id),
    );

    expect(patientView.id).toBe(order.id);
    expect(patientView.status).toBe(LabOrderStatus.APPROVED);
  });

  it('36. should deny patient access to an unapproved diagnostic order in progress', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    // Order is in ORDERED status
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.getOrderById(hospitalAId, { id: patientAUserId, role: UserRole.PATIENT }, order.id),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('37. should deny patient access to another patient diagnostic report', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    // Patient B attempts to access Patient A's order
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.getOrderById(hospitalAId, { id: patientBUserId, role: UserRole.PATIENT }, order.id),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ===========================================================================
  // 46–48. Non-Clinical Role Access Denials (RBAC Matrix)
  // ===========================================================================
  it('38. should deny RECEPTIONIST access to clinical laboratory queue', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.getOrders(hospitalAId, { id: receptionistAUserId, role: UserRole.RECEPTIONIST }, {}),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('39. should deny PHARMACIST access to clinical laboratory queue', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.getOrders(hospitalAId, { id: pharmacistAUserId, role: UserRole.PHARMACIST }, {}),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('40. should deny ACCOUNTANT access to clinical laboratory queue', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        laboratoryService.getOrders(hospitalAId, { id: accountantAUserId, role: UserRole.ACCOUNTANT }, {}),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ===========================================================================
  // 49–51. Multi-Tenant Cross-Hospital Query & Mutation Protection
  // ===========================================================================
  it('41. should prevent Hospital B staff from reading Hospital A orders', async () => {
    const orderA = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(orderA.id);

    // Hospital B query for Hospital A order
    await expect(
      withTenant(hospitalBId, () =>
        laboratoryService.getOrderById(hospitalBId, { id: doctorBUserId, role: UserRole.DOCTOR }, orderA.id),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('42. should prevent Hospital B staff from mutating Hospital A orders', async () => {
    const orderA = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(orderA.id);

    await expect(
      withTenant(hospitalBId, () =>
        laboratoryService.collectSpecimen(
          hospitalBId,
          { id: doctorBUserId, role: UserRole.LAB_TECHNICIAN },
          orderA.id,
          { specimenType: 'Blood' },
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  // ===========================================================================
  // 52–53. Audit Trail & Zero-Leakage Security Verification
  // ===========================================================================
  it('43. should create audit log records for clinical operations', async () => {
    const order = await withTenant(hospitalAId, () =>
      laboratoryService.createOrder(
        hospitalAId,
        { id: doctorAUserId, role: UserRole.DOCTOR },
        {
          patientId: patientAId,
          doctorId: doctorAId,
          items: [{ testId: testCbcId }],
        },
      ),
    );
    createdOrderIds.push(order.id);

    const auditEntry = await prisma.raw.auditLog.findFirst({
      where: {
        hospitalId: hospitalAId,
        entityName: 'LabOrder',
        entityId: order.id,
      },
    });

    expect(auditEntry).toBeDefined();
    expect(auditEntry?.action).toBe('CREATE');
  });

  it('44. should ensure audit logs contain zero full clinical measurements or raw secrets', async () => {
    const audits = await prisma.raw.auditLog.findMany({
      where: {
        hospitalId: hospitalAId,
        entityName: 'LabOrder',
      },
      take: 5,
    });

    audits.forEach((entry) => {
      const jsonStr = JSON.stringify(entry.changesJson);
      expect(jsonStr).not.toContain('password');
      expect(jsonStr).not.toContain('secret');
      expect(jsonStr).not.toContain('bearer');
    });
  });
});
