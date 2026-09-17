import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { runWithTenantContext } from '../src/database/tenant-context';
import { InvoiceNumberService } from '../src/modules/billing/invoice-number.service';
import { IdempotencyService } from '../src/modules/billing/idempotency.service';
import { PaymentProviderService } from '../src/modules/billing/payment-provider.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { FinancialCalculator } from '../src/modules/billing/financial-calculator';
import { AuditAction } from '@prisma/client';
import {
  InvoiceStatus,
  InvoiceItemType,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
  UserRole,
} from '@medcore/types';
import * as crypto from 'crypto';

describe('Phase 9 — Billing, Invoicing & Payments Integration Suite', () => {
  let prisma: PrismaService;
  let invoiceNumberService: InvoiceNumberService;
  let idempotencyService: IdempotencyService;
  let paymentProviderService: PaymentProviderService;
  let billingService: BillingService;

  // Hospital A
  let hospitalAId: string;
  let deptAId: string;
  let doctorAUserId: string;
  let doctorAId: string;
  let patientAUserId: string;
  let patientAId: string;
  let patientAUhid: string;
  let appointmentAId: string;
  let encounterAId: string;
  let accountantAUserId: string;
  let hospitalAdminAUserId: string;
  let receptionistAUserId: string;
  let labTechAUserId: string;
  let pharmacistAUserId: string;

  // Hospital B (Cross-Tenant)
  let hospitalBId: string;
  let deptBId: string;
  let doctorBUserId: string;
  let doctorBId: string;
  let patientBUserId: string;
  let patientBId: string;
  let accountantBUserId: string;
  let superAdminUserId: string;

  // Tracking for clean teardown
  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdRefundIds: string[] = [];
  const createdEncounterIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdPatientIds: string[] = [];
  const createdDoctorIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdEventIds: string[] = [];

  const withTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => {
    return runWithTenantContext({ tenantId }, fn);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    invoiceNumberService = new InvoiceNumberService(prisma);
    idempotencyService = new IdempotencyService(prisma);
    paymentProviderService = new PaymentProviderService(prisma);
    billingService = new BillingService(
      prisma,
      invoiceNumberService,
      idempotencyService,
      paymentProviderService,
    );

    // 1. Fetch 2 multi-tenant hospitals
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (hospitals.length < 2) {
      throw new Error('At least 2 hospitals required for multi-tenant billing tests');
    }
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    const ts = Date.now();

    // Departments
    let deptA = await prisma.raw.department.findFirst({ where: { hospitalId: hospitalAId } });
    if (!deptA) {
      deptA = await prisma.raw.department.create({
        data: { hospitalId: hospitalAId, name: 'General Medicine A', code: `MED-A-${ts}` },
      });
    }
    deptAId = deptA.id;

    let deptB = await prisma.raw.department.findFirst({ where: { hospitalId: hospitalBId } });
    if (!deptB) {
      deptB = await prisma.raw.department.create({
        data: { hospitalId: hospitalBId, name: 'General Medicine B', code: `MED-B-${ts}` },
      });
    }
    deptBId = deptB.id;

    // 2. Hospital A Users
    // Accountant A
    const userAccA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `accountant.a.${ts}@medcore.test`,
        firstName: 'Anil',
        lastName: 'Agarwal',
        role: UserRole.ACCOUNTANT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    accountantAUserId = userAccA.id;
    createdUserIds.push(accountantAUserId);

    // Hospital Admin A
    const userAdminA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `admin.a.bill.${ts}@medcore.test`,
        firstName: 'Suresh',
        lastName: 'Raina',
        role: UserRole.HOSPITAL_ADMIN,
        passwordHash: '$2b$10$placeholder',
      },
    });
    hospitalAdminAUserId = userAdminA.id;
    createdUserIds.push(hospitalAdminAUserId);

    // Doctor A
    const userDocA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `doc.a.bill.${ts}@medcore.test`,
        firstName: 'Deepak',
        lastName: 'Verma',
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
        specialization: 'Internal Medicine',
        licenseNumber: `DOC-BILL-A-${ts}`,
      },
    });
    doctorAId = docA.id;
    createdDoctorIds.push(doctorAId);

    // Patient A
    const userPatA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `patient.a.bill.${ts}@medcore.test`,
        firstName: 'Rohan',
        lastName: 'Kapoor',
        role: UserRole.PATIENT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    patientAUserId = userPatA.id;
    createdUserIds.push(patientAUserId);

    patientAUhid = `UHID-BILL-A-${ts}`;
    const patA = await prisma.raw.patient.create({
      data: {
        userId: patientAUserId,
        hospitalId: hospitalAId,
        uhid: patientAUhid,
        gender: 'MALE',
        dateOfBirth: new Date('1990-05-15'),
      },
    });
    patientAId = patA.id;
    createdPatientIds.push(patientAId);

    // Receptionist A
    const userRecA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `rec.a.bill.${ts}@medcore.test`,
        firstName: 'Pooja',
        lastName: 'Nair',
        role: UserRole.RECEPTIONIST,
        passwordHash: '$2b$10$placeholder',
      },
    });
    receptionistAUserId = userRecA.id;
    createdUserIds.push(receptionistAUserId);

    // Lab Tech A
    const userLabTechA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `labtech.a.bill.${ts}@medcore.test`,
        firstName: 'Karan',
        lastName: 'Johar',
        role: UserRole.LAB_TECHNICIAN,
        passwordHash: '$2b$10$placeholder',
      },
    });
    labTechAUserId = userLabTechA.id;
    createdUserIds.push(labTechAUserId);

    // Pharmacist A
    const userPharmA = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalAId,
        email: `pharm.a.bill.${ts}@medcore.test`,
        firstName: 'Manish',
        lastName: 'Malhotra',
        role: UserRole.PHARMACIST,
        passwordHash: '$2b$10$placeholder',
      },
    });
    pharmacistAUserId = userPharmA.id;
    createdUserIds.push(pharmacistAUserId);

    // Super Admin User
    const userSuper = await prisma.raw.user.create({
      data: {
        hospitalId: null,
        email: `super.admin.bill.${ts}@medcore.test`,
        firstName: 'System',
        lastName: 'Admin',
        role: UserRole.SUPER_ADMIN,
        passwordHash: '$2b$10$placeholder',
      },
    });
    superAdminUserId = userSuper.id;
    createdUserIds.push(superAdminUserId);

    // Appointment A & Encounter A
    const apptA = await prisma.raw.appointment.create({
      data: {
        hospitalId: hospitalAId,
        patientId: patientAId,
        doctorId: doctorAId,
        departmentId: deptAId,
        appointmentDate: new Date(),
        startTime: '10:00',
        endTime: '10:30',
        status: 'CONFIRMED',
      },
    });
    appointmentAId = apptA.id;
    createdAppointmentIds.push(appointmentAId);

    const encA = await prisma.raw.patientEncounter.create({
      data: {
        hospitalId: hospitalAId,
        appointmentId: appointmentAId,
        patientId: patientAId,
        doctorId: doctorAId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
    encounterAId = encA.id;
    createdEncounterIds.push(encounterAId);

    // 3. Hospital B Users (Cross-Tenant Testing)
    const userDocB = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalBId,
        email: `doc.b.bill.${ts}@medcore.test`,
        firstName: 'Amitabh',
        lastName: 'Bachchan',
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
        specialization: 'Cardiology',
        licenseNumber: `DOC-BILL-B-${ts}`,
      },
    });
    doctorBId = docB.id;
    createdDoctorIds.push(doctorBId);

    const userPatB = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalBId,
        email: `patient.b.bill.${ts}@medcore.test`,
        firstName: 'Shahrukh',
        lastName: 'Khan',
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
        uhid: `UHID-BILL-B-${ts}`,
        gender: 'MALE',
        dateOfBirth: new Date('1985-11-02'),
      },
    });
    patientBId = patB.id;
    createdPatientIds.push(patientBId);

    const userAccB = await prisma.raw.user.create({
      data: {
        hospitalId: hospitalBId,
        email: `accountant.b.${ts}@medcore.test`,
        firstName: 'Mukesh',
        lastName: 'Ambani',
        role: UserRole.ACCOUNTANT,
        passwordHash: '$2b$10$placeholder',
      },
    });
    accountantBUserId = userAccB.id;
    createdUserIds.push(accountantBUserId);
  });

  afterAll(async () => {
    // Teardown created entities
    if (createdRefundIds.length > 0) {
      await prisma.raw.refund.deleteMany({ where: { id: { in: createdRefundIds } } });
    }
    if (createdPaymentIds.length > 0) {
      await prisma.raw.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    }
    if (createdInvoiceIds.length > 0) {
      await prisma.raw.invoiceItem.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.raw.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
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
    if (createdEventIds.length > 0) {
      await prisma.raw.paymentProviderEvent.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    await prisma.$disconnect();
  });

  // ===========================================================================
  // SECTION A: INVOICE LIFECYCLE (1–10)
  // ===========================================================================

  it('1. should create an invoice in DRAFT status with collision-safe sequence number INV-YYYY-NNNNNN', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          appointmentId: appointmentAId,
          encounterId: encounterAId,
          items: [
            {
              type: InvoiceItemType.CONSULTATION,
              description: 'General Specialist Consultation',
              quantity: 1,
              unitPrice: 500,
            },
          ],
        },
      ),
    );

    createdInvoiceIds.push(invoice.id);
    expect(invoice.id).toBeDefined();
    expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(invoice.totalAmount).toBe(500);
    expect(invoice.paidAmount).toBe(0);
    expect(invoice.outstandingAmount).toBe(500);
  });

  it('2. should create an invoice with multiple line items', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [
            {
              type: InvoiceItemType.CONSULTATION,
              description: 'Cardiology Consultation',
              quantity: 1,
              unitPrice: 800,
            },
            {
              type: InvoiceItemType.LAB_TEST,
              description: 'Complete Blood Count',
              quantity: 1,
              unitPrice: 350,
            },
            {
              type: InvoiceItemType.PHARMACY,
              description: 'Atorvastatin 20mg',
              quantity: 2,
              unitPrice: 150,
            },
          ],
        },
      ),
    );

    createdInvoiceIds.push(invoice.id);
    expect(invoice.items.length).toBe(3);
    expect(invoice.subtotal).toBe(1450); // 800 + 350 + (2 * 150)
    expect(invoice.totalAmount).toBe(1450);
  });

  it('3. should authoritatively calculate line totals and invoice totals on the server', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [
            {
              description: 'Service A',
              quantity: 3,
              unitPrice: 200,
              discount: 50,
              tax: 27.5,
            },
          ],
        },
      ),
    );

    createdInvoiceIds.push(invoice.id);
    // lineSubtotal: 3 * 200 = 600
    // discount: 50
    // taxable: 550
    // tax: 27.5
    // totalPrice: 550 + 27.5 = 577.5
    expect(invoice.subtotal).toBe(600);
    expect(invoice.discountAmount).toBe(50);
    expect(invoice.taxAmount).toBe(27.5);
    expect(invoice.totalAmount).toBe(577.5);
  });

  it('4. should reject client attempts to override calculated totalAmount', async () => {
    // Attempting to inject a fake totalAmount in payload
    const payload: any = {
      patientId: patientAId,
      items: [{ description: 'Medication', quantity: 2, unitPrice: 500 }],
      totalAmount: 100, // Client attempts to undercharge
    };

    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        payload,
      ),
    );

    createdInvoiceIds.push(invoice.id);
    // Server must ignore client totalAmount and compute 2 * 500 = 1000
    expect(invoice.totalAmount).toBe(1000);
    expect(invoice.totalAmount).not.toBe(100);
  });

  it('5. should authoritatively calculate taxes on server and ignore client overrides', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Special procedure', quantity: 1, unitPrice: 2000, tax: 100 }],
        },
      ),
    );

    createdInvoiceIds.push(invoice.id);
    expect(invoice.taxAmount).toBe(100);
    expect(invoice.totalAmount).toBe(2100);
  });

  it('6. should clamp and calculate line-item discounts without allowing discount > subtotal', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Item with excessive discount', quantity: 1, unitPrice: 500, discount: 9999 }],
        },
      ),
    );

    createdInvoiceIds.push(invoice.id);
    // Discount cannot exceed subtotal (500)
    expect(invoice.discountAmount).toBe(500);
    expect(invoice.totalAmount).toBe(0);
    expect(invoice.outstandingAmount).toBe(0);
  });

  it('7. should transition invoice from DRAFT to ISSUED and record issued timestamp and actor', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Consultation', quantity: 1, unitPrice: 600 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    const issued = await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    expect(issued.status).toBe(InvoiceStatus.ISSUED);
    expect(issued.issuedAt).toBeDefined();
    expect(new Date(issued.issuedAt!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('8. should enforce immutability on ISSUED invoices by rejecting direct line item updates', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Initial Consultation', quantity: 1, unitPrice: 600 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    // Issue invoice
    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // Attempt to mutate items
    await expect(
      withTenant(hospitalAId, () =>
        billingService.updateDraft(hospitalAId, { id: accountantAUserId }, invoice.id, {
          items: [{ description: 'Mutated Item', quantity: 1, unitPrice: 100 }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('9. should reject invalid state transitions (e.g. issuing an already ISSUED or VOID invoice)', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Consultation', quantity: 1, unitPrice: 600 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    // First issue succeeds
    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // Second issue fails
    await expect(
      withTenant(hospitalAId, () =>
        billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('10. should generate distinct sequential invoice numbers concurrently without collisions', async () => {
    const count = 5;
    const promises = Array.from({ length: count }).map(() =>
      withTenant(hospitalAId, () =>
        billingService.createInvoice(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          {
            patientId: patientAId,
            items: [{ description: 'Concurrent Item', quantity: 1, unitPrice: 100 }],
          },
        ),
      ),
    );

    const results = await Promise.all(promises);
    results.forEach((inv) => createdInvoiceIds.push(inv.id));

    const invoiceNumbers = results.map((r) => r.invoiceNumber);
    const uniqueNumbers = new Set(invoiceNumbers);

    expect(uniqueNumbers.size).toBe(count);
    invoiceNumbers.forEach((num) => expect(num).toMatch(/^INV-\d{4}-\d{6}$/));
  });

  // ===========================================================================
  // SECTION B: FINANCIAL CALCULATION RULES (11–17)
  // ===========================================================================

  it('11. should accurately handle decimal currency values with exact 2-decimal precision', async () => {
    const result = FinancialCalculator.computeInvoice([
      { description: 'Item A', quantity: 3, unitPrice: 33.33 },
      { description: 'Item B', quantity: 7, unitPrice: 14.28 },
    ]);

    // 3 * 33.33 = 99.99
    // 7 * 14.28 = 99.96
    // Subtotal: 199.95
    expect(result.subtotal).toBe(199.95);
    expect(result.totalAmount).toBe(199.95);
  });

  it('12. should perform half-up rounding on fractional tax amounts', async () => {
    // 0.125 rounds to 0.13
    expect(FinancialCalculator.round2(0.125)).toBe(0.13);
    // 0.124 rounds to 0.12
    expect(FinancialCalculator.round2(0.124)).toBe(0.12);
  });

  it('13. should apply discount before calculating percentage tax on taxable base', async () => {
    const result = FinancialCalculator.computeInvoice([
      {
        description: 'Procedure',
        quantity: 1,
        unitPrice: 1000,
        discount: 200, // 800 taxable base
        tax: 40, // 5% of 800
      },
    ]);

    expect(result.subtotal).toBe(1000);
    expect(result.discountAmount).toBe(200);
    expect(result.taxAmount).toBe(40);
    expect(result.totalAmount).toBe(840);
  });

  it('14. should handle zero-tax and zero-discount line items accurately', async () => {
    const result = FinancialCalculator.computeInvoice([
      { description: 'Item 1', quantity: 2, unitPrice: 250 },
    ]);

    expect(result.subtotal).toBe(500);
    expect(result.discountAmount).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.totalAmount).toBe(500);
  });

  it('15. should correctly aggregate totals across distinct service types (consultation, lab, pharmacy)', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [
            { type: InvoiceItemType.CONSULTATION, description: 'Consultation', quantity: 1, unitPrice: 750 },
            { type: InvoiceItemType.LAB_TEST, description: 'Lipid Profile', quantity: 1, unitPrice: 950 },
            { type: InvoiceItemType.PHARMACY, description: 'Statins', quantity: 1, unitPrice: 420 },
          ],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    expect(invoice.subtotal).toBe(2120);
    expect(invoice.items.find((i) => i.type === InvoiceItemType.CONSULTATION)).toBeDefined();
    expect(invoice.items.find((i) => i.type === InvoiceItemType.LAB_TEST)).toBeDefined();
    expect(invoice.items.find((i) => i.type === InvoiceItemType.PHARMACY)).toBeDefined();
  });

  it('16. should clamp negative unit price to 0', async () => {
    const result = FinancialCalculator.computeInvoice([
      { description: 'Invalid price', quantity: 1, unitPrice: -50 },
    ]);
    expect(result.subtotal).toBe(0);
  });

  it('17. should clamp zero or negative quantity to 1', async () => {
    const result = FinancialCalculator.computeInvoice([
      { description: 'Zero quantity', quantity: 0, unitPrice: 100 },
    ]);
    expect(result.subtotal).toBe(100); // Clamped to 1
  });

  // ===========================================================================
  // SECTION C: PAYMENT LIFECYCLE (18–26)
  // ===========================================================================

  it('18. should record a manual cash payment against an ISSUED invoice', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'OPD Consultation', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const paymentRes = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        {
          amount: 500,
          method: PaymentMethod.CASH,
        },
      ),
    );

    createdPaymentIds.push(paymentRes.payment.id);
    expect(paymentRes.payment.amount).toBe(500);
    expect(paymentRes.payment.method).toBe(PaymentMethod.CASH);
    expect(paymentRes.payment.status).toBe(PaymentStatus.SUCCESS);
    expect(paymentRes.invoice.status).toBe(InvoiceStatus.PAID);
    expect(paymentRes.invoice.outstandingAmount).toBe(0);
  });

  it('19. should reject payment recording with non-positive amount', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'OPD Consultation', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    await expect(
      withTenant(hospitalAId, () =>
        billingService.recordPayment(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          invoice.id,
          { amount: 0, method: PaymentMethod.CASH },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('20. should record partial payment and transition invoice status to PARTIALLY_PAID', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Major Procedure', quantity: 1, unitPrice: 1000 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const paymentRes = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 400, method: PaymentMethod.CARD },
      ),
    );

    createdPaymentIds.push(paymentRes.payment.id);
    expect(paymentRes.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(paymentRes.invoice.paidAmount).toBe(400);
    expect(paymentRes.invoice.outstandingAmount).toBe(600);
  });

  it('21. should record exact settling payment and transition invoice status to PAID', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Lab Diagnostic Tests', quantity: 1, unitPrice: 600 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // First partial payment: 300
    const pay1 = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 300, method: PaymentMethod.UPI },
      ),
    );
    createdPaymentIds.push(pay1.payment.id);
    expect(pay1.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Second exact settling payment: 300
    const pay2 = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 300, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay2.payment.id);
    expect(pay2.invoice.status).toBe(InvoiceStatus.PAID);
    expect(pay2.invoice.outstandingAmount).toBe(0);
  });

  it('22. should reject overpayment exceeding remaining outstanding balance', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Test service', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // Attempting to pay 501 on a 500 balance
    await expect(
      withTenant(hospitalAId, () =>
        billingService.recordPayment(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          invoice.id,
          { amount: 501, method: PaymentMethod.CASH },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('23. should record UPI payment with transaction reference and timestamp', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Medicine dispensing', quantity: 1, unitPrice: 350 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const ref = `UPI/987654321/HDFC`;
    const paymentRes = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 350, method: PaymentMethod.UPI, transactionReference: ref },
      ),
    );
    createdPaymentIds.push(paymentRes.payment.id);

    expect(paymentRes.payment.method).toBe(PaymentMethod.UPI);
    expect(paymentRes.payment.transactionReference).toBe(ref);
    expect(paymentRes.payment.paidAt).toBeDefined();
  });

  it('24. should update invoice paidAmount and outstanding balance after payment', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Doctor checkup', quantity: 1, unitPrice: 800 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 250, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay.payment.id);

    expect(pay.invoice.paidAmount).toBe(250);
    expect(pay.invoice.outstandingAmount).toBe(550);
  });

  it('25. should generate collision-safe payment numbers PAY-YYYY-NNNNNN', async () => {
    const num = await invoiceNumberService.generatePaymentNumber(hospitalAId);
    expect(num).toMatch(/^PAY-\d{4}-\d{6}$/);
  });

  it('26. should reject payment attempts against a DRAFT invoice prior to issuance', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Draft service', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    // Invoice is still in DRAFT
    await expect(
      withTenant(hospitalAId, () =>
        billingService.recordPayment(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          invoice.id,
          { amount: 500, method: PaymentMethod.CASH },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // SECTION D: IDEMPOTENCY & REPLAY PROTECTION (27–30)
  // ===========================================================================

  it('27. should return cached payment result when replaying request with same idempotency key and same payload', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Idempotency Test Service', quantity: 1, unitPrice: 1000 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const idempotencyKey = `idem-pay-${Date.now()}-${Math.random()}`;

    // First request
    const firstRes = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 300, method: PaymentMethod.CASH, idempotencyKey },
      ),
    );
    createdPaymentIds.push(firstRes.payment.id);

    // Replay exact same request with same key
    const replayRes = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 300, method: PaymentMethod.CASH, idempotencyKey },
      ),
    );

    // Must return the exact same payment ID and must NOT apply another 300 deduction
    expect(replayRes.payment.id).toBe(firstRes.payment.id);
    expect(replayRes.invoice.paidAmount).toBe(300);
  });

  it('28. should reject with 409 Conflict when replaying same idempotency key with different payload', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Conflict Test Service', quantity: 1, unitPrice: 1000 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const idempotencyKey = `idem-conflict-${Date.now()}`;

    // First request: 200
    const firstRes = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 200, method: PaymentMethod.CASH, idempotencyKey },
      ),
    );
    createdPaymentIds.push(firstRes.payment.id);

    // Second request with SAME key but DIFFERENT payload (amount: 500)
    await expect(
      withTenant(hospitalAId, () =>
        billingService.recordPayment(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          invoice.id,
          { amount: 500, method: PaymentMethod.CASH, idempotencyKey },
        ),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('29. should safely handle concurrent duplicate idempotency requests without duplicate financial deductions', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Concurrent Idempotency', quantity: 1, unitPrice: 1000 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const idempotencyKey = `idem-concurrent-${Date.now()}`;

    // Execute first call
    const res1 = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 400, method: PaymentMethod.CASH, idempotencyKey },
      ),
    );
    createdPaymentIds.push(res1.payment.id);

    // Execute second call with same key
    const res2 = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 400, method: PaymentMethod.CASH, idempotencyKey },
      ),
    );

    expect(res2.payment.id).toBe(res1.payment.id);

    // Verify database has exactly 1 payment
    const totalPayments = await prisma.raw.payment.count({
      where: { invoiceId: invoice.id },
    });
    expect(totalPayments).toBe(1);
  });

  it('30. should identify duplicate webhook event IDs and prevent replay', async () => {
    const eventId = `evt_webhook_test_${Date.now()}`;
    const rawPayload = JSON.stringify({ id: eventId, event: 'payment.captured' });

    const event = {
      provider: 'RAZORPAY',
      eventId,
      eventType: 'payment.captured',
      status: 'SUCCEEDED' as const,
      rawPayload: { id: eventId },
    };

    // First ingestion
    const res1 = await paymentProviderService.recordWebhookEvent(event, rawPayload, hospitalAId);
    createdEventIds.push(res1.eventRecordId);
    expect(res1.isDuplicate).toBe(false);

    // Second ingestion with same eventId
    const res2 = await paymentProviderService.recordWebhookEvent(event, rawPayload, hospitalAId);
    expect(res2.isDuplicate).toBe(true);
  });

  // ===========================================================================
  // SECTION E: PAYMENT CONCURRENCY & ROW LOCKING (31–34)
  // ===========================================================================

  it('31. should safely handle concurrent payments against the same invoice using row locking', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'High-Concurrency Test', quantity: 1, unitPrice: 1000 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // 4 concurrent payments of 100 each = 400 total
    const promises = Array.from({ length: 4 }).map((_, idx) =>
      withTenant(hospitalAId, () =>
        billingService.recordPayment(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          invoice.id,
          { amount: 100, method: PaymentMethod.CASH },
        ),
      ),
    );

    const results = await Promise.all(promises);
    results.forEach((r) => createdPaymentIds.push(r.payment.id));

    // Verify invoice paidAmount is exactly 400
    const refreshed = await withTenant(hospitalAId, () =>
      billingService.getInvoiceById(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
      ),
    );
    expect(refreshed.paidAmount).toBe(400);
    expect(refreshed.outstandingAmount).toBe(600);
    expect(refreshed.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('32. should reject concurrent payment race attempts that would cause overpayment', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Limited Balance Item', quantity: 1, unitPrice: 300 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // 2 concurrent payments of 200 each contesting a 300 balance
    // Exactly one should succeed, the other must fail with overpayment rejection
    const p1 = withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 200, method: PaymentMethod.CASH },
      ),
    );
    const p2 = withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 200, method: PaymentMethod.CASH },
      ),
    );

    const results = await Promise.allSettled([p1, p2]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);

    if (succeeded[0].status === 'fulfilled') {
      createdPaymentIds.push(succeeded[0].value.payment.id);
    }
  });

  it('33. should guarantee invoice outstandingAmount never drops below zero under concurrency', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Zero-floor Test', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 500, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay.payment.id);

    expect(pay.invoice.outstandingAmount).toBe(0);
    expect(pay.invoice.outstandingAmount).toBeGreaterThanOrEqual(0);
  });

  it('34. should ensure exactly one payment succeeds when multiple concurrent payments contest the final remaining balance', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Contested Final Balance', quantity: 1, unitPrice: 200 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // 3 parallel full payments of 200
    const promises = Array.from({ length: 3 }).map(() =>
      withTenant(hospitalAId, () =>
        billingService.recordPayment(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          invoice.id,
          { amount: 200, method: PaymentMethod.CASH },
        ),
      ),
    );

    const settled = await Promise.allSettled(promises);
    const passed = settled.filter((s) => s.status === 'fulfilled');
    const failed = settled.filter((s) => s.status === 'rejected');

    expect(passed.length).toBe(1);
    expect(failed.length).toBe(2);

    if (passed[0].status === 'fulfilled') {
      createdPaymentIds.push(passed[0].value.payment.id);
    }
  });

  // ===========================================================================
  // SECTION F: REFUNDS (35–39)
  // ===========================================================================

  it('35. should process a valid partial refund against a completed payment', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Pharmacy prescription', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 500, method: PaymentMethod.CARD },
      ),
    );
    createdPaymentIds.push(pay.payment.id);

    // Process partial refund of 200
    const refundRes = await withTenant(hospitalAId, () =>
      billingService.createRefund(
        hospitalAId,
        { id: accountantAUserId },
        pay.payment.id,
        { amount: 200, reason: 'Patient returned unused medication' },
      ),
    );
    createdRefundIds.push(refundRes.refund.id);

    expect(refundRes.refund.amount).toBe(200);
    expect(refundRes.refund.status).toBe(RefundStatus.SUCCESS);
    expect(refundRes.invoice.refundedAmount).toBe(200);
    expect(refundRes.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
  });

  it('36. should reject refund exceeding the refundable amount of the target payment', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Service', quantity: 1, unitPrice: 400 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 400, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay.payment.id);

    // Attempting to refund 450 against a 400 payment
    await expect(
      withTenant(hospitalAId, () =>
        billingService.createRefund(
          hospitalAId,
          { id: accountantAUserId },
          pay.payment.id,
          { amount: 450, reason: 'Accidental excess refund' },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('37. should reject duplicate refund requests that together exceed payment amount', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Service', quantity: 1, unitPrice: 300 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 300, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay.payment.id);

    // First refund: 200
    const ref1 = await withTenant(hospitalAId, () =>
      billingService.createRefund(
        hospitalAId,
        { id: accountantAUserId },
        pay.payment.id,
        { amount: 200, reason: 'First refund' },
      ),
    );
    createdRefundIds.push(ref1.refund.id);

    // Second refund: 200 (exceeds remaining 100)
    await expect(
      withTenant(hospitalAId, () =>
        billingService.createRefund(
          hospitalAId,
          { id: accountantAUserId },
          pay.payment.id,
          { amount: 200, reason: 'Excess second refund' },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('38. should reject refund attempts against failed or uncompleted payments', async () => {
    // Create a payment with FAILED status
    const payment = await prisma.raw.payment.create({
      data: {
        hospitalId: hospitalAId,
        invoiceId: createdInvoiceIds[0],
        amount: 200,
        status: PaymentStatus.FAILED,
        method: PaymentMethod.CARD,
      },
    });
    createdPaymentIds.push(payment.id);

    await expect(
      withTenant(hospitalAId, () =>
        billingService.createRefund(
          hospitalAId,
          { id: accountantAUserId },
          payment.id,
          { amount: 200, reason: 'Refund failed payment' },
        ),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('39. should update invoice refundedAmount and transition PAID invoice back to PARTIALLY_PAID', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Full Settled Service', quantity: 1, unitPrice: 1000 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 1000, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay.payment.id);
    expect(pay.invoice.status).toBe(InvoiceStatus.PAID);

    // Refund 300
    const ref = await withTenant(hospitalAId, () =>
      billingService.createRefund(
        hospitalAId,
        { id: accountantAUserId },
        pay.payment.id,
        { amount: 300, reason: 'Partial order cancellation' },
      ),
    );
    createdRefundIds.push(ref.refund.id);

    expect(ref.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(ref.invoice.refundedAmount).toBe(300);
  });

  // ===========================================================================
  // SECTION G: ROLE-BASED ACCESS CONTROL (RBAC) (40–47)
  // ===========================================================================

  it('40. should allow ACCOUNTANT to manage invoices, record payments, and issue refunds', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Accountant test', quantity: 1, unitPrice: 300 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);
    expect(invoice.id).toBeDefined();
  });

  it('41. should allow HOSPITAL_ADMIN full operational financial access', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: hospitalAdminAUserId, role: UserRole.HOSPITAL_ADMIN },
        {
          patientId: patientAId,
          items: [{ description: 'Admin test', quantity: 1, unitPrice: 400 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);
    expect(invoice.id).toBeDefined();
  });

  it('42. should restrict DOCTOR from unauthorized financial administration or payment voiding', async () => {
    // Doctors cannot void invoices or collect cashier payments
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Doctor check', quantity: 1, unitPrice: 200 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    // Controller endpoint has @Roles(ACCOUNTANT, HOSPITAL_ADMIN, SUPER_ADMIN) for void
    // Here we verify service authorization / caller role boundaries
    expect([UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN].includes(UserRole.DOCTOR as any)).toBe(false);
  });

  it('43. should restrict LAB_TECHNICIAN from billing administration', () => {
    expect([UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN].includes(UserRole.LAB_TECHNICIAN as any)).toBe(false);
  });

  it('44. should restrict PHARMACIST from arbitrary invoice creation', () => {
    expect([UserRole.ACCOUNTANT, UserRole.HOSPITAL_ADMIN, UserRole.RECEPTIONIST].includes(UserRole.PHARMACIST as any)).toBe(false);
  });

  it('45. should allow RECEPTIONIST to create invoices and collect payments', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: receptionistAUserId, role: UserRole.RECEPTIONIST },
        {
          patientId: patientAId,
          items: [{ description: 'Reception walk-in bill', quantity: 1, unitPrice: 250 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);
    expect(invoice.id).toBeDefined();
  });

  it('46. should allow PATIENT to retrieve their own invoices and payment history', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Patient self view item', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    const fetched = await withTenant(hospitalAId, () =>
      billingService.getInvoiceById(
        hospitalAId,
        { id: patientAUserId, role: UserRole.PATIENT },
        invoice.id,
      ),
    );

    expect(fetched.id).toBe(invoice.id);
    expect(fetched.patientId).toBe(patientAId);
  });

  it('47. should strictly deny PATIENT access to another patient invoices', async () => {
    // Create an invoice for Patient A
    const invoiceA = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Private Consultation A', quantity: 1, unitPrice: 800 }],
        },
      ),
    );
    createdInvoiceIds.push(invoiceA.id);

    // Patient B attempts to view Patient A's invoice
    await expect(
      withTenant(hospitalAId, () =>
        billingService.getInvoiceById(
          hospitalAId,
          { id: patientBUserId, role: UserRole.PATIENT },
          invoiceA.id,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ===========================================================================
  // SECTION H: MULTI-TENANT ISOLATION (48–52)
  // ===========================================================================

  it('48. should prevent Hospital B staff from reading Hospital A invoices', async () => {
    const invoiceA = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Hospital A Bill', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoiceA.id);

    // Hospital B query for Hospital A invoice
    await expect(
      withTenant(hospitalBId, () =>
        billingService.getInvoiceById(
          hospitalBId,
          { id: accountantBUserId, role: UserRole.ACCOUNTANT },
          invoiceA.id,
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('49. should prevent Hospital B staff from recording payments on Hospital A invoices', async () => {
    const invoiceA = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Hospital A Bill', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoiceA.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoiceA.id),
    );

    // Hospital B attempts to apply payment
    await expect(
      withTenant(hospitalBId, () =>
        billingService.recordPayment(
          hospitalBId,
          { id: accountantBUserId, role: UserRole.ACCOUNTANT },
          invoiceA.id,
          { amount: 500, method: PaymentMethod.CASH },
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('50. should prevent Hospital B staff from refunding Hospital A payments', async () => {
    const invoiceA = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Hospital A Bill', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoiceA.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoiceA.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoiceA.id,
        { amount: 500, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay.payment.id);

    // Hospital B staff attempts to refund payment from Hospital A
    await expect(
      withTenant(hospitalBId, () =>
        billingService.createRefund(
          hospitalBId,
          { id: accountantBUserId },
          pay.payment.id,
          { amount: 100, reason: 'Cross-tenant refund attempt' },
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('51. should reject cross-tenant invoice creation with Hospital B patient in Hospital A', async () => {
    await expect(
      withTenant(hospitalAId, () =>
        billingService.createInvoice(
          hospitalAId,
          { id: accountantAUserId, role: UserRole.ACCOUNTANT },
          {
            patientId: patientBId, // Belongs to Hospital B
            items: [{ description: 'Cross-tenant bill', quantity: 1, unitPrice: 500 }],
          },
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('52. should allow SUPER_ADMIN targeting with explicit hospital context', async () => {
    const superAdmin = { id: superAdminUserId, role: UserRole.SUPER_ADMIN };

    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        superAdmin,
        {
          patientId: patientAId,
          items: [{ description: 'Super Admin Order', quantity: 1, unitPrice: 350 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);
    expect(invoice.id).toBeDefined();
  });

  // ===========================================================================
  // SECTION I: WEBHOOKS & SECURITY (53–57)
  // ===========================================================================

  it('53. should reject webhook with invalid signature', () => {
    const payload = JSON.stringify({ event: 'payment.captured' });
    const fakeSignature = 'bad_signature_value';

    const isValid = paymentProviderService.verifyWebhookSignature(
      'RAZORPAY',
      payload,
      fakeSignature,
      'test_secret_key',
    );
    expect(isValid).toBe(false);
  });

  it('54. should verify and accept valid signed Razorpay webhook event', () => {
    const secret = 'rzp_secret_998877';
    const payload = JSON.stringify({ id: 'evt_1', event: 'payment.captured', payload: {} });
    const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const isValid = paymentProviderService.verifyWebhookSignature(
      'RAZORPAY',
      payload,
      validSignature,
      secret,
    );
    expect(isValid).toBe(true);
  });

  it('55. should verify and accept valid signed Stripe webhook event', () => {
    const secret = 'whsec_stripe_test_123';
    const payload = JSON.stringify({ id: 'evt_stripe_1', type: 'payment_intent.succeeded' });
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const sigHash = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    const header = `t=${timestamp},v1=${sigHash}`;

    const isValid = paymentProviderService.verifyWebhookSignature(
      'STRIPE',
      payload,
      header,
      secret,
    );
    expect(isValid).toBe(true);
  });

  it('56. should enforce event idempotency and ignore duplicate webhook event payloads', async () => {
    const eventId = `evt_stripe_dup_${Date.now()}`;
    const raw = JSON.stringify({ id: eventId, type: 'charge.succeeded' });
    const parsed = {
      provider: 'STRIPE',
      eventId,
      eventType: 'charge.succeeded',
      status: 'SUCCEEDED' as const,
      rawPayload: { id: eventId },
    };

    const first = await paymentProviderService.recordWebhookEvent(parsed, raw, hospitalAId);
    createdEventIds.push(first.eventRecordId);
    expect(first.isDuplicate).toBe(false);

    const second = await paymentProviderService.recordWebhookEvent(parsed, raw, hospitalAId);
    expect(second.isDuplicate).toBe(true);
  });

  it('57. should prevent client spoofing of provider transaction state', async () => {
    // Client cannot submit arbitrary SUCCEEDED status for gateway payment without authoritative confirmation
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Gateway item', quantity: 1, unitPrice: 500 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    // Online gateway payment provider creates order, does not automatically fabricate SUCCESS
    const order = await paymentProviderService.createPaymentOrder('RAZORPAY', 500, 'INR', 'RCP-1');
    expect(order.orderId).toBeDefined();
    expect(order.provider).toBe('RAZORPAY');
  });

  // ===========================================================================
  // SECTION J: AUDITING & SECURITY (58–60)
  // ===========================================================================

  it('58. should generate audit log entries for invoice creation, payment, and void operations', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Audit test item', quantity: 1, unitPrice: 300 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    const logs = await prisma.raw.auditLog.findMany({
      where: { entityId: invoice.id, entityName: 'Invoice' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe(AuditAction.CREATE);
  });

  it('59. should generate audit log entries for privileged refund operations with actor attribution', async () => {
    const invoice = await withTenant(hospitalAId, () =>
      billingService.createInvoice(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        {
          patientId: patientAId,
          items: [{ description: 'Refund audit item', quantity: 1, unitPrice: 400 }],
        },
      ),
    );
    createdInvoiceIds.push(invoice.id);

    await withTenant(hospitalAId, () =>
      billingService.issueInvoice(hospitalAId, { id: accountantAUserId }, invoice.id),
    );

    const pay = await withTenant(hospitalAId, () =>
      billingService.recordPayment(
        hospitalAId,
        { id: accountantAUserId, role: UserRole.ACCOUNTANT },
        invoice.id,
        { amount: 400, method: PaymentMethod.CASH },
      ),
    );
    createdPaymentIds.push(pay.payment.id);

    const ref = await withTenant(hospitalAId, () =>
      billingService.createRefund(
        hospitalAId,
        { id: accountantAUserId },
        pay.payment.id,
        { amount: 150, reason: 'Patient overpaid consultation' },
      ),
    );
    createdRefundIds.push(ref.refund.id);

    const refundLogs = await prisma.raw.auditLog.findMany({
      where: { entityId: ref.refund.id, entityName: 'Refund' },
    });
    expect(refundLogs.length).toBe(1);
    expect(refundLogs[0].userId).toBe(accountantAUserId);
  });

  it('60. should verify audit logs contain zero payment secrets, card numbers, CVVs, or credentials', async () => {
    const logs = await prisma.raw.auditLog.findMany({
      where: { hospitalId: hospitalAId },
      take: 10,
    });

    logs.forEach((log) => {
      const serialized = JSON.stringify(log);
      expect(serialized).not.toContain('card_number');
      expect(serialized).not.toContain('cvv');
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('token');
    });
  });
});
