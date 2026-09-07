import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

export interface IdempotentResult<T> {
  isCached: boolean;
  status: number;
  data: T;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministically hash a canonical JSON representation of the request payload
   */
  hashPayload(payload: unknown): string {
    const canonicalString = this.canonicalizeJson(payload);
    return createHash('sha256').update(canonicalString).digest('hex');
  }

  private canonicalizeJson(obj: unknown): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map((item) => this.canonicalizeJson(item)).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
    const parts = sortedKeys.map(
      (k) => `${JSON.stringify(k)}:${this.canonicalizeJson((obj as Record<string, unknown>)[k])}`,
    );
    return '{' + parts.join(',') + '}';
  }

  /**
   * Check whether an idempotency key has already been executed.
   * If replayed with identical payload -> return cached response.
   * If replayed with differing payload -> throw ConflictException (409).
   */
  async checkIdempotency<T>(
    hospitalId: string,
    idempotencyKey: string | undefined,
    endpoint: string,
    payload: unknown,
  ): Promise<IdempotentResult<T> | null> {
    if (!idempotencyKey) {
      return null;
    }

    const requestHash = this.hashPayload(payload);

    // Query scoped to tenant
    const existing = await this.prisma.idempotencyRecord.findFirst({
      where: {
        hospitalId,
        idempotencyKey,
      },
    });

    if (!existing) {
      return null;
    }

    // Check payload hash match
    if (existing.requestHash !== requestHash) {
      this.logger.warn(
        `Idempotency conflict for key ${idempotencyKey} on hospital ${hospitalId}. Stored hash: ${existing.requestHash}, Incoming: ${requestHash}`,
      );
      throw new ConflictException(
        'Idempotency-Key was previously used with a different request payload',
      );
    }

    let parsedBody: T;
    try {
      parsedBody = JSON.parse(existing.responseBody);
    } catch {
      parsedBody = existing.responseBody as unknown as T;
    }

    return {
      isCached: true,
      status: existing.responseStatus,
      data: parsedBody,
    };
  }

  /**
   * Persist response under tenant-scoped idempotency key
   */
  async saveIdempotencyRecord(
    hospitalId: string,
    idempotencyKey: string | undefined,
    endpoint: string,
    payload: unknown,
    responseStatus: number,
    responseBody: unknown,
    ttlHours: number = 48,
  ): Promise<void> {
    if (!idempotencyKey) {
      return;
    }

    const requestHash = this.hashPayload(payload);
    const serializedBody = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    const existing = await this.prisma.idempotencyRecord.findFirst({
      where: {
        hospitalId,
        idempotencyKey,
      },
    });

    if (existing) {
      await this.prisma.idempotencyRecord.update({
        where: { id: existing.id },
        data: {
          requestHash,
          responseStatus,
          responseBody: serializedBody,
          expiresAt,
        },
      });
    } else {
      await this.prisma.idempotencyRecord.create({
        data: {
          hospitalId,
          idempotencyKey,
          endpoint,
          requestHash,
          responseStatus,
          responseBody: serializedBody,
          expiresAt,
        },
      });
    }
  }
}
