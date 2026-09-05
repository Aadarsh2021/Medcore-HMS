import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateDoctorLeaveRequest } from '@medcore/types';

export class CreateDoctorLeaveDto implements CreateDoctorLeaveRequest {
  @ApiProperty({
    example: '2026-10-12T00:00:00.000Z',
    description: 'Leave start timestamp (ISO 8601 UTC)',
  })
  @IsISO8601()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    example: '2026-10-12T23:59:59.999Z',
    description: 'Leave end timestamp (ISO 8601 UTC)',
  })
  @IsISO8601()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({
    example: 'Attending National Cardiology Symposium',
    description: 'Reason or notes for the leave/blackout period',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
