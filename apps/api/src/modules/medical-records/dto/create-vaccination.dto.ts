import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVaccinationDto {
  @ApiProperty({ description: 'Vaccine product name', example: 'Covishield COVID-19' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  vaccineName: string;

  @ApiProperty({ description: 'Vaccine administration date (ISO date string)', example: '2021-06-15' })
  @IsNotEmpty()
  @IsDateString()
  administeredDate: string;

  @ApiPropertyOptional({ description: 'Batch / Lot number', example: '4121Z023' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({ description: 'Next scheduled booster/due date (ISO date string)' })
  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @ApiPropertyOptional({ description: 'Clinical administration notes or site' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Originating MedicalRecord UUID if administered during encounter' })
  @IsOptional()
  @IsUUID()
  recordId?: string;
}
