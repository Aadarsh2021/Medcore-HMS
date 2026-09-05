import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { UserRole } from '@medcore/types';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Patient Management')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @Roles(UserRole.RECEPTIONIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new patient with server-generated UHID and demographics',
  })
  @ApiResponse({
    status: 201,
    description: 'Patient registered successfully with server-generated UHID',
  })
  @ApiResponse({ status: 400, description: 'Validation failure on patient data' })
  @ApiResponse({
    status: 409,
    description: 'Patient with this email already exists',
  })
  async register(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreatePatientDto,
  ) {
    const data = await this.patientsService.register(tenantId, dto);
    return {
      success: true,
      data,
      message: 'Patient registered successfully',
    };
  }

  @Get()
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
  )
  @ApiOperation({
    summary: 'Search and list patients with pagination, search, and clinical filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of patients returned successfully',
  })
  async findAll(
    @CurrentTenant() tenantId: string | null,
    @Query() query: PatientQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.patientsService.findAll(tenantId, query, user);
  }

  @Get(':id')
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.LAB_TECHNICIAN,
    UserRole.PHARMACIST,
    UserRole.ACCOUNTANT,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Retrieve complete patient clinical summary and demographics',
  })
  @ApiParam({ name: 'id', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Patient details retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied or tenant boundary violation' })
  @ApiResponse({ status: 404, description: 'Patient record not found' })
  async findById(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.patientsService.findById(tenantId, id, user);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id')
  @Roles(UserRole.RECEPTIONIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Update patient demographics, emergency contact, or address',
  })
  @ApiParam({ name: 'id', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Patient demographics updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Patient record not found' })
  async update(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.patientsService.update(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Patient demographics updated successfully',
    };
  }

  @Delete(':id')
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete / deactivate patient record (preserves clinical history)',
  })
  @ApiParam({ name: 'id', description: 'Patient UUID' })
  @ApiResponse({
    status: 200,
    description: 'Patient record deactivated successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: Only Hospital Administrators can deactivate patients',
  })
  @ApiResponse({ status: 404, description: 'Patient record not found' })
  async remove(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.patientsService.softDelete(tenantId, id, user);
    return {
      success: true,
      data,
      message: 'Patient record deactivated successfully',
    };
  }
}
