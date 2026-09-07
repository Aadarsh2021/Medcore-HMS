import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IdempotencyService } from './idempotency.service';
import { CreateStockReceiptDto } from './dto';
import { StockMovementType } from '@medcore/types';
import { AuditAction } from '@prisma/client';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Process purchase delivery shipment, register batches, and commit ledger intake movements
   */
  async createStockReceipt(
    hospitalId: string,
    dto: CreateStockReceiptDto,
    userId: string,
    idempotencyKey?: string,
  ) {
    // 1. Idempotency check
    const cached = await this.idempotencyService.checkIdempotency(
      hospitalId,
      idempotencyKey,
      '/api/pharmacy/stock-receipts',
      dto,
    );
    if (cached) {
      return cached.data;
    }

    // 2. Duplicate invoice validation
    const existingInvoice = await this.prisma.stockReceipt.findUnique({
      where: {
        hospitalId_supplierName_invoiceNumber: {
          hospitalId,
          supplierName: dto.supplierName.trim(),
          invoiceNumber: dto.invoiceNumber.trim(),
        },
      },
    });

    if (existingInvoice) {
      throw new ConflictException(
        `A stock receipt already exists for supplier '${dto.supplierName}' with invoice number '${dto.invoiceNumber}'`,
      );
    }

    // 3. Item-level validation
    for (const item of dto.items) {
      if (item.quantityReceived <= 0) {
        throw new BadRequestException('quantityReceived must be greater than zero');
      }
      if (item.unitCost < 0 || item.mrp < 0) {
        throw new BadRequestException('Financial amounts cannot be negative');
      }
      if (item.mrp < item.unitCost) {
        throw new BadRequestException(`MRP (${item.mrp}) cannot be lower than unit cost (${item.unitCost})`);
      }
      const mfg = new Date(item.manufacturingDate);
      const exp = new Date(item.expiryDate);
      if (exp <= mfg) {
        throw new BadRequestException(
          `Expiry date (${item.expiryDate}) must be strictly later than manufacturing date (${item.manufacturingDate})`,
        );
      }
    }

    // 4. Verify all medicines belong to the active hospital
    const medicineIds = [...new Set(dto.items.map((it) => it.medicineId))];
    const medicines = await this.prisma.medicine.findMany({
      where: {
        id: { in: medicineIds },
        hospitalId,
      },
    });

    if (medicines.length !== medicineIds.length) {
      throw new NotFoundException('One or more medicines do not exist or belong to another hospital facility');
    }

    // 5. Atomic transaction execution
    const result = await this.prisma.raw.$transaction(async (tx) => {
      // Fetch hospital code for sequential GRN naming
      const hospital = await tx.hospital.findUnique({
        where: { id: hospitalId },
        select: { code: true },
      });

      const hospCode = hospital?.code || 'HOSP';
      const year = new Date().getFullYear();
      const count = await tx.stockReceipt.count({ where: { hospitalId } });
      const receiptNumber = `GRN-${hospCode}-${year}-${String(count + 1).padStart(6, '0')}`;

      // Calculate total cost
      const totalCost = dto.items.reduce(
        (sum, it) => sum + it.quantityReceived * it.unitCost,
        0,
      );

      // Create StockReceipt header
      const receipt = await tx.stockReceipt.create({
        data: {
          hospitalId,
          receiptNumber,
          supplierName: dto.supplierName.trim(),
          invoiceNumber: dto.invoiceNumber.trim(),
          invoiceDate: new Date(dto.invoiceDate),
          receivedDate: new Date(),
          totalCost: totalCost.toFixed(2),
          notes: dto.notes || null,
          receivedById: userId,
        },
      });

      // Process each item
      for (const item of dto.items) {
        // Deterministically check if batch already exists in this hospital
        const existingBatch = await tx.medicineBatch.findUnique({
          where: {
            hospitalId_medicineId_batchNumber: {
              hospitalId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber.trim(),
            },
          },
        });

        let targetBatchId: string;
        let balanceBefore = 0;
        let balanceAfter = item.quantityReceived;

        if (existingBatch) {
          // Row lock existing batch
          const locked: any[] = await tx.$queryRaw`
            SELECT id, "currentQuantity" FROM "MedicineBatch"
            WHERE id = ${existingBatch.id}
            FOR UPDATE
          `;
          balanceBefore = locked[0].currentQuantity;
          balanceAfter = balanceBefore + item.quantityReceived;

          await tx.medicineBatch.update({
            where: { id: existingBatch.id },
            data: {
              currentQuantity: balanceAfter,
              unitCost: item.unitCost,
              mrp: item.mrp,
            },
          });
          targetBatchId = existingBatch.id;
        } else {
          // Create new physical batch
          const newBatch = await tx.medicineBatch.create({
            data: {
              hospitalId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber.trim(),
              manufacturingDate: new Date(item.manufacturingDate),
              expiryDate: new Date(item.expiryDate),
              initialQuantity: item.quantityReceived,
              currentQuantity: item.quantityReceived,
              unitCost: item.unitCost,
              mrp: item.mrp,
              isQuarantined: false,
            },
          });
          targetBatchId = newBatch.id;
        }

        // Create StockReceiptItem line
        await tx.stockReceiptItem.create({
          data: {
            receiptId: receipt.id,
            batchId: targetBatchId,
            medicineId: item.medicineId,
            batchNumber: item.batchNumber.trim(),
            quantityReceived: item.quantityReceived,
            unitCost: item.unitCost,
            mrp: item.mrp,
            expiryDate: new Date(item.expiryDate),
          },
        });

        // Create append-only StockMovement row
        await tx.stockMovement.create({
          data: {
            hospitalId,
            batchId: targetBatchId,
            medicineId: item.medicineId,
            movementType: StockMovementType.PURCHASE_RECEIPT,
            quantity: item.quantityReceived, // Positive for intake
            balanceBefore,
            balanceAfter,
            referenceType: 'STOCK_RECEIPT',
            referenceId: receipt.id,
            reason: `Purchase intake via invoice ${dto.invoiceNumber}`,
            performedById: userId,
          },
        });
      }

      // Record audit log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId,
          action: AuditAction.CREATE,
          entityName: 'StockReceipt',
          entityId: receipt.id,
          changesJson: {
            receiptNumber,
            supplierName: dto.supplierName,
            invoiceNumber: dto.invoiceNumber,
            totalCost: totalCost.toFixed(2),
            itemCount: dto.items.length,
          },
        },
      });

      return {
        success: true,
        data: {
          receiptId: receipt.id,
          receiptNumber,
          supplierName: receipt.supplierName,
          invoiceNumber: receipt.invoiceNumber,
          totalCost: totalCost.toFixed(2),
          itemsReceived: dto.items.length,
        },
        message: 'Stock receipt successfully processed and inventory updated',
      };
    }, { maxWait: 15000, timeout: 30000 });

    // 6. Save idempotency record
    await this.idempotencyService.saveIdempotencyRecord(
      hospitalId,
      idempotencyKey,
      '/api/pharmacy/stock-receipts',
      dto,
      201,
      result,
    );

    return result;
  }
}
