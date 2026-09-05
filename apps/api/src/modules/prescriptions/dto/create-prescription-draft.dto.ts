import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePrescriptionDraftDto {
  @ApiPropertyOptional({
    description: 'General clinical advice, dietary advice, or follow-up instructions',
    example: 'Drink plenty of water and avoid strenuous exertion.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
