import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
    const connection: ConnectionOptions = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', undefined) || undefined,
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
    };

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

    // Error handlers to prevent unhandled Redis connection crashes
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

    const job = await this.scansQueue.add(JOB_APPOINTMENT_REMINDERS, payload, {
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

    const job = await this.scansQueue.add(JOB_EXPIRY_SCAN, payload, {
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

    const job = await this.scansQueue.add(JOB_LOW_STOCK_SCAN, payload, {
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

    const job = await this.scansQueue.add(JOB_NO_SHOW_PROCESSING, payload, {
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
    const job = await this.notificationsQueue.add(JOB_NOTIFICATION_DISPATCH, payload);
    return { jobId: job.id || 'unknown', queue: QUEUE_NOTIFICATIONS };
  }
}
