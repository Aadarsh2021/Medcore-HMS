import { IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RescheduleAppointmentRequest } from '@medcore/types';

export class RescheduleAppointmentDto implements RescheduleAppointmentRequest {
  @ApiProperty({
    example: '2026-10-22',
    description: 'New appointment date in YYYY-MM-DD format',
  })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'appointmentDate must be a valid calendar date in YYYY-MM-DD format',
  })
  appointmentDate: string;

  @ApiProperty({
    example: '14:00',
    description: 'New slot start time in HH:mm (24-hour) format',
  })
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be a valid 24-hour time in HH:mm format',
  })
  startTime: string;
}
