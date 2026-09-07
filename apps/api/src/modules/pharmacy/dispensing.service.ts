import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IdempotencyService } from './idempotency.service';
import { computeFefoAllocation } from './allocation.engine';
import {
  DispensePrescriptionDto,
  PharmacyQueueQueryDto,
  ReturnDispenseItemDto,
} from './dto';
import { PrescriptionStatus, StockMovementType } from '@medcore/types';
import { AuditAction } from '@prisma/client';

@Injectable()
export class DispensingService {
  private readonly logger = new Logger(DispensingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Pharmacy fulfillment queue: ISSUED or PARTIALLY_DISPENSED prescriptions
   */
  async getQueue(hospitalId: string, query: PharmacyQueueQueryDto) {
    const { status, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const allowedStatuses = status
      ? [status]
      : [PrescriptionStatus.ISSUED, PrescriptionStatus.PARTIALLY_DISPENSED];

    const whereClause: any = {
      hospitalId,
      status: { in: allowedStatuses },
    };

    if (search) {
      whereClause.OR = [
        { prescriptionNumber: { contains: search, mode: 'insensitive' } },
        { patient: { uhid: { contains: search, mode: 'insensitive' } } },
        { patient: { user: { firstName: { contains: search, mode: 'insensitive' } } } },
        { patient: { user: { lastName: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [totalCount, prescriptions] = await Promise.all([
      this.prisma.prescription.count({ where: whereClause }),
      this.prisma.prescription.findMany({
        where: whereClause,
        include: {
          patient: {
            select: {
              id: true,
              uhid: true,
              gender: true,
              dateOfBirth: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          doctor: {
            select: {
              id: true,
              licenseNumber: true,
              specialization: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          items: {
            select: {
              id: true,
              medicineId: true,
              medicineName: true,
              form: true,
              strength: true,
              quantity: true,
              dispensedQuantity: true,
            },
          },
        },
        orderBy: { issuedAt: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    const data = prescriptions.map((rx) => {
      const totalItems = rx.items.length;
      const fulfilledItems = rx.items.filter(
        (it) => it.quantity && it.dispensedQuantity >= it.quantity,
      ).length;

      const birthYear = rx.patient?.dateOfBirth ? new Date(rx.patient.dateOfBirth).getFullYear() : null;
      const age = birthYear ? new Date().getFullYear() - birthYear : undefined;

      const patientName = rx.patient?.user
        ? `${rx.patient.user.firstName} ${rx.patient.user.lastName}`.trim()
        : 'Patient';

      return {
        id: rx.id,
        prescriptionId: rx.id,
        prescriptionNumber: rx.prescriptionNumber || 'UNASSIGNED',
        encounterId: rx.encounterId,
        status: rx.status,
        issuedAt: rx.issuedAt ? rx.issuedAt.toISOString() : rx.createdAt.toISOString(),
        totalItems,
        fulfilledItems,
        patient: {
          id: rx.patient.id,
          uhid: rx.patient.uhid,
          fullName: patientName,
          gender: rx.patient.gender,
          age,
        },
        doctor: {
          id: rx.doctor.id,
          fullName: rx.doctor.user ? `Dr. ${rx.doctor.user.firstName} ${rx.doctor.user.lastName}`.trim() : 'Attending Clinician',
          specialization: rx.doctor.specialization,
        },
        items: rx.items.map((it) => ({
          prescriptionItemId: it.id,
          medicineId: it.medicineId,
          medicineName: it.medicineName,
          form: it.form,
          strength: it.strength || '',
          prescribedQuantity: it.quantity || 0,
          dispensedQuantity: it.dispensedQuantity,
          remainingQuantity: Math.max(0, (it.quantity || 0) - it.dispensedQuantity),
        })),
      };
    });

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * Preview authoritative FEFO allocation for a prescription without mutating inventory
   */
  async getDispensePlan(hospitalId: string, prescriptionId: string) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, hospitalId },
      include: {
        patient: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        items: true,
      },
    });

    if (!rx) {
      throw new NotFoundException(`Prescription '${prescriptionId}' not found in this facility`);
    }

    const planItems = [];
    const now = new Date();

    for (const item of rx.items) {
      const prescribedQuantity = item.quantity || 0;
      const alreadyDispensed = item.dispensedQuantity;
      const remainingQuantity = Math.max(0, prescribedQuantity - alreadyDispensed);

      if (!item.medicineId) {
        // Unmapped generic medicine with no formulary ID
        planItems.push({
          prescriptionItemId: item.id,
          medicineId: '',
          medicineName: item.medicineName,
          prescribedQuantity,
          alreadyDispensedQuantity: alreadyDispensed,
          remainingQuantity,
          recommendedAllocations: [],
          isFullyFulfillable: false,
        });
        continue;
      }

      // Query candidate batches for this medicine
      const candidateBatches = await this.prisma.medicineBatch.findMany({
        where: {
          hospitalId,
          medicineId: item.medicineId,
          isQuarantined: false,
          currentQuantity: { gt: 0 },
          expiryDate: { gt: now },
        },
      });

      const allocation = computeFefoAllocation(remainingQuantity, candidateBatches, now);

      planItems.push({
        prescriptionItemId: item.id,
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        prescribedQuantity,
        alreadyDispensedQuantity: alreadyDispensed,
        remainingQuantity,
        recommendedAllocations: allocation.allocations,
        isFullyFulfillable: allocation.isFullyFulfillable,
      });
    }

    return {
      success: true,
      data: {
        prescriptionId: rx.id,
        prescriptionNumber: rx.prescriptionNumber || '',
        patientName: rx.patient?.user ? `${rx.patient.user.firstName} ${rx.patient.user.lastName}`.trim() : 'Unknown Patient',
        patientUhid: rx.patient?.uhid || '',
        items: planItems,
      },
    };
  }

  /**
   * Concurrency-safe atomic dispensing with row-level locks and append-only ledger entries
   */
  async dispense(
    hospitalId: string,
    prescriptionId: string,
    dto: DispensePrescriptionDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // 1. Idempotency replay check
    const cached = await this.idempotencyService.checkIdempotency(
      hospitalId,
      idempotencyKey,
      `/api/pharmacy/prescriptions/${prescriptionId}/dispense`,
      dto,
    );
    if (cached) {
      return cached.data;
    }

    // 2. Validate request shape
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item must be supplied for dispensing');
    }

    // 3. Execute atomic transaction with strict deterministic lock order
    const result = await this.prisma.raw.$transaction(
      async (tx) => {
      // Step A: Lock Prescription row
      const lockedPrescriptions: any[] = await tx.$queryRaw`
        SELECT id, "hospitalId", "prescriptionNumber", status
        FROM "Prescription"
        WHERE id = ${prescriptionId} AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;

      if (!lockedPrescriptions || lockedPrescriptions.length === 0) {
        throw new NotFoundException(`Prescription '${prescriptionId}' not found in this facility`);
      }

      const prescription = lockedPrescriptions[0];

      if (
        prescription.status !== PrescriptionStatus.ISSUED &&
        prescription.status !== PrescriptionStatus.PARTIALLY_DISPENSED
      ) {
        throw new ConflictException(
          `Cannot dispense prescription in status '${prescription.status}'. Only ISSUED or PARTIALLY_DISPENSED prescriptions are eligible.`,
        );
      }

      // Step B: Lock relevant PrescriptionItems in deterministic ID order
      const itemIds = [...new Set(dto.items.map((it) => it.prescriptionItemId))].sort();
      const lockedItems: any[] = await tx.$queryRaw`
        SELECT id, "prescriptionId", "medicineId", "medicineName", quantity, "dispensedQuantity"
        FROM "PrescriptionItem"
        WHERE id = ANY(${itemIds}::text[]) AND "prescriptionId" = ${prescriptionId}
        ORDER BY id ASC
        FOR UPDATE
      `;

      if (lockedItems.length !== itemIds.length) {
        throw new NotFoundException('One or more prescription items not found on this prescription');
      }

      const itemMap = new Map<string, any>();
      for (const it of lockedItems) {
        itemMap.set(it.id, it);
      }

      // Step C: Collect target batch IDs and sort deterministically to prevent deadlocks
      const batchIdsToLock = new Set<string>();
      for (const itemDto of dto.items) {
        for (const alloc of itemDto.allocations) {
          if (alloc.quantity <= 0) {
            throw new BadRequestException('Dispense allocation quantity must be positive');
          }
          batchIdsToLock.add(alloc.batchId);
        }
      }

      const sortedBatchIds = [...batchIdsToLock].sort();
      const lockedBatches: any[] = await tx.$queryRaw`
        SELECT id, "hospitalId", "medicineId", "batchNumber", "currentQuantity", "expiryDate", "isQuarantined", mrp
        FROM "MedicineBatch"
        WHERE id = ANY(${sortedBatchIds}::text[]) AND "hospitalId" = ${hospitalId}
        ORDER BY id ASC
        FOR UPDATE
      `;

      if (lockedBatches.length !== sortedBatchIds.length) {
        throw new NotFoundException('One or more medicine batches not found in this facility');
      }

      const batchMap = new Map<string, any>();
      for (const b of lockedBatches) {
        batchMap.set(b.id, b);
      }

      // Step D: Invariant and stock availability verification
      const now = new Date();
      const batchDeductionTotals = new Map<string, number>();

      for (const itemDto of dto.items) {
        const itemRecord = itemMap.get(itemDto.prescriptionItemId);
        const itemAllocSum = itemDto.allocations.reduce((sum, a) => sum + a.quantity, 0);
        const maxRemaining = (itemRecord.quantity || 0) - itemRecord.dispensedQuantity;

        if (itemAllocSum > maxRemaining) {
          throw new BadRequestException(
            `Total allocation for '${itemRecord.medicineName}' (${itemAllocSum}) exceeds remaining prescribed balance (${maxRemaining})`,
          );
        }

        for (const alloc of itemDto.allocations) {
          const batch = batchMap.get(alloc.batchId);

          if (batch.isQuarantined) {
            throw new UnprocessableEntityException(
              `Batch '${batch.batchNumber}' is quarantined and cannot be dispensed`,
            );
          }

          if (new Date(batch.expiryDate) <= now) {
            throw new UnprocessableEntityException(
              `Batch '${batch.batchNumber}' expired on ${new Date(batch.expiryDate).toISOString().split('T')[0]} and cannot be dispensed`,
            );
          }

          const currentTotal = (batchDeductionTotals.get(alloc.batchId) || 0) + alloc.quantity;
          batchDeductionTotals.set(alloc.batchId, currentTotal);

          if (currentTotal > batch.currentQuantity) {
            throw new ConflictException(
              `Insufficient stock in batch '${batch.batchNumber}'. Requested: ${currentTotal}, Available: ${batch.currentQuantity}`,
            );
          }
        }
      }

      // Step E: Generate sequential dispense number: DSP-{hospCode}-{year}-{seq6}
      const hospital = await tx.hospital.findUnique({
        where: { id: hospitalId },
        select: { code: true },
      });
      const hospCode = hospital?.code || 'HOSP';
      const year = now.getFullYear();
      const count = await tx.prescriptionDispense.count({ where: { hospitalId } });
      const dispenseNumber = `DSP-${hospCode}-${year}-${String(count + 1).padStart(6, '0')}`;

      // Create PrescriptionDispense header
      const dispenseRecord = await tx.prescriptionDispense.create({
        data: {
          hospitalId,
          prescriptionId,
          dispenseNumber,
          dispensedById: userId,
          dispensedAt: now,
          notes: dto.notes || null,
          idempotencyKey: idempotencyKey || null,
        },
      });

      // Step F: Apply deductions, create dispense items, and record StockMovements
      const itemResponseSummary: any[] = [];

      for (const itemDto of dto.items) {
        const itemRecord = itemMap.get(itemDto.prescriptionItemId);
        let totalDispensedThisItem = 0;
        const dispensedBatches: any[] = [];

        for (const alloc of itemDto.allocations) {
          const batch = batchMap.get(alloc.batchId);
          const previousBatchQty = batch.currentQuantity;
          const newBatchQty = previousBatchQty - alloc.quantity;

          // Update batch stock
          await tx.medicineBatch.update({
            where: { id: alloc.batchId },
            data: { currentQuantity: newBatchQty },
          });

          // Refresh in-memory map
          batch.currentQuantity = newBatchQty;

          // Create PrescriptionDispenseItem
          await tx.prescriptionDispenseItem.create({
            data: {
              dispenseId: dispenseRecord.id,
              prescriptionItemId: itemDto.prescriptionItemId,
              batchId: alloc.batchId,
              quantityDispensed: alloc.quantity,
              unitPrice: batch.mrp,
            },
          });

          // Append to StockMovement ledger
          await tx.stockMovement.create({
            data: {
              hospitalId,
              batchId: alloc.batchId,
              medicineId: batch.medicineId,
              movementType: StockMovementType.DISPENSE,
              quantity: -alloc.quantity, // Negative for deduction
              balanceBefore: previousBatchQty,
              balanceAfter: newBatchQty,
              referenceType: 'PRESCRIPTION',
              referenceId: prescriptionId,
              reason: `Prescription fulfillment ${prescription.prescriptionNumber}`,
              performedById: userId,
            },
          });

          totalDispensedThisItem += alloc.quantity;
          dispensedBatches.push({
            batchId: alloc.batchId,
            batchNumber: batch.batchNumber,
            quantity: alloc.quantity,
          });
        }

        // Update PrescriptionItem dispensed counter
        const updatedDispensedQuantity = itemRecord.dispensedQuantity + totalDispensedThisItem;
        await tx.prescriptionItem.update({
          where: { id: itemDto.prescriptionItemId },
          data: { dispensedQuantity: updatedDispensedQuantity },
        });

        itemRecord.dispensedQuantity = updatedDispensedQuantity;

        itemResponseSummary.push({
          prescriptionItemId: itemDto.prescriptionItemId,
          medicineName: itemRecord.medicineName,
          quantityDispensed: totalDispensedThisItem,
          dispensedBatches,
        });
      }

      // Step G: Evaluate final prescription status
      const allPrescriptionItems = await tx.prescriptionItem.findMany({
        where: { prescriptionId },
      });

      const allItemsFulfilled = allPrescriptionItems.every(
        (it) => it.quantity !== null && it.dispensedQuantity >= it.quantity,
      );

      const nextStatus = allItemsFulfilled
        ? PrescriptionStatus.DISPENSED
        : PrescriptionStatus.PARTIALLY_DISPENSED;

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: nextStatus },
      });

      // Step H: Create AuditLog
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId,
          action: AuditAction.CREATE,
          entityName: 'PrescriptionDispense',
          entityId: dispenseRecord.id,
          changesJson: {
            dispenseNumber,
            prescriptionId,
            prescriptionNumber: prescription.prescriptionNumber,
            previousStatus: prescription.status,
            newStatus: nextStatus,
            itemsFulfilled: dto.items.length,
          },
        },
      });

      return {
        success: true,
        data: {
          dispenseId: dispenseRecord.id,
          dispenseNumber,
          prescriptionId,
          prescriptionNumber: prescription.prescriptionNumber,
          prescriptionStatus: nextStatus,
          newPrescriptionStatus: nextStatus,
          dispensedAt: now.toISOString(),
          items: itemResponseSummary,
        },
        message: `Prescription successfully dispensed (${nextStatus})`,
      };
    }, { maxWait: 15000, timeout: 30000 });

    // 4. Save idempotency record
    await this.idempotencyService.saveIdempotencyRecord(
      hospitalId,
      idempotencyKey,
      `/api/pharmacy/prescriptions/${prescriptionId}/dispense`,
      dto,
      201,
      result,
    );

    return result;
  }

  /**
   * Concurrency-safe return of previously dispensed medication with inventory restoration
   */
  async returnDispense(
    hospitalId: string,
    dto: ReturnDispenseItemDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // 1. Idempotency check
    const cached = await this.idempotencyService.checkIdempotency(
      hospitalId,
      idempotencyKey,
      '/api/pharmacy/returns',
      dto,
    );
    if (cached) {
      return cached.data;
    }

    if (dto.quantity <= 0) {
      throw new BadRequestException('Return quantity must be greater than zero');
    }

    // 2. Transaction with row locking
    const result = await this.prisma.raw.$transaction(async (tx) => {
      // Lock target PrescriptionDispenseItem
      const lockedDispenseItems: any[] = await tx.$queryRaw`
        SELECT pdi.id, pdi."dispenseId", pdi."prescriptionItemId", pdi."batchId",
               pdi."quantityDispensed", pdi."returnedQuantity",
               pd."hospitalId", pd."prescriptionId"
        FROM "PrescriptionDispenseItem" pdi
        JOIN "PrescriptionDispense" pd ON pdi."dispenseId" = pd.id
        WHERE pdi.id = ${dto.dispenseItemId} AND pd."hospitalId" = ${hospitalId}
        FOR UPDATE
      `;

      if (!lockedDispenseItems || lockedDispenseItems.length === 0) {
        throw new NotFoundException(`Dispense item '${dto.dispenseItemId}' not found in this facility`);
      }

      const dispenseItem = lockedDispenseItems[0];
      const maxReturnable = dispenseItem.quantityDispensed - dispenseItem.returnedQuantity;

      if (dto.quantity > maxReturnable) {
        throw new BadRequestException(
          `Cannot return ${dto.quantity} units. Maximum returnable quantity for this dispense item is ${maxReturnable}`,
        );
      }

      // Lock target MedicineBatch
      const lockedBatches: any[] = await tx.$queryRaw`
        SELECT id, "currentQuantity", "medicineId", "batchNumber"
        FROM "MedicineBatch"
        WHERE id = ${dispenseItem.batchId}
        FOR UPDATE
      `;

      const batch = lockedBatches[0];
      const previousBatchQty = batch.currentQuantity;
      const newBatchQty = previousBatchQty + dto.quantity;

      // Update MedicineBatch currentQuantity
      await tx.medicineBatch.update({
        where: { id: dispenseItem.batchId },
        data: { currentQuantity: newBatchQty },
      });

      // Update PrescriptionDispenseItem returnedQuantity
      const newReturnedTotal = dispenseItem.returnedQuantity + dto.quantity;
      await tx.prescriptionDispenseItem.update({
        where: { id: dto.dispenseItemId },
        data: { returnedQuantity: newReturnedTotal },
      });

      // Update PrescriptionItem dispensedQuantity
      const prescriptionItem = await tx.prescriptionItem.findUnique({
        where: { id: dispenseItem.prescriptionItemId },
      });

      if (prescriptionItem) {
        const updatedDispensedQuantity = Math.max(0, prescriptionItem.dispensedQuantity - dto.quantity);
        await tx.prescriptionItem.update({
          where: { id: dispenseItem.prescriptionItemId },
          data: { dispensedQuantity: updatedDispensedQuantity },
        });
      }

      // If prescription was marked DISPENSED, revert to PARTIALLY_DISPENSED
      const rx = await tx.prescription.findUnique({
        where: { id: dispenseItem.prescriptionId },
        select: { status: true },
      });

      if (rx && rx.status === PrescriptionStatus.DISPENSED) {
        await tx.prescription.update({
          where: { id: dispenseItem.prescriptionId },
          data: { status: PrescriptionStatus.PARTIALLY_DISPENSED },
        });
      }

      // Record StockMovement of type DISPENSE_RETURN
      const movement = await tx.stockMovement.create({
        data: {
          hospitalId,
          batchId: dispenseItem.batchId,
          medicineId: batch.medicineId,
          movementType: StockMovementType.DISPENSE_RETURN,
          quantity: dto.quantity, // Positive for return to inventory
          balanceBefore: previousBatchQty,
          balanceAfter: newBatchQty,
          referenceType: 'RETURN',
          referenceId: dto.dispenseItemId,
          reason: dto.reason,
          performedById: userId,
        },
      });

      // Create AuditLog
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId,
          action: AuditAction.UPDATE,
          entityName: 'PrescriptionDispenseItem',
          entityId: dto.dispenseItemId,
          changesJson: {
            dispenseItemId: dto.dispenseItemId,
            prescriptionId: dispenseItem.prescriptionId,
            batchNumber: batch.batchNumber,
            quantityReturned: dto.quantity,
            reason: dto.reason,
            movementId: movement.id,
          },
        },
      });

      return {
        success: true,
        data: {
          dispenseItemId: dto.dispenseItemId,
          batchId: dispenseItem.batchId,
          batchNumber: batch.batchNumber,
          quantityReturned: dto.quantity,
          newBatchQuantity: newBatchQty,
          movementId: movement.id,
        },
        message: 'Medication return successfully processed and stock restored',
      };
    }, { maxWait: 15000, timeout: 30000 });

    // 3. Save idempotency
    await this.idempotencyService.saveIdempotencyRecord(
      hospitalId,
      idempotencyKey,
      '/api/pharmacy/returns',
      dto,
      200,
      result,
    );

    return result;
  }
}
