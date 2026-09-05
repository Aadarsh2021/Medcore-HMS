import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadGatewayException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  UserRole,
  PatientResponseData,
  PatientListItemData,
  PaginatedResponse,
} from '@medcore/types';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseService } from '../auth/supabase.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';

/**
 * Unusable placeholder password hash stored in PostgreSQL User.passwordHash.
 * Supabase Auth is the single authoritative identity provider for MedCore HMS.
 * This placeholder satisfies the non-null schema column without storing a second active credential.
 */
export const SUPABASE_MANAGED_PASSWORD_HASH =
  '$2b$10$auth.managed.by.supabase.placeholder';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Safely retrieves the Supabase Admin client if configured, returning null otherwise.
   */
  private getSupabaseAdmin(): SupabaseClient | null {
    try {
      return this.supabaseService?.adminClient || null;
    } catch {
      return null;
    }
  }

  /**
   * Generates a concurrency-safe, server-authoritative Unique Hospital ID (UHID).
   * Uses PostgreSQL pessimistic row-locking on the Hospital tenant record within an
   * interactive transaction to guarantee zero collisions under concurrent registrations.
   */
  async generateUhid(
    tx: Prisma.TransactionClient,
    hospitalId: string,
  ): Promise<string> {
    // 1. Acquire transaction-level advisory lock scoped to this specific hospital
    // Uses PostgreSQL built-in advisory locks for high-performance, deadlock-free serialization
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${'uhid_' + hospitalId}))
    `;

    // 2. Fetch hospital prefix/code
    const hospital = await tx.hospital.findUnique({
      where: { id: hospitalId },
      select: { code: true, slug: true },
    });

    const prefix = (
      hospital?.code
        ? hospital.code.split('-')[0]
        : hospital?.slug?.substring(0, 5) || 'MED'
    ).toUpperCase();

    const currentYear = new Date().getFullYear();
    const uhidPrefix = `${prefix}-${currentYear}-`;

    // 3. Find the highest existing UHID sequence for this hospital and year
    const lastPatient = await tx.patient.findFirst({
      where: {
        hospitalId,
        uhid: {
          startsWith: uhidPrefix,
        },
      },
      orderBy: {
        uhid: 'desc',
      },
      select: {
        uhid: true,
      },
    });

    let nextSequence = 1;
    if (lastPatient?.uhid) {
      const parts = lastPatient.uhid.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextSequence = lastSeq + 1;
      }
    }

    const formattedSequence = String(nextSequence).padStart(5, '0');
    return `${uhidPrefix}${formattedSequence}`;
  }

  /**
   * Registers a new patient with demographics, relational address, emergency contact,
   * server-generated UHID, and provisions their Supabase Auth identity.
   *
   * Architecture & Security:
   * - Supabase Auth is the single authoritative identity provider.
   * - No dual credentials: User.passwordHash receives a non-credential placeholder.
   * - Transactional compensation: If the database transaction fails, any newly provisioned
   *   Supabase identity is automatically deleted to prevent orphaned auth accounts.
   */
  async register(
    tenantId: string | null,
    dto: CreatePatientDto,
  ): Promise<PatientResponseData> {
    if (!tenantId) {
      throw new ForbiddenException(
        'Tenant context missing: A valid hospital facility must be active or specified via X-Hospital-Id.',
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();

    // Verify email is not already registered as an existing patient
    const existingUser = await this.prisma.raw.user.findUnique({
      where: { email: normalizedEmail },
      include: { patientProfile: true },
    });

    if (existingUser?.patientProfile) {
      throw new ConflictException(
        'PATIENT_ALREADY_EXISTS: A patient record is already associated with this email address.',
      );
    }

    // Determine initial password for Supabase Auth identity
    const rawPassword =
      dto.password || crypto.randomBytes(16).toString('hex') + 'P@ss1';

    // Synchronous Supabase Auth provisioning
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
              role: UserRole.PATIENT,
              hospitalId: tenantId,
            },
          });

        if (sbError) {
          // If already registered in Supabase Auth, check if already linked
          if (
            sbError.message?.toLowerCase().includes('already') ||
            (sbError as any).status === 422
          ) {
            const { data: listData } =
              await adminClient.auth.admin.listUsers();
            const existingSbUser = (listData?.users as any[])?.find(
              (u: any) => u.email?.toLowerCase() === normalizedEmail,
            );

            if (existingSbUser) {
              const linkedDbUser = await this.prisma.raw.user.findFirst({
                where: { supabaseAuthId: existingSbUser.id },
                include: { patientProfile: true },
              });
              if (linkedDbUser?.patientProfile) {
                throw new ConflictException(
                  'PATIENT_ALREADY_EXISTS: A user with this email is already registered as a patient in authentication provider.',
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
              `Failed to provision authentication identity in Supabase: ${sbError.message}`,
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
    } else if (!adminClient) {
      this.logger.warn(
        'Supabase admin client not initialized. Proceeding without Supabase auth provisioning (offline/test mode).',
      );
    }

    // Execute atomic transaction for Address + User + Concurrency-Locked UHID + Patient
    let createdPatient;
    try {
      createdPatient = await this.prisma.raw.$transaction(
        async (tx) => {
          // 1. Create Address if provided
          let addressId: string | null = null;

          if (dto.address) {
            const address = await tx.address.create({
              data: {
                street: dto.address.street,
                city: dto.address.city,
                state: dto.address.state,
                postalCode: dto.address.postalCode,
                country: dto.address.country || 'India',
              },
            });
            addressId = address.id;
          }

          // 2. Create or link User
          let userId: string;
          if (existingUser) {
            userId = existingUser.id;
            await tx.user.update({
              where: { id: userId },
              data: {
                hospitalId: existingUser.hospitalId || tenantId,
                supabaseAuthId: existingUser.supabaseAuthId || supabaseAuthId,
              },
            });
          } else {
            const newUser = await tx.user.create({
              data: {
                hospitalId: tenantId,
                email: normalizedEmail,
                // Supabase Auth is authoritative; store non-credential placeholder
                passwordHash: SUPABASE_MANAGED_PASSWORD_HASH,
                role: UserRole.PATIENT,
                firstName: dto.firstName.trim(),
                lastName: dto.lastName.trim(),
                phone: dto.phone || null,
                supabaseAuthId,
                isEmailVerified: true,
              },
            });
            userId = newUser.id;
          }

          // 3. Generate concurrency-safe UHID inside the locked transaction
          const uhid = await this.generateUhid(tx, tenantId);

          // 4. Create Patient record
          return tx.patient.create({
            data: {
              userId,
              hospitalId: tenantId,
              uhid,
              dateOfBirth: new Date(dto.dateOfBirth),
              gender: dto.gender,
              bloodGroup: dto.bloodGroup || null,
              allergiesSummary: dto.allergiesSummary || null,
              addressId,
              emergencyContactName: dto.emergencyContact?.name || null,
              emergencyContactPhone: dto.emergencyContact?.phone || null,
              emergencyContactRelation: dto.emergencyContact?.relation || null,
            },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  avatarUrl: true,
                  isActive: true,
                },
              },
              address: true,
            },
          });
        },
        { maxWait: 30000, timeout: 30000 },
      );
    } catch (dbError: any) {
      // Compensation: if we newly created a Supabase Auth identity, roll it back
      if (newlyCreatedSupabaseUserId && adminClient) {
        try {
          await adminClient.auth.admin.deleteUser(newlyCreatedSupabaseUserId);
          this.logger.warn(
            `Compensated: Rolled back Supabase Auth user ${newlyCreatedSupabaseUserId} after DB transaction failure.`,
          );
        } catch (cleanupErr: any) {
          this.logger.error(
            `Failed to roll back Supabase Auth user ${newlyCreatedSupabaseUserId}: ${cleanupErr.message}`,
          );
        }
      }
      throw dbError;
    }

    return this.formatPatientResponse(createdPatient);
  }



  /**
   * Retrieves a paginated list of patients matching optional filters and search query.
   * Automatically scoped to active tenant by Prisma tenant extension.
   */
  async findAll(
    tenantId: string | null,
    query: PatientQueryDto,
    caller: any,
  ): Promise<PaginatedResponse<PatientListItemData>> {
    if (caller.role === UserRole.PATIENT) {
      throw new ForbiddenException(
        'Access denied: Patients are not permitted to list all patient directories.',
      );
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PatientWhereInput = {
      deletedAt: query.includeDeleted ? undefined : null,
    };

    if (query.gender) {
      where.gender = query.gender;
    }

    if (query.bloodGroup) {
      where.bloodGroup = query.bloodGroup;
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { uhid: { contains: term, mode: 'insensitive' } },
        { user: { firstName: { contains: term, mode: 'insensitive' } } },
        { user: { lastName: { contains: term, mode: 'insensitive' } } },
        { user: { phone: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    // Uses this.prisma.patient which automatically applies hospitalId scoping
    const [records, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.patient.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const data: PatientListItemData[] = records.map((p) => ({
      id: p.id,
      uhid: p.uhid,
      hospitalId: p.hospitalId,
      fullName: `${p.user.firstName} ${p.user.lastName}`.trim(),
      firstName: p.user.firstName,
      lastName: p.user.lastName,
      email: p.user.email,
      phone: p.user.phone,
      dateOfBirth: p.dateOfBirth.toISOString().split('T')[0],
      gender: p.gender as any,
      bloodGroup: p.bloodGroup as any,
      createdAt: p.createdAt.toISOString(),
    }));

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Retrieves full details of a specific patient record.
   * Enforces patient self-access and tenant boundaries.
   */
  async findById(
    tenantId: string | null,
    patientId: string,
    caller: any,
  ): Promise<PatientResponseData> {
    // Patient Self-Access Enforcement
    if (caller.role === UserRole.PATIENT) {
      const callerPatientId = caller.patientProfile?.id;
      if (!callerPatientId || callerPatientId !== patientId) {
        throw new ForbiddenException(
          'Access denied: Patients may only access their own clinical records.',
        );
      }
    }

    // Queries this.prisma.patient, which routes findUnique to tenant-filtered findFirst
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
            isActive: true,
          },
        },
        address: true,
      },
    });

    if (
      !patient ||
      (patient.deletedAt &&
        caller.role !== UserRole.HOSPITAL_ADMIN &&
        caller.role !== UserRole.SUPER_ADMIN)
    ) {
      throw new NotFoundException(
        'PATIENT_NOT_FOUND: Patient record not found or has been deactivated.',
      );
    }

    return this.formatPatientResponse(patient);
  }

  /**
   * Updates patient demographics, emergency contact, and address.
   */
  async update(
    tenantId: string | null,
    patientId: string,
    dto: UpdatePatientDto,
    caller: any,
  ): Promise<PatientResponseData> {
    if (caller.role === UserRole.PATIENT) {
      throw new ForbiddenException(
        'Access denied: Patients cannot directly update demographic records.',
      );
    }

    // Verify patient exists in active tenant
    const existing = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { user: true, address: true },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(
        'PATIENT_NOT_FOUND: Patient record not found or has been deactivated.',
      );
    }

    // Perform demographic update in interactive transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Update User names/phone if provided
      if (dto.firstName || dto.lastName || dto.phone !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            firstName: dto.firstName?.trim() || undefined,
            lastName: dto.lastName?.trim() || undefined,
            phone: dto.phone !== undefined ? dto.phone : undefined,
          },
        });
      }

      // 2. Update or Create Address if provided
      let addressId = existing.addressId;
      if (dto.address) {
        if (addressId) {
          await tx.address.update({
            where: { id: addressId },
            data: {
              street: dto.address.street,
              city: dto.address.city,
              state: dto.address.state,
              postalCode: dto.address.postalCode,
              country: dto.address.country || 'India',
            },
          });
        } else {
          const newAddress = await tx.address.create({
            data: {
              street: dto.address.street,
              city: dto.address.city,
              state: dto.address.state,
              postalCode: dto.address.postalCode,
              country: dto.address.country || 'India',
            },
          });
          addressId = newAddress.id;
        }
      }

      // 3. Update Patient demographic scalar fields
      await tx.patient.update({
        where: { id: patientId },
        data: {
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          gender: dto.gender || undefined,
          bloodGroup: dto.bloodGroup !== undefined ? dto.bloodGroup : undefined,
          allergiesSummary:
            dto.allergiesSummary !== undefined ? dto.allergiesSummary : undefined,
          emergencyContactName:
            dto.emergencyContact?.name !== undefined
              ? dto.emergencyContact.name
              : undefined,
          emergencyContactPhone:
            dto.emergencyContact?.phone !== undefined
              ? dto.emergencyContact.phone
              : undefined,
          emergencyContactRelation:
            dto.emergencyContact?.relation !== undefined
              ? dto.emergencyContact.relation
              : undefined,
          addressId,
        },
      });
    });

    return this.findById(tenantId, patientId, caller);
  }

  /**
   * Soft-deletes a patient record by setting deletedAt timestamp.
   * Preserves all clinical history (encounters, vitals, prescriptions, invoices).
   */
  async softDelete(
    tenantId: string | null,
    patientId: string,
    caller: any,
  ): Promise<{ id: string; deletedAt: Date }> {
    if (
      caller.role !== UserRole.HOSPITAL_ADMIN &&
      caller.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Access denied: Only Hospital Administrators can deactivate patient records.',
      );
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.deletedAt) {
      throw new NotFoundException(
        'PATIENT_NOT_FOUND: Patient record not found or already deactivated.',
      );
    }

    const updated = await this.prisma.patient.update({
      where: { id: patientId },
      data: { deletedAt: new Date() },
    });

    return {
      id: updated.id,
      deletedAt: updated.deletedAt!,
    };
  }

  /**
   * Formats internal Prisma Patient entity to standard PatientResponseData.
   * Ensures no sensitive credentials or internal auth hashes are exposed.
   */
  private formatPatientResponse(patient: any): PatientResponseData {
    return {
      id: patient.id,
      uhid: patient.uhid,
      hospitalId: patient.hospitalId,
      dateOfBirth: patient.dateOfBirth.toISOString().split('T')[0],
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      allergiesSummary: patient.allergiesSummary,
      emergencyContactName: patient.emergencyContactName,
      emergencyContactPhone: patient.emergencyContactPhone,
      emergencyContactRelation: patient.emergencyContactRelation,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
      deletedAt: patient.deletedAt ? patient.deletedAt.toISOString() : null,
      user: {
        id: patient.user.id,
        email: patient.user.email,
        firstName: patient.user.firstName,
        lastName: patient.user.lastName,
        phone: patient.user.phone,
        avatarUrl: patient.user.avatarUrl,
        isActive: patient.user.isActive,
      },
      address: patient.address
        ? {
            id: patient.address.id,
            street: patient.address.street,
            city: patient.address.city,
            state: patient.address.state,
            postalCode: patient.address.postalCode,
            country: patient.address.country,
          }
        : null,
    };
  }
}
