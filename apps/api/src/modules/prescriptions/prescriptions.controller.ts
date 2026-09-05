import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { PrescriptionsService } from './prescriptions.service';
import {
  CreatePrescriptionDraftDto,
  PatientPrescriptionsQueryDto,
  UpdatePrescriptionItemsDto,
  VoidPrescriptionDto,
} from './dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Prescription Management & Clinical Medication Ordering')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller()
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  // ---------------------------------------------------------------------------
  // 1. POST /encounters/:encounterId/prescriptions — Create / Get Draft Prescription
  // ---------------------------------------------------------------------------
  @Post('encounters/:encounterId/prescriptions')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initialize or retrieve an idempotent draft prescription for an active clinical encounter.',
  })
  @ApiParam({ name: 'encounterId', description: 'PatientEncounter UUID' })
  @ApiResponse({ status: 201, description: 'Draft prescription created or returned' })
  @ApiResponse({ status: 400, description: 'Encounter not IN_PROGRESS' })
  @ApiResponse({ status: 403, description: 'Doctor not assigned to encounter' })
  @ApiResponse({ status: 409, description: 'Prescription already finalized' })
  async getOrCreateDraft(
    @CurrentTenant() tenantId: string | null,
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @Body() dto: CreatePrescriptionDraftDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.prescriptionsService.getOrCreateDraft(
      tenantId,
      encounterId,
      dto,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 2. GET /prescriptions/:id — Get Prescription Details
  // ---------------------------------------------------------------------------
  @Get('prescriptions/:id')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Retrieve prescription order details with item list and status.',
  })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 200, description: 'Prescription details' })
  @ApiResponse({ status: 403, description: 'Access denied / Draft visibility restricted' })
  @ApiResponse({ status: 404, description: 'Prescription not found' })
  async getPrescription(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.prescriptionsService.getPrescriptionById(
      tenantId,
      id,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 3. PUT /prescriptions/:id — Update Draft Prescription Items & Notes
  // ---------------------------------------------------------------------------
  @Put('prescriptions/:id')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Atomically update items and clinical notes on a DRAFT prescription.',
  })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 200, description: 'Prescription draft updated' })
  @ApiResponse({ status: 403, description: 'Caller not the prescribing doctor' })
  @ApiResponse({ status: 409, description: 'Prescription is finalized and immutable' })
  async updateDraft(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrescriptionItemsDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.prescriptionsService.updateDraft(
      tenantId,
      id,
      dto,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 4. POST /prescriptions/:id/cancel — Cancel Draft Prescription
  // ---------------------------------------------------------------------------
  @Post('prescriptions/:id/cancel')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a draft prescription without deleting audit record.',
  })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 200, description: 'Draft prescription cancelled' })
  @ApiResponse({ status: 409, description: 'Only DRAFT prescriptions can be cancelled here' })
  async cancelDraft(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.prescriptionsService.cancelDraft(
      tenantId,
      id,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 5. POST /prescriptions/:id/finalize — Finalize & Sign Prescription (Concurrency-Safe)
  // ---------------------------------------------------------------------------
  @Post('prescriptions/:id/finalize')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Finalize prescription: allocate sequential prescription number, lock status to ISSUED, compile PDF with doctor digital signature representation, and upload to S3.',
  })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 200, description: 'Prescription finalized and immutable' })
  @ApiResponse({ status: 409, description: 'Prescription already finalized or cancelled' })
  @ApiResponse({ status: 422, description: 'Prescription has zero items' })
  async finalize(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.prescriptionsService.finalizePrescription(
      tenantId,
      id,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 6. POST /prescriptions/:id/void — Void / Cancel Finalized Prescription
  // ---------------------------------------------------------------------------
  @Post('prescriptions/:id/void')
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Void a finalized (ISSUED) prescription with an audited clinical justification. Original record is preserved.',
  })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 200, description: 'Prescription voided/cancelled' })
  @ApiResponse({ status: 400, description: 'Reason missing or too short' })
  @ApiResponse({ status: 409, description: 'Only ISSUED prescriptions can be voided' })
  async voidPrescription(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidPrescriptionDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.prescriptionsService.voidPrescription(
      tenantId,
      id,
      dto,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 7. GET /prescriptions/:id/pdf/url — Get Authorized 15-Minute Signed PDF URL
  // ---------------------------------------------------------------------------
  @Get('prescriptions/:id/pdf/url')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Generate an authorized temporary 15-minute pre-signed URL to download prescription PDF.',
  })
  @ApiParam({ name: 'id', description: 'Prescription UUID' })
  @ApiResponse({ status: 200, description: 'Pre-signed download URL' })
  @ApiResponse({ status: 400, description: 'PDF not available / Draft status' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getPdfUrl(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.prescriptionsService.getPdfDownloadUrl(
      tenantId,
      id,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 8. GET /patients/:patientId/prescriptions — Paginated Patient Prescriptions
  // ---------------------------------------------------------------------------
  @Get('patients/:patientId/prescriptions')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Retrieve paginated prescription history for a patient. Patients see only finalized prescriptions.',
  })
  @ApiParam({ name: 'patientId', description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Paginated prescription history' })
  @ApiResponse({ status: 403, description: 'Cross-patient access denied' })
  async getPatientPrescriptions(
    @CurrentTenant() tenantId: string | null,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: PatientPrescriptionsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.prescriptionsService.getPatientPrescriptions(
      tenantId,
      patientId,
      query,
      user,
    );
  }
}
