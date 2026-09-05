import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  UserRole,
  DoctorResponseData,
  DoctorListItemData,
  DoctorAvailabilityResponseData,
  DoctorLeaveResponseData,
  DoctorSlotsResponseData,
  PaginatedResponse,
} from '@medcore/types';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseService } from '../auth/supabase.service';
import { SchedulingService } from './scheduling.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { SetDoctorAvailabilityDto } from './dto/doctor-availability.dto';
import { CreateDoctorLeaveDto } from './dto/doctor-leave.dto';
import { DoctorSlotsQueryDto } from './dto/doctor-slots-query.dto';

export const SUPABASE_MANAGED_PASSWORD_HASH =
  '$2b$10$auth.managed.by.supabase.placeholder';

@Injectable()
export class DoctorsService {
  private readonly logger = new Logger(DoctorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
    private readonly schedulingService: SchedulingService,
  ) {}

  private getSupabaseAdmin(): SupabaseClient | null {
    try {
      return this.supabaseService?.adminClient || null;
    } catch {
      return null;
    }
  }

  private formatDoctorResponse(doctor: any): DoctorResponseData {
    return {
      id: doctor.id,
      userId: doctor.userId,
      hospitalId: doctor.hospitalId,
      departmentId: doctor.departmentId,
      departmentName: doctor.department?.name,
      specialization: doctor.specialization,
      licenseNumber: doctor.licenseNumber,
      consultationFee: Number(doctor.consultationFee),
      bio: doctor.bio,
      signatureUrl: doctor.signatureUrl,
      isAvailable: doctor.isAvailable,
      createdAt: doctor.createdAt instanceof Date ? doctor.createdAt.toISOString() : doctor.createdAt,
      updatedAt: doctor.updatedAt instanceof Date ? doctor.updatedAt.toISOString() : doctor.updatedAt,
      deletedAt: doctor.deletedAt ? (doctor.deletedAt instanceof Date ? doctor.deletedAt.toISOString() : doctor.deletedAt) : null,
      user: {
        id: doctor.user.id,
        email: doctor.user.email,
        firstName: doctor.user.firstName,
        lastName: doctor.user.lastName,
        phone: doctor.user.phone,
        avatarUrl: doctor.user.avatarUrl,
        isActive: doctor.user.isActive,
      },
    };
  }

  private formatDoctorListItem(doctor: any): DoctorListItemData {
    return {
      id: doctor.id,
      userId: doctor.userId,
      hospitalId: doctor.hospitalId,
      departmentId: doctor.departmentId,
      departmentName: doctor.department?.name || '',
      fullName: `${doctor.user?.firstName || ''} ${doctor.user?.lastName || ''}`.trim(),
      firstName: doctor.user?.firstName || '',
      lastName: doctor.user?.lastName || '',
      email: doctor.user?.email || '',
      phone: doctor.user?.phone || null,
      specialization: doctor.specialization,
      licenseNumber: doctor.licenseNumber,
      consultationFee: Number(doctor.consultationFee),
      isAvailable: doctor.isAvailable,
      createdAt: doctor.createdAt instanceof Date ? doctor.createdAt.toISOString() : doctor.createdAt,
    };
  }

  /**
   * Registers a new Doctor:
   * 1. Validates department belongs to the hospital and is active.
   * 2. Validates unique licenseNumber within hospital.
   * 3. Provisions Supabase Auth user identity (with rollback on failure).
   * 4. Creates User and Doctor records atomically.
   */
  async create(
    tenantId: string | null,
    dto: CreateDoctorDto,
  ): Promise<DoctorResponseData> {
    if (!tenantId) {
      throw new ForbiddenException(
        'Tenant context missing: A valid hospital facility must be active or specified via X-Hospital-Id.',
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const cleanLicense = dto.licenseNumber.trim();

    // 1. Validate Department belongs to the same hospital tenant and is active
    const department = await this.prisma.raw.department.findFirst({
      where: {
        id: dto.departmentId,
        hospitalId: tenantId,
        isActive: true,
      },
    });

    if (!department) {
      throw new BadRequestException(
        'Invalid department: Department not found, does not belong to this hospital, or is inactive.',
      );
    }

    // 2. Validate unique licenseNumber in hospital
    const existingDocWithLicense = await this.prisma.raw.doctor.findFirst({
      where: {
        hospitalId: tenantId,
        licenseNumber: cleanLicense,
        deletedAt: null,
      },
    });

    if (existingDocWithLicense) {
      throw new ConflictException(
        'A doctor with this license number already exists in this hospital.',
      );
    }

    // 3. Validate email is not already associated with a doctor profile
    const existingUser = await this.prisma.raw.user.findUnique({
      where: { email: normalizedEmail },
      include: { doctorProfile: true },
    });

    if (existingUser?.doctorProfile) {
      throw new ConflictException(
        'A doctor record is already associated with this email address.',
      );
    }

    // 4. Supabase Auth Provisioning
    const rawPassword =
      dto.password || crypto.randomBytes(16).toString('hex') + 'D@ct0r!';

    let supabaseAuthId: string | null = existingUser?.supabaseAuthId || null;
    let newlyCreatedSupabaseUserId: string | null = null;
    const adminClient = this.getSupabaseAdmin();

    if (adminClient && !supabaseAuthId) {
      try {
        const { data: sbData, error: sbError } =
          await adminClient.auth.admin.createUser({
            email: normalizedEmail,
            password: rawPassword,
            email_confirm: true,
            user_metadata: {
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              role: UserRole.DOCTOR,
              hospitalId: tenantId,
            },
          });

        if (sbError) {
          if (
            sbError.message?.toLowerCase().includes('already') ||
            (sbError as any).status === 422
          ) {
            const { data: listData } = await adminClient.auth.admin.listUsers();
            const existingSbUser = (listData?.users as any[])?.find(
              (u: any) => u.email?.toLowerCase() === normalizedEmail,
            );

            if (existingSbUser) {
              const linkedDbUser = await this.prisma.raw.user.findFirst({
                where: { supabaseAuthId: existingSbUser.id },
                include: { doctorProfile: true },
              });
              if (linkedDbUser?.doctorProfile) {
                throw new ConflictException(
                  'A user with this email is already registered as a doctor in authentication provider.',
                );
              }
              supabaseAuthId = existingSbUser.id;
            } else {
              throw new ConflictException(
                `Authentication provider conflict: ${sbError.message}`,
              );
            }
          } else {
            this.logger.error(
              `Supabase Auth provisioning failed: ${sbError.message}`,
            );
            throw new BadGatewayException(
              `Failed to provision doctor authentication identity in Supabase: ${sbError.message}`,
            );
          }
        } else if (sbData?.user) {
          supabaseAuthId = sbData.user.id;
          newlyCreatedSupabaseUserId = sbData.user.id;
        }
      } catch (err: any) {
        if (
          err instanceof ConflictException ||
          err instanceof BadGatewayException
        ) {
          throw err;
        }
        this.logger.error(
          `Supabase Auth provisioning exception: ${err.message}`,
        );
        throw new BadGatewayException(
          `Authentication identity provisioning failed: ${err.message}`,
        );
      }
    }

    // 5. Database Transaction
    let createdDoctor;
    try {
      createdDoctor = await this.prisma.raw.$transaction(
        async (tx) => {
          let userId: string;
          if (existingUser) {
            userId = existingUser.id;
            await tx.user.update({
              where: { id: userId },
              data: {
                hospitalId: existingUser.hospitalId || tenantId,
                role: UserRole.DOCTOR,
                supabaseAuthId: existingUser.supabaseAuthId || supabaseAuthId,
                phone: dto.phone || existingUser.phone,
              },
            });
          } else {
            const newUser = await tx.user.create({
              data: {
                hospitalId: tenantId,
                email: normalizedEmail,
                passwordHash: SUPABASE_MANAGED_PASSWORD_HASH,
                role: UserRole.DOCTOR,
                firstName: dto.firstName.trim(),
                lastName: dto.lastName.trim(),
                phone: dto.phone || null,
                supabaseAuthId,
                isEmailVerified: true,
              },
            });
            userId = newUser.id;
          }

          return tx.doctor.create({
            data: {
              userId,
              hospitalId: tenantId,
              departmentId: dto.departmentId,
              specialization: dto.specialization.trim(),
              licenseNumber: cleanLicense,
              consultationFee:
                dto.consultationFee !== undefined ? dto.consultationFee : 50.0,
              bio: dto.bio || null,
              signatureUrl: dto.signatureUrl || null,
              isAvailable: true,
            },
            include: {
              user: true,
              department: true,
            },
          });
        },
        { maxWait: 20000, timeout: 20000 },
      );
    } catch (dbError: any) {
      if (newlyCreatedSupabaseUserId && adminClient) {
        try {
          await adminClient.auth.admin.deleteUser(newlyCreatedSupabaseUserId);
          this.logger.warn(
            `Compensated orphaned Supabase Auth identity for doctor ${normalizedEmail}`,
          );
        } catch (compensationError: any) {
          this.logger.error(
            `Failed to rollback Supabase user ${newlyCreatedSupabaseUserId}: ${compensationError.message}`,
          );
        }
      }
      throw dbError;
    }

    return this.formatDoctorResponse(createdDoctor);
  }

  /**
   * Retrieves doctors list with search, filtering, and pagination.
   * If caller is PATIENT, only returns active and non-deleted doctors.
   */
  async findAll(
    tenantId: string | null,
    query: DoctorQueryDto,
    userRole?: UserRole,
  ): Promise<PaginatedResponse<DoctorListItemData>> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.DoctorWhereInput = {
      hospitalId: tenantId,
      deletedAt: null,
    };

    // Patients can only see available doctors
    if (userRole === UserRole.PATIENT) {
      where.isAvailable = true;
    } else if (query.isAvailable !== undefined) {
      where.isAvailable = query.isAvailable;
    }

    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }

    if (query.specialization) {
      where.specialization = {
        contains: query.specialization.trim(),
        mode: 'insensitive',
      };
    }

    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { specialization: { contains: searchTerm, mode: 'insensitive' } },
        { licenseNumber: { contains: searchTerm, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { firstName: { contains: searchTerm, mode: 'insensitive' } },
              { lastName: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [total, doctors] = await Promise.all([
      this.prisma.raw.doctor.count({ where }),
      this.prisma.raw.doctor.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ user: { lastName: 'asc' } }, { createdAt: 'desc' }],
        include: {
          user: true,
          department: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: doctors.map((doc) => this.formatDoctorListItem(doc)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves single Doctor profile with department and availability.
   */
  async findById(
    tenantId: string | null,
    id: string,
    userRole?: UserRole,
  ): Promise<DoctorResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const where: Prisma.DoctorWhereInput = {
      id,
      hospitalId: tenantId,
      deletedAt: null,
    };

    if (userRole === UserRole.PATIENT) {
      where.isAvailable = true;
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where,
      include: {
        user: true,
        department: true,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${id}' not found.`);
    }

    return this.formatDoctorResponse(doctor);
  }

  /**
   * Updates Doctor profile.
   * Strictly enforces RBAC:
   * - DOCTOR: Can only update their own record and ONLY `bio`, `signatureUrl`, `phone`.
   *   Attempting to modify any other field throws 403 Forbidden.
   * - HOSPITAL_ADMIN / SUPER_ADMIN: Can update all fields.
   */
  async update(
    tenantId: string | null,
    id: string,
    dto: UpdateDoctorDto,
    currentUser: { id: string; role: UserRole },
  ): Promise<DoctorResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id,
        hospitalId: tenantId,
        deletedAt: null,
      },
      include: {
        user: true,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${id}' not found.`);
    }

    // Role-based authorization and field restrictions
    if (currentUser.role === UserRole.DOCTOR) {
      // Must be own profile
      if (doctor.userId !== currentUser.id) {
        throw new ForbiddenException('Doctors may only update their own profile.');
      }

      // Check if restricted admin fields are present in the payload
      const restrictedFields: (keyof UpdateDoctorDto)[] = [
        'departmentId',
        'specialization',
        'licenseNumber',
        'consultationFee',
        'isAvailable',
        'firstName',
        'lastName',
      ];

      const attemptedRestricted = restrictedFields.filter(
        (f) => dto[f] !== undefined,
      );

      if (attemptedRestricted.length > 0) {
        throw new ForbiddenException(
          `Doctors are restricted from updating administrative fields (${attemptedRestricted.join(
            ', ',
          )}). Only bio, signatureUrl, and phone are self-editable.`,
        );
      }
    }

    // Admin updates: department validation if provided
    if (dto.departmentId && dto.departmentId !== doctor.departmentId) {
      const dept = await this.prisma.raw.department.findFirst({
        where: {
          id: dto.departmentId,
          hospitalId: tenantId,
          isActive: true,
        },
      });
      if (!dept) {
        throw new BadRequestException(
          'Invalid department: Department not found, does not belong to this hospital, or is inactive.',
        );
      }
    }

    // Admin updates: licenseNumber uniqueness if provided
    if (dto.licenseNumber && dto.licenseNumber.trim() !== doctor.licenseNumber) {
      const cleanLicense = dto.licenseNumber.trim();
      const existingLicense = await this.prisma.raw.doctor.findFirst({
        where: {
          hospitalId: tenantId,
          licenseNumber: cleanLicense,
          id: { not: doctor.id },
          deletedAt: null,
        },
      });
      if (existingLicense) {
        throw new ConflictException(
          'A doctor with this license number already exists in this hospital.',
        );
      }
    }

    // Perform updates in atomic transaction
    const updatedDoctor = await this.prisma.raw.$transaction(async (tx) => {
      // 1. Update User if firstName, lastName, or phone changed
      const userUpdates: Prisma.UserUpdateInput = {};
      if (dto.firstName !== undefined) userUpdates.firstName = dto.firstName.trim();
      if (dto.lastName !== undefined) userUpdates.lastName = dto.lastName.trim();
      if (dto.phone !== undefined) userUpdates.phone = dto.phone || null;

      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({
          where: { id: doctor.userId },
          data: userUpdates,
        });
      }

      // 2. Update Doctor fields
      const docUpdates: Prisma.DoctorUpdateInput = {};
      if (dto.departmentId !== undefined) docUpdates.department = { connect: { id: dto.departmentId } };
      if (dto.specialization !== undefined) docUpdates.specialization = dto.specialization.trim();
      if (dto.licenseNumber !== undefined) docUpdates.licenseNumber = dto.licenseNumber.trim();
      if (dto.consultationFee !== undefined) docUpdates.consultationFee = dto.consultationFee;
      if (dto.bio !== undefined) docUpdates.bio = dto.bio;
      if (dto.signatureUrl !== undefined) docUpdates.signatureUrl = dto.signatureUrl;
      if (dto.isAvailable !== undefined) docUpdates.isAvailable = dto.isAvailable;

      return tx.doctor.update({
        where: { id: doctor.id },
        data: docUpdates,
        include: {
          user: true,
          department: true,
        },
      });
    });

    return this.formatDoctorResponse(updatedDoctor);
  }

  /**
   * Soft deletes a Doctor.
   * Sets deletedAt = now(), isAvailable = false.
   */
  async softDelete(
    tenantId: string | null,
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${id}' not found.`);
    }

    await this.prisma.raw.doctor.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isAvailable: false,
      },
    });

    return {
      success: true,
      message: 'Doctor record deactivated successfully.',
    };
  }

  /**
   * Sets/replaces weekly availability windows for a doctor.
   *
   * PRD Semantics: Complete Weekly Schedule Replacement.
   * The PRD defines doctor availability as a recurring weekly calendar schedule with
   * configurable time slots per day of week (0=Sun..6=Sat).
   * This operation performs an atomic complete replacement of the doctor's weekly schedule
   * inside an interactive transaction serialized by a doctor-scoped advisory lock:
   * SELECT pg_advisory_xact_lock(hashtext('doc_avail_' || doctorId)).
   * Any previously configured windows not present in the payload are removed, and new
   * pairwise non-overlapping windows are persisted atomically.
   */
  async setAvailability(
    tenantId: string | null,
    doctorId: string,
    dto: SetDoctorAvailabilityDto,
    currentUser: { id: string; role: UserRole },
  ): Promise<DoctorAvailabilityResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id: doctorId,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${doctorId}' not found.`);
    }

    // Role check: DOCTOR can only set own availability
    if (currentUser.role === UserRole.DOCTOR && doctor.userId !== currentUser.id) {
      throw new ForbiddenException(
        'Doctors may only configure their own availability schedule.',
      );
    }

    // Validate non-overlapping windows
    this.schedulingService.validateNoOverlappingWindows(dto.windows);

    // Advisory-locked transactional replacement
    await this.prisma.raw.$transaction(
      async (tx) => {
        // Doctor-scoped advisory lock prevents race conditions on schedule replacements
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${'doc_avail_' + doctorId}))
        `;

        // Delete existing availability windows
        await tx.doctorAvailability.deleteMany({
          where: { doctorId },
        });

        // Insert new windows
        if (dto.windows.length > 0) {
          await tx.doctorAvailability.createMany({
            data: dto.windows.map((w) => ({
              doctorId,
              dayOfWeek: w.dayOfWeek,
              startTime: w.startTime,
              endTime: w.endTime,
              slotDurationMinutes: w.slotDurationMinutes || 30,
              maxBookingsPerSlot: w.maxBookingsPerSlot || 1,
              isActive: w.isActive !== false,
            })),
          });
        }
      },
      { maxWait: 15000, timeout: 15000 },
    );

    return this.getAvailability(tenantId, doctorId);
  }

  /**
   * Retrieves current availability windows for a doctor.
   */
  async getAvailability(
    tenantId: string | null,
    doctorId: string,
  ): Promise<DoctorAvailabilityResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id: doctorId,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${doctorId}' not found.`);
    }

    const windows = await this.prisma.raw.doctorAvailability.findMany({
      where: { doctorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return {
      doctorId,
      windows: windows.map((w) => ({
        id: w.id,
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        slotDurationMinutes: w.slotDurationMinutes,
        maxBookingsPerSlot: w.maxBookingsPerSlot,
        isActive: w.isActive,
      })),
    };
  }

  /**
   * Creates a leave interval for a doctor.
   */
  async createLeave(
    tenantId: string | null,
    doctorId: string,
    dto: CreateDoctorLeaveDto,
    currentUser: { id: string; role: UserRole },
  ): Promise<DoctorLeaveResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id: doctorId,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${doctorId}' not found.`);
    }

    if (currentUser.role === UserRole.DOCTOR && doctor.userId !== currentUser.id) {
      throw new ForbiddenException(
        'Doctors may only schedule leave for their own profile.',
      );
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid ISO 8601 date format for startDate or endDate.');
    }

    if (start >= end) {
      throw new BadRequestException('Leave startDate must be strictly before endDate.');
    }

    const leave = await this.prisma.raw.doctorLeave.create({
      data: {
        doctorId,
        startDate: start,
        endDate: end,
        reason: dto.reason || null,
      },
    });

    return {
      id: leave.id,
      doctorId: leave.doctorId,
      startDate: leave.startDate.toISOString(),
      endDate: leave.endDate.toISOString(),
      reason: leave.reason,
      createdAt: leave.createdAt.toISOString(),
    };
  }

  /**
   * Retrieves all leave intervals for a doctor.
   */
  async getLeaves(
    tenantId: string | null,
    doctorId: string,
  ): Promise<DoctorLeaveResponseData[]> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id: doctorId,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${doctorId}' not found.`);
    }

    const leaves = await this.prisma.raw.doctorLeave.findMany({
      where: { doctorId },
      orderBy: { startDate: 'desc' },
    });

    return leaves.map((l) => ({
      id: l.id,
      doctorId: l.doctorId,
      startDate: l.startDate.toISOString(),
      endDate: l.endDate.toISOString(),
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  /**
   * Deletes a doctor leave record.
   */
  async deleteLeave(
    tenantId: string | null,
    doctorId: string,
    leaveId: string,
    currentUser: { id: string; role: UserRole },
  ): Promise<{ success: boolean; message: string }> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id: doctorId,
        hospitalId: tenantId,
        deletedAt: null,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID '${doctorId}' not found.`);
    }

    if (currentUser.role === UserRole.DOCTOR && doctor.userId !== currentUser.id) {
      throw new ForbiddenException(
        'Doctors may only delete leave from their own profile.',
      );
    }

    const leave = await this.prisma.raw.doctorLeave.findFirst({
      where: {
        id: leaveId,
        doctorId,
      },
    });

    if (!leave) {
      throw new NotFoundException(`Doctor leave record with ID '${leaveId}' not found.`);
    }

    await this.prisma.raw.doctorLeave.delete({
      where: { id: leaveId },
    });

    return {
      success: true,
      message: 'Doctor leave removed successfully.',
    };
  }

  /**
   * Generates pure schedule-derived available appointment slots:
   * 1. Resolves authoritative hospital timezone from Hospital.settings.
   * 2. Retrieves doctor availability windows for that weekday.
   * 3. Slices windows into slot intervals.
   * 4. Discards slots that mathematically overlap any Leave interval.
   */
  async getAvailableSlots(
    tenantId: string | null,
    doctorId: string,
    query: DoctorSlotsQueryDto,
  ): Promise<DoctorSlotsResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context missing.');
    }

    const doctor = await this.prisma.raw.doctor.findFirst({
      where: {
        id: doctorId,
        hospitalId: tenantId,
        deletedAt: null,
        isAvailable: true,
      },
    });

    if (!doctor) {
      throw new NotFoundException(`Active doctor with ID '${doctorId}' not found.`);
    }

    // Fetch authoritative hospital timezone
    const hospital = await this.prisma.raw.hospital.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const timezone = this.schedulingService.resolveHospitalTimezone(
      hospital?.settings,
    );

    // Fetch availability windows
    const windows = await this.prisma.raw.doctorAvailability.findMany({
      where: {
        doctorId,
        isActive: true,
      },
    });

    // Fetch all doctor leaves (service handles UTC interval overlap)
    const leaves = await this.prisma.raw.doctorLeave.findMany({
      where: { doctorId },
      select: {
        startDate: true,
        endDate: true,
      },
    });

    const dayOfWeek = this.schedulingService.getDayOfWeekForDate(query.date);
    const dayWindows = windows.filter(
      (w) => w.dayOfWeek === dayOfWeek && (w.isActive !== false)
    );

    const slots = this.schedulingService.generateSlots(
      windows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        slotDurationMinutes: w.slotDurationMinutes,
        maxBookingsPerSlot: w.maxBookingsPerSlot,
        isActive: w.isActive,
      })),
      leaves,
      query.date,
      timezone,
    );

    const slotDuration =
      dayWindows.length > 0 && dayWindows[0].slotDurationMinutes
        ? dayWindows[0].slotDurationMinutes
        : 30;

    return {
      doctorId,
      date: query.date,
      timezone,
      slotDurationMinutes: slotDuration,
      slots,
    };
  }
}
