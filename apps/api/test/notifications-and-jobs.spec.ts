import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { NotificationsController } from '../src/modules/notifications/notifications.controller';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuditController } from '../src/modules/audit/audit.controller';
import { JobsService } from '../src/modules/jobs/jobs.service';
import { JobsController } from '../src/modules/jobs/jobs.controller';
import { UserRole, NotificationChannel, NotificationStatus } from '@medcore/types';

describe('Phase 6 & Phase 10 — Notifications, Audit & Background Jobs Suite', () => {
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let notificationsController: NotificationsController;
  let auditService: AuditService;
  let auditController: AuditController;
  let jobsService: JobsService;
  let jobsController: JobsController;

  let hospitalAId: string;
  let hospitalBId: string;
  let hospitalAdminA: { id: string; role: string; hospitalId: string };
  let doctorA: { id: string; role: string; hospitalId: string };
  let patientA: { id: string; userId: string };
  let superAdminUser: { id: string; role: string };

  const createdNotificationIds: string[] = [];
  const createdBatchIds: string[] = [];
  const createdMedicineIds: string[] = [];
  const createdAppointmentIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    notificationsService = new NotificationsService(prisma);
    notificationsController = new NotificationsController(notificationsService);
    auditService = new AuditService(prisma);
    auditController = new AuditController(auditService);
    jobsService = new JobsService(prisma, notificationsService);
    jobsController = new JobsController(jobsService);

    // Fetch hospitals
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // Fetch Super Admin
    const superAdmin = await prisma.raw.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN as any },
    });
    superAdminUser = { id: superAdmin!.id, role: UserRole.SUPER_ADMIN };

    // Fetch Hospital Admin A
    const admin = await prisma.raw.user.findFirst({
      where: { hospitalId: hospitalAId, role: UserRole.HOSPITAL_ADMIN as any },
    });
    hospitalAdminA = { id: admin!.id, role: UserRole.HOSPITAL_ADMIN, hospitalId: hospitalAId };

    // Fetch Doctor A
    const doc = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    doctorA = { id: doc!.userId, role: UserRole.DOCTOR, hospitalId: hospitalAId };

    // Fetch Patient A
    const pat = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    patientA = { id: pat!.id, userId: pat!.userId };
  });

  afterAll(async () => {
    if (createdNotificationIds.length > 0) {
      await prisma.raw.notification.deleteMany({
        where: { id: { in: createdNotificationIds } },
      });
    }

    if (createdBatchIds.length > 0) {
      await prisma.raw.medicineBatch.deleteMany({
        where: { id: { in: createdBatchIds } },
      });
    }

    if (createdMedicineIds.length > 0) {
      await prisma.raw.medicine.deleteMany({
        where: { id: { in: createdMedicineIds } },
      });
    }

    if (createdAppointmentIds.length > 0) {
      await prisma.raw.appointment.deleteMany({
        where: { id: { in: createdAppointmentIds } },
      });
    }

    await prisma.$disconnect();
  });

  // ===========================================================================
  // SECTION 1: NOTIFICATIONS (PHASE 6)
  // ===========================================================================

  it('1. should create an in-app notification for a user with status SENT', async () => {
    const notif = await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: patientA.userId,
      title: 'Lab Report Available',
      message: 'Your Comprehensive Metabolic Panel results are ready for download.',
      channel: NotificationChannel.IN_APP as any,
      metadataJson: { testType: 'CMP', priority: 'ROUTINE' },
    });

    expect(notif.id).toBeDefined();
    expect(notif.userId).toBe(patientA.userId);
    expect(notif.status).toBe(NotificationStatus.SENT);
    expect(notif.readAt).toBeNull();
    createdNotificationIds.push(notif.id);
  });

  it('2. should enforce patient privacy: user only receives their own notifications', async () => {
    // Notification for Patient A
    const notifA = await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: patientA.userId,
      title: 'Confidential Medical Notice A',
      message: 'Notice for Patient A only',
    });
    createdNotificationIds.push(notifA.id);

    // Notification for Doctor A
    const notifDoc = await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: doctorA.id,
      title: 'Doctor Schedule Update',
      message: 'Notice for Doctor A',
    });
    createdNotificationIds.push(notifDoc.id);

    // Patient queries /notifications/me
    const patientFeed = await notificationsController.getMyNotifications(patientA.userId, {});
    expect(patientFeed.success).toBe(true);

    const receivedIds = patientFeed.data.map((n: any) => n.id);
    expect(receivedIds).toContain(notifA.id);
    expect(receivedIds).not.toContain(notifDoc.id);
  });

  it('3. should accurately report unread notification badge count', async () => {
    const initial = await notificationsController.getUnreadCount(patientA.userId);

    const freshNotif = await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: patientA.userId,
      title: 'Unread Counter Test',
      message: 'Test message',
    });
    createdNotificationIds.push(freshNotif.id);

    const updated = await notificationsController.getUnreadCount(patientA.userId);
    expect(updated.data.unreadCount).toBe(initial.data.unreadCount + 1);
  });

  it('4. should mark a notification as READ and record timestamp', async () => {
    const notif = await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: patientA.userId,
      title: 'Read Transition Test',
      message: 'Click to mark as read',
    });
    createdNotificationIds.push(notif.id);

    const res = await notificationsController.markAsRead(patientA.userId, notif.id);
    expect(res.success).toBe(true);
    expect(res.data.status).toBe(NotificationStatus.READ);
    expect(res.data.readAt).toBeDefined();

    // Verify DB
    const dbNotif = await prisma.raw.notification.findUnique({ where: { id: notif.id } });
    expect(dbNotif?.status).toBe(NotificationStatus.READ);
    expect(dbNotif?.readAt).not.toBeNull();
  });

  it('5. should prevent User B from marking User A notification as read (ownership protection)', async () => {
    const notifA = await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: patientA.userId,
      title: 'Protected Notification',
      message: 'Cannot be altered by other users',
    });
    createdNotificationIds.push(notifA.id);

    // Doctor A attempts to mark Patient A's notification as read
    await expect(
      notificationsController.markAsRead(doctorA.id, notifA.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('6. should mark all notifications as READ for user in bulk', async () => {
    await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: patientA.userId,
      title: 'Bulk 1',
      message: 'Bulk 1 message',
    });
    await notificationsService.createNotification({
      hospitalId: hospitalAId,
      userId: patientA.userId,
      title: 'Bulk 2',
      message: 'Bulk 2 message',
    });

    const bulkRes = await notificationsController.markAllAsRead(patientA.userId);
    expect(bulkRes.success).toBe(true);

    const remainingUnread = await notificationsController.getUnreadCount(patientA.userId);
    expect(remainingUnread.data.unreadCount).toBe(0);
  });

  // ===========================================================================
  // SECTION 2: AUDIT LOG COMPLIANCE & MULTI-TENANCY
  // ===========================================================================

  it('7. should allow Super Admin to query audit logs across all hospital tenants', async () => {
    const logs = await auditController.getAuditLogs(superAdminUser, {});
    expect(logs.success).toBe(true);
    expect(logs.data.length).toBeGreaterThan(0);
    expect(logs.data[0].id).toBeDefined();
    expect(logs.data[0].action).toBeDefined();
  });

  it('8. should enforce tenant isolation on Hospital Admin audit log queries', async () => {
    const logsA = await auditController.getAuditLogs(hospitalAdminA, {});
    expect(logsA.success).toBe(true);

    // Verify every returned log belongs strictly to Hospital A
    logsA.data.forEach((log: any) => {
      expect(log.hospitalId).toBe(hospitalAId);
    });
  });

  it('9. should reject audit log queries from non-administrative clinical roles (Doctor/Patient)', async () => {
    await expect(auditController.getAuditLogs(doctorA, {})).rejects.toThrow(ForbiddenException);
    await expect(
      auditController.getAuditLogs({ id: patientA.userId, role: UserRole.PATIENT }, {}),
    ).rejects.toThrow(ForbiddenException);
  });

  // ===========================================================================
  // SECTION 3: BACKGROUND JOBS (PHASE 10)
  // ===========================================================================

  it('10. should scan upcoming appointments and dispatch reminder notifications', async () => {
    // 1. Create appointment 4 hours from now
    const upcomingDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const doctorProfile = await prisma.raw.doctor.findFirst({
      where: { userId: doctorA.id },
    });

    const appt = await (prisma.raw.appointment as any).create({
      data: {
        hospitalId: hospitalAId,
        patientId: patientA.id,
        doctorId: doctorProfile!.id,
        departmentId: doctorProfile!.departmentId,
        appointmentDate: upcomingDate,
        startTime: '14:00',
        endTime: '14:30',
        type: 'REGULAR',
        status: 'CONFIRMED',
      },
    });
    createdAppointmentIds.push(appt.id);

    // 2. Trigger job
    const jobRes = await jobsController.triggerAppointmentReminders(hospitalAId);
    expect(jobRes.success).toBe(true);
    expect(jobRes.data.dispatchedCount).toBeGreaterThanOrEqual(1);

    // 3. Verify notification arrived in patient's feed
    const patientFeed = await notificationsController.getMyNotifications(patientA.userId, {});
    const reminder = patientFeed.data.find(
      (n: any) => n.metadataJson?.appointmentId === appt.id,
    );
    expect(reminder).toBeDefined();
    expect(reminder.title).toBe('Appointment Reminder');
    if (reminder) createdNotificationIds.push(reminder.id);

    // 4. Idempotency test: Run job again; it should NOT duplicate the reminder
    const rerun = await jobsController.triggerAppointmentReminders(hospitalAId);
    expect(rerun.data.dispatchedCount).toBe(0);
  });

  it('11. should scan pharmacy stock expiring within 30 days and alert pharmacists', async () => {
    const timestamp = Date.now().toString().slice(-4);
    // 1. Create a medicine and batch expiring 15 days from now
    const medicine = await (prisma.raw.medicine as any).create({
      data: {
        hospitalId: hospitalAId,
        name: `Ceftriaxone ${timestamp}`,
        genericName: 'Ceftriaxone Sodium',
        category: 'ANTIBIOTIC',
        form: 'INJECTION',
        strength: '1g',
        manufacturer: 'Cipla',
        reorderLevel: 20,
      },
    });
    createdMedicineIds.push(medicine.id);

    const expiryDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const batch = await (prisma.raw.medicineBatch as any).create({
      data: {
        hospitalId: hospitalAId,
        medicineId: medicine.id,
        batchNumber: `BAT-EXP-${timestamp}`,
        manufacturingDate: new Date('2025-01-01'),
        expiryDate,
        initialQuantity: 85,
        currentQuantity: 85,
        unitCost: 120,
        mrp: 180,
      },
    });
    createdBatchIds.push(batch.id);

    // 2. Trigger scan
    const scanRes = await jobsController.triggerExpiryScan(hospitalAId);
    expect(scanRes.success).toBe(true);
    expect(scanRes.data.expiringBatchCount).toBeGreaterThanOrEqual(1);
    expect(scanRes.data.alertCount).toBeGreaterThanOrEqual(1);

    // 3. Verify notification in Admin/Pharmacist feed
    const adminFeed = await notificationsController.getMyNotifications(hospitalAdminA.id, {});
    const expiryNotif = adminFeed.data.find(
      (n: any) => n.metadataJson?.batchId === batch.id,
    );
    expect(expiryNotif).toBeDefined();
    expect(expiryNotif.title).toContain('Expiring Medicine Stock');
    if (expiryNotif) createdNotificationIds.push(expiryNotif.id);

    // 4. Idempotency check: Re-scanning today should not re-alert the same batch
    const rerunScan = await jobsController.triggerExpiryScan(hospitalAId);
    expect(rerunScan.data.alertCount).toBe(0);
  });
});
