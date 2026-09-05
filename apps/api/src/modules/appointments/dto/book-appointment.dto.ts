import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentType, BookAppointmentRequest } from '@medcore/types';

export class BookAppointmentDto implements BookAppointmentRequest {
  @ApiProperty({
    example: '11111111-1111-1111-1111-111111111111',
    description: 'Doctor UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  doctorId: string;

  @ApiProperty({
    example: '2026-10-15',
    description: 'Appointment date in YYYY-MM-DD format (hospital local timezone)',
  })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'appointmentDate must be a valid calendar date in YYYY-MM-DD format',
  })
  appointmentDate: string;

  @ApiProperty({
    example: '09:30',
    description: 'Slot start time in HH:mm (24-hour) format — must match a generated schedule slot',
  })
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be a valid 24-hour time in HH:mm format',
  })
  startTime: string;

  @ApiPropertyOptional({
    example: '22222222-2222-2222-2222-222222222222',
    description:
      'Patient UUID — required for RECEPTIONIST/ADMIN roles. Ignored for PATIENT role (derived from token).',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    enum: AppointmentType,
    example: AppointmentType.REGULAR,
    description: 'Appointment type (default: REGULAR)',
  })
  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @ApiPropertyOptional({
    example: 'Chest pain and shortness of breath',
    description: 'Patient-reported reason for visit',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({
    example: 'Patient prefers morning appointments',
    description: 'Internal notes for the booking',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
