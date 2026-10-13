import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, ConnectionOptions } from 'bullmq';
import {
  QUEUE_NOTIFICATIONS,
  QUEUE_REPORTS,
  QUEUE_SCANS,
  JOB_APPOINTMENT_REMINDERS,
  JOB_EXPIRY_SCAN,
  JOB_LOW_STOCK_SCAN,
  JOB_NO_SHOW_PROCESSING,
  JOB_NOTIFICATION_DISPATCH,
} from './jobs.constants';
import {
  AppointmentReminderJobPayload,
  ExpiryScanJobPayload,
  LowStockScanJobPayload,
  NoShowProcessingJobPayload,
  NotificationDispatchJobPayload,
} from './jobs.types';

@Injectable()
export class JobsQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(JobsQueueService.name);

  public readonly scansQueue: Queue;
  public readonly notificationsQueue: Queue;
  public readonly reportsQueue: Queue;
  public isRedisHealthy = true;

  constructor(private readonly configService: ConfigService) {
    let connection: ConnectionOptions;
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      try {
        const cleanUrl = redisUrl.replace(/^["']|["']$/g, '').trim();
        const parsed = new URL(cleanUrl);
        const isTls = parsed.protocol === 'rediss:';
        connection = {
          host: parsed.hostname,
          port: parsed.port ? Number(parsed.port) : 6379,
          username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
          password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
          tls: isTls ? { rejectUnauthorized: false } : undefined,
          maxRetriesPerRequest: null,
          connectTimeout: 10000,
        };
      } catch (err: any) {
        this.logger.error(`Invalid REDIS_URL format: ${err.message}. Falling back to individual host/port configs.`);
        connection = {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          password: this.configService.get<string>('REDIS_PASSWORD', undefined) || undefined,
          maxRetriesPerRequest: null,
          connectTimeout: 10000,
        };
      }
    } else {
      connection = {
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD', undefined) || undefined,
        maxRetriesPerRequest: null,
        connectTimeout: 10000,
      };
    }

    const defaultJobOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    };

    this.scansQueue = new Queue(QUEUE_SCANS, {
      connection,
      defaultJobOptions,
    });

    this.notificationsQueue = new Queue(QUEUE_NOTIFICATIONS, {
      connection,
      defaultJobOptions,
    });

    this.reportsQueue = new Queue(QUEUE_REPORTS, {
      connection,
      defaultJobOptions,
    });

    this.scansQueue.on('error', (err) => {
      this.isRedisHealthy = false;
      this.logger.warn(`BullMQ scans queue connection warning: ${err.message}`);
    });
    this.notificationsQueue.on('error', (err) => {
      this.isRedisHealthy = false;
      this.logger.warn(`BullMQ notifications queue connection warning: ${err.message}`);
    });
    this.reportsQueue.on('error', (err) => {
      this.isRedisHealthy = false;
      this.logger.warn(`BullMQ reports queue connection warning: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await Promise.allSettled([
        this.scansQueue.close(),
        this.notificationsQueue.close(),
        this.reportsQueue.close(),
      ]);
      this.logger.log('Closed all BullMQ queue connections cleanly');
    } catch (err: any) {
      this.logger.warn(`Error closing BullMQ queues: ${err.message}`);
    }
  }

  /**
   * Safe queue addition with bounded timeout (defaults to 5000ms).
   * Prevents HTTP requests from hanging indefinitely when Redis is unprovisioned or unreachable.
   */
  async addWithTimeout(
    queue: Queue,
    name: string,
    payload: any,
    opts?: any,
    timeoutMs = 5000,
  ): Promise<any> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        this.isRedisHealthy = false;
        reject(
          new ServiceUnavailableException(
            `Queue operation timed out after ${timeoutMs}ms. Redis connection is unreachable.`,
          ),
        );
      }, timeoutMs);
    });

    const addPromise = queue.add(name, payload, opts);
    // Suppress unhandledRejection if addPromise rejects after timeoutPromise has already settled
    addPromise.catch((err) => {
      this.logger.debug(`Background queue.add settled after timeout or error: ${err?.message}`);
    });

    try {
      const job = await Promise.race([
        addPromise,
        timeoutPromise,
      ]);
      clearTimeout(timeoutId!);
      this.isRedisHealthy = true;
      return job;
    } catch (err: any) {
      clearTimeout(timeoutId!);
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      this.isRedisHealthy = false;
      this.logger.error(`BullMQ queue.add failed: ${err.message}`);
      throw new ServiceUnavailableException(
        `Background queue service unavailable: ${err.message}. Verify Redis connectivity.`,
      );
    }
  }

  /**
   * Enqueues appointment reminders scan for hospital tenant.
   * Uses deterministic jobId (e.g. appointment-reminders:hospitalId:YYYY-MM-DD-HH)
   * to guarantee idempotency across concurrent/duplicate calls.
   */
  async enqueueAppointmentReminders(
    hospitalId: string,
    appointmentId?: string,
  ): Promise<{ jobId: string; queue: string }> {
    const todayHour = new Date().toISOString().slice(0, 13);
    const deterministicId = appointmentId
      ? `${JOB_APPOINTMENT_REMINDERS}:${hospitalId}:${appointmentId}`
      : `${JOB_APPOINTMENT_REMINDERS}:${hospitalId}:${todayHour}`;

    const payload: AppointmentReminderJobPayload = {
      hospitalId,
      appointmentId,
      enqueuedAt: new Date().toISOString(),
    };

    const job = await this.addWithTimeout(this.scansQueue, JOB_APPOINTMENT_REMINDERS, payload, {
      jobId: deterministicId,
    });

    this.logger.log(`Enqueued ${JOB_APPOINTMENT_REMINDERS} [ID: ${job.id}] for tenant: ${hospitalId}`);
    return { jobId: job.id || deterministicId, queue: QUEUE_SCANS };
  }

  /**
   * Enqueues nightly pharmacy batch expiry scan with daily deduplication ID.
   */
  async enqueueExpiryScan(
    hospitalId: string,
    windowDays = 30,
  ): Promise<{ jobId: string; queue: string }> {
    const today = new Date().toISOString().split('T')[0];
    const deterministicId = `${JOB_EXPIRY_SCAN}:${hospitalId}:${today}`;

    const payload: ExpiryScanJobPayload = {
      hospitalId,
      windowDays,
      enqueuedAt: new Date().toISOString(),
    };

    const job = await this.addWithTimeout(this.scansQueue, JOB_EXPIRY_SCAN, payload, {
      jobId: deterministicId,
    });

    this.logger.log(`Enqueued ${JOB_EXPIRY_SCAN} [ID: ${job.id}] for tenant: ${hospitalId}`);
    return { jobId: job.id || deterministicId, queue: QUEUE_SCANS };
  }

  /**
   * Enqueues inventory low-stock replenishment alert scan.
   */
  async enqueueLowStockScan(hospitalId: string): Promise<{ jobId: string; queue: string }> {
    const todayHour = new Date().toISOString().slice(0, 13);
    const deterministicId = `${JOB_LOW_STOCK_SCAN}:${hospitalId}:${todayHour}`;

    const payload: LowStockScanJobPayload = {
      hospitalId,
      enqueuedAt: new Date().toISOString(),
    };

    const job = await this.addWithTimeout(this.scansQueue, JOB_LOW_STOCK_SCAN, payload, {
      jobId: deterministicId,
    });

    this.logger.log(`Enqueued ${JOB_LOW_STOCK_SCAN} [ID: ${job.id}] for tenant: ${hospitalId}`);
    return { jobId: job.id || deterministicId, queue: QUEUE_SCANS };
  }

  /**
   * Enqueues appointment no-show batch processor.
   */
  async enqueueNoShowProcessing(hospitalId: string): Promise<{ jobId: string; queue: string }> {
    const todayHour = new Date().toISOString().slice(0, 13);
    const deterministicId = `${JOB_NO_SHOW_PROCESSING}:${hospitalId}:${todayHour}`;

    const payload: NoShowProcessingJobPayload = {
      hospitalId,
      enqueuedAt: new Date().toISOString(),
    };

    const job = await this.addWithTimeout(this.scansQueue, JOB_NO_SHOW_PROCESSING, payload, {
      jobId: deterministicId,
    });

    this.logger.log(`Enqueued ${JOB_NO_SHOW_PROCESSING} [ID: ${job.id}] for tenant: ${hospitalId}`);
    return { jobId: job.id || deterministicId, queue: QUEUE_SCANS };
  }

  /**
   * Enqueues async notification dispatch via BullMQ.
   */
  async enqueueNotificationDispatch(
    payload: NotificationDispatchJobPayload,
  ): Promise<{ jobId: string; queue: string }> {
    const job = await this.addWithTimeout(this.notificationsQueue, JOB_NOTIFICATION_DISPATCH, payload);
    return { jobId: job.id || 'unknown', queue: QUEUE_NOTIFICATIONS };
  }
}
