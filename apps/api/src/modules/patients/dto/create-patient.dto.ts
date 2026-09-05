import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsEnum,
  IsDateString,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, BloodGroup } from '@medcore/types';

export class AddressDto {
  @ApiProperty({ example: '123 Health Ave, Apt 4B' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '400001' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiPropertyOptional({ example: 'India', default: 'India' })
  @IsString()
  @IsOptional()
  country?: string = 'India';
}

export class EmergencyContactDto {
  @ApiProperty({ example: 'Deepa Mehta' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+91 98199 88777' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'Spouse' })
  @IsString()
  @IsNotEmpty()
  relation: string;
}

export class CreatePatientDto {
  @ApiProperty({ example: 'Aarav' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Patel' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'aarav.patel@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: '+91 98200 11223' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '1992-05-14' })
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({ enum: Gender, example: Gender.MALE })
  @IsEnum(Gender)
  @IsNotEmpty()
  gender: Gender;

  @ApiPropertyOptional({ enum: BloodGroup, example: BloodGroup.B_POSITIVE })
  @IsEnum(BloodGroup)
  @IsOptional()
  bloodGroup?: BloodGroup;

  @ApiPropertyOptional({ example: 'Penicillin (mild rash)' })
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

  @ApiPropertyOptional({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
