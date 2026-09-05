import {
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateDoctorAdminRequest } from '@medcore/types';

export class UpdateDoctorDto implements UpdateDoctorAdminRequest {
  @ApiPropertyOptional({ example: '11111111-1111-1111-1111-111111111111', description: 'Department UUID within hospital (Admin only)' })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ example: 'Cardiology', description: 'Clinical specialization (Admin only)' })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({ example: 'MCI-2008-04921', description: 'Medical registration/license number (Admin only)' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({ example: 900.0, description: 'Consultation fee (Admin only)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  consultationFee?: number;

  @ApiPropertyOptional({ example: true, description: 'Doctor availability status for appointments (Admin only)' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 'Updated biographical summary...', description: 'Professional biography (Doctor self-editable or Admin)' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'https://storage.medcore.io/signatures/dr_sharma_new.png', description: 'Digital signature asset URL (Doctor self-editable or Admin)' })
  @IsOptional()
  @IsString()
  signatureUrl?: string;

  @ApiPropertyOptional({ example: 'Rajesh', description: 'First name (Admin only)' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Sharma', description: 'Last name (Admin only)' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '+91 98202 55668', description: 'Personal contact phone (Doctor self-editable or Admin)' })
  @IsOptional()
  @IsString()
  phone?: string;
}
