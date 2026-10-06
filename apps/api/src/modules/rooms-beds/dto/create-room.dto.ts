import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomType } from '@medcore/types';

export class CreateRoomDto {
  @ApiProperty({ example: 'ICU-101', description: 'Unique room identifier within hospital' })
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Room number must contain only letters, numbers, dashes, or underscores',
  })
  roomNumber: string;

  @ApiPropertyOptional({ example: 'Intensive Coronary Care Unit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: RoomType, default: RoomType.GENERAL_WARD })
  @IsOptional()
  @IsEnum(RoomType)
  type?: RoomType = RoomType.GENERAL_WARD;

  @ApiPropertyOptional({ example: 'dept-uuid' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiPropertyOptional({ example: 'Floor 3, Tower B' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  floor?: string;

  @ApiPropertyOptional({ example: 'Main Surgical Block' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  building?: string;

  @ApiPropertyOptional({ example: 2500, description: 'Daily room occupancy rate in INR' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyRate?: number = 0;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export class CreateBedDto {
  @ApiProperty({ example: 'room-uuid', description: 'ID of the room this bed belongs to' })
  @IsNotEmpty()
  @IsUUID('4')
  roomId: string;

  @ApiProperty({ example: 'BED-01', description: 'Bed number / label within the room' })
  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  bedNumber: string;
}

export class AssignBedDto {
  @ApiProperty({ example: 'patient-uuid', description: 'Patient receiving inpatient bed admission' })
  @IsNotEmpty()
  @IsUUID('4')
  patientId: string;

  @ApiPropertyOptional({ example: 'encounter-uuid' })
  @IsOptional()
  @IsUUID('4')
  encounterId?: string;

  @ApiPropertyOptional({ example: 'Admitted for acute stabilization under observation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReleaseBedDto {
  @ApiPropertyOptional({ example: 'DISCHARGED', description: 'Reason for bed release (DISCHARGED, TRANSFERRED)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dischargeReason?: string = 'DISCHARGED';

  @ApiPropertyOptional({ example: 'Patient clinically stable for outpatient follow-up' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class TransferBedDto {
  @ApiProperty({ example: 'target-bed-uuid', description: 'New bed to transfer patient to' })
  @IsNotEmpty()
  @IsUUID('4')
  targetBedId: string;

  @ApiPropertyOptional({ example: 'Transferred from ICU to Step-down Ward' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
