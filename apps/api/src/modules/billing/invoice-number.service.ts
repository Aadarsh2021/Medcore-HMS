import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class InvoiceNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Concurrency-safe hospital-scoped invoice sequence number generator:
   * Format: INV-YYYY-000001
   * Uses atomic PostgreSQL UPSERT with RETURNING to eliminate collisions under parallel load.
   */
  async generateInvoiceNumber(hospitalId: string, customYear?: number): Promise<string> {
    const year = customYear || new Date().getFullYear();

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ current: number }>>(
        `INSERT INTO "InvoiceNumberCounter" ("id", "hospitalId", "year", "current")
         VALUES (gen_random_uuid(), $1, $2, 1)
         ON CONFLICT ("hospitalId", "year")
         DO UPDATE SET "current" = "InvoiceNumberCounter"."current" + 1
         RETURNING "current";`,
        hospitalId,
        year,
      );

      if (!rows || rows.length === 0) {
        throw new InternalServerErrorException('Failed to generate invoice sequential identifier');
      }

      const seq = String(rows[0].current).padStart(6, '0');
      return `INV-${year}-${seq}`;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(
        `Failed to generate sequence number: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Concurrency-safe hospital-scoped payment sequence number generator:
   * Format: PAY-YYYY-000001
   */
  async generatePaymentNumber(hospitalId: string, customYear?: number): Promise<string> {
    const year = customYear || new Date().getFullYear();

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ current: number }>>(
        `INSERT INTO "PaymentNumberCounter" ("id", "hospitalId", "year", "current")
         VALUES (gen_random_uuid(), $1, $2, 1)
         ON CONFLICT ("hospitalId", "year")
         DO UPDATE SET "current" = "PaymentNumberCounter"."current" + 1
         RETURNING "current";`,
        hospitalId,
        year,
      );

      if (!rows || rows.length === 0) {
        throw new InternalServerErrorException('Failed to generate payment sequential identifier');
      }

      const seq = String(rows[0].current).padStart(6, '0');
      return `PAY-${year}-${seq}`;
    } catch (err) {
      if (err instanceof InternalServerErrorException) throw err;
      throw new InternalServerErrorException(
        `Failed to generate payment sequence: ${(err as Error).message}`,
      );
    }
  }
}
