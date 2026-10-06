import { Controller, Post, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentHospital } from '../auth/decorators/current-hospital.decorator';
import { UserRole } from '@medcore/types';

@ApiTags('Background Jobs')
@Controller('jobs')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth('bearer-token')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('appointment-reminders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger appointment reminder notification processing' })
  async triggerAppointmentReminders(@CurrentHospital() hospitalId: string) {
    const result = await this.jobsService.processAppointmentReminders(hospitalId);
    return {
      success: true,
      data: result,
      message: `Processed appointment reminders: ${result.dispatchedCount} dispatched.`,
    };
  }

  @Post('scan-expiring-medications')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.PHARMACIST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger pharmacy batch expiry scan (30-day window)' })
  async triggerExpiryScan(
    @CurrentHospital() hospitalId: string,
    @Query('windowDays') windowDays?: number,
  ) {
    const result = await this.jobsService.scanExpiringMedications(
      hospitalId,
      windowDays ? Number(windowDays) : 30,
    );
    return {
      success: true,
      data: result,
      message: `Scanned inventory: ${result.expiringBatchCount} expiring batches identified, ${result.alertCount} alerts sent.`,
    };
  }

  @Post('enqueue/appointment-reminders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enqueue appointment reminder notification processing into BullMQ' })
  async enqueueAppointmentReminders(@CurrentHospital() hospitalId: string) {
    const result = await this.jobsService.enqueueAppointmentReminders(hospitalId);
    return {
      success: true,
      data: result,
      message: `Enqueued appointment reminders scan into BullMQ queue [Job ID: ${result.jobId}].`,
    };
  }

  @Post('enqueue/scan-expiring-medications')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.PHARMACIST)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enqueue pharmacy batch expiry scan into BullMQ' })
  async enqueueExpiryScan(
    @CurrentHospital() hospitalId: string,
    @Query('windowDays') windowDays?: number,
  ) {
    const result = await this.jobsService.enqueueExpiryScan(
      hospitalId,
      windowDays ? Number(windowDays) : 30,
    );
    return {
      success: true,
      data: result,
      message: `Enqueued pharmacy batch expiry scan into BullMQ queue [Job ID: ${result.jobId}].`,
    };
  }

  @Post('enqueue/scan-low-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.PHARMACIST)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enqueue inventory low-stock alert scan into BullMQ' })
  async enqueueLowStockScan(@CurrentHospital() hospitalId: string) {
    const result = await this.jobsService.enqueueLowStockScan(hospitalId);
    return {
      success: true,
      data: result,
      message: `Enqueued low stock inventory scan into BullMQ queue [Job ID: ${result.jobId}].`,
    };
  }

  @Post('enqueue/process-no-shows')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enqueue overdue appointment no-show processor into BullMQ' })
  async enqueueNoShowProcessing(@CurrentHospital() hospitalId: string) {
    const result = await this.jobsService.enqueueNoShowProcessing(hospitalId);
    return {
      success: true,
      data: result,
      message: `Enqueued appointment no-show processor into BullMQ queue [Job ID: ${result.jobId}].`,
    };
  }
}
