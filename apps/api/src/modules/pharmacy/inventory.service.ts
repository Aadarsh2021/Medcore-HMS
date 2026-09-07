import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IdempotencyService } from './idempotency.service';
import {
  InventoryQueryDto,
  AdjustStockDto,
  QuarantineBatchDto,
  ExpiryReportQueryDto,
} from './dto';
import { StockMovementType } from '@medcore/types';
import { AuditAction } from '@prisma/client';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Aggregate physical batch stock across master catalog medicines for the tenant hospital
   */
  async getInventory(hospitalId: string, query: InventoryQueryDto) {
    const { search, category, isLowStock, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      hospitalId,
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      whereClause.category = { equals: category, mode: 'insensitive' };
    }

    const [totalCount, medicines] = await Promise.all([
      this.prisma.medicine.count({ where: whereClause }),
      this.prisma.medicine.findMany({
        where: whereClause,
        include: {
          batches: {
            where: {
              hospitalId,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    const now = new Date();

    const data = medicines.map((med) => {
      // Usable active stock excludes expired and quarantined batches
      const activeBatches = med.batches.filter(
        (b) => !b.isQuarantined && new Date(b.expiryDate) > now && b.currentQuantity > 0,
      );

      const availableStock = activeBatches.reduce((acc, b) => acc + b.currentQuantity, 0);
      const totalPhysicalStock = med.batches.reduce((acc, b) => acc + b.currentQuantity, 0);
      const isLow = availableStock <= med.reorderLevel;

      let status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
      if (availableStock === 0) {
        status = 'OUT_OF_STOCK';
      } else if (isLow) {
        status = 'LOW_STOCK';
      }

      return {
        id: med.id,
        medicineId: med.id,
        name: med.name,
        genericName: med.genericName,
        category: med.category,
        form: med.form,
        strength: med.strength,
        reorderLevel: med.reorderLevel,
        availableStock,
        totalStock: totalPhysicalStock,
        totalPhysicalStock,
        isLowStock: isLow,
        status,
        batchCount: med.batches.length,
        activeBatchesCount: activeBatches.length,
      };
    });

    const filteredData = isLowStock !== undefined
      ? data.filter((item) => item.isLowStock === isLowStock)
      : data;

    return {
      success: true,
      data: filteredData,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * Get physical batches for a specific medicine or across the hospital
   */
  async getBatches(hospitalId: string, medicineId?: string) {
    const whereClause: any = { hospitalId };
    if (medicineId) {
      whereClause.medicineId = medicineId;
    }

    const batches = await this.prisma.medicineBatch.findMany({
      where: whereClause,
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            genericName: true,
            form: true,
            strength: true,
          },
        },
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    });

    const now = new Date();

    const mapped = batches.map((b) => ({
      id: b.id,
      medicineId: b.medicineId,
      medicineName: b.medicine.name,
      genericName: b.medicine.genericName,
      form: b.medicine.form,
      strength: b.medicine.strength,
      batchNumber: b.batchNumber,
      manufacturingDate: b.manufacturingDate.toISOString(),
      expiryDate: b.expiryDate.toISOString(),
      initialQuantity: b.initialQuantity,
      currentQuantity: b.currentQuantity,
      unitCost: Number(b.unitCost),
      mrp: Number(b.mrp),
      isQuarantined: b.isQuarantined,
      quarantinedAt: b.quarantinedAt?.toISOString() || null,
      quarantinedById: b.quarantinedById,
      quarantineReason: b.quarantineReason,
      isExpired: new Date(b.expiryDate) <= now,
      createdAt: b.createdAt.toISOString(),
    }));

    return {
      success: true,
      data: mapped,
    };
  }

  /**
   * Toggle quarantine state for a physical batch with mandatory audit trail
   */
  async toggleQuarantine(
    hospitalId: string,
    batchId: string,
    dto: QuarantineBatchDto,
    userId: string,
  ) {
    const batch = await this.prisma.medicineBatch.findFirst({
      where: { id: batchId, hospitalId },
      include: { medicine: true },
    });

    if (!batch) {
      throw new NotFoundException(`Batch with ID '${batchId}' not found in this hospital`);
    }

    const updated = await this.prisma.medicineBatch.update({
      where: { id: batchId },
      data: {
        isQuarantined: dto.isQuarantined,
        quarantinedAt: dto.isQuarantined ? new Date() : null,
        quarantinedById: dto.isQuarantined ? userId : null,
        quarantineReason: dto.isQuarantined ? dto.reason : null,
      },
    });

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        hospitalId,
        userId,
        action: AuditAction.UPDATE,
        entityName: 'MedicineBatch',
        entityId: batchId,
        changesJson: {
          action: dto.isQuarantined ? 'QUARANTINE_BATCH' : 'RELEASE_BATCH_QUARANTINE',
          batchNumber: batch.batchNumber,
          medicineName: batch.medicine.name,
          reason: dto.reason,
          isQuarantined: dto.isQuarantined,
        },
      },
    });

    return {
      success: true,
      data: {
        batchId: updated.id,
        batchNumber: updated.batchNumber,
        isQuarantined: updated.isQuarantined,
        quarantinedById: updated.quarantinedById,
        quarantinedAt: updated.quarantinedAt?.toISOString() || null,
        quarantineReason: updated.quarantineReason,
      },
      message: `Batch quarantine status successfully updated to ${updated.isQuarantined ? 'QUARANTINED' : 'RELEASED'}`,
    };
  }

  /**
   * Execute physical stock adjustment with append-only ledger StockMovement
   */
  async adjustStock(
    hospitalId: string,
    batchId: string,
    dto: AdjustStockDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // Check idempotency replay
    const cached = await this.idempotencyService.checkIdempotency(
      hospitalId,
      idempotencyKey,
      `/api/pharmacy/batches/${batchId}/adjust`,
      dto,
    );
    if (cached) {
      return cached.data;
    }

    const isIncrease = dto.adjustmentType === StockMovementType.ADJUSTMENT_INCREASE;

    // Use raw transaction with FOR UPDATE row lock to ensure concurrency safety
    const result = await this.prisma.raw.$transaction(async (tx) => {
      // Row lock batch
      const lockedBatches: any[] = await tx.$queryRaw`
        SELECT id, "hospitalId", "medicineId", "batchNumber", "currentQuantity"
        FROM "MedicineBatch"
        WHERE id = ${batchId} AND "hospitalId" = ${hospitalId}
        FOR UPDATE
      `;

      if (!lockedBatches || lockedBatches.length === 0) {
        throw new NotFoundException(`Batch '${batchId}' not found in this facility`);
      }

      const batch = lockedBatches[0];
      const previousQuantity = batch.currentQuantity;
      let newQuantity: number;
      let signedDelta: number;

      if (isIncrease) {
        signedDelta = dto.quantity;
        newQuantity = previousQuantity + dto.quantity;
      } else {
        if (previousQuantity < dto.quantity) {
          throw new BadRequestException(
            `Insufficient stock for adjustment reduction. Available: ${previousQuantity}, Requested: ${dto.quantity}`,
          );
        }
        signedDelta = -dto.quantity;
        newQuantity = previousQuantity - dto.quantity;
      }

      // Update current quantity
      await tx.medicineBatch.update({
        where: { id: batchId },
        data: { currentQuantity: newQuantity },
      });

      // Insert append-only movement ledger row
      const movement = await tx.stockMovement.create({
        data: {
          hospitalId,
          batchId,
          medicineId: batch.medicineId,
          movementType: dto.adjustmentType,
          quantity: signedDelta,
          balanceBefore: previousQuantity,
          balanceAfter: newQuantity,
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: dto.reference || null,
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
          entityName: 'MedicineBatch',
          entityId: batchId,
          changesJson: {
            action: 'STOCK_ADJUSTMENT',
            batchNumber: batch.batchNumber,
            adjustmentType: dto.adjustmentType,
            previousQuantity,
            newQuantity,
            delta: signedDelta,
            reason: dto.reason,
            movementId: movement.id,
          },
        },
      });

      return {
        success: true,
        data: {
          batchId,
          batchNumber: batch.batchNumber,
          previousQuantity,
          newQuantity,
          adjustmentType: dto.adjustmentType,
          quantityChange: signedDelta,
          movementId: movement.id,
        },
        message: 'Stock adjustment successfully recorded in ledger',
      };
    }, { maxWait: 15000, timeout: 30000 });

    // Save idempotency
    await this.idempotencyService.saveIdempotencyRecord(
      hospitalId,
      idempotencyKey,
      `/api/pharmacy/batches/${batchId}/adjust`,
      dto,
      200,
      result,
    );

    return result;
  }

  /**
   * Expiry brackets reporting: EXPIRED, DAYS_30, DAYS_60, DAYS_90 with comprehensive summary
   */
  async getExpiryReport(hospitalId: string, query: ExpiryReportQueryDto) {
    const bracket = query.bracket;
    const now = new Date();

    const allBatches = await this.prisma.medicineBatch.findMany({
      where: {
        hospitalId,
        currentQuantity: { gt: 0 },
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            genericName: true,
            form: true,
            strength: true,
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    let expiredCount = 0;
    let expiring30DaysCount = 0;
    let expiring60DaysCount = 0;
    let expiring90DaysCount = 0;
    let activeCount = 0;

    const mapped = allBatches.map((b) => {
      const diffMs = b.expiryDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 3600 * 24));
      const isExpired = daysRemaining <= 0;

      let batchBracket: 'EXPIRED' | 'DAYS_30' | 'DAYS_60' | 'DAYS_90' | 'ACTIVE';
      if (isExpired) {
        batchBracket = 'EXPIRED';
        expiredCount++;
      } else if (daysRemaining <= 30) {
        batchBracket = 'DAYS_30';
        expiring30DaysCount++;
      } else if (daysRemaining <= 60) {
        batchBracket = 'DAYS_60';
        expiring60DaysCount++;
      } else if (daysRemaining <= 90) {
        batchBracket = 'DAYS_90';
        expiring90DaysCount++;
      } else {
        batchBracket = 'ACTIVE';
        activeCount++;
      }

      return {
        id: b.id,
        batchId: b.id,
        batchNumber: b.batchNumber,
        medicineId: b.medicineId,
        medicineName: b.medicine.name,
        genericName: b.medicine.genericName,
        form: b.medicine.form,
        strength: b.medicine.strength,
        currentQuantity: b.currentQuantity,
        expiryDate: b.expiryDate.toISOString(),
        daysRemaining,
        isExpired,
        bracket: batchBracket,
        isQuarantined: b.isQuarantined,
      };
    });

    const filtered = bracket ? mapped.filter((b) => b.bracket === bracket) : mapped;

    return {
      success: true,
      data: {
        summary: {
          totalBatches: allBatches.length,
          expiredCount,
          expiring30DaysCount,
          expiring60DaysCount,
          expiring90DaysCount,
          activeCount,
        },
        bracket: bracket || 'ALL',
        count: filtered.length,
        batches: filtered,
      },
    };
  }
}
