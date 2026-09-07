import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StockMovementQueryDto } from './dto';

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Query the append-only stock movement ledger
   */
  async getMovements(hospitalId: string, query: StockMovementQueryDto) {
    const { medicineId, batchId, movementType, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const whereClause: any = {
      hospitalId,
    };

    if (medicineId) {
      whereClause.medicineId = medicineId;
    }

    if (batchId) {
      whereClause.batchId = batchId;
    }

    if (movementType) {
      whereClause.movementType = movementType;
    }

    const [totalCount, movements] = await Promise.all([
      this.prisma.stockMovement.count({ where: whereClause }),
      this.prisma.stockMovement.findMany({
        where: whereClause,
        include: {
          batch: {
            select: {
              batchNumber: true,
              expiryDate: true,
            },
          },
          performedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const mapped = movements.map((m) => ({
      id: m.id,
      movementType: m.movementType,
      quantity: m.quantity,
      balanceBefore: m.balanceBefore,
      balanceAfter: m.balanceAfter,
      batchId: m.batchId,
      batchNumber: m.batch.batchNumber,
      medicineId: m.medicineId,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      reason: m.reason,
      performedBy: `${m.performedBy.firstName} ${m.performedBy.lastName} (${m.performedBy.role})`,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      success: true,
      data: mapped,
      meta: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }
}
