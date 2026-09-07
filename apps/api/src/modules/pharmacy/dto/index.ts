import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType, PrescriptionStatus } from '@medcore/types';

export class BatchDispenseAllocationDto {
  @ApiProperty({ description: 'Target physical medicine batch UUID' })
  @IsUUID()
  @IsNotEmpty()
  batchId: string;

  @ApiProperty({ description: 'Quantity to dispense from this batch', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class DispenseItemDto {
  @ApiProperty({ description: 'Prescription Item UUID' })
  @IsUUID()
  @IsNotEmpty()
  prescriptionItemId: string;

  @ApiProperty({ type: [BatchDispenseAllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchDispenseAllocationDto)
  allocations: BatchDispenseAllocationDto[];
}

export class DispensePrescriptionDto {
  @ApiPropertyOptional({ description: 'Dispensing pharmacist notes / instructions' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [DispenseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispenseItemDto)
  items: DispenseItemDto[];
}

export class StockReceiptItemDto {
  @ApiProperty({ description: 'Formulary catalog medicine UUID' })
  @IsUUID()
  @IsNotEmpty()
  medicineId: string;

  @ApiProperty({ description: 'Manufacturer batch lot number' })
  @IsString()
  @IsNotEmpty()
  batchNumber: string;

  @ApiProperty({ description: 'Manufacturing Date (ISO8601)' })
  @IsISO8601()
  @IsNotEmpty()
  manufacturingDate: string;

  @ApiProperty({ description: 'Expiry Date (ISO8601)' })
  @IsISO8601()
  @IsNotEmpty()
  expiryDate: string;

  @ApiProperty({ description: 'Received physical units', minimum: 1 })
  @IsInt()
  @Min(1)
  quantityReceived: number;

  @ApiProperty({ description: 'Purchase acquisition cost per unit', minimum: 0 })
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiProperty({ description: 'Maximum Retail Price per unit', minimum: 0 })
  @IsNumber()
  @Min(0)
  mrp: number;
}

export class CreateStockReceiptDto {
  @ApiProperty({ description: 'Supplier / Vendor distributor name' })
  @IsString()
  @IsNotEmpty()
  supplierName: string;

  @ApiProperty({ description: 'Supplier invoice / delivery challan number' })
  @IsString()
  @IsNotEmpty()
  invoiceNumber: string;

  @ApiProperty({ description: 'Supplier invoice date (ISO8601)' })
  @IsISO8601()
  @IsNotEmpty()
  invoiceDate: string;

  @ApiPropertyOptional({ description: 'Receiving dock / intake notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [StockReceiptItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptItemDto)
  items: StockReceiptItemDto[];
}

export class AdjustStockDto {
  @ApiProperty({
    enum: [
      StockMovementType.ADJUSTMENT_INCREASE,
      StockMovementType.ADJUSTMENT_DECREASE,
      StockMovementType.DAMAGE_WRITEOFF,
      StockMovementType.EXPIRY_DISPOSAL,
    ],
    description: 'Specific stock adjustment category',
  })
  @IsEnum(StockMovementType)
  adjustmentType: StockMovementType;

  @ApiProperty({ description: 'Quantity units to adjust (positive integer)', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Clinical / audit justification for adjustment' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Optional reference document ID' })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class QuarantineBatchDto {
  @ApiProperty({ description: 'Quarantine state toggle' })
  @IsBoolean()
  isQuarantined: boolean;

  @ApiProperty({ description: 'Audit rationale for quarantine or release' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ReturnDispenseItemDto {
  @ApiProperty({ description: 'PrescriptionDispenseItem UUID to return against' })
  @IsUUID()
  @IsNotEmpty()
  dispenseItemId: string;

  @ApiProperty({ description: 'Units to return to stock', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Return justification' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class PharmacyQueueQueryDto {
  @ApiPropertyOptional({ enum: [PrescriptionStatus.ISSUED, PrescriptionStatus.PARTIALLY_DISPENSED] })
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;

  @ApiPropertyOptional({ description: 'Search UHID, patient name, or prescription number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class InventoryQueryDto {
  @ApiPropertyOptional({ description: 'Search medicine name or generic name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter only low-stock medicines' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isLowStock?: boolean;

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

export class StockMovementQueryDto {
  @ApiPropertyOptional({ description: 'Filter by medicine UUID' })
  @IsOptional()
  @IsUUID()
  medicineId?: string;

  @ApiPropertyOptional({ description: 'Filter by batch UUID' })
  @IsOptional()
  @IsUUID()
  batchId?: string;

  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

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

export class ExpiryReportQueryDto {
  @ApiPropertyOptional({ enum: ['EXPIRED', 'DAYS_30', 'DAYS_60', 'DAYS_90'], default: 'DAYS_30' })
  @IsOptional()
  @IsString()
  bracket?: 'EXPIRED' | 'DAYS_30' | 'DAYS_60' | 'DAYS_90' = 'DAYS_30';
}
