import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { StorageService } from './storage.service';
import { SupabaseAuthGuard } from '../../modules/auth/guards/supabase-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { CurrentUser } from '../../modules/auth/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { UserRole } from '@medcore/types';

export class PresignedUploadDto {
  filename!: string;
  mimetype!: string;
  size!: number;
  patientId!: string;
}

@Controller('storage')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('presigned-upload')
  async getPresignedUpload(
    @CurrentUser() user: any,
    @Body() dto: PresignedUploadDto,
  ) {
    if (!dto.patientId) {
      throw new BadRequestException('patientId is required for storage upload');
    }

    const hospitalId = user.hospitalId;
    if (!hospitalId && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('User must belong to a hospital');
    }

    // Patient role authorization check (IDOR protection)
    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.raw.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient || patient.id !== dto.patientId) {
        throw new ForbiddenException('Patients can only upload attachments for their own profile');
      }
    } else {
      // Verify patient exists in the same hospital
      const patient = await this.prisma.raw.patient.findFirst({
        where: { id: dto.patientId, hospitalId },
      });
      if (!patient && user.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Target patient does not belong to your hospital');
      }
    }

    const result = await this.storageService.generatePresignedUploadUrl({
      hospitalId,
      patientId: dto.patientId,
      filename: dto.filename,
      mimetype: dto.mimetype,
      size: dto.size,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Get('presigned-download')
  async getPresignedDownload(
    @CurrentUser() user: any,
    @Query('objectKey') objectKey: string,
  ) {
    if (!objectKey) {
      throw new BadRequestException('objectKey query parameter is required');
    }

    // Object key format: {category}/{hospitalId}/{patientId}/{filename}
    const parts = objectKey.split('/');
    if (parts.length >= 3) {
      const objHospitalId = parts[1];
      const objPatientId = parts[2];

      // Super Admin bypass
      if (user.role !== UserRole.SUPER_ADMIN) {
        // Enforce multi-tenancy
        if (user.hospitalId && user.hospitalId !== objHospitalId) {
          throw new ForbiddenException('Cross-hospital storage access is strictly prohibited');
        }

        // If user is Patient, enforce patient-level ownership
        if (user.role === UserRole.PATIENT) {
          const patient = await this.prisma.raw.patient.findFirst({
            where: { userId: user.id },
          });
          if (!patient || patient.id !== objPatientId) {
            throw new ForbiddenException('Patients may only download their own clinical documents');
          }
        }
      }
    }

    const downloadUrl = await this.storageService.getSignedDownloadUrl(objectKey, 900);

    return {
      success: true,
      data: {
        objectKey,
        downloadUrl,
        expiresInSeconds: 900,
      },
    };
  }
}
