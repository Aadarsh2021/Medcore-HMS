import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/create-department.dto';
import { AuditAction } from '@prisma/client';
import { DepartmentResponse } from '@medcore/types';

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new clinical or administrative department within the hospital tenant.
   */
  async createDepartment(
    hospitalId: string,
    actor: { id: string; role: string },
    dto: CreateDepartmentDto,
  ): Promise<DepartmentResponse> {
    const code = dto.code.toUpperCase().trim();

    // 1. Verify unique department code within hospital
    const existing = await this.prisma.raw.department.findUnique({
      where: {
        hospitalId_code: {
          hospitalId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Department code "${code}" already exists in this hospital`);
    }

    // 2. Verify head doctor if provided
    let headDoctorUser: { firstName: string; lastName: string } | null = null;
    if (dto.headDoctorId) {
      const doctor = await this.prisma.raw.doctor.findFirst({
        where: { id: dto.headDoctorId, hospitalId },
        include: { user: true },
      });
      if (!doctor) {
        throw new BadRequestException('Referenced head doctor does not belong to this hospital facility');
      }
      headDoctorUser = doctor.user;
    }

    // 3. Create Department
    const department = await this.prisma.raw.department.create({
      data: {
        hospitalId,
        name: dto.name.trim(),
        code,
        description: dto.description?.trim() || null,
        headDoctorId: dto.headDoctorId || null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    // 4. Audit Log
    await this.prisma.raw.auditLog.create({
      data: {
        hospitalId,
        userId: actor.id,
        action: AuditAction.CREATE,
        entityName: 'Department',
        entityId: department.id,
        changesJson: {
          name: department.name,
          code: department.code,
          headDoctorId: department.headDoctorId,
          isActive: department.isActive,
        },
      },
    });

    return {
      id: department.id,
      hospitalId: department.hospitalId,
      name: department.name,
      code: department.code,
      description: department.description,
      headDoctorId: department.headDoctorId,
      headDoctorName: headDoctorUser ? `Dr. ${headDoctorUser.firstName} ${headDoctorUser.lastName}` : null,
      doctorCount: 0,
      activeAppointmentsToday: 0,
      isActive: department.isActive,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves all departments for the hospital tenant with active doctor & appointment census.
   */
  async getDepartments(
    hospitalId: string,
    query?: { isActive?: boolean; search?: string },
  ): Promise<DepartmentResponse[]> {
    const where: any = { hospitalId };

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const departments = await this.prisma.raw.department.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        doctors: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        _count: {
          select: {
            doctors: true,
            appointments: {
              where: {
                appointmentDate: {
                  gte: startOfToday,
                  lte: endOfToday,
                },
                status: {
                  in: ['CONFIRMED', 'IN_PROGRESS', 'PENDING'],
                },
              },
            },
          },
        },
      },
    });

    // Resolve head doctor names if headDoctorId is set
    const headDoctorIds = departments
      .map((d) => d.headDoctorId)
      .filter((id): id is string => Boolean(id));

    const headDoctors = headDoctorIds.length > 0
      ? await this.prisma.raw.doctor.findMany({
          where: { id: { in: headDoctorIds } },
          include: { user: { select: { firstName: true, lastName: true } } },
        })
      : [];

    const headDoctorMap = new Map<string, string>();
    headDoctors.forEach((doc) => {
      headDoctorMap.set(doc.id, `Dr. ${doc.user.firstName} ${doc.user.lastName}`);
    });

    return departments.map((d) => ({
      id: d.id,
      hospitalId: d.hospitalId,
      name: d.name,
      code: d.code,
      description: d.description,
      headDoctorId: d.headDoctorId,
      headDoctorName: d.headDoctorId ? headDoctorMap.get(d.headDoctorId) || null : null,
      doctorCount: d._count.doctors,
      activeAppointmentsToday: d._count.appointments,
      isActive: d.isActive,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  /**
   * Retrieves single department by ID with strict tenant boundary check.
   */
  async getDepartmentById(hospitalId: string, departmentId: string): Promise<DepartmentResponse> {
    const department = await this.prisma.raw.department.findFirst({
      where: { id: departmentId, hospitalId },
      include: {
        doctors: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true, phone: true } },
          },
        },
        _count: {
          select: {
            doctors: true,
            appointments: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found in this hospital facility');
    }

    let headDoctorName: string | null = null;
    if (department.headDoctorId) {
      const headDoc = await this.prisma.raw.doctor.findUnique({
        where: { id: department.headDoctorId },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
      if (headDoc) {
        headDoctorName = `Dr. ${headDoc.user.firstName} ${headDoc.user.lastName}`;
      }
    }

    return {
      id: department.id,
      hospitalId: department.hospitalId,
      name: department.name,
      code: department.code,
      description: department.description,
      headDoctorId: department.headDoctorId,
      headDoctorName,
      doctorCount: department._count.doctors,
      activeAppointmentsToday: 0,
      isActive: department.isActive,
      createdAt: department.createdAt.toISOString(),
      updatedAt: department.updatedAt.toISOString(),
    };
  }

  /**
   * Updates department details, head doctor link, or active status.
   */
  async updateDepartment(
    hospitalId: string,
    actor: { id: string; role: string },
    departmentId: string,
    dto: UpdateDepartmentDto,
  ): Promise<DepartmentResponse> {
    const department = await this.prisma.raw.department.findFirst({
      where: { id: departmentId, hospitalId },
    });

    if (!department) {
      throw new NotFoundException('Department not found in this hospital facility');
    }

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name.trim();

    if (dto.code && dto.code.toUpperCase() !== department.code) {
      const newCode = dto.code.toUpperCase().trim();
      const existing = await this.prisma.raw.department.findUnique({
        where: {
          hospitalId_code: {
            hospitalId,
            code: newCode,
          },
        },
      });
      if (existing && existing.id !== departmentId) {
        throw new ConflictException(`Department code "${newCode}" already in use by another department`);
      }
      updateData.code = newCode;
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description?.trim() || null;
    }

    if (dto.headDoctorId !== undefined) {
      if (dto.headDoctorId) {
        const doc = await this.prisma.raw.doctor.findFirst({
          where: { id: dto.headDoctorId, hospitalId },
        });
        if (!doc) {
          throw new BadRequestException('Referenced head doctor does not belong to this hospital');
        }
      }
      updateData.headDoctorId = dto.headDoctorId;
    }

    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    const updated = await this.prisma.raw.department.update({
      where: { id: departmentId },
      data: updateData,
    });

    // Audit Log
    await this.prisma.raw.auditLog.create({
      data: {
        hospitalId,
        userId: actor.id,
        action: AuditAction.UPDATE,
        entityName: 'Department',
        entityId: departmentId,
        changesJson: updateData,
      },
    });

    return this.getDepartmentById(hospitalId, departmentId);
  }

  /**
   * Safely deletes or deactivates department.
   */
  async deleteDepartment(
    hospitalId: string,
    actor: { id: string; role: string },
    departmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const department = await this.prisma.raw.department.findFirst({
      where: { id: departmentId, hospitalId },
      include: {
        _count: {
          select: { doctors: true, appointments: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found in this hospital facility');
    }

    // Safety check: if doctors or appointments are attached, soft deactivate instead of breaking foreign keys
    if (department._count.doctors > 0 || department._count.appointments > 0) {
      await this.prisma.raw.department.update({
        where: { id: departmentId },
        data: { isActive: false },
      });

      await this.prisma.raw.auditLog.create({
        data: {
          hospitalId,
          userId: actor.id,
          action: AuditAction.UPDATE,
          entityName: 'Department',
          entityId: departmentId,
          changesJson: { isActive: false, reason: 'Deactivated due to existing clinical dependencies' },
        },
      });

      return {
        success: true,
        message: 'Department has associated doctors/appointments; successfully deactivated instead of hard-deleted',
      };
    }

    await this.prisma.raw.department.delete({
      where: { id: departmentId },
    });

    await this.prisma.raw.auditLog.create({
      data: {
        hospitalId,
        userId: actor.id,
        action: AuditAction.DELETE,
        entityName: 'Department',
        entityId: departmentId,
      },
    });

    return {
      success: true,
      message: 'Department deleted successfully',
    };
  }
}
