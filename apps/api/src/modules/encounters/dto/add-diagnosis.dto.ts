import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
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
