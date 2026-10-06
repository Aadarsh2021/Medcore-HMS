import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job, ConnectionOptions } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  QUEUE_NOTIFICATIONS,
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
import { NotificationChannel, UserRole, AppointmentStatus } from '@medcore/types';

@Injectable()
export class JobsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsWorkerService.name);

  public scansWorker?: Worker;
  public notificationsWorker?: Worker;
  private readonly connection: ConnectionOptions;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.connection = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', undefined) || undefined,
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
    };
  }

  async onModuleInit(): Promise<void> {
    try {
      this.initWorkers();
    } catch (err: any) {
      this.logger.warn(`Failed to initialize BullMQ workers: ${err.message}`);
    }
  }

  initWorkers(customConnection?: ConnectionOptions | any): void {
    const conn = customConnection || this.connection;

    // 1. Scans Queue Worker
    this.scansWorker = new Worker(
      QUEUE_SCANS,
      async (job: Job) => {
        this.logger.log(`Processing Job [${job.name}] ID: ${job.id} (Attempt ${job.attemptsMade + 1})`);
        return this.processScanJob(job);
      },
      {
        connection: conn,
        concurrency: 5,
      },
    );

    this.scansWorker.on('completed', (job: Job, returnvalue: any) => {
      this.logger.log(`Job Completed [${job.name}] ID: ${job.id}. Result: ${JSON.stringify(returnvalue)}`);
    });

    this.scansWorker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(
        `Job Failed [${job?.name}] ID: ${job?.id} Attempts: ${job?.attemptsMade}/${job?.opts.attempts}. Error: ${err.message}`,
        err.stack,
      );
    });

    this.scansWorker.on('error', (err: Error) => {
      this.logger.warn(`BullMQ scans worker connection error: ${err.message}`);
    });

    // 2. Notifications Queue Worker
    this.notificationsWorker = new Worker(
      QUEUE_NOTIFICATIONS,
      async (job: Job) => {
        this.logger.log(`Processing Notification Job ID: ${job.id}`);
        return this.processNotificationJob(job);
      },
      {
        connection: conn,
        concurrency: 10,
      },
    );

    this.notificationsWorker.on('completed', (job: Job) => {
      this.logger.log(`Notification Job Completed ID: ${job.id}`);
    });

    this.notificationsWorker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Notification Job Failed ID: ${job?.id}: ${err.message}`);
    });

    this.notificationsWorker.on('error', (err: Error) => {
      this.logger.warn(`BullMQ notifications worker connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await Promise.allSettled([
        this.scansWorker?.close(),
        this.notificationsWorker?.close(),
      ]);
      this.logger.log('Closed BullMQ workers cleanly');
    } catch (err: any) {
      this.logger.warn(`Error closing BullMQ workers: ${err.message}`);
    }
  }

  /**
   * Router for scan jobs. Enforces tenant context preservation.
   */
  async processScanJob(job: Job): Promise<any> {
    const { hospitalId } = job.data;
    if (!hospitalId) {
      throw new Error(`Job ${job.name} missing mandatory tenant context (hospitalId)`);
    }

    switch (job.name) {
      case JOB_APPOINTMENT_REMINDERS:
        return this.handleAppointmentReminders(job.data as AppointmentReminderJobPayload);
      case JOB_EXPIRY_SCAN:
        return this.handleExpiryScan(job.data as ExpiryScanJobPayload);
      case JOB_LOW_STOCK_SCAN:
        return this.handleLowStockScan(job.data as LowStockScanJobPayload);
      case JOB_NO_SHOW_PROCESSING:
        return this.handleNoShowProcessing(job.data as NoShowProcessingJobPayload);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  }

  async processNotificationJob(job: Job): Promise<any> {
    const data = job.data as NotificationDispatchJobPayload;
    if (!data.hospitalId || !data.userId) {
      throw new Error('Notification job missing hospitalId or userId');
    }

    return this.notificationsService.createNotification({
      hospitalId: data.hospitalId,
      userId: data.userId,
      title: data.title,
      message: data.message,
      channel: data.channel || NotificationChannel.IN_APP,
      metadataJson: data.metadataJson || {},
    });
  }

  /**
   * Worker handler: Scans appointments scheduled in next 24 hours.
   * Strictly enforces tenant boundary (hospitalId).
   */
  async handleAppointmentReminders(
    payload: AppointmentReminderJobPayload,
  ): Promise<{ checkedCount: number; dispatchedCount: number }> {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const where: any = {
      hospitalId: payload.hospitalId,
      appointmentDate: { gte: now, lte: next24h },
      status: AppointmentStatus.CONFIRMED,
    };
    if (payload.appointmentId) {
      where.id = payload.appointmentId;
    }

    const appointments = await this.prisma.raw.appointment.findMany({
      where,
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
      },
    });

    let dispatchedCount = 0;

    for (const appt of appointments) {
      const patientUserId = appt.patient?.userId;
      if (!patientUserId) continue;

      // Idempotency check: verify notification was not already created for this appointment
      const existing = await this.prisma.raw.notification.findFirst({
        where: {
          hospitalId: payload.hospitalId,
          userId: patientUserId,
          metadataJson: {
            path: ['appointmentId'],
            equals: appt.id,
          },
        },
      });

      if (!existing) {
        const timeStr = appt.startTime;
        const dateStr = appt.appointmentDate.toISOString().split('T')[0];
        const doctorName = `Dr. ${appt.doctor.user.firstName} ${appt.doctor.user.lastName}`;

        await this.notificationsService.createNotification({
          hospitalId: payload.hospitalId,
          userId: patientUserId,
          title: 'Appointment Reminder',
          message: `Reminder: You have an upcoming consultation with ${doctorName} on ${dateStr} at ${timeStr}.`,
          channel: NotificationChannel.IN_APP,
          metadataJson: {
            type: 'APPOINTMENT_REMINDER',
            appointmentId: appt.id,
          },
        });
        dispatchedCount++;
      }
    }

    return { checkedCount: appointments.length, dispatchedCount };
  }

  /**
   * Worker handler: Pharmacy batch expiry scan (30-day window).
   * Strictly enforces tenant boundary (hospitalId).
   */
  async handleExpiryScan(
    payload: ExpiryScanJobPayload,
  ): Promise<{ expiringBatchCount: number; alertCount: number }> {
    const now = new Date();
    const windowDays = payload.windowDays || 30;
    const futureLimit = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    const expiringBatches = await this.prisma.raw.medicineBatch.findMany({
      where: {
        hospitalId: payload.hospitalId,
        expiryDate: { gte: now, lte: futureLimit },
        currentQuantity: { gt: 0 },
        isQuarantined: false,
      },
      include: {
        medicine: true,
      },
    });

    let alertCount = 0;

    for (const batch of expiringBatches) {
      const pharmacists = await this.prisma.raw.user.findMany({
        where: {
          hospitalId: payload.hospitalId,
          role: { in: [UserRole.PHARMACIST as any, UserRole.HOSPITAL_ADMIN as any] },
          isActive: true,
        },
      });

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      for (const pharmacist of pharmacists) {
        const alreadySent = await this.prisma.raw.notification.findFirst({
          where: {
            hospitalId: payload.hospitalId,
            userId: pharmacist.id,
            createdAt: { gte: startOfToday },
            metadataJson: {
              path: ['batchId'],
              equals: batch.id,
            },
          },
        });

        if (!alreadySent) {
          const expiryStr = batch.expiryDate.toISOString().split('T')[0];
          await this.notificationsService.createNotification({
            hospitalId: payload.hospitalId,
            userId: pharmacist.id,
            title: 'Pharmacy Alert: Expiring Medicine Stock',
            message: `Batch ${batch.batchNumber} of ${batch.medicine.name} (${batch.currentQuantity} units) expires on ${expiryStr}.`,
            channel: NotificationChannel.IN_APP,
            metadataJson: {
              type: 'EXPIRY_ALERT',
              batchId: batch.id,
              medicineId: batch.medicineId,
            },
          });
          alertCount++;
        }
      }
    }

    return { expiringBatchCount: expiringBatches.length, alertCount };
  }

  /**
   * Worker handler: Scans for low stock inventory below reorder point.
   * Strictly enforces tenant boundary (hospitalId).
   */
  async handleLowStockScan(
    payload: LowStockScanJobPayload,
  ): Promise<{ lowStockCount: number; alertCount: number }> {
    // Find medicines where currentStock <= reorderLevel
    const lowStockMedicines = await (this.prisma.raw.medicine as any).findMany({
      where: {
        hospitalId: payload.hospitalId,
      },
      include: {
        batches: true,
      },
    });

    const flagged = lowStockMedicines.filter((m: any) => {
      const totalStock = (m.batches || []).reduce((sum: number, b: any) => sum + (b.currentQuantity || 0), 0);
      return totalStock <= (m.reorderLevel || 10);
    });

    let alertCount = 0;

    if (flagged.length > 0) {
      const staff = await this.prisma.raw.user.findMany({
        where: {
          hospitalId: payload.hospitalId,
          role: { in: [UserRole.PHARMACIST as any, UserRole.HOSPITAL_ADMIN as any] },
          isActive: true,
        },
      });

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      for (const med of flagged) {
        for (const user of staff) {
          const alreadySent = await this.prisma.raw.notification.findFirst({
            where: {
              hospitalId: payload.hospitalId,
              userId: user.id,
              createdAt: { gte: startOfToday },
              metadataJson: {
                path: ['medicineId'],
                equals: med.id,
              },
            },
          });

          if (!alreadySent) {
            await this.notificationsService.createNotification({
              hospitalId: payload.hospitalId,
              userId: user.id,
              title: 'Pharmacy Alert: Low Stock Warning',
              message: `${med.name} stock level is low (reorder threshold: ${med.reorderLevel}).`,
              channel: NotificationChannel.IN_APP,
              metadataJson: {
                type: 'LOW_STOCK_ALERT',
                medicineId: med.id,
              },
            });
            alertCount++;
          }
        }
      }
    }

    return { lowStockCount: flagged.length, alertCount };
  }

  /**
   * Worker handler: Automatically transitions past scheduled appointments to NO_SHOW.
   * Strictly enforces tenant boundary (hospitalId).
   */
  async handleNoShowProcessing(
    payload: NoShowProcessingJobPayload,
  ): Promise<{ updatedCount: number }> {
    const cutoff = payload.cutoffDate ? new Date(payload.cutoffDate) : new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours overdue

    const pastAppointments = await (this.prisma.raw.appointment as any).findMany({
      where: {
        hospitalId: payload.hospitalId,
        appointmentDate: { lte: cutoff },
        status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
      },
    });

    if (pastAppointments.length === 0) {
      return { updatedCount: 0 };
    }

    const ids = pastAppointments.map((a: any) => a.id);
    const updateRes = await this.prisma.raw.appointment.updateMany({
      where: {
        id: { in: ids },
        hospitalId: payload.hospitalId,
      },
      data: {
        status: AppointmentStatus.NO_SHOW,
      },
    });

    return { updatedCount: updateRes.count };
  }
}
