import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus, UpdateAppointmentStatusRequest } from '@medcore/types';

/**
 * Admin/Receptionist-only status transition.
 * Allowed values: CONFIRMED | IN_PROGRESS | COMPLETED | NO_SHOW
 * PENDING and CANCELLED may NOT be set via this endpoint.
 */
const ALLOWED_ADMIN_STATUSES = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

export class UpdateAppointmentStatusDto implements UpdateAppointmentStatusRequest {
  @ApiProperty({
    enum: ALLOWED_ADMIN_STATUSES,
    example: AppointmentStatus.CONFIRMED,
    description: 'New appointment status. Allowed: CONFIRMED, IN_PROGRESS, COMPLETED, NO_SHOW.',
  })
  @IsNotEmpty()
  @IsEnum(AppointmentStatus, {
    message: `status must be one of: ${ALLOWED_ADMIN_STATUSES.join(', ')}`,
  })
  status: AppointmentStatus;

  @ApiPropertyOptional({
    example: 'Patient checked in at reception.',
    description: 'Optional clinical or operational notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
