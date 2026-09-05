import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateDoctorRequest } from '@medcore/types';

export class CreateDoctorDto implements CreateDoctorRequest {
  @ApiProperty({ example: 'dr.sharma@metrogeneral.org', description: 'Clinician work email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 'DoctorPass123!', description: 'Optional initial account password' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ example: 'Rajesh', description: 'Doctor first name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Sharma', description: 'Doctor last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: '+91 98202 55667', description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111', description: 'Department UUID within hospital' })
  @IsUUID()
  @IsNotEmpty()
  departmentId: string;

  @ApiProperty({ example: 'Interventional Cardiology', description: 'Clinical specialization' })
  @IsString()
  @IsNotEmpty()
  specialization: string;

  @ApiProperty({ example: 'MCI-2008-04921', description: 'Medical registration/license number' })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiPropertyOptional({ example: 800.0, description: 'Consultation fee in hospital currency' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  consultationFee?: number;

  @ApiPropertyOptional({ example: 'Senior Consultant Cardiologist with 16+ years experience.', description: 'Professional biography' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'https://storage.medcore.io/signatures/dr_sharma.png', description: 'Digital signature image URL' })
  @IsOptional()
  @IsString()
  signatureUrl?: string;
}
