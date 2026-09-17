import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabOrderStatus, LabPriority, LabResultFlag, LabSpecimenStatus } from '@medcore/types';

export class CreateLabOrderItemDto {
  @ApiProperty({ description: 'Catalog Lab Test UUID' })
  @IsUUID()
  @IsNotEmpty()
  testId: string;

  @ApiPropertyOptional({ description: 'Optional clinical instructions for this specific test' })
  @IsOptional()
  @IsString()
  technicianNotes?: string;
}

export class CreateLabOrderDto {
  @ApiProperty({ description: 'Patient UUID' })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ description: 'Ordering Doctor UUID' })
  @IsUUID()
  @IsNotEmpty()
  doctorId: string;

  @ApiPropertyOptional({ description: 'Associated Clinical Encounter UUID (optional for direct walk-ins)' })
  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @ApiPropertyOptional({ enum: LabPriority, default: LabPriority.ROUTINE })
  @IsOptional()
  @IsEnum(LabPriority)
  priority?: LabPriority;

  @ApiPropertyOptional({ description: 'Intended specimen type (e.g., Venous Whole Blood (EDTA))' })
  @IsOptional()
  @IsString()
  specimenType?: string;

  @ApiPropertyOptional({ description: 'Diagnostic requisition notes from doctor' })
  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @ApiProperty({ type: [CreateLabOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLabOrderItemDto)
  items: CreateLabOrderItemDto[];
}

export class CollectSpecimenDto {
  @ApiProperty({ description: 'Collected specimen description/container type' })
  @IsString()
  @IsNotEmpty()
  specimenType: string;

  @ApiPropertyOptional({ description: 'Specimen notes (e.g., hemolysis status, site)' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Time of sample draw (ISO string)' })
  @IsOptional()
  @IsISO8601()
  collectedAt?: string;
}

export class RejectSpecimenDto {
  @ApiProperty({ description: 'Mandatory clinical reason for specimen rejection' })
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}

export class EnterLabResultItemDto {
  @ApiPropertyOptional({ description: 'LabOrderItem UUID' })
  @IsOptional()
  @IsUUID()
  orderItemId?: string;

  @ApiPropertyOptional({ description: 'Test code (e.g. CBC-01, LIPID-01)' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: 'Measured clinical value (numeric or text)' })
  @IsString()
  @IsNotEmpty()
  resultValue: string;

  @ApiPropertyOptional({ description: 'Unit of measurement override' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Reference range text display' })
  @IsOptional()
  @IsString()
  referenceRange?: string;

  @ApiPropertyOptional({ description: 'Client submitted flag (server calculates authoritative flag)' })
  @IsOptional()
  @IsEnum(LabResultFlag)
  flag?: LabResultFlag;

  @ApiPropertyOptional({ description: 'Technician observation notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class EnterLabResultsDto {
  @ApiProperty({ type: [EnterLabResultItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EnterLabResultItemDto)
  results: EnterLabResultItemDto[];
}

export class ApproveLabOrderDto {
  @ApiPropertyOptional({ description: 'Pathologist / certifying physician full name for report signature' })
  @IsOptional()
  @IsString()
  pathologistName?: string;

  @ApiPropertyOptional({ description: 'Clinical sign-off remarks or interpretative commentary' })
  @IsOptional()
  @IsString()
  clinicalRemarks?: string;
}

export class AmendLabResultDto {
  @ApiProperty({ description: 'Target LabOrderItem UUID to correct' })
  @IsUUID()
  @IsNotEmpty()
  orderItemId: string;

  @ApiProperty({ description: 'New corrected measurement value' })
  @IsString()
  @IsNotEmpty()
  newValue: string;

  @ApiProperty({ description: 'Mandatory clinical justification for the amendment' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CancelLabOrderDto {
  @ApiProperty({ description: 'Mandatory cancellation reason' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class LabOrdersQueryDto {
  @ApiPropertyOptional({ enum: LabOrderStatus })
  @IsOptional()
  @IsEnum(LabOrderStatus)
  status?: LabOrderStatus;

  @ApiPropertyOptional({ description: 'Filter by patient UUID' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filter by doctor UUID' })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiPropertyOptional({ enum: LabPriority })
  @IsOptional()
  @IsEnum(LabPriority)
  priority?: LabPriority;

  @ApiPropertyOptional({ description: 'Search term for order number or patient UHID/name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}

export class LabCatalogQueryDto {
  @ApiPropertyOptional({ description: 'Filter by category UUID' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Search term for test code or name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;
}
