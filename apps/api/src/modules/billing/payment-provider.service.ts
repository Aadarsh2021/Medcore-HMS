import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { WebhookProcessingStatus } from '@prisma/client';

export interface ProviderOrderResult {
  provider: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
}

export interface ParsedWebhookEvent {
  provider: string;
  eventId: string;
  eventType: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  amount?: number;
  currency?: string;
  status: 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'OTHER';
  rawPayload: any;
}

@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a payment order for supported online gateways.
   * For MANUAL payments, order creation is skipped.
   */
  async createPaymentOrder(
    provider: string,
    amount: number,
    currency: string = 'INR',
    receipt: string,
  ): Promise<ProviderOrderResult> {
    const prov = provider.toUpperCase();

    if (prov === 'MANUAL' || prov === 'CASH' || prov === 'UPI') {
      return {
        provider: 'MANUAL',
        orderId: `ORD-MANUAL-${Date.now()}`,
        amount,
        currency,
      };
    }

    if (prov === 'RAZORPAY') {
      // Razorpay order structure (requires RAZORPAY_KEY_ID / SECRET in production)
      const mockOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
      return {
        provider: 'RAZORPAY',
        orderId: mockOrderId,
        amount: Math.round(amount * 100), // paise
        currency,
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
      };
    }

    if (prov === 'STRIPE') {
      const mockPaymentIntentId = `pi_${crypto.randomBytes(12).toString('hex')}`;
      return {
        provider: 'STRIPE',
        orderId: mockPaymentIntentId,
        amount: Math.round(amount * 100), // cents
        currency,
        keyId: process.env.STRIPE_PUBLIC_KEY || 'pk_test_placeholder',
      };
    }

    throw new BadRequestException(`Unsupported payment provider: ${provider}`);
  }

  /**
   * Cryptographically verifies HMAC signatures for Razorpay & Stripe webhooks.
   */
  verifyWebhookSignature(
    provider: string,
    payloadString: string,
    signature: string | undefined,
    secretOverride?: string,
  ): boolean {
    const prov = provider.toUpperCase();
    if (!signature) return false;

    if (prov === 'RAZORPAY') {
      const secret = secretOverride || process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) {
        this.logger.warn('Razorpay webhook secret not configured');
        return false;
      }
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
      const signatureBuffer = Buffer.from(signature, 'utf-8');
      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    }

    if (prov === 'STRIPE') {
      const secret = secretOverride || process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        this.logger.warn('Stripe webhook secret not configured');
        return false;
      }

      // Stripe signature format: t=timestamp,v1=signature
      const parts = signature.split(',').reduce((acc, part) => {
        const [k, v] = part.split('=');
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      }, {} as Record<string, string>);

      if (!parts.t || !parts.v1) return false;

      const signedPayload = `${parts.t}.${payloadString}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
      const signatureBuffer = Buffer.from(parts.v1, 'utf-8');
      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    }

    return false;
  }

  /**
   * Parses raw provider webhook payload into normalized MedCore event format.
   */
  parseWebhook(provider: string, body: any): ParsedWebhookEvent {
    const prov = provider.toUpperCase();

    if (prov === 'RAZORPAY') {
      const event = body.event || 'unknown';
      const paymentEntity = body.payload?.payment?.entity;
      const eventId = body.id || `rzp_evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      let status: ParsedWebhookEvent['status'] = 'OTHER';
      if (event === 'payment.captured' || event === 'order.paid') {
        status = 'SUCCEEDED';
      } else if (event === 'payment.failed') {
        status = 'FAILED';
      } else if (event === 'refund.processed') {
        status = 'REFUNDED';
      }

      return {
        provider: 'RAZORPAY',
        eventId,
        eventType: event,
        providerPaymentId: paymentEntity?.id,
        providerOrderId: paymentEntity?.order_id,
        amount: paymentEntity?.amount ? paymentEntity.amount / 100 : undefined,
        currency: paymentEntity?.currency || 'INR',
        status,
        rawPayload: body,
      };
    }

    if (prov === 'STRIPE') {
      const eventId = body.id;
      const eventType = body.type;
      const dataObj = body.data?.object;

      let status: ParsedWebhookEvent['status'] = 'OTHER';
      if (eventType === 'payment_intent.succeeded' || eventType === 'charge.succeeded') {
        status = 'SUCCEEDED';
      } else if (eventType === 'payment_intent.payment_failed') {
        status = 'FAILED';
      } else if (eventType === 'charge.refunded') {
        status = 'REFUNDED';
      }

      return {
        provider: 'STRIPE',
        eventId,
        eventType,
        providerPaymentId: dataObj?.id,
        providerOrderId: dataObj?.metadata?.orderId || dataObj?.payment_intent,
        amount: dataObj?.amount ? dataObj.amount / 100 : undefined,
        currency: dataObj?.currency ? dataObj.currency.toUpperCase() : 'INR',
        status,
        rawPayload: body,
      };
    }

    throw new BadRequestException(`Unrecognized webhook provider: ${provider}`);
  }

  /**
   * Records inbound webhook event for idempotency and replay auditing.
   * Returns false if event was already processed (duplicate).
   */
  async recordWebhookEvent(
    event: ParsedWebhookEvent,
    rawBody: string,
    hospitalId?: string,
  ): Promise<{ isDuplicate: boolean; eventRecordId: string }> {
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    const existing = await this.prisma.raw.paymentProviderEvent.findUnique({
      where: { eventId: event.eventId },
    });

    if (existing) {
      return { isDuplicate: true, eventRecordId: existing.id };
    }

    const created = await this.prisma.raw.paymentProviderEvent.create({
      data: {
        hospitalId: hospitalId || null,
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.eventType,
        payloadHash,
        payload: event.rawPayload,
        processingStatus: WebhookProcessingStatus.PENDING,
      },
    });

    return { isDuplicate: false, eventRecordId: created.id };
  }

  /**
   * Updates webhook processing status upon completion.
   */
  async markWebhookProcessed(
    eventRecordId: string,
    status: WebhookProcessingStatus,
    failureReason?: string,
  ): Promise<void> {
    await this.prisma.raw.paymentProviderEvent.update({
      where: { id: eventRecordId },
      data: {
        processingStatus: status,
        failureReason: failureReason || null,
        processedAt: new Date(),
      },
    });
  }
}
