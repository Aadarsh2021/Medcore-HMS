import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { OnboardHospitalDto } from './dto/onboard-hospital.dto';
import { UpdateHospitalDto, QueryHospitalsDto } from './dto/update-hospital.dto';
import { AuditAction } from '@prisma/client';
import { UserRole, HospitalResponse, OnboardHospitalResponse } from '@medcore/types';

@Injectable()
export class HospitalsService {
  private readonly logger = new Logger(HospitalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Super Admin Hospital Onboarding with transactional tenant & initial admin provisioning.
   */
  async onboardHospital(
    actor: { id: string; role: string },
    dto: OnboardHospitalDto,
  ): Promise<OnboardHospitalResponse> {
    if (actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only platform Super Administrators can onboard new hospitals');
    }

    // 1. Verify Unique Slug & Code
    const existing = await this.prisma.raw.hospital.findFirst({
      where: {
        OR: [{ slug: dto.slug.toLowerCase() }, { code: dto.code.toUpperCase() }],
      },
    });

    if (existing) {
      if (existing.slug === dto.slug.toLowerCase()) {
        throw new ConflictException(`Hospital slug "${dto.slug}" is already registered`);
      }
      throw new ConflictException(`Hospital code "${dto.code}" is already registered`);
    }

    // 2. Verify Initial Admin Email Uniqueness
    const existingAdminUser = await this.prisma.raw.user.findUnique({
      where: { email: dto.initialAdmin.email.toLowerCase() },
    });

    if (existingAdminUser) {
      throw new ConflictException(
        `Initial admin email "${dto.initialAdmin.email}" is already registered to an existing user`,
      );
    }

    // 3. Hash Initial Admin Password
    const passwordHash = await bcrypt.hash(dto.initialAdmin.password, 12);

    // 4. Transactional Provisioning
    const result = await this.prisma.$transaction(async (tx) => {
      // Optional Address Creation
      let addressId: string | undefined = undefined;
      if (dto.address) {
        const addr = await tx.address.create({
          data: {
            street: dto.address.street,
            city: dto.address.city,
            state: dto.address.state,
            postalCode: dto.address.postalCode,
            country: dto.address.country || 'India',
          },
        });
        addressId = addr.id;
      }

      // Hospital Record
      const hospital = await tx.hospital.create({
        data: {
          name: dto.name.trim(),
          slug: dto.slug.toLowerCase().trim(),
          code: dto.code.toUpperCase().trim(),
          email: dto.email.toLowerCase().trim(),
          phone: dto.phone.trim(),
          website: dto.website?.trim() || null,
          status: 'ACTIVE',
          subscriptionTier: dto.subscriptionTier || 'STANDARD',
          addressId: addressId || null,
        },
        include: { address: true },
      });

      // Initial Hospital Administrator
      const adminUser = await tx.user.create({
        data: {
          hospitalId: hospital.id,
          email: dto.initialAdmin.email.toLowerCase().trim(),
          passwordHash,
          role: UserRole.HOSPITAL_ADMIN as any,
          firstName: dto.initialAdmin.firstName.trim(),
          lastName: dto.initialAdmin.lastName.trim(),
          phone: dto.initialAdmin.phone?.trim() || null,
          isEmailVerified: true,
          isActive: true,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId: hospital.id,
          userId: actor.id,
          action: AuditAction.CREATE,
          entityName: 'Hospital',
          entityId: hospital.id,
          changesJson: {
            name: hospital.name,
            code: hospital.code,
            slug: hospital.slug,
            initialAdminEmail: adminUser.email,
            onboardedBy: actor.id,
          },
        },
      });

      return { hospital, adminUser };
    });

    return {
      hospital: this.mapHospitalToResponse(result.hospital),
      initialAdmin: {
        id: result.adminUser.id,
        email: result.adminUser.email,
        firstName: result.adminUser.firstName,
        lastName: result.adminUser.lastName,
        role: result.adminUser.role as UserRole,
      },
    };
  }

  /**
   * Retrieves hospital list with role-based scoping and pagination.
   */
  async getHospitals(actor: { id: string; role: string; hospitalId?: string }, query: QueryHospitalsDto) {
    if (actor.role === UserRole.SUPER_ADMIN) {
      const page = Math.max(1, query.page || 1);
      const limit = Math.min(100, Math.max(1, query.limit || 20));
      const skip = (page - 1) * limit;

      const where: any = {};
      if (query.status) {
        where.status = query.status;
      }
      if (query.search) {
        const q = query.search.trim();
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ];
      }

      const [total, records] = await Promise.all([
        this.prisma.raw.hospital.count({ where }),
        this.prisma.raw.hospital.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { address: true },
        }),
      ]);

      return {
        items: records.map((h) => this.mapHospitalToResponse(h)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    if (actor.role === UserRole.HOSPITAL_ADMIN && actor.hospitalId) {
      const hospital = await this.prisma.raw.hospital.findUnique({
        where: { id: actor.hospitalId },
        include: { address: true },
      });
      return {
        items: hospital ? [this.mapHospitalToResponse(hospital)] : [],
        total: hospital ? 1 : 0,
        page: 1,
        limit: 1,
        totalPages: 1,
      };
    }

    throw new ForbiddenException('Access denied: You do not have permission to view the hospital registry');
  }

  /**
   * Retrieves hospital profile by ID with strict tenant boundary enforcement.
   */
  async getHospitalById(hospitalId: string, actor: { id: string; role: string; hospitalId?: string }): Promise<HospitalResponse> {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.hospitalId !== hospitalId) {
      throw new ForbiddenException('Access denied: Cannot access hospital profile outside your tenant facility');
    }

    const hospital = await this.prisma.raw.hospital.findUnique({
      where: { id: hospitalId },
      include: { address: true },
    });

    if (!hospital) {
      throw new NotFoundException('Hospital facility not found');
    }

    return this.mapHospitalToResponse(hospital);
  }

  /**
   * Updates hospital facility metadata, contact info, or settings.
   */
  async updateHospital(
    hospitalId: string,
    actor: { id: string; role: string; hospitalId?: string },
    dto: UpdateHospitalDto,
  ): Promise<HospitalResponse> {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.hospitalId !== hospitalId) {
      throw new ForbiddenException('Access denied: Cannot modify hospital facility outside your tenant');
    }

    const hospital = await this.prisma.raw.hospital.findUnique({
      where: { id: hospitalId },
    });

    if (!hospital) {
      throw new NotFoundException('Hospital facility not found');
    }

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name.trim();
    if (dto.email) updateData.email = dto.email.toLowerCase().trim();
    if (dto.phone) updateData.phone = dto.phone.trim();
    if (dto.website !== undefined) updateData.website = dto.website?.trim() || null;
    if (dto.logoUrl !== undefined) updateData.logoUrl = dto.logoUrl?.trim() || null;
    if (dto.settings) updateData.settings = dto.settings;

    // Privileged fields (Super Admin only)
    if (dto.status || dto.subscriptionTier) {
      if (actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Only Super Administrators can modify hospital status or subscription tier');
      }
      if (dto.status) updateData.status = dto.status;
      if (dto.subscriptionTier) updateData.subscriptionTier = dto.subscriptionTier;
    }

    const updated = await this.prisma.raw.hospital.update({
      where: { id: hospitalId },
      data: updateData,
      include: { address: true },
    });

    await this.prisma.raw.auditLog.create({
      data: {
        hospitalId,
        userId: actor.id,
        action: AuditAction.UPDATE,
        entityName: 'Hospital',
        entityId: hospitalId,
        changesJson: updateData,
      },
    });

    return this.mapHospitalToResponse(updated);
  }

  private mapHospitalToResponse(hospital: any): HospitalResponse {
    return {
      id: hospital.id,
      name: hospital.name,
      slug: hospital.slug,
      code: hospital.code,
      email: hospital.email,
      phone: hospital.phone,
      website: hospital.website,
      logoUrl: hospital.logoUrl,
      status: hospital.status,
      subscriptionTier: hospital.subscriptionTier,
      address: hospital.address
        ? {
            street: hospital.address.street,
            city: hospital.address.city,
            state: hospital.address.state,
            postalCode: hospital.address.postalCode,
            country: hospital.address.country,
          }
        : null,
      settings: (hospital.settings as Record<string, any>) || null,
      createdAt: hospital.createdAt.toISOString(),
      updatedAt: hospital.updatedAt.toISOString(),
    };
  }
}
