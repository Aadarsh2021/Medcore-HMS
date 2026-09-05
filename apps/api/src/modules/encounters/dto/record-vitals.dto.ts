import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RecordVitalsDto {
  @ApiPropertyOptional({ description: 'Systolic blood pressure (mmHg)', minimum: 40, maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(300)
  bpSystolic?: number;

  @ApiPropertyOptional({ description: 'Diastolic blood pressure (mmHg)', minimum: 20, maximum: 200 })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(200)
  bpDiastolic?: number;

  @ApiPropertyOptional({ description: 'Heart rate / pulse (bpm)', minimum: 20, maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(300)
  heartRate?: number;

  @ApiPropertyOptional({ description: 'Body temperature (°C)', minimum: 25.0, maximum: 45.0 })
  @IsOptional()
  @IsNumber()
  @Min(25.0)
  @Max(45.0)
  temperature?: number;

  @ApiPropertyOptional({ description: 'Oxygen saturation SpO2 (%)', minimum: 50, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(100)
  spo2?: number;

  @ApiPropertyOptional({ description: 'Respiratory rate (breaths/min)', minimum: 4, maximum: 80 })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(80)
  respiratoryRate?: number;

  @ApiPropertyOptional({ description: 'Height (cm)', minimum: 20.0, maximum: 300.0 })
  @IsOptional()
  @IsNumber()
  @Min(20.0)
  @Max(300.0)
  heightCm?: number;

  @ApiPropertyOptional({ description: 'Weight (kg)', minimum: 0.5, maximum: 500.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(500.0)
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Clinical observations or measurement notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /**
   * Note: Any client-supplied BMI is ignored. Server computes BMI exclusively.
   */
  @IsOptional()
  bmi?: number;
}
