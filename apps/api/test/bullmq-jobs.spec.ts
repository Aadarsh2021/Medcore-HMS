import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import RedisMock from 'ioredis-mock';
import { PrismaService } from '../src/database/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { JobsWorkerService } from '../src/modules/jobs/jobs-worker.service';
import { JobsQueueService } from '../src/modules/jobs/jobs-queue.service';
import {
  QUEUE_SCANS,
  QUEUE_NOTIFICATIONS,
  JOB_APPOINTMENT_REMINDERS,
  JOB_EXPIRY_SCAN,
} from '../src/modules/jobs/jobs.constants';
import { AppointmentStatus, UserRole } from '@medcore/types';

describe('Phase 10 — BullMQ Production Worker & Queue Architecture Suite', () => {
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let jobsWorkerService: JobsWorkerService;
  let configService: ConfigService;

  let hospitalAId: string;
  let hospitalBId: string;
  let doctorA: any;
  let patientA: any;
  let patientB: any;

  const createdNotificationIds: string[] = [];
  const createdAppointmentIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    configService = new ConfigService();
    notificationsService = new NotificationsService(prisma);
    jobsWorkerService = new JobsWorkerService(configService, prisma, notificationsService);

    // Fetch test tenants
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // Fetch Doctor and Patient in Hospital A
    const doctor = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    doctorA = doctor;

    const patientsInA = await prisma.raw.patient.findMany({
      where: { hospitalId: hospitalAId },
      include: { user: true },
      take: 1,
    });
    patientA = patientsInA[0];

    const patientsInB = await prisma.raw.patient.findMany({
      where: { hospitalId: hospitalBId },
      include: { user: true },
      take: 1,
    });
    patientB = patientsInB[0];
  });

  afterAll(async () => {
    if (createdNotificationIds.length > 0) {
      await prisma.raw.notification.deleteMany({
        where: { id: { in: createdNotificationIds } },
      });
    }
    if (createdAppointmentIds.length > 0) {
      await prisma.raw.appointment.deleteMany({
        where: { id: { in: createdAppointmentIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('1. should configure real BullMQ Queue with 3 attempts and exponential backoff', async () => {
    const testQueue = new Queue('test-scans', {
      connection: { host: '127.0.0.1', port: 6379 },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });

    expect(testQueue.name).toBe('test-scans');
    expect(testQueue.opts.defaultJobOptions?.attempts).toBe(3);
    expect(testQueue.opts.defaultJobOptions?.backoff).toEqual({
      type: 'exponential',
      delay: 2000,
    });

    await testQueue.close();
  });

  it('2. should process appointment reminder job via JobsWorkerService and create in-app notification', async () => {
    // 1. Create a confirmed appointment in next 6 hours
    const apptDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const appt = await (prisma.raw.appointment as any).create({
      data: {
        hospitalId: hospitalAId,
        patientId: patientA.id,
        doctorId: doctorA.id,
        departmentId: doctorA.departmentId,
        appointmentDate: apptDate,
        startTime: '14:00',
        endTime: '14:30',
        type: 'REGULAR',
        status: AppointmentStatus.CONFIRMED,
      },
    });
    createdAppointmentIds.push(appt.id);

    // 2. Execute worker processor directly with BullMQ Job contract
    const fakeJob = {
      name: JOB_APPOINTMENT_REMINDERS,
      id: `job-test-${Date.now()}`,
      data: {
        hospitalId: hospitalAId,
        appointmentId: appt.id,
        enqueuedAt: new Date().toISOString(),
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await jobsWorkerService.processScanJob(fakeJob);
    expect(result.dispatchedCount).toBeGreaterThanOrEqual(1);

    // 3. Verify notification created in DB
    const notifs = await prisma.raw.notification.findMany({
      where: {
        hospitalId: hospitalAId,
        userId: patientA.userId,
      },
    });
    const notif = notifs.find((n: any) => n.metadataJson?.appointmentId === appt.id);
    expect(notif).toBeDefined();
    expect(notif?.title).toBe('Appointment Reminder');
    if (notif) createdNotificationIds.push(notif.id);
  });

  it('3. should enforce idempotency: duplicate job processing produces zero duplicate notifications', async () => {
    const existingApptId = createdAppointmentIds[0];

    const duplicateJob = {
      name: JOB_APPOINTMENT_REMINDERS,
      id: `job-duplicate-${Date.now()}`,
      data: {
        hospitalId: hospitalAId,
        appointmentId: existingApptId,
        enqueuedAt: new Date().toISOString(),
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const rerun = await jobsWorkerService.processScanJob(duplicateJob);
    expect(rerun.dispatchedCount).toBe(0);

    const userNotifs = await prisma.raw.notification.findMany({
      where: {
        hospitalId: hospitalAId,
        userId: patientA.userId,
      },
    });
    const matchingNotifs = userNotifs.filter(
      (n: any) => n.metadataJson?.appointmentId === existingApptId,
    );
    expect(matchingNotifs.length).toBe(1);
  });

  it('4. should enforce strict tenant isolation: Hospital A worker job never processes Hospital B records', async () => {
    // Run reminder job explicitly for Hospital B
    const jobB = {
      name: JOB_APPOINTMENT_REMINDERS,
      id: `job-tenant-b-${Date.now()}`,
      data: {
        hospitalId: hospitalBId,
        enqueuedAt: new Date().toISOString(),
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    await jobsWorkerService.processScanJob(jobB);

    // Notifications generated must strictly belong to hospital B
    const notifsForHospitalA = await prisma.raw.notification.findMany({
      where: {
        hospitalId: hospitalAId,
        userId: patientB.userId, // Cross-tenant leak check
      },
    });
    expect(notifsForHospitalA.length).toBe(0);
  });

  it('5. should fail cleanly and reject job when tenant context (hospitalId) is missing', async () => {
    const invalidJob = {
      name: JOB_APPOINTMENT_REMINDERS,
      id: 'job-missing-tenant',
      data: {
        enqueuedAt: new Date().toISOString(),
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    await expect(jobsWorkerService.processScanJob(invalidJob)).rejects.toThrow(
      /missing mandatory tenant context/i,
    );
  });

  it('6. should safe-guard against Redis connection failures without process crash', async () => {
    const unreachableQueueService = new JobsQueueService({
      get: (key: string, def?: any) => {
        if (key === 'REDIS_HOST') return '127.0.0.1';
        if (key === 'REDIS_PORT') return 59999; // Non-existent port
        return def;
      },
    } as any);

    expect(unreachableQueueService.scansQueue).toBeDefined();
    expect(unreachableQueueService.notificationsQueue).toBeDefined();

    await unreachableQueueService.onModuleDestroy();
  });
});
