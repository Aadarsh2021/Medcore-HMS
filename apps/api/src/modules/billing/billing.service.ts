import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InvoiceNumberService } from './invoice-number.service';
import { IdempotencyService } from './idempotency.service';
import { PaymentProviderService } from './payment-provider.service';
import { FinancialCalculator } from './financial-calculator';
import {
  CreateInvoiceDto,
  UpdateInvoiceDraftDto,
  VoidInvoiceDto,
  RecordPaymentDto,
  CreateRefundDto,
  QueryInvoicesDto,
} from './dto';
import { AuditAction } from '@prisma/client';
import {
  InvoiceStatus,
  PaymentStatus,
  PaymentMethod,
  RefundStatus,
  InvoiceResponse,
  BillingSummaryResponse,
  UserRole,
} from '@medcore/types';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceNumberService: InvoiceNumberService,
    private readonly idempotencyService: IdempotencyService,
    private readonly paymentProviderService: PaymentProviderService,
  ) {}

  private async getAuditUserId(actorId?: string): Promise<string | null> {
    if (!actorId) return null;
    try {
      const user = await this.prisma.raw.user.findUnique({
        where: { id: actorId },
        select: { id: true },
      });
      return user ? user.id : null;
    } catch {
      return null;
    }
  }

  /**
   * Creates a new invoice in DRAFT status with server-authoritative financial totals.
   */
  async createInvoice(
    hospitalId: string,
    actor: { id: string; role: string },
    dto: CreateInvoiceDto,
  ): Promise<InvoiceResponse> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('An invoice must contain at least one line item');
    }

    // 1. Verify Patient in tenant
    const patient = await this.prisma.raw.patient.findFirst({
      where: { id: dto.patientId, hospitalId },
      include: { user: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this hospital facility');
    }

    // 2. Verify optional relations belong to same tenant & patient
    if (dto.appointmentId) {
      const appt = await this.prisma.raw.appointment.findFirst({
        where: { id: dto.appointmentId, hospitalId },
      });
      if (!appt || appt.patientId !== patient.id) {
        throw new BadRequestException('Appointment does not match active hospital and patient');
      }
    }

    if (dto.encounterId) {
      const enc = await this.prisma.raw.patientEncounter.findFirst({
        where: { id: dto.encounterId, hospitalId },
      });
      if (!enc || enc.patientId !== patient.id) {
        throw new BadRequestException('Encounter does not match active hospital and patient');
      }
    }

    // 3. Verify cross-service line item links belong to same tenant
    for (const item of dto.items) {
      if (item.labOrderId) {
        const lab = await this.prisma.raw.labOrder.findFirst({
          where: { id: item.labOrderId, hospitalId },
        });
        if (!lab || lab.patientId !== patient.id) {
          throw new BadRequestException('Referenced Lab Order does not belong to patient and facility');
        }
      }
      if (item.prescriptionId) {
        const rx = await this.prisma.raw.prescription.findFirst({
          where: { id: item.prescriptionId, hospitalId },
        });
        if (!rx || rx.patientId !== patient.id) {
          throw new BadRequestException('Referenced Prescription does not belong to patient and facility');
        }
      }
    }

    // 4. Authoritative Server Financial Calculation
    const calculated = FinancialCalculator.computeInvoice(dto.items, 0);

    // 5. Concurrency-Safe Hospital Invoice Number
    const invoiceNumber = await this.invoiceNumberService.generateInvoiceNumber(hospitalId);

    // 6. Persistence
    const created = await this.prisma.raw.invoice.create({
      data: {
        hospitalId,
        patientId: patient.id,
        appointmentId: dto.appointmentId || null,
        encounterId: dto.encounterId || null,
        invoiceNumber,
        currency: 'INR',
        subtotal: calculated.subtotal,
        discountAmount: calculated.discountAmount,
        taxAmount: calculated.taxAmount,
        totalAmount: calculated.totalAmount,
        paidAmount: 0.0,
        refundedAmount: 0.0,
        status: InvoiceStatus.DRAFT,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes || null,
        createdById: actor.id,
        items: {
          create: calculated.items.map((it) => ({
            type: it.type,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            tax: it.tax,
            totalPrice: it.totalPrice,
            appointmentId: it.appointmentId || null,
            encounterId: it.encounterId || null,
            prescriptionId: it.prescriptionId || null,
            dispenseId: it.dispenseId || null,
            labOrderId: it.labOrderId || null,
            labTestId: it.labTestId || null,
          })),
        },
      },
      include: {
        patient: { include: { user: true } },
        items: true,
        payments: true,
        refunds: true,
      },
    });

    // 7. Audit Log
    const auditUserId = await this.getAuditUserId(actor?.id);
    await this.prisma.raw.auditLog.create({
      data: {
        hospitalId,
        userId: auditUserId,
        action: AuditAction.CREATE,
        entityName: 'Invoice',
        entityId: created.id,
        changesJson: {
          invoiceNumber,
          patientId: patient.id,
          totalAmount: calculated.totalAmount,
          itemCount: dto.items.length,
        },
      },
    });

    return this.mapInvoiceToResponse(created);
  }

  /**
   * Updates an unissued invoice draft. Once ISSUED, invoices are immutable.
   */
  async updateDraft(
    hospitalId: string,
    actor: { id: string },
    invoiceId: string,
    dto: UpdateInvoiceDraftDto,
  ): Promise<InvoiceResponse> {
    const existing = await this.prisma.raw.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Invoice not found');
    }

    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Invoice in ${existing.status} status is immutable and cannot be directly updated`,
      );
    }

    let calculated = {
      subtotal: FinancialCalculator.toNumber(existing.subtotal),
      discountAmount: FinancialCalculator.toNumber(existing.discountAmount),
      taxAmount: FinancialCalculator.toNumber(existing.taxAmount),
      totalAmount: FinancialCalculator.toNumber(existing.totalAmount),
      items: [] as any[],
    };

    if (dto.items) {
      calculated = FinancialCalculator.computeInvoice(dto.items, 0);
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        if (dto.items) {
          await tx.invoiceItem.deleteMany({ where: { invoiceId } });
          await tx.invoiceItem.createMany({
            data: calculated.items.map((it) => ({
              invoiceId,
              type: it.type,
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              discount: it.discount,
              tax: it.tax,
              totalPrice: it.totalPrice,
              appointmentId: it.appointmentId || null,
              encounterId: it.encounterId || null,
              prescriptionId: it.prescriptionId || null,
              dispenseId: it.dispenseId || null,
              labOrderId: it.labOrderId || null,
              labTestId: it.labTestId || null,
            })),
          });
        }

        return tx.invoice.update({
          where: { id: invoiceId },
          data: {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : existing.dueDate,
            notes: dto.notes !== undefined ? dto.notes : existing.notes,
            ...(dto.items && {
              subtotal: calculated.subtotal,
              discountAmount: calculated.discountAmount,
              taxAmount: calculated.taxAmount,
              totalAmount: calculated.totalAmount,
            }),
          },
          include: {
            patient: { include: { user: true } },
            items: true,
            payments: true,
            refunds: true,
          },
        });
      },
      { maxWait: 15000, timeout: 20000 },
    );

    return this.mapInvoiceToResponse(updated);
  }

  /**
   * Finalizes and issues an invoice, locking line items permanently.
   */
  async issueInvoice(
    hospitalId: string,
    actor: { id: string },
    invoiceId: string,
  ): Promise<InvoiceResponse> {
    const existing = await this.prisma.raw.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundException('Invoice not found');
    }

    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(`Cannot issue an invoice that is in ${existing.status} status`);
    }

    if (existing.items.length === 0) {
      throw new BadRequestException('Cannot issue an invoice without any line items');
    }

    const issued = await this.prisma.raw.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.ISSUED as any,
        issuedAt: new Date(),
        issueDate: new Date(),
        issuedById: actor.id,
      },
      include: {
        patient: { include: { user: true } },
        items: true,
        payments: true,
        refunds: true,
      },
    });

    const auditUserId = await this.getAuditUserId(actor?.id);
    await this.prisma.raw.auditLog.create({
      data: {
        hospitalId,
        userId: auditUserId,
        action: AuditAction.UPDATE,
        entityName: 'Invoice',
        entityId: invoiceId,
        changesJson: {
          status: 'ISSUED',
          totalAmount: issued.totalAmount,
          invoiceNumber: issued.invoiceNumber,
        },
      },
    });

    return this.mapInvoiceToResponse(issued);
  }

  /**
   * Voids an invoice. Only unpaid or fully refunded invoices can be voided.
   */
  async voidInvoice(
    hospitalId: string,
    actor: { id: string },
    invoiceId: string,
    dto: VoidInvoiceDto,
  ): Promise<InvoiceResponse> {
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('A mandatory reason is required to void an invoice');
    }

    const invoice = await this.prisma.raw.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Invoice is already voided');
    }

    const paid = FinancialCalculator.toNumber(invoice.paidAmount);
    const refunded = FinancialCalculator.toNumber(invoice.refundedAmount);
    const netPaid = FinancialCalculator.round2(paid - refunded);

    if (netPaid > 0) {
      throw new BadRequestException(
        'Cannot void an invoice with active unrefunded payments. Process full refunds first.',
      );
    }

    const voided = await this.prisma.raw.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.VOID as any,
        voidedAt: new Date(),
        voidedById: actor.id,
        voidReason: dto.reason.trim(),
      },
      include: {
        patient: { include: { user: true } },
        items: true,
        payments: true,
        refunds: true,
      },
    });

    const auditUserId = await this.getAuditUserId(actor?.id);
    await this.prisma.raw.auditLog.create({
      data: {
        hospitalId,
        userId: auditUserId,
        action: AuditAction.UPDATE,
        entityName: 'Invoice',
        entityId: invoiceId,
        changesJson: {
          status: 'VOID',
          reason: dto.reason.trim(),
        },
      },
    });

    return this.mapInvoiceToResponse(voided);
  }

  /**
   * Queries invoices with filtering, pagination, and multi-tenant scoping.
   */
  async getInvoices(hospitalId: string, query: QueryInvoicesDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { hospitalId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.patientId) {
      where.patientId = query.patientId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { patient: { uhid: { contains: q, mode: 'insensitive' } } },
        { patient: { user: { firstName: { contains: q, mode: 'insensitive' } } } },
        { patient: { user: { lastName: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [total, records] = await Promise.all([
      this.prisma.raw.invoice.count({ where }),
      this.prisma.raw.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { include: { user: true } },
          items: true,
          payments: true,
          refunds: true,
        },
      }),
    ]);

    return {
      items: records.map((r) => this.mapInvoiceToResponse(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single invoice by ID with strict tenant and patient authorization.
   */
  async getInvoiceById(
    hospitalId: string,
    actor: { id: string; role: string },
    invoiceId: string,
  ): Promise<InvoiceResponse> {
    const invoice = await this.prisma.raw.invoice.findFirst({
      where: { id: invoiceId, hospitalId },
      include: {
        patient: { include: { user: true } },
        items: true,
        payments: true,
        refunds: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Patient Privacy Enforcement
    if (actor.role === UserRole.PATIENT) {
      if (invoice.patient?.userId !== actor.id && invoice.patientId !== actor.id) {
        throw new ForbiddenException('Access denied: You can only view your own invoices');
      }
    }

    return this.mapInvoiceToResponse(invoice);
  }

  /**
   * Transactional, Concurrency-Safe Payment Collection with Row Locking.
   * Prevents double payment, overpayment, and race condition duplicate applications.
   */
  async recordPayment(
    hospitalId: string,
    actor: { id: string; role: string },
    invoiceId: string,
    dto: RecordPaymentDto,
  ) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyService.checkIdempotency(
        hospitalId,
        dto.idempotencyKey,
        `/api/billing/invoices/${invoiceId}/payments`,
        dto,
      );
      if (cached) {
        return cached.body;
      }
    }

    // 2. Transactional Row-Locked Payment Application
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Explicit Row Lock on Invoice
        const lockedInvoices = await tx.$queryRawUnsafe<Array<{
          id: string;
          hospitalId: string;
          status: InvoiceStatus;
          totalAmount: any;
          paidAmount: any;
        }>>(
          `SELECT "id", "hospitalId", "status", "totalAmount", "paidAmount"
           FROM "Invoice"
           WHERE "id" = $1 AND "hospitalId" = $2
           FOR UPDATE;`,
          invoiceId,
          hospitalId,
        );

        if (!lockedInvoices || lockedInvoices.length === 0) {
          throw new NotFoundException('Invoice not found');
        }

        const inv = lockedInvoices[0];

        if (inv.status === InvoiceStatus.DRAFT) {
          throw new BadRequestException('Cannot apply payment to a DRAFT invoice. Issue invoice first.');
        }

        if (inv.status === InvoiceStatus.VOID) {
          throw new BadRequestException('Cannot apply payment to a VOID invoice');
        }

        const total = FinancialCalculator.toNumber(inv.totalAmount);
        const currentPaid = FinancialCalculator.toNumber(inv.paidAmount);
        const outstanding = FinancialCalculator.round2(total - currentPaid);

        if (outstanding <= 0 || inv.status === InvoiceStatus.PAID) {
          throw new BadRequestException('Invoice is already fully paid');
        }

        const paymentAmount = FinancialCalculator.round2(dto.amount);
        if (paymentAmount > outstanding) {
          throw new BadRequestException(
            `Payment amount (${paymentAmount}) exceeds remaining outstanding balance (${outstanding})`,
          );
        }

        // Generate sequential payment identifier
        const paymentNumber = await this.invoiceNumberService.generatePaymentNumber(hospitalId);

        const newPaid = FinancialCalculator.round2(currentPaid + paymentAmount);
        const newOutstanding = FinancialCalculator.round2(total - newPaid);
        const newStatus = newOutstanding <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

        // Record Payment
        const payment = await tx.payment.create({
          data: {
            hospitalId,
            invoiceId,
            paymentNumber,
            amount: paymentAmount,
            currency: 'INR',
            method: dto.method as any,
            status: PaymentStatus.SUCCESS as any,
            provider: dto.provider || 'MANUAL',
            transactionReference: dto.transactionReference || null,
            paidAt: new Date(),
            createdById: actor.id,
          },
        });

        // Update Invoice Aggregates
        const updatedInvoice = await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: newPaid,
            status: newStatus as any,
          },
          include: {
            patient: { include: { user: true } },
            items: true,
            payments: true,
            refunds: true,
          },
        });

        // Audit Log
        const auditUserId = await this.getAuditUserId(actor?.id);
        await tx.auditLog.create({
          data: {
            hospitalId,
            userId: auditUserId,
            action: AuditAction.CREATE,
            entityName: 'Payment',
            entityId: payment.id,
            changesJson: {
              invoiceId,
              paymentNumber,
              amount: paymentAmount,
              method: dto.method,
              previousPaid: currentPaid,
              newPaid,
              invoiceStatus: newStatus,
            },
          },
        });

        return {
          payment: {
            id: payment.id,
            hospitalId: payment.hospitalId,
            invoiceId: payment.invoiceId,
            paymentNumber: payment.paymentNumber,
            amount: FinancialCalculator.toNumber(payment.amount),
            currency: payment.currency,
            method: payment.method,
            status: payment.status,
            provider: payment.provider,
            transactionReference: payment.transactionReference,
            paidAt: payment.paidAt?.toISOString() || null,
            createdAt: payment.createdAt.toISOString(),
          },
          invoice: this.mapInvoiceToResponse(updatedInvoice),
        };
      },
      { maxWait: 15000, timeout: 20000 },
    );

    // 3. Save Idempotency Record
    if (dto.idempotencyKey) {
      await this.idempotencyService.recordResult(
        hospitalId,
        dto.idempotencyKey,
        `/api/billing/invoices/${invoiceId}/payments`,
        dto,
        201,
        result,
      );
    }

    return result;
  }

  /**
   * Transactional, Concurrency-Safe Refund Processing.
   * Ensures refund cannot exceed refundable payment amount and maintains financial integrity.
   */
  async createRefund(
    hospitalId: string,
    actor: { id: string },
    paymentId: string,
    dto: CreateRefundDto,
  ) {
    if (dto.amount <= 0) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }
    if (!dto.reason || dto.reason.trim() === '') {
      throw new BadRequestException('A mandatory reason is required to process a refund');
    }

    // Idempotency Check
    if (dto.idempotencyKey) {
      const cached = await this.idempotencyService.checkIdempotency(
        hospitalId,
        dto.idempotencyKey,
        `/api/billing/payments/${paymentId}/refund`,
        dto,
      );
      if (cached) return cached.body;
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Lock Payment
        const payment = await tx.payment.findFirst({
          where: { id: paymentId, hospitalId },
          include: { refunds: true },
        });

        if (!payment) {
          throw new NotFoundException('Payment record not found');
        }

        if (payment.status !== PaymentStatus.SUCCESS) {
          throw new BadRequestException(
            `Cannot refund a payment with status ${payment.status}`,
          );
        }

        const paymentAmount = FinancialCalculator.toNumber(payment.amount);
        const alreadyRefunded = payment.refunds
          .filter((r) => r.status === RefundStatus.SUCCESS)
          .reduce((sum, r) => sum + FinancialCalculator.toNumber(r.amount), 0);

        const refundableOnPayment = FinancialCalculator.round2(paymentAmount - alreadyRefunded);
        const requestedRefund = FinancialCalculator.round2(dto.amount);

        if (requestedRefund > refundableOnPayment) {
          throw new BadRequestException(
            `Refund amount (${requestedRefund}) exceeds remaining refundable balance on payment (${refundableOnPayment})`,
          );
        }

        // Lock Target Invoice
        const invoice = await tx.invoice.findFirst({
          where: { id: payment.invoiceId, hospitalId },
        });

        if (!invoice) {
          throw new NotFoundException('Target invoice for payment not found');
        }

        const totalPaidOnInvoice = FinancialCalculator.toNumber(invoice.paidAmount);
        const currentInvoiceRefunded = FinancialCalculator.toNumber(invoice.refundedAmount);

        if (FinancialCalculator.round2(currentInvoiceRefunded + requestedRefund) > totalPaidOnInvoice) {
          throw new BadRequestException('Total refunds cannot exceed the total amount paid on the invoice');
        }

        // Create Refund Row
        const refund = await tx.refund.create({
          data: {
            hospitalId,
            paymentId,
            invoiceId: payment.invoiceId,
            amount: requestedRefund,
            reason: dto.reason.trim(),
            status: RefundStatus.SUCCESS as any,
            createdById: actor.id,
            processedAt: new Date(),
          },
        });

        // Update Payment status if fully refunded
        const newTotalRefundedOnPayment = FinancialCalculator.round2(alreadyRefunded + requestedRefund);
        if (newTotalRefundedOnPayment >= paymentAmount) {
          await tx.payment.update({
            where: { id: paymentId },
            data: { status: PaymentStatus.REFUNDED as any },
          });
        }

        // Update Invoice aggregate refundedAmount & status
        const newInvoiceRefunded = FinancialCalculator.round2(currentInvoiceRefunded + requestedRefund);
        const invoiceTotal = FinancialCalculator.toNumber(invoice.totalAmount);
        const netPaidAfterRefund = FinancialCalculator.round2(totalPaidOnInvoice - newInvoiceRefunded);

        let newInvoiceStatus = invoice.status;
        if (invoice.status === InvoiceStatus.PAID && netPaidAfterRefund < invoiceTotal) {
          newInvoiceStatus = InvoiceStatus.PARTIALLY_PAID;
        }

        const updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            refundedAmount: newInvoiceRefunded,
            status: newInvoiceStatus as any,
          },
          include: {
            patient: { include: { user: true } },
            items: true,
            payments: true,
            refunds: true,
          },
        });

        // Audit Log
        const auditUserId = await this.getAuditUserId(actor?.id);
        await tx.auditLog.create({
          data: {
            hospitalId,
            userId: auditUserId,
            action: AuditAction.CREATE,
            entityName: 'Refund',
            entityId: refund.id,
            changesJson: {
              paymentId,
              invoiceId: invoice.id,
              amount: requestedRefund,
              reason: dto.reason.trim(),
              newInvoiceRefunded,
            },
          },
        });

        return {
          refund: {
            id: refund.id,
            hospitalId: refund.hospitalId,
            paymentId: refund.paymentId,
            invoiceId: refund.invoiceId,
            amount: FinancialCalculator.toNumber(refund.amount),
            reason: refund.reason,
            status: refund.status,
            processedAt: refund.processedAt?.toISOString() || null,
            createdAt: refund.createdAt.toISOString(),
          },
          invoice: this.mapInvoiceToResponse(updatedInvoice),
        };
      },
      { maxWait: 15000, timeout: 20000 },
    );

    if (dto.idempotencyKey) {
      await this.idempotencyService.recordResult(
        hospitalId,
        dto.idempotencyKey,
        `/api/billing/payments/${paymentId}/refund`,
        dto,
        201,
        result,
      );
    }

    return result;
  }

  /**
   * Retrieves summary analytics for financial reporting.
   */
  async getBillingSummary(hospitalId: string): Promise<BillingSummaryResponse> {
    const invoices = await this.prisma.raw.invoice.findMany({
      where: { hospitalId, status: { not: InvoiceStatus.VOID } },
      select: {
        totalAmount: true,
        paidAmount: true,
        refundedAmount: true,
      },
    });

    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalRefunded = 0;

    for (const inv of invoices) {
      totalInvoiced += FinancialCalculator.toNumber(inv.totalAmount);
      totalPaid += FinancialCalculator.toNumber(inv.paidAmount);
      totalRefunded += FinancialCalculator.toNumber(inv.refundedAmount);
    }

    totalInvoiced = FinancialCalculator.round2(totalInvoiced);
    totalPaid = FinancialCalculator.round2(totalPaid);
    totalRefunded = FinancialCalculator.round2(totalRefunded);
    const totalOutstanding = Math.max(0, FinancialCalculator.round2(totalInvoiced - totalPaid));

    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      totalRefunded,
      invoiceCount: invoices.length,
    };
  }

  /**
   * Maps internal Prisma Invoice entity to public response contract.
   */
  private mapInvoiceToResponse(inv: any): InvoiceResponse {
    const subtotal = FinancialCalculator.toNumber(inv.subtotal);
    const taxAmount = FinancialCalculator.toNumber(inv.taxAmount);
    const discountAmount = FinancialCalculator.toNumber(inv.discountAmount);
    const totalAmount = FinancialCalculator.toNumber(inv.totalAmount);
    const paidAmount = FinancialCalculator.toNumber(inv.paidAmount);
    const refundedAmount = FinancialCalculator.toNumber(inv.refundedAmount);
    const outstandingAmount = Math.max(0, FinancialCalculator.round2(totalAmount - paidAmount));

    const patientName = inv.patient?.user
      ? `${inv.patient.user.firstName} ${inv.patient.user.lastName}`.trim()
      : 'Unknown Patient';

    return {
      id: inv.id,
      hospitalId: inv.hospitalId,
      patientId: inv.patientId,
      patientUhid: inv.patient?.uhid || 'N/A',
      patientName,
      patientPhone: inv.patient?.user?.phone || null,
      appointmentId: inv.appointmentId || null,
      encounterId: inv.encounterId || null,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency || 'INR',
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      paidAmount,
      refundedAmount,
      outstandingAmount,
      status: inv.status,
      issueDate: inv.issueDate?.toISOString() || null,
      dueDate: inv.dueDate?.toISOString() || null,
      notes: inv.notes || null,
      issuedAt: inv.issuedAt?.toISOString() || null,
      voidedAt: inv.voidedAt?.toISOString() || null,
      voidReason: inv.voidReason || null,
      items: (inv.items || []).map((it: any) => ({
        id: it.id,
        type: it.type,
        description: it.description,
        quantity: it.quantity,
        unitPrice: FinancialCalculator.toNumber(it.unitPrice),
        discount: FinancialCalculator.toNumber(it.discount),
        tax: FinancialCalculator.toNumber(it.tax),
        totalPrice: FinancialCalculator.toNumber(it.totalPrice),
        appointmentId: it.appointmentId || null,
        encounterId: it.encounterId || null,
        prescriptionId: it.prescriptionId || null,
        dispenseId: it.dispenseId || null,
        labOrderId: it.labOrderId || null,
        labTestId: it.labTestId || null,
      })),
      payments: (inv.payments || []).map((p: any) => ({
        id: p.id,
        hospitalId: p.hospitalId,
        invoiceId: p.invoiceId,
        paymentNumber: p.paymentNumber,
        amount: FinancialCalculator.toNumber(p.amount),
        currency: p.currency,
        method: p.method,
        status: p.status,
        provider: p.provider,
        providerPaymentId: p.providerPaymentId,
        providerOrderId: p.providerOrderId,
        transactionReference: p.transactionReference,
        failureReason: p.failureReason,
        paidAt: p.paidAt?.toISOString() || null,
        createdById: p.createdById,
        createdAt: p.createdAt.toISOString(),
      })),
      refunds: (inv.refunds || []).map((r: any) => ({
        id: r.id,
        hospitalId: r.hospitalId,
        paymentId: r.paymentId,
        invoiceId: r.invoiceId,
        amount: FinancialCalculator.toNumber(r.amount),
        reason: r.reason,
        status: r.status,
        providerRefundId: r.providerRefundId,
        createdById: r.createdById,
        processedAt: r.processedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      createdAt: inv.createdAt.toISOString(),
      updatedAt: inv.updatedAt.toISOString(),
    };
  }
}
