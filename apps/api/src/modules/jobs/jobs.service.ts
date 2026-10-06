import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobsQueueService } from './jobs-queue.service';
import { JobsWorkerService } from './jobs-worker.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private internalWorker?: JobsWorkerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly jobsQueueService?: JobsQueueService,
    @Optional() private readonly jobsWorkerService?: JobsWorkerService,
  ) {
    if (!this.jobsWorkerService) {
      this.internalWorker = new JobsWorkerService(
        new ConfigService(),
        this.prisma,
        this.notificationsService,
      );
    }
  }

  private get worker(): JobsWorkerService {
    return this.jobsWorkerService || this.internalWorker!;
  }

  /**
   * Enqueues appointment reminders scan asynchronously into BullMQ scans queue.
   */
  async enqueueAppointmentReminders(
    hospitalId: string,
    appointmentId?: string,
  ): Promise<{ jobId: string; queue: string }> {
    if (this.jobsQueueService) {
      return this.jobsQueueService.enqueueAppointmentReminders(hospitalId, appointmentId);
    }
    return { jobId: `direct-${Date.now()}`, queue: 'scans' };
  }

  /**
   * Enqueues pharmacy batch expiry scan into BullMQ scans queue.
   */
  async enqueueExpiryScan(
    hospitalId: string,
    windowDays = 30,
  ): Promise<{ jobId: string; queue: string }> {
    if (this.jobsQueueService) {
      return this.jobsQueueService.enqueueExpiryScan(hospitalId, windowDays);
    }
    return { jobId: `direct-${Date.now()}`, queue: 'scans' };
  }

  /**
   * Enqueues inventory low-stock replenishment alert scan into BullMQ.
   */
  async enqueueLowStockScan(hospitalId: string): Promise<{ jobId: string; queue: string }> {
    if (this.jobsQueueService) {
      return this.jobsQueueService.enqueueLowStockScan(hospitalId);
    }
    return { jobId: `direct-${Date.now()}`, queue: 'scans' };
  }

  /**
   * Enqueues appointment no-show batch processor into BullMQ.
   */
  async enqueueNoShowProcessing(hospitalId: string): Promise<{ jobId: string; queue: string }> {
    if (this.jobsQueueService) {
      return this.jobsQueueService.enqueueNoShowProcessing(hospitalId);
    }
    return { jobId: `direct-${Date.now()}`, queue: 'scans' };
  }

  /**
   * Process appointment reminders (worker handler).
   */
  async processAppointmentReminders(
    hospitalId?: string,
    appointmentId?: string,
  ): Promise<{ checkedCount: number; dispatchedCount: number }> {
    return this.worker.handleAppointmentReminders({
      hospitalId: hospitalId || '',
      appointmentId,
      enqueuedAt: new Date().toISOString(),
    });
  }

  /**
   * Process pharmacy batch expiry scan (worker handler).
   */
  async scanExpiringMedications(
    hospitalId?: string,
    windowDays = 30,
  ): Promise<{ expiringBatchCount: number; alertCount: number }> {
    return this.worker.handleExpiryScan({
      hospitalId: hospitalId || '',
      windowDays,
      enqueuedAt: new Date().toISOString(),
    });
  }
}
