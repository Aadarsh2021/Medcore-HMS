import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMedicationHistoryDto {
  @ApiProperty({ description: 'Medication name', example: 'Metformin' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  medicationName: string;

  @ApiProperty({ description: 'Dosage and strength', example: '500mg' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  dosage: string;

  @ApiProperty({ description: 'Administration frequency', example: 'Twice daily (BD)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  frequency: string;

  @ApiPropertyOptional({ description: 'Route of administration', example: 'Oral' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  route?: string;

  @ApiPropertyOptional({ description: 'Treatment start date (ISO date string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Treatment discontinuation/end date (ISO date string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Whether medication is currently active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ description: 'Clinical notes or indication' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Originating MedicalRecord UUID if prescribed during an encounter' })
  @IsOptional()
  @IsUUID()
  recordId?: string;
}
