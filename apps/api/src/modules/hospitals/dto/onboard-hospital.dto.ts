import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HospitalAddressDto {
  @ApiProperty({ example: '123 Health Boulevard' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  street: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: '400001' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  postalCode: string;

  @ApiPropertyOptional({ example: 'India', default: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string = 'India';
}

export class InitialAdminDto {
  @ApiProperty({ example: 'Aditi' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Sharma' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ example: 'admin@cityhospital.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class OnboardHospitalDto {
  @ApiProperty({ example: 'City Specialty Hospital & Research Center' })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'city-specialty-mumbai' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase alphanumeric characters and hyphens',
  })
  slug: string;

  @ApiProperty({ example: 'CSH-MUM-01' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Hospital code must be uppercase alphanumeric with dashes/underscores',
  })
  code: string;

  @ApiProperty({ example: 'contact@cityhospital.org' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+912212345678' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'https://cityhospital.org' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ example: 'ENTERPRISE', default: 'STANDARD' })
  @IsOptional()
  @IsString()
  subscriptionTier?: string = 'STANDARD';

  @ApiPropertyOptional({ type: HospitalAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HospitalAddressDto)
  address?: HospitalAddressDto;

  @ApiProperty({ type: InitialAdminDto })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => InitialAdminDto)
  initialAdmin: InitialAdminDto;
}
