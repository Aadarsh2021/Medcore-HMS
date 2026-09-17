import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class OrderNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Concurrency-safe hospital-scoped order number generation.
   * Format: LAB-YYYY-000001
   * Uses atomic PostgreSQL row-level UPSERT with RETURNING to prevent collisions under race conditions.
   */
  async generateOrderNumber(hospitalId: string, tx?: any): Promise<string> {
    const client = tx || this.prisma;
    const year = new Date().getFullYear();
    const id = randomUUID();

    const result = await client.$queryRaw<Array<{ lastNumber: number }>>`
      INSERT INTO "LabOrderNumberCounter" ("id", "hospitalId", "year", "lastNumber", "updatedAt")
      VALUES (${id}, ${hospitalId}, ${year}, 1, NOW())
      ON CONFLICT ("hospitalId", "year")
      DO UPDATE SET "lastNumber" = "LabOrderNumberCounter"."lastNumber" + 1, "updatedAt" = NOW()
      RETURNING "lastNumber";
    `;

    const nextVal = Number(result[0].lastNumber);
    return `LAB-${year}-${String(nextVal).padStart(6, '0')}`;
  }

  /**
   * Concurrency-safe hospital-scoped specimen accession number generation.
   * Format: ACC-YYYY-000001
   * Uses atomic PostgreSQL row-level UPSERT with RETURNING to guarantee zero duplicates.
   */
  async generateAccessionNumber(hospitalId: string, tx?: any): Promise<string> {
    const client = tx || this.prisma;
    const year = new Date().getFullYear();
    const id = randomUUID();

    const result = await client.$queryRaw<Array<{ lastNumber: number }>>`
      INSERT INTO "LabAccessionCounter" ("id", "hospitalId", "year", "lastNumber", "updatedAt")
      VALUES (${id}, ${hospitalId}, ${year}, 1, NOW())
      ON CONFLICT ("hospitalId", "year")
      DO UPDATE SET "lastNumber" = "LabAccessionCounter"."lastNumber" + 1, "updatedAt" = NOW()
      RETURNING "lastNumber";
    `;

    const nextVal = Number(result[0].lastNumber);
    return `ACC-${year}-${String(nextVal).padStart(6, '0')}`;
  }
}
