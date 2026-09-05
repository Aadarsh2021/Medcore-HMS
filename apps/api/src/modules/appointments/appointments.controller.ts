import {
  Controller,
  Get,
  Post,
  Patch,
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
import { AppointmentsService } from './appointments.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { AppointmentQueryDto } from './dto/appointment-query.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Appointment Management')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ---------------------------------------------------------------------------
  // POST /appointments — Book an appointment
  // ---------------------------------------------------------------------------

  @Post()
  @Roles(
    UserRole.PATIENT,
    UserRole.RECEPTIONIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Book a doctor appointment. ' +
      'For PATIENT role, patientId is derived from the authenticated session token — any client-supplied patientId is ignored. ' +
      'Uses ADR-002 3-layer concurrency: SELECT FOR UPDATE + unique partial index + Redis soft-hold.',
  })
  @ApiResponse({ status: 201, description: 'Appointment booked successfully' })
  @ApiResponse({ status: 400, description: 'Slot not in schedule, doctor on leave, or validation error' })
  @ApiResponse({ status: 409, description: 'Slot already booked (double-booking rejected)' })
  @ApiResponse({ status: 422, description: 'Slot has maxBookingsPerSlot > 1 — not supported in Phase 4' })
  async book(
    @CurrentTenant() tenantId: string | null,
    @Body() dto: BookAppointmentDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.appointmentsService.bookAppointment(tenantId, dto, user);
    return {
      success: true,
      data,
      message: 'Appointment booked successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // GET /appointments — List appointments (role-scoped)
  // ---------------------------------------------------------------------------

  @Get()
  @Roles(
    UserRole.PATIENT,
    UserRole.DOCTOR,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({
    summary:
      'List appointments with pagination. ' +
      'PATIENT sees only their own. DOCTOR sees only theirs. ' +
      'Admin/Receptionist/Nurse see all within the hospital tenant.',
  })
  @ApiResponse({ status: 200, description: 'Paginated appointment list' })
  async list(
    @CurrentTenant() tenantId: string | null,
    @Query() query: AppointmentQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.listAppointments(tenantId, query, user);
  }

  // ---------------------------------------------------------------------------
  // GET /appointments/:id — Get appointment by ID
  // ---------------------------------------------------------------------------

  @Get(':id')
  @Roles(
    UserRole.PATIENT,
    UserRole.DOCTOR,
    UserRole.RECEPTIONIST,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Get appointment details by ID. PATIENT and DOCTOR access is scoped to their own appointments.' })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment details' })
  @ApiResponse({ status: 403, description: 'Access denied — appointment belongs to another patient/doctor' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  async findById(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.appointmentsService.findById(tenantId, id, user);
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // PATCH /appointments/:id/status — Admin status transition
  // ---------------------------------------------------------------------------

  @Patch(':id/status')
  @Roles(UserRole.RECEPTIONIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Update appointment status (admin/receptionist only). ' +
      'Allowed targets: CONFIRMED, IN_PROGRESS, COMPLETED, NO_SHOW. ' +
      'Cannot set PENDING or CANCELLED via this endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 400, description: 'Invalid transition or terminal state' })
  async updateStatus(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    const data = await this.appointmentsService.updateStatus(tenantId, id, dto);
    return {
      success: true,
      data,
      message: `Appointment status updated to ${dto.status}`,
    };
  }

  // ---------------------------------------------------------------------------
  // PATCH /appointments/:id/cancel — Cancel appointment
  // ---------------------------------------------------------------------------

  @Patch(':id/cancel')
  @Roles(
    UserRole.PATIENT,
    UserRole.RECEPTIONIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({
    summary:
      'Cancel an appointment. ' +
      'PATIENT may only cancel their own PENDING or CONFIRMED appointments. ' +
      'Admin/Receptionist may cancel any non-terminal appointment.',
  })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel — appointment in terminal state' })
  @ApiResponse({ status: 403, description: 'PATIENT attempting to cancel another patient\'s appointment' })
  async cancel(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.appointmentsService.cancelAppointment(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Appointment cancelled successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // PATCH /appointments/:id/reschedule — Reschedule appointment
  // ---------------------------------------------------------------------------

  @Patch(':id/reschedule')
  @Roles(UserRole.RECEPTIONIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Reschedule an appointment to a new date/time slot. ' +
      'Validates new slot against doctor schedule. ' +
      'Resets status to PENDING. ' +
      'Uses ADR-002 concurrency strategy for new slot.',
  })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 200, description: 'Appointment rescheduled. Status reset to PENDING.' })
  @ApiResponse({ status: 400, description: 'Invalid slot or appointment not reschedulable' })
  @ApiResponse({ status: 409, description: 'New slot already booked' })
  @ApiResponse({ status: 422, description: 'New slot has maxBookingsPerSlot > 1 — not supported in Phase 4' })
  async reschedule(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.appointmentsService.rescheduleAppointment(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Appointment rescheduled successfully. Status reset to PENDING.',
    };
  }
}
