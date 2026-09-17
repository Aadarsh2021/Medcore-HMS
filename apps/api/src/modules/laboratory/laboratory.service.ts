import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrderNumberService } from './order-number.service';
import { RangeEvaluator } from './range-evaluator';
import {
  AmendLabResultDto,
  ApproveLabOrderDto,
  CollectSpecimenDto,
  CreateLabOrderDto,
  EnterLabResultsDto,
  LabCatalogQueryDto,
  LabOrdersQueryDto,
  RejectSpecimenDto,
  CancelLabOrderDto,
} from './dto';
import {
  AuditAction,
  LabOrderStatus,
  LabPriority,
  LabResultFlag,
  LabSpecimenStatus,
  UserRole,
} from '@medcore/types';

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderNumberService: OrderNumberService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Catalog & Categories
  // ---------------------------------------------------------------------------
  async getCategories(hospitalId: string) {
    return this.prisma.labCategory.findMany({
      where: { hospitalId },
      orderBy: { name: 'asc' },
    });
  }

  async getCatalog(hospitalId: string, query: LabCatalogQueryDto) {
    const where: any = { hospitalId };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 100;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.labTest.findMany({
        where,
        include: { category: true },
        skip,
        take: limit,
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      }),
      this.prisma.labTest.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Create Laboratory Order
  // ---------------------------------------------------------------------------
  async createOrder(hospitalId: string, user: any, dto: CreateLabOrderDto) {
    // A. Validate Patient belongs to active hospital
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, hospitalId },
      include: { user: true },
    });
    if (!patient) {
      throw new BadRequestException('Patient not found or belongs to another hospital facility');
    }

    // B. Validate Ordering Doctor belongs to active hospital
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: dto.doctorId, hospitalId },
      include: { user: true, department: true },
    });
    if (!doctor) {
      throw new BadRequestException('Doctor not found or belongs to another hospital facility');
    }

    // C. Validate Encounter (if provided) belongs to hospital and matches patient
    if (dto.encounterId) {
      const encounter = await this.prisma.patientEncounter.findFirst({
        where: { id: dto.encounterId, hospitalId, patientId: dto.patientId },
      });
      if (!encounter) {
        throw new BadRequestException('Encounter not found or does not match patient and facility');
      }
    }

    // D. Validate Tests belong to hospital
    const testIds = dto.items.map((i) => i.testId);
    const labTests = await this.prisma.labTest.findMany({
      where: { id: { in: testIds }, hospitalId },
      include: { category: true },
    });
    if (labTests.length !== testIds.length) {
      throw new BadRequestException('One or more selected lab tests are invalid or belong to another facility');
    }

    // E. Atomic creation with concurrency-safe orderNumber in transaction
    return this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.orderNumberService.generateOrderNumber(hospitalId, tx);

      const order = await tx.labOrder.create({
        data: {
          hospitalId,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          encounterId: dto.encounterId || null,
          orderNumber,
          priority: dto.priority || LabPriority.ROUTINE,
          specimenType: dto.specimenType || labTests[0]?.sampleType || 'Specimen',
          clinicalNotes: dto.clinicalNotes || null,
          status: LabOrderStatus.ORDERED,
          items: {
            create: dto.items.map((item) => {
              const catalogTest = labTests.find((t) => t.id === item.testId)!;
              const rangeText =
                catalogTest.referenceRangeMin != null && catalogTest.referenceRangeMax != null
                  ? `${catalogTest.referenceRangeMin} - ${catalogTest.referenceRangeMax}`
                  : catalogTest.referenceRangeMin != null
                  ? `> ${catalogTest.referenceRangeMin}`
                  : catalogTest.referenceRangeMax != null
                  ? `< ${catalogTest.referenceRangeMax}`
                  : null;

              return {
                testId: item.testId,
                technicianNotes: item.technicianNotes || null,
                resultUnit: catalogTest.unit || null,
                referenceRangeText: rangeText,
              };
            }),
          },
        },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: 'LabOrder',
          entityId: order.id,
          changesJson: {
            orderNumber: order.orderNumber,
            patientId: dto.patientId,
            doctorId: dto.doctorId,
            itemCount: dto.items.length,
            priority: order.priority,
          },
        },
      });

      return this.mapOrderToResponse(order);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 3. List Orders (Queue & Search with RBAC)
  // ---------------------------------------------------------------------------
  async getOrders(hospitalId: string, user: any, query: LabOrdersQueryDto) {
    // RBAC Restrictions
    if (
      user.role === UserRole.RECEPTIONIST ||
      user.role === UserRole.PHARMACIST ||
      user.role === UserRole.ACCOUNTANT
    ) {
      throw new ForbiddenException('Access denied: Role is not authorized to view clinical laboratory records');
    }

    const where: any = { hospitalId };

    // Patient Role: strictly view own APPROVED diagnostic reports only
    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id, hospitalId },
      });
      if (!patient) return [];
      where.patientId = patient.id;
      where.status = LabOrderStatus.APPROVED;
    } else if (user.role === UserRole.DOCTOR) {
      // Doctor: can view department or hospital orders, filter by doctor if requested
      if (query.doctorId) {
        where.doctorId = query.doctorId;
      }
    }

    if (query.status && user.role !== UserRole.PATIENT) {
      where.status = query.status;
    }
    if (query.patientId && user.role !== UserRole.PATIENT) {
      where.patientId = query.patientId;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { patient: { uhid: { contains: query.search, mode: 'insensitive' } } },
        {
          patient: {
            user: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const orders = await this.prisma.labOrder.findMany({
      where,
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
        items: { include: { test: { include: { category: true } } } },
        specimens: true,
        amendments: true,
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((o) => this.mapOrderToResponse(o));
  }

  // ---------------------------------------------------------------------------
  // 4. Get Order Detail
  // ---------------------------------------------------------------------------
  async getOrderById(hospitalId: string, user: any, id: string) {
    if (
      user.role === UserRole.RECEPTIONIST ||
      user.role === UserRole.PHARMACIST ||
      user.role === UserRole.ACCOUNTANT
    ) {
      throw new ForbiddenException('Access denied: Role is not authorized to view clinical laboratory records');
    }

    const order = await this.prisma.labOrder.findFirst({
      where: {
        hospitalId,
        OR: [{ id }, { orderNumber: id }],
      },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true, department: true } },
        items: { include: { test: { include: { category: true } } } },
        specimens: true,
        amendments: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Laboratory order '${id}' not found in active hospital facility`);
    }

    // Patient Role Enforcement
    if (user.role === UserRole.PATIENT) {
      if (order.patient.userId !== user.id) {
        throw new ForbiddenException('Access denied: Cannot access clinical records of other patients');
      }
      if (order.status !== LabOrderStatus.APPROVED) {
        throw new ForbiddenException('Access denied: Diagnostic report is not yet certified or approved');
      }
    }

    return this.mapOrderToResponse(order);
  }

  // ---------------------------------------------------------------------------
  // 5. Specimen Intake & Collection
  // ---------------------------------------------------------------------------
  async collectSpecimen(hospitalId: string, user: any, orderId: string, dto: CollectSpecimenDto) {
    // Only Lab Technician, Nurse, or Admin
    if (
      user.role !== UserRole.LAB_TECHNICIAN &&
      user.role !== UserRole.NURSE &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Only laboratory staff or nurses can collect specimens');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, hospitalId },
      });
      if (!order) {
        throw new NotFoundException(`Laboratory order '${orderId}' not found`);
      }

      // Exact State Transition Enforcement
      if (order.status !== LabOrderStatus.ORDERED) {
        throw new BadRequestException(
          `Invalid state transition: Cannot collect specimen for order in '${order.status}' status (must be ORDERED)`,
        );
      }

      const accessionNumber = await this.orderNumberService.generateAccessionNumber(hospitalId, tx);
      const collectorName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Lab Technician';
      const collectedTime = dto.collectedAt ? new Date(dto.collectedAt) : new Date();

      // Create Specimen
      const specimen = await tx.labSpecimen.create({
        data: {
          hospitalId,
          orderId: order.id,
          accessionNumber,
          specimenType: dto.specimenType,
          status: LabSpecimenStatus.COLLECTED,
          collectedAt: collectedTime,
          collectedById: user.id,
          collectedByName: collectorName,
          notes: dto.notes || null,
        },
      });

      // Update Order Status
      const updatedOrder = await tx.labOrder.update({
        where: { id: order.id },
        data: {
          status: LabOrderStatus.SAMPLE_COLLECTED,
          specimenType: dto.specimenType,
          collectedById: user.id,
          collectedByName: collectorName,
          collectedAt: collectedTime,
        },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
          specimens: true,
          amendments: true,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: 'LabOrder',
          entityId: order.id,
          changesJson: {
            action: 'SPECIMEN_COLLECTION',
            orderNumber: order.orderNumber,
            accessionNumber: specimen.accessionNumber,
            specimenType: dto.specimenType,
            previousStatus: order.status,
            newStatus: LabOrderStatus.SAMPLE_COLLECTED,
          },
        },
      });

      return this.mapOrderToResponse(updatedOrder);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 6. Specimen Rejection
  // ---------------------------------------------------------------------------
  async rejectSpecimen(hospitalId: string, user: any, orderId: string, dto: RejectSpecimenDto) {
    if (
      user.role !== UserRole.LAB_TECHNICIAN &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Only laboratory technicians or administrators can reject specimens');
    }

    if (!dto.rejectionReason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, hospitalId },
        include: { specimens: true },
      });
      if (!order) {
        throw new NotFoundException(`Laboratory order '${orderId}' not found`);
      }

      if (order.status === LabOrderStatus.APPROVED || order.status === LabOrderStatus.CANCELLED) {
        throw new BadRequestException(`Cannot reject specimen for order in terminal status '${order.status}'`);
      }

      // Mark all specimens REJECTED
      await tx.labSpecimen.updateMany({
        where: { orderId: order.id, hospitalId },
        data: {
          status: LabSpecimenStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
          rejectedById: user.id,
          rejectedAt: new Date(),
        },
      });

      // Advance Order to REJECTED terminal state
      const updatedOrder = await tx.labOrder.update({
        where: { id: order.id },
        data: {
          status: LabOrderStatus.REJECTED,
          cancellationReason: `Specimen Rejected: ${dto.rejectionReason}`,
        },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
          specimens: true,
          amendments: true,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: 'LabOrder',
          entityId: order.id,
          changesJson: {
            action: 'SPECIMEN_REJECTION',
            orderNumber: order.orderNumber,
            reason: dto.rejectionReason,
            newStatus: LabOrderStatus.REJECTED,
          },
        },
      });

      return this.mapOrderToResponse(updatedOrder);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 7. Start Laboratory Processing
  // ---------------------------------------------------------------------------
  async startProcessing(hospitalId: string, user: any, orderId: string) {
    if (
      user.role !== UserRole.LAB_TECHNICIAN &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Only laboratory staff can initiate specimen analysis');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, hospitalId },
      });
      if (!order) {
        throw new NotFoundException(`Laboratory order '${orderId}' not found`);
      }

      if (order.status !== LabOrderStatus.SAMPLE_COLLECTED) {
        throw new BadRequestException(
          `Invalid state transition: Cannot begin processing for order in '${order.status}' status (must be SAMPLE_COLLECTED)`,
        );
      }

      const updatedOrder = await tx.labOrder.update({
        where: { id: order.id },
        data: {
          status: LabOrderStatus.PROCESSING,
          processedAt: new Date(),
        },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
          specimens: true,
          amendments: true,
        },
      });

      await tx.labSpecimen.updateMany({
        where: { orderId: order.id, hospitalId },
        data: {
          status: LabSpecimenStatus.PROCESSING,
          processorId: user.id,
          processedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: 'LabOrder',
          entityId: order.id,
          changesJson: {
            action: 'START_PROCESSING',
            orderNumber: order.orderNumber,
            previousStatus: order.status,
            newStatus: LabOrderStatus.PROCESSING,
          },
        },
      });

      return this.mapOrderToResponse(updatedOrder);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 8. Enter Laboratory Results (Authoritative Server Range Evaluation)
  // ---------------------------------------------------------------------------
  async enterResults(hospitalId: string, user: any, orderId: string, dto: EnterLabResultsDto) {
    if (
      user.role !== UserRole.LAB_TECHNICIAN &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Only laboratory technicians can enter clinical test measurements');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, hospitalId },
        include: { items: { include: { test: true } } },
      });
      if (!order) {
        throw new NotFoundException(`Laboratory order '${orderId}' not found`);
      }

      if (order.status === LabOrderStatus.APPROVED) {
        throw new BadRequestException('Results are finalized and immutable. Corrections require formal clinical amendment.');
      }
      if (order.status !== LabOrderStatus.PROCESSING && order.status !== LabOrderStatus.RESULTS_ENTERED) {
        throw new BadRequestException(
          `Cannot enter results: Order must be in PROCESSING or RESULTS_ENTERED status (current: '${order.status}')`,
        );
      }

      // Evaluate and update each item
      for (const res of dto.results) {
        const item = order.items.find((i) => i.id === res.orderItemId || i.test.code === res.code);
        if (!item) continue;

        // Authoritative Range & Critical Panic Evaluation
        const evaluated = RangeEvaluator.evaluate({
          resultValue: res.resultValue,
          referenceRangeMin: item.test.referenceRangeMin ? Number(item.test.referenceRangeMin) : null,
          referenceRangeMax: item.test.referenceRangeMax ? Number(item.test.referenceRangeMax) : null,
          criticalLow: item.test.criticalLow ? Number(item.test.criticalLow) : null,
          criticalHigh: item.test.criticalHigh ? Number(item.test.criticalHigh) : null,
        });

        await tx.labOrderItem.update({
          where: { id: item.id },
          data: {
            resultValue: res.resultValue,
            resultValueNumeric: evaluated.numericValue != null ? evaluated.numericValue : null,
            resultUnit: res.unit || item.resultUnit || item.test.unit || null,
            referenceRangeText: res.referenceRange || item.referenceRangeText,
            flag: evaluated.flag,
            isCritical: evaluated.isCritical,
            technicianNotes: res.notes || item.technicianNotes || null,
            completedAt: new Date(),
          },
        });
      }

      // Advance Order to RESULTS_ENTERED
      const updatedOrder = await tx.labOrder.update({
        where: { id: order.id },
        data: {
          status: LabOrderStatus.RESULTS_ENTERED,
        },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
          specimens: true,
          amendments: true,
        },
      });

      // Audit Log (Without dumping raw clinical PHI values)
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: 'LabOrder',
          entityId: order.id,
          changesJson: {
            action: 'ENTER_RESULTS',
            orderNumber: order.orderNumber,
            measuredCount: dto.results.length,
            newStatus: LabOrderStatus.RESULTS_ENTERED,
          },
        },
      });

      return this.mapOrderToResponse(updatedOrder);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 9. Pathologist Review & Certification (Atomic Row-Locked Approval)
  // ---------------------------------------------------------------------------
  async approveOrder(hospitalId: string, user: any, orderId: string, dto: ApproveLabOrderDto) {
    // Clinical Authorization: ONLY Clinicians with DOCTOR role
    if (user.role !== UserRole.DOCTOR && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Access denied: Only authorized Physicians or Pathologists may certify and approve diagnostic reports',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Row-Level Lock: Prevents concurrent race approval
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; orderNumber: string }>>`
        SELECT "id", "status", "orderNumber"
        FROM "LabOrder"
        WHERE "id" = ${orderId} AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;

      if (!rows.length) {
        throw new NotFoundException(`Laboratory order '${orderId}' not found in facility`);
      }

      const orderRow = rows[0];

      if (orderRow.status === LabOrderStatus.APPROVED) {
        throw new BadRequestException(`Order '${orderRow.orderNumber}' is already approved and certified`);
      }
      if (orderRow.status !== LabOrderStatus.RESULTS_ENTERED) {
        throw new BadRequestException(
          `Invalid approval state: Cannot certify order in status '${orderRow.status}' (must be RESULTS_ENTERED)`,
        );
      }

      // Check all items have recorded results
      const items = await tx.labOrderItem.findMany({
        where: { orderId: orderRow.id },
      });
      const pendingItems = items.filter((i) => !i.resultValue);
      if (pendingItems.length > 0) {
        throw new BadRequestException('Cannot approve order: One or more diagnostic tests have missing result values');
      }

      const certifierName =
        dto.pathologistName ||
        `${user.firstName || 'Dr.'} ${user.lastName || ''}, MD (Pathology)`.trim() ||
        'Pathologist Sign-off';

      const approvedOrder = await tx.labOrder.update({
        where: { id: orderRow.id },
        data: {
          status: LabOrderStatus.APPROVED,
          approvedById: user.id,
          approvedByName: certifierName,
          approvedAt: new Date(),
          clinicalNotes: dto.clinicalRemarks ? dto.clinicalRemarks : undefined,
        },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
          specimens: true,
          amendments: true,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: 'LabOrder',
          entityId: orderRow.id,
          changesJson: {
            action: 'CERTIFY_AND_APPROVE',
            orderNumber: orderRow.orderNumber,
            certifier: certifierName,
            newStatus: LabOrderStatus.APPROVED,
          },
        },
      });

      return this.mapOrderToResponse(approvedOrder);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 10. Post-Approval Clinical Amendment (Immutable Result Corrections)
  // ---------------------------------------------------------------------------
  async amendResult(hospitalId: string, user: any, orderId: string, dto: AmendLabResultDto) {
    if (
      user.role !== UserRole.DOCTOR &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Only certifying physicians or administrators can amend approved reports');
    }

    if (!dto.reason?.trim()) {
      throw new BadRequestException('Mandatory clinical reason required for post-approval result amendment');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, hospitalId },
        include: { items: { include: { test: true } } },
      });
      if (!order) {
        throw new NotFoundException(`Laboratory order '${orderId}' not found`);
      }

      if (order.status !== LabOrderStatus.APPROVED) {
        throw new BadRequestException(
          `Amendment is only permitted on finalized, APPROVED reports (current: '${order.status}')`,
        );
      }

      const item = order.items.find((i) => i.id === dto.orderItemId);
      if (!item) {
        throw new NotFoundException(`Lab test item '${dto.orderItemId}' not found on order`);
      }

      const prevValue = item.resultValue || '';
      const prevFlag = item.flag;

      // Authoritative evaluation for amended value
      const evaluated = RangeEvaluator.evaluate({
        resultValue: dto.newValue,
        referenceRangeMin: item.test.referenceRangeMin ? Number(item.test.referenceRangeMin) : null,
        referenceRangeMax: item.test.referenceRangeMax ? Number(item.test.referenceRangeMax) : null,
        criticalLow: item.test.criticalLow ? Number(item.test.criticalLow) : null,
        criticalHigh: item.test.criticalHigh ? Number(item.test.criticalHigh) : null,
      });

      const amendedByName = `${user.firstName || 'Dr.'} ${user.lastName || ''}`.trim() || user.email || 'Physician';

      // 1. Record immutable historical amendment
      await tx.labResultAmendment.create({
        data: {
          hospitalId,
          orderId: order.id,
          orderItemId: item.id,
          previousValue: prevValue,
          previousFlag: prevFlag,
          newValue: dto.newValue,
          newFlag: evaluated.flag,
          reason: dto.reason,
          amendedById: user.id,
          amendedByName,
        },
      });

      // 2. Update current item measurement
      await tx.labOrderItem.update({
        where: { id: item.id },
        data: {
          resultValue: dto.newValue,
          resultValueNumeric: evaluated.numericValue != null ? evaluated.numericValue : null,
          flag: evaluated.flag,
          isCritical: evaluated.isCritical,
          technicianNotes: `Amended: ${dto.reason}`,
        },
      });

      // Re-fetch complete order with amendments
      const updatedOrder = await tx.labOrder.findFirst({
        where: { id: order.id },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
          specimens: true,
          amendments: true,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: 'LabResultAmendment',
          entityId: order.id,
          changesJson: {
            action: 'AMEND_RESULT',
            orderNumber: order.orderNumber,
            orderItemId: item.id,
            reason: dto.reason,
            amendedBy: amendedByName,
          },
        },
      });

      return this.mapOrderToResponse(updatedOrder!);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 11. Order Cancellation
  // ---------------------------------------------------------------------------
  async cancelOrder(hospitalId: string, user: any, orderId: string, dto: CancelLabOrderDto) {
    if (
      user.role !== UserRole.DOCTOR &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied: Only ordering physicians or administrators can cancel orders');
    }

    if (!dto.reason?.trim()) {
      throw new BadRequestException('Cancellation reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.findFirst({
        where: { id: orderId, hospitalId },
      });
      if (!order) {
        throw new NotFoundException(`Laboratory order '${orderId}' not found`);
      }

      if (order.status === LabOrderStatus.APPROVED) {
        throw new BadRequestException('Cannot cancel order: Diagnostic report has already been certified and approved');
      }
      if (order.status === LabOrderStatus.PROCESSING) {
        throw new BadRequestException('Cannot cancel order: Laboratory specimen is actively undergoing analyzer processing');
      }
      if (order.status === LabOrderStatus.CANCELLED) {
        throw new BadRequestException('Order is already cancelled');
      }

      const cancelledOrder = await tx.labOrder.update({
        where: { id: order.id },
        data: {
          status: LabOrderStatus.CANCELLED,
          cancelledById: user.id,
          cancelledAt: new Date(),
          cancellationReason: dto.reason,
        },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          items: { include: { test: { include: { category: true } } } },
          specimens: true,
          amendments: true,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: 'LabOrder',
          entityId: order.id,
          changesJson: {
            action: 'CANCEL_ORDER',
            orderNumber: order.orderNumber,
            reason: dto.reason,
            newStatus: LabOrderStatus.CANCELLED,
          },
        },
      });

      return this.mapOrderToResponse(cancelledOrder);
    }, { maxWait: 15000, timeout: 20000 });
  }

  // ---------------------------------------------------------------------------
  // 12. Helper Mapper
  // ---------------------------------------------------------------------------
  private mapOrderToResponse(order: any) {
    const patientUser = order.patient?.user || {};
    const doctorUser = order.doctor?.user || {};

    const patientName = `${patientUser.firstName || ''} ${patientUser.lastName || ''}`.trim() || 'Patient';
    const doctorName = `Dr. ${doctorUser.firstName || ''} ${doctorUser.lastName || ''}`.trim() || 'Doctor';

    // Calculate approximate patient age from dateOfBirth if available
    let patientAge = 35;
    if (order.patient?.dateOfBirth) {
      const birth = new Date(order.patient.dateOfBirth);
      const diff = Date.now() - birth.getTime();
      patientAge = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      patientId: order.patientId,
      patientUhid: order.patient?.uhid || '',
      patientName,
      patientAge,
      patientGender: order.patient?.gender || 'Unknown',
      doctorId: order.doctorId,
      doctorName,
      encounterId: order.encounterId || undefined,
      status: order.status,
      orderDate: order.orderDate ? order.orderDate.toISOString() : order.createdAt.toISOString(),
      specimenType: order.specimenType || 'Specimen',
      priority: order.priority,
      clinicalNotes: order.clinicalNotes || undefined,
      tests: (order.items || []).map((i: any) => ({
        id: i.id,
        testId: i.testId,
        code: i.test?.code || '',
        name: i.test?.name || '',
        category: i.test?.category?.name || 'General',
        result: i.resultValue || undefined,
        unit: i.resultUnit || i.test?.unit || undefined,
        referenceRange: i.referenceRangeText || undefined,
        flag: i.flag || undefined,
        isCritical: i.isCritical || false,
        notes: i.technicianNotes || undefined,
      })),
      collectedAt: order.collectedAt ? order.collectedAt.toISOString() : undefined,
      collectedByName: order.collectedByName || undefined,
      processedAt: order.processedAt ? order.processedAt.toISOString() : undefined,
      approvedAt: order.approvedAt ? order.approvedAt.toISOString() : undefined,
      approvedBy: order.approvedByName || undefined,
      cancellationReason: order.cancellationReason || undefined,
      specimens: (order.specimens || []).map((s: any) => ({
        id: s.id,
        accessionNumber: s.accessionNumber,
        specimenType: s.specimenType,
        status: s.status,
        collectedAt: s.collectedAt.toISOString(),
        collectedByName: s.collectedByName || undefined,
        rejectionReason: s.rejectionReason || undefined,
        notes: s.notes || undefined,
      })),
      amendments: (order.amendments || []).map((a: any) => ({
        id: a.id,
        orderItemId: a.orderItemId,
        previousValue: a.previousValue,
        previousFlag: a.previousFlag || undefined,
        newValue: a.newValue,
        newFlag: a.newFlag || undefined,
        reason: a.reason,
        amendedByName: a.amendedByName,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
