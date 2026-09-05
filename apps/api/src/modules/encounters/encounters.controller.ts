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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@medcore/types';
import { EncountersService } from './encounters.service';
import { UploadedFilePayload } from '../../common/storage/storage.service';
import { RecordVitalsDto } from './dto/record-vitals.dto';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { UpdateClinicalNotesDto } from './dto/update-clinical-notes.dto';
import { CreateAmendmentDto } from './dto/create-amendment.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Clinical Encounters & EMR')
@ApiBearerAuth('bearer-token')
@ApiHeader({
  name: 'X-Hospital-Id',
  required: false,
  description: 'Target hospital UUID override header for Super Admin operations',
})
@UseGuards(SupabaseAuthGuard, RolesGuard, TenantGuard)
@Controller()
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  // ---------------------------------------------------------------------------
  // 1. POST /appointments/:appointmentId/encounter — Start Clinical Encounter
  // ---------------------------------------------------------------------------
  @Post('appointments/:appointmentId/encounter')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Start a clinical encounter for a scheduled appointment. ' +
      'Assigned doctor only. Atomically sets encounter and appointment to IN_PROGRESS and initializes draft MedicalRecord. Idempotent.',
  })
  @ApiParam({ name: 'appointmentId', description: 'Appointment UUID' })
  @ApiResponse({ status: 201, description: 'Clinical encounter started successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Only the assigned doctor may start this encounter' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  @ApiResponse({ status: 422, description: 'Cannot start encounter on cancelled or no-show appointment' })
  async startEncounter(
    @CurrentTenant() tenantId: string | null,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.startEncounter(tenantId, appointmentId, user);
    return {
      success: true,
      data,
      message: 'Clinical encounter started successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 2. GET /encounters/:id — Get Encounter Details
  // ---------------------------------------------------------------------------
  @Get('encounters/:id')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Get clinical encounter details, medical record, vitals, diagnoses, attachments, and amendments.',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 200, description: 'Encounter details' })
  @ApiResponse({ status: 403, description: 'Access denied: Patient cannot access another patient encounter' })
  @ApiResponse({ status: 404, description: 'Encounter not found' })
  async getEncounter(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.getEncounter(tenantId, id, user);
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 3. POST /encounters/:id/vitals — Record Vitals
  // ---------------------------------------------------------------------------
  @Post('encounters/:id/vitals')
  @Roles(UserRole.DOCTOR, UserRole.NURSE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Record patient vitals. Server-side calculates BMI from height and weight. Client-provided BMI is ignored. Blocked if encounter is completed.',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 201, description: 'Vitals recorded successfully' })
  @ApiResponse({ status: 409, description: 'Encounter is completed and locked' })
  async recordVitals(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordVitalsDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.recordVitals(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Vitals recorded successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 4. POST /encounters/:id/diagnoses — Add Diagnosis
  // ---------------------------------------------------------------------------
  @Post('encounters/:id/diagnoses')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record provisional or confirmed diagnosis with ICD-10 code. Assigned doctor only. Blocked if completed.',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 201, description: 'Diagnosis recorded successfully' })
  @ApiResponse({ status: 409, description: 'Encounter is completed and locked' })
  async addDiagnosis(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddDiagnosisDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.addDiagnosis(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Diagnosis recorded successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 5. PUT /encounters/:id/notes — Update Draft Notes & Treatment Plan
  // ---------------------------------------------------------------------------
  @Put('encounters/:id/notes')
  @Roles(UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Update draft consultation notes, chief complaint, symptoms, and treatment plan. Blocked if completed.',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 200, description: 'Clinical notes updated successfully' })
  @ApiResponse({ status: 409, description: 'Encounter is completed and locked. Submit an amendment instead' })
  async updateNotes(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClinicalNotesDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.updateNotes(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Clinical notes updated successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 6. POST /encounters/:id/attachments — Upload Clinical Attachment
  // ---------------------------------------------------------------------------
  @Post('encounters/:id/attachments')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload clinical document or image (max 20 MB, PDF/JPEG/PNG/WEBP). Assigned doctor only.',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 201, description: 'Attachment uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file format or script extension rejected' })
  @ApiResponse({ status: 413, description: 'File size exceeds 20 MB limit' })
  async uploadAttachment(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFilePayload,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.uploadAttachment(tenantId, id, file, user);
    return {
      success: true,
      data,
      message: 'Attachment uploaded successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 7. GET /encounters/:id/attachments/:attachmentId/url — Pre-Signed Download URL
  // ---------------------------------------------------------------------------
  @Get('encounters/:id/attachments/:attachmentId/url')
  @Roles(
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.PATIENT,
  )
  @ApiOperation({
    summary: 'Generate a cryptographically signed pre-signed download URL (15-minute expiration).',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment UUID' })
  @ApiResponse({ status: 200, description: 'Pre-signed download URL generated' })
  @ApiResponse({ status: 403, description: 'Access denied to attachment' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async getAttachmentUrl(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.getAttachmentSignedUrl(
      tenantId,
      id,
      attachmentId,
      user,
    );
    return { success: true, data };
  }

  // ---------------------------------------------------------------------------
  // 8. POST /encounters/:id/complete — Complete Clinical Encounter
  // ---------------------------------------------------------------------------
  @Post('encounters/:id/complete')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Complete clinical encounter. Enforces completion invariants: status must be IN_PROGRESS, ' +
      'chief complaint must be >= 3 characters, at least 1 diagnosis recorded. Atomically finalizes encounter and appointment.',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 200, description: 'Encounter completed successfully' })
  @ApiResponse({ status: 400, description: 'Encounter not in progress or missing chief complaint' })
  @ApiResponse({ status: 422, description: 'Cannot complete encounter without at least one diagnosis' })
  async completeEncounter(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.completeEncounter(tenantId, id, user);
    return {
      success: true,
      data,
      message: 'Clinical encounter completed successfully',
    };
  }

  // ---------------------------------------------------------------------------
  // 9. POST /encounters/:id/amendments — Add Additive Amendment
  // ---------------------------------------------------------------------------
  @Post('encounters/:id/amendments')
  @Roles(UserRole.DOCTOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit an additive amendment to a finalized medical record. Assigned doctor only. ' +
    'The original medical record row is never overwritten or deleted.',
  })
  @ApiParam({ name: 'id', description: 'Encounter UUID' })
  @ApiResponse({ status: 201, description: 'Medical record amendment recorded' })
  @ApiResponse({ status: 400, description: 'Encounter not completed or invalid justification' })
  @ApiResponse({ status: 403, description: 'Only the assigned doctor may amend the record' })
  async createAmendment(
    @CurrentTenant() tenantId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAmendmentDto,
    @CurrentUser() user: any,
  ) {
    const data = await this.encountersService.createAmendment(tenantId, id, dto, user);
    return {
      success: true,
      data,
      message: 'Medical record amendment recorded successfully',
    };
  }
}
