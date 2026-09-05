import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AllergySeverity } from '@medcore/types';

export class CreateAllergyDto {
  @ApiProperty({ description: 'Allergen / substance name', example: 'Penicillin' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  allergen: string;

  @ApiProperty({ description: 'Clinical reaction description', example: 'Anaphylactic rash and facial edema' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  reaction: string;

  @ApiPropertyOptional({ enum: AllergySeverity, default: AllergySeverity.MODERATE })
  @IsOptional()
  @IsEnum(AllergySeverity)
  severity?: AllergySeverity = AllergySeverity.MODERATE;

  @ApiPropertyOptional({ description: 'Diagnosis timestamp (ISO date string)' })
  @IsOptional()
  @IsDateString()
  diagnosedAt?: string;

  @ApiPropertyOptional({ description: 'Originating MedicalRecord UUID if discovered during an encounter' })
  @IsOptional()
  @IsUUID()
  recordId?: string;
}
