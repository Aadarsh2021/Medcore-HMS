import {
  Controller,
  Get,
  Post,
  Put,
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
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { SetDoctorAvailabilityDto } from './dto/doctor-availability.dto';
import { CreateDoctorLeaveDto } from './dto/doctor-leave.dto';
import { DoctorSlotsQueryDto } from './dto/doctor-slots-query.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Doctor Management & Scheduling')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Provision a new doctor with validated department and Supabase identity',
  })
  @ApiResponse({ status: 201, description: 'Doctor created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid department or validation error' })
  @ApiResponse({ status: 409, description: 'Doctor license or email already exists' })
  async create(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: CreateDoctorDto,
  ) {
    const data = await this.doctorsService.create(tenantId, dto);
    return {
      success: true,
      data,
      message: 'Doctor created successfully',
    };
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.PATIENT,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
  )
  @ApiOperation({
    summary: 'List doctors with search, filtering, and pagination',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of doctors' })
  async findAll(
    @CurrentTenant() tenantId: string | null,
    @Query() query: DoctorQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.doctorsService.findAll(tenantId, query, user?.role);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.PATIENT,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
  )
  @ApiOperation({ summary: 'Retrieve single doctor profile by ID' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Doctor profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  async findById(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.doctorsService.findById(tenantId, id, user?.role);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  @ApiOperation({
    summary:
      'Update doctor profile. Doctors are restricted to bio, signatureUrl, and phone.',
  })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Doctor updated successfully' })
  @ApiResponse({ status: 403, description: 'Restricted fields or unauthorized doctor update' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  async update(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDoctorDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.doctorsService.update(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Doctor updated successfully',
    };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Soft delete doctor record' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Doctor deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  async softDelete(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.doctorsService.softDelete(tenantId, id);
  }

  @Put(':id/availability')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  @ApiOperation({
    summary:
      'Complete Weekly Schedule Replacement: Atomically replaces recurring weekly availability windows for the doctor using doctor-scoped advisory lock serialization',
  })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Availability configured successfully (complete replacement)' })
  @ApiResponse({ status: 400, description: 'Overlapping windows detected on same weekday' })
  async putAvailability(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDoctorAvailabilityDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.doctorsService.setAvailability(
      tenantId,
      id,
      dto,
      user,
    );
    return {
      success: true,
      data,
      message: 'Doctor weekly availability schedule replaced successfully',
    };
  }

  @Post(':id/availability')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  @ApiOperation({
    summary:
      'Complete Weekly Schedule Replacement (POST alias): Atomically replaces recurring weekly availability windows for the doctor using doctor-scoped advisory lock serialization',
  })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Availability configured successfully (complete replacement)' })
  @ApiResponse({ status: 400, description: 'Overlapping windows detected on same weekday' })
  async setAvailability(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDoctorAvailabilityDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.doctorsService.setAvailability(
      tenantId,
      id,
      dto,
      user,
    );
    return {
      success: true,
      data,
      message: 'Doctor weekly availability schedule replaced successfully',
    };
  }

  @Get(':id/availability')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.PATIENT,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
  )
  @ApiOperation({ summary: 'Get doctor weekly availability windows' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Availability windows returned' })
  async getAvailability(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.doctorsService.getAvailability(tenantId, id);
    return {
      success: true,
      data,
    };
  }

  @Post(':id/leaves')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule a doctor leave/blackout interval' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 201, description: 'Leave scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid date interval' })
  async createLeave(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDoctorLeaveDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.doctorsService.createLeave(
      tenantId,
      id,
      dto,
      user,
    );
    return {
      success: true,
      data,
      message: 'Doctor leave scheduled successfully',
    };
  }

  @Get(':id/leaves')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
  )
  @ApiOperation({ summary: 'List doctor leave intervals' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Leave intervals returned' })
  async getLeaves(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.doctorsService.getLeaves(tenantId, id);
    return {
      success: true,
      data,
    };
  }

  @Delete(':id/leaves/:leaveId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Cancel/delete a doctor leave interval' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiParam({ name: 'leaveId', description: 'Leave UUID' })
  @ApiResponse({ status: 200, description: 'Leave deleted successfully' })
  @ApiResponse({ status: 404, description: 'Leave record not found' })
  async deleteLeave(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
    @CurrentUser() user: any,
  ) {
    return this.doctorsService.deleteLeave(tenantId, id, leaveId, user);
  }

  @Get(':id/slots')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.PATIENT,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
  )
  @ApiOperation({
    summary:
      'Generate purely schedule-derived slots for a date in the hospital authoritative timezone, blocking leaves',
  })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Available slots generated successfully' })
  @ApiResponse({ status: 404, description: 'Doctor not found or inactive' })
  async getSlots(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DoctorSlotsQueryDto,
  ) {
    const data = await this.doctorsService.getAvailableSlots(
      tenantId,
      id,
      query,
    );
    return {
      success: true,
      data,
    };
  }
}
