import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CancelAppointmentRequest } from '@medcore/types';

export class CancelAppointmentDto implements CancelAppointmentRequest {
  @ApiPropertyOptional({
    example: 'Patient is travelling and unable to attend.',
    description: 'Optional reason for cancellation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;
}
