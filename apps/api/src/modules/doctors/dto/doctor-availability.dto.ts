import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DoctorAvailabilityWindowDto as IDoctorAvailabilityWindowDto,
  SetDoctorAvailabilityRequest,
} from '@medcore/types';

export class DoctorAvailabilityWindowDto implements IDoctorAvailabilityWindowDto {
  @ApiPropertyOptional({ example: 'uuid', description: 'Existing window ID if updating' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 1, description: 'Day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ example: '09:00', description: 'Start time in 24-hour HH:mm format' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be a valid 24-hour time format (HH:mm)',
  })
  startTime: string;

  @ApiProperty({ example: '13:00', description: 'End time in 24-hour HH:mm format' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be a valid 24-hour time format (HH:mm)',
  })
  endTime: string;

  @ApiPropertyOptional({ example: 30, description: 'Slot duration in minutes (5–240)', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  slotDurationMinutes?: number = 30;

  @ApiPropertyOptional({ example: 1, description: 'Maximum bookings allowed per slot (metadata)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxBookingsPerSlot?: number = 1;

  @ApiPropertyOptional({ example: true, description: 'Window active status', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class SetDoctorAvailabilityDto implements SetDoctorAvailabilityRequest {
  @ApiProperty({
    type: [DoctorAvailabilityWindowDto],
    description: 'Weekly recurring availability windows for the doctor',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DoctorAvailabilityWindowDto)
  windows: DoctorAvailabilityWindowDto[];
}
