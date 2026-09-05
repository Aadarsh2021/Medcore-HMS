import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VoidPrescriptionDto {
  @ApiProperty({
    description: 'Mandatory clinical justification for voiding/cancelling the finalized prescription (min 5 chars)',
    example: 'Patient experienced adverse skin reaction. Switching to alternate therapy.',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(5, { message: 'Void reason must be at least 5 characters long' })
  @MaxLength(500)
  reason: string;
}
