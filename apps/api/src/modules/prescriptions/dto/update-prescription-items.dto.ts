import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MedicineForm, PrescriptionFrequency } from '@medcore/types';

export class PrescriptionItemDto {
  @ApiPropertyOptional({
    description: 'Catalog Medicine UUID. If provided, snapshot fields are verified against DB record.',
    example: '832a554e-b954-4b04-a988-836bcd6f9c7b',
  })
  @IsOptional()
  @IsUUID()
  medicineId?: string | null;

  @ApiPropertyOptional({
    description: 'Medicine name (required if custom uncataloged medicine)',
    example: 'Paracetamol 650mg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  medicineName?: string;

  @ApiPropertyOptional({
    description: 'Dosage form',
    enum: MedicineForm,
    default: MedicineForm.TABLET,
  })
  @IsOptional()
  @IsEnum(MedicineForm)
  form?: MedicineForm;

  @ApiPropertyOptional({
    description: 'Medicine strength',
    example: '650 mg',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  strength?: string | null;

  @ApiProperty({
    description: 'Dosage amount (e.g. 1 tablet, 5 ml, 1 puff)',
    example: '1 tablet',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  dosage: string;

  @ApiProperty({
    description: 'Frequency of intake',
    enum: PrescriptionFrequency,
    example: PrescriptionFrequency.TDS,
  })
  @IsNotEmpty()
  @IsEnum(PrescriptionFrequency)
  frequency: PrescriptionFrequency;

  @ApiProperty({
    description: 'Duration in days (minimum 1, maximum 365)',
    example: 5,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays: number;

  @ApiPropertyOptional({
    description: 'Administration route (default ORAL)',
    example: 'ORAL',
    default: 'ORAL',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  route?: string = 'ORAL';

  @ApiPropertyOptional({
    description: 'Specific patient instructions',
    example: 'Take after food with water. Avoid lying down immediately.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instructions?: string | null;

  @ApiPropertyOptional({
    description: 'Total dispensed/prescribed units (optional)',
    example: 15,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity?: number | null;
}

export class UpdatePrescriptionItemsDto {
  @ApiPropertyOptional({
    description: 'Clinical advice or dietary notes',
    example: 'Avoid heavy lifting. Drink 2L of water daily.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiProperty({
    description: 'Prescription items list',
    type: [PrescriptionItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
