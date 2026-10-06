import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiagnosisType } from '@medcore/types';

export class AddDiagnosisDto {
  @ApiPropertyOptional({ description: 'Standard ICD-10 Diagnostic Code', example: 'J06.9' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/i, {
    message: 'code must be a valid ICD-10 format (e.g. J06.9, R05, I10, E11.9)',
  })
  code?: string;

  @ApiProperty({ description: 'Clinical diagnostic description', example: 'Acute upper respiratory infection, unspecified' })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  description: string;

  @ApiPropertyOptional({ enum: DiagnosisType, default: DiagnosisType.CONFIRMED })
  @IsOptional()
  @IsEnum(DiagnosisType)
  type?: DiagnosisType = DiagnosisType.CONFIRMED;

  @ApiPropertyOptional({ description: 'Whether this is the primary diagnosis', default: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean = true;

  @ApiPropertyOptional({ description: 'Additional clinical reasoning or differential notes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
