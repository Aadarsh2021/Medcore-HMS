import {
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DoctorSlotsQueryDto {
  @ApiProperty({
    example: '2026-10-12',
    description: 'Calendar date in hospital timezone (YYYY-MM-DD format)',
  })
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a valid calendar date in YYYY-MM-DD format',
  })
  date: string;
}
