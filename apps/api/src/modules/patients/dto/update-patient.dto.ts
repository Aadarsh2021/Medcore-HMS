import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, BloodGroup } from '@medcore/types';
import { AddressDto, EmergencyContactDto } from './create-patient.dto';

export class UpdatePatientDto {
  @ApiPropertyOptional({ example: 'Aarav' })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Patel' })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({ example: '+91 98200 99887' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '1992-05-14' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ enum: BloodGroup, example: BloodGroup.B_POSITIVE })
  @IsEnum(BloodGroup)
  @IsOptional()
  bloodGroup?: BloodGroup;

  @ApiPropertyOptional({ example: 'Updated allergy notes' })
  @IsString()
  @IsOptional()
  allergiesSummary?: string;

  @ApiPropertyOptional({ type: EmergencyContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}
