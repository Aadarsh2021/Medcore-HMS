import {
  Injectable,
  Logger,
  Inject,
  Optional,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import {
  UserRole,
  AppointmentStatus,
  AppointmentType,
  AppointmentResponseData,
  AppointmentListItemData,
  PaginatedResponse,
} from '@medcore/types';
import { PrismaService } from '../../database/prisma.service';
import { SchedulingService } from '../doctors/scheduling.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { AppointmentQueryDto } from './dto/appointment-query.dto';

// Status transitions that are considered non-terminal (can still be cancelled or progressed)
const CANCELLABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

// Terminal statuses — no further transitions allowed
const TERMINAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

// Admin-allowed status targets (cannot set to PENDING or CANCELLED via status endpoint)
const ADMIN_STATUS_TARGETS: AppointmentStatus[] = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);
  private redisClient: Redis | null = null;
  private redisInitialized = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingService: SchedulingService,
    @Optional() @Inject('REDIS_CLIENT') private readonly injectedRedis?: any,
  ) {
    if (injectedRedis !== undefined) {
      this.redisClient = injectedRedis;
      this.redisInitialized = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Redis — configuration-driven lazy initialisation, best-effort only
  // ---------------------------------------------------------------------------

  private async getRedis(): Promise<Redis | null> {
    if (this.redisInitialized) {
      return this.redisClient;
    }

    this.redisInitialized = true;

    // Configuration-driven from environment: REDIS_URL or REDIS_HOST/PORT/PASSWORD
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
    const redisPassword = process.env.REDIS_PASSWORD;

    if (!redisUrl && !redisHost) {
      this.redisClient = null;
      return null;
    }

    try {
      if (redisUrl) {
        this.redisClient = new Redis(redisUrl, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
          commandTimeout: 1000,
          retryStrategy: () => null,
        });
      } else {
        this.redisClient = new Redis({
          host: redisHost,
          port: redisPort,
          password: redisPassword || undefined,
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
          commandTimeout: 1000,
          retryStrategy: () => null,
        });
      }

      this.redisClient.on('error', (err: any) => {
        // ADR-002 Layer 3 is best-effort UX signal only.
        // NEVER log credentials or sensitive connection parameters.
        const sanitized = (err?.message || 'unreachable').replace(/:[^:@/]+@/g, ':***@');
        this.logger.warn(`Redis client event (Layer 3 UX): ${sanitized}`);
      });

      return this.redisClient;
    } catch (err: any) {
      const sanitized = (err?.message || 'initialization failed').replace(/:[^:@/]+@/g, ':***@');
      this.logger.warn(`Redis initialization failed (non-critical): ${sanitized}`);
      this.redisClient = null;
      return null;
    }
  }

  /**
   * ADR-002 Layer 3: Post-commit best-effort Redis soft-hold.
   * Key: slot_hold:{doctorId}:{date}:{startTime} with 5-minute TTL (300 seconds).
   * Signals to the frontend UX that this slot is currently held.
   * NEVER throws; NEVER blocks booking or rescheduling correctness.
   * NEVER logs credentials.
   */
  async setSoftHold(doctorId: string, date: string, startTime: string): Promise<void> {
    try {
      const redis = await this.getRedis();
      if (!redis) return;

      if (typeof redis.connect === 'function' && redis.status !== 'ready' && redis.status !== 'connecting') {
        await redis.connect().catch(() => {});
      }

      if (redis.status === 'ready' || typeof redis.connect !== 'function') {
        const key = `slot_hold:${doctorId}:${date}:${startTime}`;
        await redis.set(key, '1', 'EX', 300);
      }
    } catch (err: any) {
      // Best-effort UX signal only — Redis failure NEVER blocks booking correctness.
      // Do NOT log credentials or sensitive connection strings.
      const sanitized = (err?.message || 'unknown error').replace(/:[^:@/]+@/g, ':***@');
      this.logger.warn(`Redis soft-hold failed (non-critical): ${sanitized}`);
    }
  }

  /**
   * ADR-002 Layer 3: Release Redis soft-hold on cancellation or reschedule.
   * NEVER throws; NEVER logs credentials.
   */
  async releaseSoftHold(doctorId: string, date: string, startTime: string): Promise<void> {
    try {
      const redis = await this.getRedis();
      if (!redis) return;

      if (typeof redis.connect === 'function' && redis.status !== 'ready' && redis.status !== 'connecting') {
        await redis.connect().catch(() => {});
      }

      if (redis.status === 'ready' || typeof redis.connect !== 'function') {
        const key = `slot_hold:${doctorId}:${date}:${startTime}`;
        await redis.del(key);
      }
    } catch (err: any) {
      const sanitized = (err?.message || 'unknown error').replace(/:[^:@/]+@/g, ':***@');
      this.logger.warn(`Redis release soft-hold failed (non-critical): ${sanitized}`);
    }
  }


  // ---------------------------------------------------------------------------
  // Response formatters
  // ---------------------------------------------------------------------------

  private formatAppointmentResponse(appt: any): AppointmentResponseData {
    return {
      id: appt.id,
      hospitalId: appt.hospitalId,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      departmentId: appt.departmentId,
      departmentName: appt.department?.name ?? null,
      appointmentDate: appt.appointmentDate instanceof Date
        ? appt.appointmentDate.toISOString().split('T')[0]
        : String(appt.appointmentDate).split('T')[0],
      startTime: appt.startTime,
      endTime: appt.endTime,
      status: appt.status as AppointmentStatus,
      type: appt.type as AppointmentType,
      reason: appt.reason ?? null,
      notes: appt.notes ?? null,
      cancellationReason: appt.cancellationReason ?? null,
      createdAt: appt.createdAt instanceof Date ? appt.createdAt.toISOString() : appt.createdAt,
      updatedAt: appt.updatedAt instanceof Date ? appt.updatedAt.toISOString() : appt.updatedAt,
      patient: appt.patient
        ? {
            id: appt.patient.id,
            uhid: appt.patient.uhid,
            firstName: appt.patient.user?.firstName ?? '',
            lastName: appt.patient.user?.lastName ?? '',
            email: appt.patient.user?.email ?? '',
            phone: appt.patient.user?.phone ?? null,
          }
        : null,
      doctor: appt.doctor
        ? {
            id: appt.doctor.id,
            firstName: appt.doctor.user?.firstName ?? '',
            lastName: appt.doctor.user?.lastName ?? '',
            specialization: appt.doctor.specialization,
            consultationFee: Number(appt.doctor.consultationFee),
          }
        : null,
    };
  }

  private formatListItem(appt: any): AppointmentListItemData {
    const patientUser = appt.patient?.user;
    const doctorUser = appt.doctor?.user;
    return {
      id: appt.id,
      hospitalId: appt.hospitalId,
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      departmentId: appt.departmentId,
      departmentName: appt.department?.name ?? '',
      appointmentDate: appt.appointmentDate instanceof Date
        ? appt.appointmentDate.toISOString().split('T')[0]
        : String(appt.appointmentDate).split('T')[0],
      startTime: appt.startTime,
      endTime: appt.endTime,
      status: appt.status as AppointmentStatus,
      type: appt.type as AppointmentType,
      reason: appt.reason ?? null,
      patientName: patientUser
        ? `${patientUser.firstName} ${patientUser.lastName}`.trim()
        : '',
      patientUhid: appt.patient?.uhid ?? '',
      doctorName: doctorUser
        ? `${doctorUser.firstName} ${doctorUser.lastName}`.trim()
        : '',
      createdAt: appt.createdAt instanceof Date ? appt.createdAt.toISOString() : appt.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Shared appointment include for Prisma queries
  // ---------------------------------------------------------------------------

  private readonly appointmentInclude = {
    patient: {
      select: {
        id: true,
        uhid: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    },
    doctor: {
      select: {
        id: true,
        specialization: true,
        consultationFee: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    },
    department: {
      select: { id: true, name: true },
    },
  };

  // ---------------------------------------------------------------------------
  // Slot validation helper — reuses Phase 3 SchedulingService
  // ---------------------------------------------------------------------------

  /**
   * Validates that a requested (date, startTime) is a valid schedule-derived slot
   * for the given doctor.
   *
   * Also enforces the Phase 4 compatibility rule:
   *   IF the matching availability window has maxBookingsPerSlot > 1,
   *   booking is REJECTED with 422 UnprocessableEntityException.
   *
   * This is a known Phase 4 limitation. ADR-002 Layer 2 unique partial index
   * enforces max 1 active booking per (doctorId, appointmentDate, startTime).
   * Supporting maxBookingsPerSlot > 1 requires a new ADR and schema revision.
   *
   * Returns the computed endTime for the slot.
   */
  private async validateSlotAndGetEndTime(
    tenantId: string,
    doctorId: string,
    date: string,
    startTime: string,
  ): Promise<string> {
    // Fetch active availability windows
    const windows = await this.prisma.raw.doctorAvailability.findMany({
      where: { doctorId, isActive: true },
    });

    // Fetch leaves
    const leaves = await this.prisma.raw.doctorLeave.findMany({
      where: { doctorId },
      select: { startDate: true, endDate: true },
    });

    // Fetch hospital timezone
    const hospital = await this.prisma.raw.hospital.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const timezone = this.schedulingService.resolveHospitalTimezone(hospital?.settings);

    // Map to DTO shape for SchedulingService
    const windowDtos = windows.map((w) => ({
      dayOfWeek: w.dayOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      slotDurationMinutes: w.slotDurationMinutes,
      maxBookingsPerSlot: w.maxBookingsPerSlot,
      isActive: w.isActive,
    }));

    // Generate schedule-derived slots
    const slots = this.schedulingService.generateSlots(windowDtos, leaves, date, timezone);

    const matchingSlot = slots.find((s) => s.startTime === startTime);
    if (!matchingSlot) {
      throw new BadRequestException(
        `The requested time slot '${startTime}' on '${date}' is not available in the doctor's schedule. ` +
          'It may be outside configured working hours, blocked by a leave, or does not align with the slot duration.',
      );
    }

    // Phase 4 compatibility check: enforce maxBookingsPerSlot = 1
    // Find the availability window that owns this slot
    const dayOfWeek = this.schedulingService.getDayOfWeekForDate(date);
    const slotStartMin = this.schedulingService.timeToMinutes(startTime);

    const owningWindow = windows.find((w) => {
      if (w.dayOfWeek !== dayOfWeek || !w.isActive) return false;
      const winStart = this.schedulingService.timeToMinutes(w.startTime);
      const winEnd = this.schedulingService.timeToMinutes(w.endTime);
      return slotStartMin >= winStart && slotStartMin < winEnd;
    });

    if (owningWindow && owningWindow.maxBookingsPerSlot > 1) {
      throw new UnprocessableEntityException(
        `Slot '${startTime}' on '${date}' is configured with maxBookingsPerSlot = ${owningWindow.maxBookingsPerSlot}. ` +
          'The appointment booking system (ADR-002) currently enforces a maximum of 1 concurrent booking per slot. ' +
          'Booking a slot with a higher configured capacity is rejected to prevent data inconsistency. ' +
          'This is a known Phase 4 limitation — support for maxBookingsPerSlot > 1 requires a new architectural decision record.',
      );
    }

    return matchingSlot.endTime;
  }

  // ---------------------------------------------------------------------------
  // Book appointment (ADR-002 compliant)
  // ---------------------------------------------------------------------------

  /**
   * Books an appointment with 3-layer concurrency protection:
   * Layer 1: SELECT FOR UPDATE (fast pre-flight for existing-row races)
   * Layer 2: Unique partial index catches concurrent first-booking races (P2002)
   * Layer 3: Redis soft-hold post-commit (UX signal, best-effort)
   */
  async bookAppointment(
    tenantId: string | null,
    dto: BookAppointmentDto,
    requestingUser: any,
  ): Promise<AppointmentResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    // 1. Resolve patientId
    // PATIENT role: always derive from token — never trust dto.patientId
    // RECEPTIONIST/ADMIN: require dto.patientId
    let patientId: string;

    if (requestingUser.role === UserRole.PATIENT) {
      if (!requestingUser.patientProfile?.id) {
        throw new ForbiddenException(
          'No patient profile found for the authenticated user. Cannot book appointment.',
        );
      }
      patientId = requestingUser.patientProfile.id;
    } else {
      if (!dto.patientId) {
        throw new BadRequestException(
          'patientId is required when booking on behalf of a patient.',
        );
      }
      patientId = dto.patientId;
    }

    // 2. Verify patient belongs to this tenant and is not soft-deleted
    const patient = await this.prisma.raw.patient.findFirst({
      where: {
        id: patientId,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });
    if (!patient) {
      throw new NotFoundException(
        `Patient with ID '${patientId}' not found in this hospital.`,
      );
    }

    // 3. Verify doctor exists, is active, and belongs to tenant
    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id: dto.doctorId,
        hospitalId: tenantId,
        isAvailable: true,
        deletedAt: null,
      },
    });
    if (!doctor) {
      throw new NotFoundException(
        `Active doctor with ID '${dto.doctorId}' not found in this hospital.`,
      );
    }

    // 4. Derive departmentId from doctor — never trust client input
    const departmentId = doctor.departmentId;

    // 5. Validate slot and enforce maxBookingsPerSlot = 1 compatibility rule
    const endTime = await this.validateSlotAndGetEndTime(
      tenantId,
      dto.doctorId,
      dto.appointmentDate,
      dto.startTime,
    );

    // Convert date string to a DateTime value for storage.
    // Store as YYYY-MM-DD 00:00:00 UTC (date-only semantics per Phase 4 plan).
    const appointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);

    // 6. ADR-002 Layers 1 + 2: Booking transaction
    let created: any;
    try {
      created = await this.prisma.raw.$transaction(async (tx) => {
        // Layer 1: SELECT FOR UPDATE — fast rejection when slot row already exists
        const existing = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Appointment"
          WHERE "doctorId" = ${dto.doctorId}
            AND "appointmentDate" = ${appointmentDate}
            AND "startTime" = ${dto.startTime}
            AND "status" NOT IN ('CANCELLED')
          FOR UPDATE
        `;

        if (existing.length > 0) {
          throw new ConflictException(
            `The requested slot '${dto.startTime}' on '${dto.appointmentDate}' is already booked for this doctor.`,
          );
        }

        // INSERT — Layer 2 unique partial index catches concurrent first-booking races
        return tx.appointment.create({
          data: {
            hospitalId: tenantId,
            patientId,
            doctorId: dto.doctorId,
            departmentId,
            appointmentDate,
            startTime: dto.startTime,
            endTime,
            status: AppointmentStatus.PENDING,
            type: dto.type ?? AppointmentType.REGULAR,
            reason: dto.reason ?? null,
            notes: dto.notes ?? null,
          },
          include: this.appointmentInclude,
        });
      });
    } catch (err: any) {
      // Translate Prisma unique constraint violation (Layer 2 catch) to 409
      if (err?.code === 'P2002' || err instanceof ConflictException) {
        throw new ConflictException(
          `The requested slot '${dto.startTime}' on '${dto.appointmentDate}' is already booked for this doctor.`,
        );
      }
      throw err;
    }

    // 7. ADR-002 Layer 3: Post-commit Redis soft-hold (best-effort, non-blocking)
    void this.setSoftHold(dto.doctorId, dto.appointmentDate, dto.startTime);

    return this.formatAppointmentResponse(created);
  }

  // ---------------------------------------------------------------------------
  // List appointments (role-scoped)
  // ---------------------------------------------------------------------------

  async listAppointments(
    tenantId: string | null,
    query: AppointmentQueryDto,
    requestingUser: any,
  ): Promise<PaginatedResponse<AppointmentListItemData>> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build role-scoped where clause
    let roleFilter: any = {};

    if (requestingUser.role === UserRole.PATIENT) {
      // PATIENT sees only their own appointments
      if (!requestingUser.patientProfile?.id) {
        throw new ForbiddenException('No patient profile found for the authenticated user.');
      }
      roleFilter.patientId = requestingUser.patientProfile.id;
    } else if (requestingUser.role === UserRole.DOCTOR) {
      // DOCTOR sees only appointments where they are the assigned doctor
      if (!requestingUser.doctorProfile?.id) {
        throw new ForbiddenException('No doctor profile found for the authenticated user.');
      }
      roleFilter.doctorId = requestingUser.doctorProfile.id;
    } else {
      // RECEPTIONIST, NURSE, HOSPITAL_ADMIN, SUPER_ADMIN — optional filters
      if (query.doctorId) roleFilter.doctorId = query.doctorId;
      if (query.patientId) roleFilter.patientId = query.patientId;
    }

    // Common filters
    if (query.status) roleFilter.status = query.status;
    if (query.type) roleFilter.type = query.type;
    if (query.date) {
      roleFilter.appointmentDate = new Date(`${query.date}T00:00:00.000Z`);
    }

    const where = {
      ...roleFilter,
      hospitalId: tenantId,
      deletedAt: null,
    };

    const [total, appointments] = await Promise.all([
      this.prisma.raw.appointment.count({ where }),
      this.prisma.raw.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ appointmentDate: 'asc' }, { startTime: 'asc' }],
        include: this.appointmentInclude,
      }),
    ]);

    return {
      success: true,
      data: appointments.map((a) => this.formatListItem(a)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Get appointment by ID
  // ---------------------------------------------------------------------------

  async findById(
    tenantId: string | null,
    appointmentId: string,
    requestingUser: any,
  ): Promise<AppointmentResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const appt = await this.prisma.raw.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: tenantId,
        deletedAt: null,
      },
      include: this.appointmentInclude,
    });

    if (!appt) {
      throw new NotFoundException(`Appointment with ID '${appointmentId}' not found.`);
    }

    // PATIENT: may only view their own appointments
    if (
      requestingUser.role === UserRole.PATIENT &&
      appt.patientId !== requestingUser.patientProfile?.id
    ) {
      throw new ForbiddenException('Access denied: You may only view your own appointments.');
    }

    // DOCTOR: may only view appointments where they are the assigned doctor
    if (
      requestingUser.role === UserRole.DOCTOR &&
      appt.doctorId !== requestingUser.doctorProfile?.id
    ) {
      throw new ForbiddenException(
        'Access denied: You may only view appointments assigned to you.',
      );
    }

    return this.formatAppointmentResponse(appt);
  }

  // ---------------------------------------------------------------------------
  // Status update (admin/receptionist workflow)
  // ---------------------------------------------------------------------------

  async updateStatus(
    tenantId: string | null,
    appointmentId: string,
    dto: UpdateAppointmentStatusDto,
  ): Promise<AppointmentResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    // Validate target status is admin-allowed
    if (!ADMIN_STATUS_TARGETS.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot set status to '${dto.status}' via this endpoint. ` +
          `Allowed values: ${ADMIN_STATUS_TARGETS.join(', ')}.`,
      );
    }

    const appt = await this.prisma.raw.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });

    if (!appt) {
      throw new NotFoundException(`Appointment with ID '${appointmentId}' not found.`);
    }

    if (TERMINAL_STATUSES.includes(appt.status as AppointmentStatus)) {
      throw new BadRequestException(
        `Appointment is already in a terminal state ('${appt.status}'). No further status transitions are permitted.`,
      );
    }

    const updated = await this.prisma.raw.appointment.update({
      where: { id: appointmentId },
      data: {
        status: dto.status,
        notes: dto.notes ?? appt.notes,
      },
      include: this.appointmentInclude,
    });

    return this.formatAppointmentResponse(updated);
  }

  // ---------------------------------------------------------------------------
  // Cancel appointment
  // ---------------------------------------------------------------------------

  async cancelAppointment(
    tenantId: string | null,
    appointmentId: string,
    dto: CancelAppointmentDto,
    requestingUser: any,
  ): Promise<AppointmentResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const appt = await this.prisma.raw.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: tenantId,
        deletedAt: null,
      },
      include: this.appointmentInclude,
    });

    if (!appt) {
      throw new NotFoundException(`Appointment with ID '${appointmentId}' not found.`);
    }

    // PATIENT: may only cancel their own appointments
    if (requestingUser.role === UserRole.PATIENT) {
      if (appt.patientId !== requestingUser.patientProfile?.id) {
        throw new ForbiddenException(
          'Access denied: You may only cancel your own appointments.',
        );
      }
    }

    // Cannot cancel terminal states
    if (!CANCELLABLE_STATUSES.includes(appt.status as AppointmentStatus)) {
      throw new BadRequestException(
        `Appointment cannot be cancelled. Current status is '${appt.status}'. ` +
          `Only appointments in ${CANCELLABLE_STATUSES.join(' or ')} status may be cancelled.`,
      );
    }

    const updated = await this.prisma.raw.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancellationReason: dto.cancellationReason ?? null,
      },
      include: this.appointmentInclude,
    });

    // ADR-002 Layer 3: Best-effort release of Redis soft-hold on cancelled slot
    void this.releaseSoftHold(
      appt.doctorId,
      appt.appointmentDate.toISOString().slice(0, 10),
      appt.startTime,
    );

    return this.formatAppointmentResponse(updated);
  }

  // ---------------------------------------------------------------------------
  // Reschedule appointment (ADR-002 compliant)
  // ---------------------------------------------------------------------------

  /**
   * Reschedules an appointment to a new date/time slot.
   *
   * Transaction boundary:
   * 1. SELECT appointment FOR UPDATE (lock existing row — holds old slot)
   * 2. Validate new slot via SchedulingService (slot validation + capacity check)
   * 3. Layer 1: SELECT FOR UPDATE on new slot (fast pre-flight)
   * 4. UPDATE appointment (atomically moves from old slot → new slot)
   *    Layer 2 (unique partial index) catches concurrent INSERT racing for new slot
   * 5. Old slot is atomically freed at commit (row no longer references it)
   */
  async rescheduleAppointment(
    tenantId: string | null,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    requestingUser: any,
  ): Promise<AppointmentResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    // Pre-validate the new slot BEFORE entering the transaction
    // (slot validation does not need to be inside the lock boundary)
    let newEndTime: string;

    const apptForDoctor = await this.prisma.raw.appointment.findFirst({
      where: {
        id: appointmentId,
        hospitalId: tenantId,
        deletedAt: null,
      },
      select: { doctorId: true, status: true },
    });

    if (!apptForDoctor) {
      throw new NotFoundException(`Appointment with ID '${appointmentId}' not found.`);
    }

    if (TERMINAL_STATUSES.includes(apptForDoctor.status as AppointmentStatus)) {
      throw new BadRequestException(
        `Appointment cannot be rescheduled. Current status is '${apptForDoctor.status}'. ` +
          'Only PENDING or CONFIRMED appointments may be rescheduled.',
      );
    }

    if (apptForDoctor.status === AppointmentStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Appointment cannot be rescheduled while IN_PROGRESS.',
      );
    }

    // Validate new slot (includes maxBookingsPerSlot > 1 rejection)
    newEndTime = await this.validateSlotAndGetEndTime(
      tenantId,
      apptForDoctor.doctorId,
      dto.appointmentDate,
      dto.startTime,
    );

    const newAppointmentDate = new Date(`${dto.appointmentDate}T00:00:00.000Z`);

    let updated: any;
    try {
      updated = await this.prisma.raw.$transaction(async (tx) => {
        // Lock the existing appointment row (holds old slot for duration of transaction)
        const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT id, status FROM "Appointment"
          WHERE id = ${appointmentId}
            AND "hospitalId" = ${tenantId}
          FOR UPDATE
        `;

        if (locked.length === 0) {
          throw new NotFoundException(`Appointment with ID '${appointmentId}' not found.`);
        }

        const currentStatus = locked[0].status as AppointmentStatus;
        if (TERMINAL_STATUSES.includes(currentStatus) || currentStatus === AppointmentStatus.IN_PROGRESS) {
          throw new BadRequestException(
            `Appointment cannot be rescheduled in status '${currentStatus}'.`,
          );
        }

        // Layer 1: SELECT FOR UPDATE on new slot
        const conflicting = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Appointment"
          WHERE "doctorId" = ${apptForDoctor.doctorId}
            AND "appointmentDate" = ${newAppointmentDate}
            AND "startTime" = ${dto.startTime}
            AND "status" NOT IN ('CANCELLED')
            AND id != ${appointmentId}
          FOR UPDATE
        `;

        if (conflicting.length > 0) {
          throw new ConflictException(
            `The requested slot '${dto.startTime}' on '${dto.appointmentDate}' is already booked. ` +
              'Please choose a different slot.',
          );
        }

        // Atomically move to new slot; reset to PENDING
        return tx.appointment.update({
          where: { id: appointmentId },
          data: {
            appointmentDate: newAppointmentDate,
            startTime: dto.startTime,
            endTime: newEndTime,
            status: AppointmentStatus.PENDING,
          },
          include: this.appointmentInclude,
        });
      });
    } catch (err: any) {
      if (err?.code === 'P2002' || err instanceof ConflictException) {
        throw new ConflictException(
          `The requested slot '${dto.startTime}' on '${dto.appointmentDate}' is already booked. ` +
            'Please choose a different slot.',
        );
      }
      throw err;
    }

    // ADR-002 Layer 3: Post-commit Redis soft-hold on new slot (best-effort, non-blocking)
    void this.setSoftHold(apptForDoctor.doctorId, dto.appointmentDate, dto.startTime);

    return this.formatAppointmentResponse(updated);
  }
}
