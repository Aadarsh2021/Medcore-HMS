import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TriageLevel, TriageStatus } from './triage.types';

export class RegisterEmergencyPatientDto {
  @ApiProperty({ description: 'ID of patient registering in ER' })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ description: 'Assigned on-call ER doctor ID' })
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @ApiProperty({ description: 'Emergency Severity Index level (1: Resuscitation to 5: Non-urgent)', enum: TriageLevel })
  @IsNumber()
  @Min(1)
  @Max(5)
  triageLevel!: TriageLevel;

  @ApiProperty({ description: 'Primary emergency chief complaint' })
  @IsString()
  @IsNotEmpty()
  chiefComplaint!: string;

  @ApiPropertyOptional({ description: 'Blood pressure reading e.g. 120/80' })
  @IsOptional()
  @IsString()
  bp?: string;

  @ApiPropertyOptional({ description: 'Pulse rate in bpm' })
  @IsOptional()
  @IsNumber()
  pulse?: number;

  @ApiPropertyOptional({ description: 'Oxygen saturation percentage' })
  @IsOptional()
  @IsNumber()
  spO2?: number;

  @ApiPropertyOptional({ description: 'Temperature in Fahrenheit' })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Triage clinical assessment notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RapidBedAllocationDto {
  @ApiProperty({ description: 'Emergency encounter ID' })
  @IsString()
  @IsNotEmpty()
  encounterId!: string;

  @ApiProperty({ description: 'Target emergency/ICU bed ID' })
  @IsString()
  @IsNotEmpty()
  bedId!: string;

  @ApiPropertyOptional({ description: 'Clinical transfer/admission notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTriageStatusDto {
  @ApiProperty({ description: 'Target triage workflow status', enum: TriageStatus })
  @IsEnum(TriageStatus)
  status!: TriageStatus;

  @ApiPropertyOptional({ description: 'Status transition notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
