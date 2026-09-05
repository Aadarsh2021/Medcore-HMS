import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFamilyHistoryDto {
  @ApiProperty({ description: 'Hereditary / familial health condition', example: 'Diabetes' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  condition: string;

  @ApiProperty({ description: 'Family relationship', example: 'Father' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  relationship: string;

  @ApiPropertyOptional({ description: 'Clinical details, age of onset, or specifics' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Originating MedicalRecord UUID if documented during encounter' })
  @IsOptional()
  @IsUUID()
  recordId?: string;
}
