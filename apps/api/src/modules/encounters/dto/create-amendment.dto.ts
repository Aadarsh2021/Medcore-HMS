import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AmendmentSection, AmendmentType } from '@medcore/types';

export class CreateAmendmentDto {
  @ApiPropertyOptional({ enum: AmendmentType, default: AmendmentType.ADDENDUM })
  @IsOptional()
  @IsEnum(AmendmentType)
  amendmentType?: AmendmentType = AmendmentType.ADDENDUM;

  @ApiPropertyOptional({ enum: AmendmentSection, default: AmendmentSection.CLINICAL_NOTES })
  @IsOptional()
  @IsEnum(AmendmentSection)
  section?: AmendmentSection = AmendmentSection.CLINICAL_NOTES;

  @ApiProperty({ description: 'Mandatory clinical justification for amendment', minLength: 10 })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ description: 'Exact amendment content or correction text', minLength: 3 })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  content: string;
}
