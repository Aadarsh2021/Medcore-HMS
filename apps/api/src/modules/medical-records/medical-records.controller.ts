import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@medcore/types';
import { MedicalRecordsService } from './medical-records.service';
import { CreateAllergyDto } from './dto/create-allergy.dto';
import { CreateMedicationHistoryDto } from './dto/create-medication.dto';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateFamilyHistoryDto } from './dto/create-family-history.dto';
import {
  PatientEncountersQueryDto,
  PatientVitalsQueryDto,
} from './dto/patient-query.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Longitudinal Patient EMR')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller('medical-records/patients/:patientId')
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  // ---------------------------------------------------------------------------
  // 1. GET /medical-records/patients/:patientId/summary — Patient Clinical Summary
  // ---------------------------------------------------------------------------
  @Get('summary')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary:
      'Get bounded patient clinical summary: demographics, active allergies, medications, vaccinations, family history, and 5 recent encounters.',
  })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Patient clinical summary' })
  @ApiResponse({ status: 403, description: 'Access denied: Patient cannot view another patient record' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async getSummary(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.medicalRecordsService.getPatientSummary(tenantId, patientId, user);
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 2. GET /medical-records/patients/:patientId/encounters — Paginated Encounters
  // ---------------------------------------------------------------------------
  @Get('encounters')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Get paginated encounter history for patient with date filters.',
  })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Paginated encounter list' })
  async getEncounters(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: PatientEncountersQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.medicalRecordsService.getPatientEncounters(tenantId, patientId, query, user);
  }

  // ---------------------------------------------------------------------------
  // 3. GET /medical-records/patients/:patientId/vitals — Paginated Vitals Time-Series
  // ---------------------------------------------------------------------------
  @Get('vitals')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Get time-series vitals readings for patient with date filters for trend charts.',
  })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Vitals time-series' })
  async getVitals(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: PatientVitalsQueryDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.medicalRecordsService.getPatientVitals(tenantId, patientId, query, user);
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 4. POST /medical-records/patients/:patientId/allergies — Add Allergy
  // ---------------------------------------------------------------------------
  @Post('allergies')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a patient allergy or adverse drug reaction (ADR). Doctor only.' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 201, description: 'Allergy recorded successfully' })
  async addAllergy(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateAllergyDto,
  ) {
    const data = await this.medicalRecordsService.addAllergy(tenantId, patientId, dto);
    return {
      success: true,
      data,
      message: 'Patient allergy recorded successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 5. POST /medical-records/patients/:patientId/medications — Add Medication History
  // ---------------------------------------------------------------------------
  @Post('medications')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add patient chronic/past medication history. Doctor only.' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 201, description: 'Medication history recorded successfully' })
  async addMedication(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateMedicationHistoryDto,
  ) {
    const data = await this.medicalRecordsService.addMedicationHistory(tenantId, patientId, dto);
    return {
      success: true,
      data,
      message: 'Medication history recorded successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 6. POST /medical-records/patients/:patientId/vaccinations — Add Vaccination
  // ---------------------------------------------------------------------------
  @Post('vaccinations')
  @Roles(UserRole.DOCTOR, UserRole.NURSE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add patient vaccination record. Doctor or Nurse.' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 201, description: 'Vaccination recorded successfully' })
  async addVaccination(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateVaccinationDto,
  ) {
    const data = await this.medicalRecordsService.addVaccination(tenantId, patientId, dto);
    return {
      success: true,
      data,
      message: 'Vaccination recorded successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 7. POST /medical-records/patients/:patientId/family-history — Add Family History
  // ---------------------------------------------------------------------------
  @Post('family-history')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add familial risk factor / family history condition. Doctor only.' })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 201, description: 'Family history recorded successfully' })
  async addFamilyHistory(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateFamilyHistoryDto,
  ) {
    const data = await this.medicalRecordsService.addFamilyHistory(tenantId, patientId, dto);
    return {
      success: true,
      data,
      message: 'Family history recorded successfully',
    };
  }
}
