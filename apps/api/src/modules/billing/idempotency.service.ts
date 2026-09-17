import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a deterministic SHA-256 hash for canonical payload and endpoint.
   */
  computeHash(endpoint: string, payload: any): string {
    const canonical = typeof payload === 'object' && payload !== null
      ? JSON.stringify(payload, Object.keys(payload).sort())
      : String(payload);
    return crypto.createHash('sha256').update(`${endpoint}:${canonical}`).digest('hex');
  }

  /**
   * Checks for an existing idempotency record.
   * If exists and hash matches -> returns saved response.
   * If exists and hash differs -> throws ConflictException.
   * If does not exist -> returns null.
   */
  async checkIdempotency<T = any>(
    hospitalId: string,
    key: string,
    endpoint: string,
    payload: any,
  ): Promise<{ status: number; body: T } | null> {
    const hash = this.computeHash(endpoint, payload);

    const record = await this.prisma.raw.idempotencyRecord.findUnique({
      where: {
        hospitalId_idempotencyKey: {
          hospitalId,
          idempotencyKey: key,
        },
      },
    });

    if (!record) {
      return null;
    }

    if (record.requestHash !== hash) {
      throw new ConflictException(
        'Idempotency key reused with different request payload or parameters',
      );
    }

    try {
      const parsedBody = JSON.parse(record.responseBody);
      return {
        status: record.responseStatus,
        body: parsedBody,
      };
    } catch {
      return {
        status: record.responseStatus,
        body: record.responseBody as any,
      };
    }
  }

  /**
   * Stores completed transaction result in IdempotencyRecord.
   */
  async recordResult(
    hospitalId: string,
    key: string,
    endpoint: string,
    payload: any,
    status: number,
    body: any,
    ttlHours: number = 24,
  ): Promise<void> {
    const hash = this.computeHash(endpoint, payload);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
    const serializedBody = typeof body === 'string' ? body : JSON.stringify(body);

    await this.prisma.raw.idempotencyRecord.upsert({
      where: {
        hospitalId_idempotencyKey: {
          hospitalId,
          idempotencyKey: key,
        },
      },
      create: {
        hospitalId,
        idempotencyKey: key,
        endpoint,
        requestHash: hash,
        responseStatus: status,
        responseBody: serializedBody,
        expiresAt,
      },
      update: {
        responseStatus: status,
        responseBody: serializedBody,
        expiresAt,
      },
    });
  }
}
