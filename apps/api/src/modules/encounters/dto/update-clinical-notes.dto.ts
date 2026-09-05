import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateClinicalNotesDto {
  @ApiPropertyOptional({ description: 'Primary chief complaint presenting reason', minLength: 3 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  chiefComplaint?: string;

  @ApiPropertyOptional({ description: 'Detailed presenting symptoms & timeline' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  presentingSymptoms?: string;

  @ApiPropertyOptional({ description: 'Physical examination findings and consultation notes' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  clinicalNotes?: string;

  @ApiPropertyOptional({ description: 'Management instructions, patient counseling, and therapeutic plan' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  treatmentPlan?: string;

  @ApiPropertyOptional({ description: 'Advisory follow-up review date (ISO 8601 string)' })
  @IsOptional()
  @IsDateString()
  followUpDate?: string;
}
