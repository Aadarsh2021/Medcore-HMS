import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AmendmentSection,
  AmendmentType,
  AppointmentStatus,
  AuditAction,
  DiagnosisType,
  EncounterResponseData,
  EncounterStatus,
  MedicalRecordResponseData,
  UserRole,
  VitalResponseData,
} from '@medcore/types';
import { PrismaService } from '../../database/prisma.service';
import { StorageService, UploadedFilePayload } from '../../common/storage/storage.service';
import { RecordVitalsDto } from './dto/record-vitals.dto';
import { AddDiagnosisDto } from './dto/add-diagnosis.dto';
import { UpdateClinicalNotesDto } from './dto/update-clinical-notes.dto';
import { CreateAmendmentDto } from './dto/create-amendment.dto';

/**
 * EncountersService orchestrates clinical encounters, vitals, diagnoses,
 * atomic finalization, and additive historical amendments.
 */
@Injectable()
export class EncountersService {
  private readonly logger = new Logger(EncountersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Start Clinical Encounter (Idempotent, Transactional)
  // ---------------------------------------------------------------------------
  async startEncounter(
    tenantId: string | null,
    appointmentId: string,
    currentUser: { id: string; role: UserRole },
  ): Promise<EncounterResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    // Resolve authenticated doctor
    const doctor = await this.prisma.doctor.findFirst({
      where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
    });

    if (!doctor) {
      throw new ForbiddenException('Only a registered doctor in this hospital may start an encounter');
    }

    // Retrieve appointment with tenant isolation
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, hospitalId: tenantId },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID '${appointmentId}' not found`);
    }

    // Clinician ownership check: Only assigned doctor can start encounter
    if (appointment.doctorId !== doctor.id) {
      throw new ForbiddenException('Only the assigned doctor may start this clinical encounter');
    }

    // Appointment status validation: Cancelled or No-Show cannot have encounters
    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      throw new UnprocessableEntityException(
        `Cannot start clinical encounter for an appointment in '${appointment.status}' status`,
      );
    }

    // Check if encounter already exists for this appointment (idempotent)
    const existingEncounter = await this.prisma.patientEncounter.findUnique({
      where: { appointmentId },
      include: {
        appointment: true,
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
        medicalRecord: {
          include: {
            vitals: { orderBy: { recordedAt: 'asc' } },
            diagnoses: { orderBy: { createdAt: 'asc' } },
            attachments: { orderBy: { uploadedAt: 'asc' } },
            amendments: {
              orderBy: { amendmentNumber: 'asc' },
              include: { amendedBy: { include: { user: true } } },
            },
          },
        },
      },
    });

    if (existingEncounter) {
      return this.formatEncounterResponse(existingEncounter);
    }

    // Atomically create encounter, draft medical record, and transition appointment
    const createdEncounter = await this.prisma.$transaction(async (tx) => {
      const startedAt = new Date();

      // Create initial draft MedicalRecord nested within PatientEncounter creation
      const chiefComplaint = appointment.reason?.trim() || 'General Consultation';
      const encounter = await tx.patientEncounter.create({
        data: {
          hospitalId: tenantId,
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          doctorId: doctor.id,
          status: EncounterStatus.IN_PROGRESS,
          startedAt,
          medicalRecord: {
            create: {
              hospitalId: tenantId,
              patientId: appointment.patientId,
              doctorId: doctor.id,
              chiefComplaint,
              clinicalNotes: appointment.notes || null,
            },
          },
        },
      });

      // Transition appointment to IN_PROGRESS if not already
      if (appointment.status !== AppointmentStatus.IN_PROGRESS) {
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: AppointmentStatus.IN_PROGRESS },
        });
      }

      // Record operational audit event
      await tx.auditLog.create({
        data: {
          hospitalId: tenantId,
          userId: currentUser.id,
          action: AuditAction.CREATE,
          entityName: 'PatientEncounter',
          entityId: encounter.id,
          changesJson: { action: 'START_ENCOUNTER', appointmentId: appointment.id },
        },
      });

      const record = await tx.patientEncounter.findFirst({
        where: { id: encounter.id },
        include: {
          appointment: true,
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          medicalRecord: {
            include: {
              vitals: true,
              diagnoses: true,
              attachments: true,
              amendments: {
                include: { amendedBy: { include: { user: true } } },
              },
            },
          },
        },
      });
      return record!;
    });

    return this.formatEncounterResponse(createdEncounter);
  }

  // ---------------------------------------------------------------------------
  // 2. Get Encounter Details (Authorization Scoped)
  // ---------------------------------------------------------------------------
  async getEncounter(
    tenantId: string | null,
    encounterId: string,
    currentUser: { id: string; role: UserRole },
  ): Promise<EncounterResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: {
        appointment: true,
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
        medicalRecord: {
          include: {
            vitals: { orderBy: { recordedAt: 'asc' } },
            diagnoses: { orderBy: { createdAt: 'asc' } },
            attachments: { orderBy: { uploadedAt: 'asc' } },
            amendments: {
              orderBy: { amendmentNumber: 'asc' },
              include: { amendedBy: { include: { user: true } } },
            },
          },
        },
      },
    });

    if (!encounter) {
      throw new NotFoundException(`Encounter with ID '${encounterId}' not found`);
    }

    // Role-specific authorization
    if (currentUser.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
      });

      if (!patient || encounter.patientId !== patient.id) {
        throw new ForbiddenException('Patients may only view their own clinical encounters');
      }
    }

    return this.formatEncounterResponse(encounter);
  }

  // ---------------------------------------------------------------------------
  // 3. Record Vitals (Server-Computed BMI)
  // ---------------------------------------------------------------------------
  async recordVitals(
    tenantId: string | null,
    encounterId: string,
    dto: RecordVitalsDto,
    currentUser: { id: string; role: UserRole },
  ): Promise<VitalResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: { medicalRecord: true },
    });

    if (!encounter || !encounter.medicalRecord) {
      throw new NotFoundException(`Encounter or medical record not found`);
    }

    if (encounter.status === EncounterStatus.COMPLETED) {
      throw new ConflictException('Encounter is finalized and locked. Cannot record new vitals');
    }

    // Doctor ownership check if caller is DOCTOR
    if (currentUser.role === UserRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findFirst({
        where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
      });

      if (!doctor || encounter.doctorId !== doctor.id) {
        throw new ForbiddenException('Only the assigned doctor or authorized nurse may record vitals');
      }
    }

    // Server-Side BMI Calculation: weightKg / ((heightCm / 100) ^ 2)
    let calculatedBmi: number | null = null;
    if (dto.heightCm && dto.weightKg && dto.heightCm > 0 && dto.weightKg > 0) {
      const heightM = dto.heightCm / 100;
      calculatedBmi = Math.round((dto.weightKg / (heightM * heightM)) * 10) / 10;
    }

    // Append-only vital creation
    const vital = await this.prisma.vital.create({
      data: {
        recordId: encounter.medicalRecord.id,
        bpSystolic: dto.bpSystolic ?? null,
        bpDiastolic: dto.bpDiastolic ?? null,
        heartRate: dto.heartRate ?? null,
        temperature: dto.temperature ?? null,
        spo2: dto.spo2 ?? null,
        respiratoryRate: dto.respiratoryRate ?? null,
        heightCm: dto.heightCm ?? null,
        weightKg: dto.weightKg ?? null,
        bmi: calculatedBmi,
        notes: dto.notes?.trim() ?? null,
      },
    });

    return {
      id: vital.id,
      recordId: vital.recordId,
      recordedAt: vital.recordedAt.toISOString(),
      bpSystolic: vital.bpSystolic,
      bpDiastolic: vital.bpDiastolic,
      heartRate: vital.heartRate,
      temperature: vital.temperature ? Number(vital.temperature) : null,
      spo2: vital.spo2,
      respiratoryRate: vital.respiratoryRate,
      heightCm: vital.heightCm ? Number(vital.heightCm) : null,
      weightKg: vital.weightKg ? Number(vital.weightKg) : null,
      bmi: vital.bmi ? Number(vital.bmi) : null,
      notes: vital.notes,
      createdAt: vital.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Add Diagnosis
  // ---------------------------------------------------------------------------
  async addDiagnosis(
    tenantId: string | null,
    encounterId: string,
    dto: AddDiagnosisDto,
    currentUser: { id: string; role: UserRole },
  ) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: { medicalRecord: true },
    });

    if (!encounter || !encounter.medicalRecord) {
      throw new NotFoundException(`Encounter or medical record not found`);
    }

    if (encounter.status === EncounterStatus.COMPLETED) {
      throw new ConflictException('Encounter is finalized and locked. Submit an amendment instead');
    }

    // Assigned doctor check
    const doctor = await this.prisma.doctor.findFirst({
      where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
    });

    if (!doctor || encounter.doctorId !== doctor.id) {
      throw new ForbiddenException('Only the assigned doctor may add diagnoses');
    }

    const diagnosis = await this.prisma.diagnosis.create({
      data: {
        recordId: encounter.medicalRecord.id,
        code: dto.code?.trim() || null,
        description: dto.description.trim(),
        type: dto.type || DiagnosisType.CONFIRMED,
        isPrimary: dto.isPrimary ?? true,
        notes: dto.notes?.trim() || null,
      },
    });

    return {
      id: diagnosis.id,
      recordId: diagnosis.recordId,
      code: diagnosis.code,
      description: diagnosis.description,
      type: diagnosis.type as DiagnosisType,
      isPrimary: diagnosis.isPrimary,
      notes: diagnosis.notes,
      createdAt: diagnosis.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Update Draft Clinical Notes & Treatment Plan
  // ---------------------------------------------------------------------------
  async updateNotes(
    tenantId: string | null,
    encounterId: string,
    dto: UpdateClinicalNotesDto,
    currentUser: { id: string; role: UserRole },
  ) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: { medicalRecord: true },
    });

    if (!encounter || !encounter.medicalRecord) {
      throw new NotFoundException(`Encounter or medical record not found`);
    }

    if (encounter.status === EncounterStatus.COMPLETED) {
      throw new ConflictException(
        'Encounter is finalized and locked. Direct edits are rejected. Submit an amendment instead',
      );
    }

    const doctor = await this.prisma.doctor.findFirst({
      where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
    });

    if (!doctor || encounter.doctorId !== doctor.id) {
      throw new ForbiddenException('Only the assigned doctor may update consultation notes');
    }

    const updatedRecord = await this.prisma.medicalRecord.update({
      where: { id: encounter.medicalRecord.id },
      data: {
        chiefComplaint: dto.chiefComplaint?.trim() || encounter.medicalRecord.chiefComplaint,
        presentingSymptoms: dto.presentingSymptoms !== undefined ? dto.presentingSymptoms?.trim() : undefined,
        clinicalNotes: dto.clinicalNotes !== undefined ? dto.clinicalNotes?.trim() : undefined,
        treatmentPlan: dto.treatmentPlan !== undefined ? dto.treatmentPlan?.trim() : undefined,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
      },
    });

    return {
      id: updatedRecord.id,
      chiefComplaint: updatedRecord.chiefComplaint,
      presentingSymptoms: updatedRecord.presentingSymptoms,
      clinicalNotes: updatedRecord.clinicalNotes,
      treatmentPlan: updatedRecord.treatmentPlan,
      followUpDate: updatedRecord.followUpDate ? updatedRecord.followUpDate.toISOString() : null,
      updatedAt: updatedRecord.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Upload Clinical Attachment (S3 Integration)
  // ---------------------------------------------------------------------------
  async uploadAttachment(
    tenantId: string | null,
    encounterId: string,
    file: UploadedFilePayload,
    currentUser: { id: string; role: UserRole },
  ) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: { medicalRecord: true },
    });

    if (!encounter || !encounter.medicalRecord) {
      throw new NotFoundException(`Encounter or medical record not found`);
    }

    if (encounter.status === EncounterStatus.COMPLETED) {
      throw new ConflictException('Encounter is finalized. Cannot upload new attachments');
    }

    const doctor = await this.prisma.doctor.findFirst({
      where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
    });

    if (!doctor || encounter.doctorId !== doctor.id) {
      throw new ForbiddenException('Only the assigned doctor may upload clinical attachments');
    }

    // Perform upload to canonical S3 path
    const uploadResult = await this.storageService.uploadAttachment({
      hospitalId: tenantId,
      patientId: encounter.patientId,
      file,
    });

    try {
      const attachment = await this.prisma.attachment.create({
        data: {
          recordId: encounter.medicalRecord.id,
          fileName: uploadResult.fileName,
          fileUrl: uploadResult.objectKey, // Store object key as canonical reference
          fileType: uploadResult.fileType,
          fileSize: uploadResult.fileSize,
        },
      });

      return {
        id: attachment.id,
        recordId: attachment.recordId,
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        uploadedAt: attachment.uploadedAt.toISOString(),
      };
    } catch (dbError) {
      // S3 rollback on failure
      await this.storageService.deleteObject(uploadResult.objectKey);
      throw dbError;
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Get Pre-Signed Download URL (15 Min Expiry)
  // ---------------------------------------------------------------------------
  async getAttachmentSignedUrl(
    tenantId: string | null,
    encounterId: string,
    attachmentId: string,
    currentUser: { id: string; role: UserRole },
  ) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: {
        medicalRecord: {
          include: { attachments: { where: { id: attachmentId } } },
        },
      },
    });

    if (
      !encounter ||
      !encounter.medicalRecord ||
      encounter.medicalRecord.attachments.length === 0
    ) {
      throw new NotFoundException('Attachment not found');
    }

    const attachment = encounter.medicalRecord.attachments[0];

    // Patient authorization check
    if (currentUser.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
      });

      if (!patient || encounter.patientId !== patient.id) {
        throw new ForbiddenException('Patients may only view their own attachments');
      }
    }

    const signedUrl = await this.storageService.getSignedDownloadUrl(attachment.fileUrl, 900);
    const expiresAt = new Date(Date.now() + 900 * 1000).toISOString();

    return {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      signedUrl,
      expiresAt,
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Complete Encounter (Strict Invariant Validation & Atomicity)
  // ---------------------------------------------------------------------------
  async completeEncounter(
    tenantId: string | null,
    encounterId: string,
    currentUser: { id: string; role: UserRole },
  ) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: {
        appointment: true,
        medicalRecord: { include: { diagnoses: true } },
      },
    });

    if (!encounter || !encounter.medicalRecord) {
      throw new NotFoundException(`Encounter with ID '${encounterId}' not found`);
    }

    // Status invariant
    if (encounter.status !== EncounterStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot complete encounter in '${encounter.status}' status. Only IN_PROGRESS encounters can be completed`,
      );
    }

    // Clinician ownership check
    const doctor = await this.prisma.doctor.findFirst({
      where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
    });

    if (!doctor || encounter.doctorId !== doctor.id) {
      throw new ForbiddenException('Only the assigned doctor may complete this clinical encounter');
    }

    // Completion Invariants:
    // 1. Mandatory Chief Complaint >= 3 chars
    if (
      !encounter.medicalRecord.chiefComplaint ||
      encounter.medicalRecord.chiefComplaint.trim().length < 3
    ) {
      throw new BadRequestException('Cannot complete encounter: Chief complaint must be at least 3 characters');
    }

    // 2. Mandatory at least 1 diagnosis
    if (encounter.medicalRecord.diagnoses.length === 0) {
      throw new UnprocessableEntityException(
        'Cannot complete encounter: At least one provisional or confirmed diagnosis is required',
      );
    }

    const completedAt = new Date();

    // Atomic completion transaction
    await this.prisma.$transaction(async (tx) => {
      // Complete encounter
      await tx.patientEncounter.update({
        where: { id: encounter.id },
        data: {
          status: EncounterStatus.COMPLETED,
          completedAt,
        },
      });

      // Complete appointment
      await tx.appointment.update({
        where: { id: encounter.appointmentId },
        data: { status: AppointmentStatus.COMPLETED },
      });

      // Operational audit log
      await tx.auditLog.create({
        data: {
          hospitalId: tenantId,
          userId: currentUser.id,
          action: AuditAction.UPDATE,
          entityName: 'PatientEncounter',
          entityId: encounter.id,
          changesJson: { action: 'COMPLETE_ENCOUNTER', completedAt },
        },
      });
    });

    return {
      id: encounter.id,
      status: EncounterStatus.COMPLETED,
      completedAt: completedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 9. Add Additive Clinical Amendment (ADR-006: Original Record Untouched)
  // ---------------------------------------------------------------------------
  async createAmendment(
    tenantId: string | null,
    encounterId: string,
    dto: CreateAmendmentDto,
    currentUser: { id: string; role: UserRole },
  ) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const encounter = await this.prisma.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId: tenantId },
      include: {
        medicalRecord: { include: { amendments: true } },
      },
    });

    if (!encounter || !encounter.medicalRecord) {
      throw new NotFoundException(`Encounter with ID '${encounterId}' not found`);
    }

    // Amendments only permitted on COMPLETED records
    if (encounter.status !== EncounterStatus.COMPLETED) {
      throw new BadRequestException('Amendments can only be submitted for completed encounters');
    }

    // Assigned doctor check
    const doctor = await this.prisma.doctor.findFirst({
      where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
      include: { user: true },
    });

    if (!doctor || encounter.doctorId !== doctor.id) {
      throw new ForbiddenException('Only the assigned doctor may submit an amendment');
    }

    const nextAmendmentNumber = encounter.medicalRecord.amendments.length + 1;

    // Create amendment record WITHOUT modifying MedicalRecord base row
    const amendment = await this.prisma.medicalRecordAmendment.create({
      data: {
        recordId: encounter.medicalRecord.id,
        amendedById: doctor.id,
        amendmentNumber: nextAmendmentNumber,
        amendmentType: dto.amendmentType || AmendmentType.ADDENDUM,
        section: dto.section || AmendmentSection.CLINICAL_NOTES,
        reason: dto.reason.trim(),
        content: dto.content.trim(),
      },
      include: { amendedBy: { include: { user: true } } },
    });

    // Record operational audit
    await this.prisma.auditLog.create({
      data: {
        hospitalId: tenantId,
        userId: currentUser.id,
        action: AuditAction.CREATE,
        entityName: 'MedicalRecordAmendment',
        entityId: amendment.id,
        changesJson: {
          action: 'CREATE_AMENDMENT',
          amendmentNumber: nextAmendmentNumber,
          section: amendment.section,
        },
      },
    });

    return {
      id: amendment.id,
      recordId: amendment.recordId,
      amendedById: amendment.amendedById,
      amendedByName: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`,
      amendmentNumber: amendment.amendmentNumber,
      amendmentType: amendment.amendmentType as AmendmentType,
      section: amendment.section as AmendmentSection,
      reason: amendment.reason,
      content: amendment.content,
      createdAt: amendment.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private formatEncounterResponse(encounter: any): EncounterResponseData {
    let formattedMedicalRecord: MedicalRecordResponseData | null = null;

    if (encounter.medicalRecord) {
      formattedMedicalRecord = {
        id: encounter.medicalRecord.id,
        hospitalId: encounter.medicalRecord.hospitalId,
        encounterId: encounter.medicalRecord.encounterId,
        patientId: encounter.medicalRecord.patientId,
        doctorId: encounter.medicalRecord.doctorId,
        chiefComplaint: encounter.medicalRecord.chiefComplaint,
        presentingSymptoms: encounter.medicalRecord.presentingSymptoms,
        clinicalNotes: encounter.medicalRecord.clinicalNotes,
        treatmentPlan: encounter.medicalRecord.treatmentPlan,
        followUpDate: encounter.medicalRecord.followUpDate
          ? encounter.medicalRecord.followUpDate.toISOString()
          : null,
        createdAt: encounter.medicalRecord.createdAt.toISOString(),
        updatedAt: encounter.medicalRecord.updatedAt.toISOString(),
        vitals: (encounter.medicalRecord.vitals || []).map((v: any) => ({
          id: v.id,
          recordId: v.recordId,
          recordedAt: v.recordedAt.toISOString(),
          bpSystolic: v.bpSystolic,
          bpDiastolic: v.bpDiastolic,
          heartRate: v.heartRate,
          temperature: v.temperature ? Number(v.temperature) : null,
          spo2: v.spo2,
          respiratoryRate: v.respiratoryRate,
          heightCm: v.heightCm ? Number(v.heightCm) : null,
          weightKg: v.weightKg ? Number(v.weightKg) : null,
          bmi: v.bmi ? Number(v.bmi) : null,
          notes: v.notes,
          createdAt: v.createdAt.toISOString(),
        })),
        diagnoses: (encounter.medicalRecord.diagnoses || []).map((d: any) => ({
          id: d.id,
          recordId: d.recordId,
          code: d.code,
          description: d.description,
          type: d.type as DiagnosisType,
          isPrimary: d.isPrimary,
          notes: d.notes,
          createdAt: d.createdAt.toISOString(),
        })),
        attachments: (encounter.medicalRecord.attachments || []).map((a: any) => ({
          id: a.id,
          recordId: a.recordId,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          fileType: a.fileType,
          fileSize: a.fileSize,
          uploadedAt: a.uploadedAt.toISOString(),
        })),
        amendments: (encounter.medicalRecord.amendments || []).map((m: any) => ({
          id: m.id,
          recordId: m.recordId,
          amendedById: m.amendedById,
          amendedByName: m.amendedBy?.user
            ? `Dr. ${m.amendedBy.user.firstName} ${m.amendedBy.user.lastName}`
            : undefined,
          amendmentNumber: m.amendmentNumber,
          amendmentType: m.amendmentType as AmendmentType,
          section: m.section as AmendmentSection,
          reason: m.reason,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }

    return {
      id: encounter.id,
      hospitalId: encounter.hospitalId,
      appointmentId: encounter.appointmentId,
      patientId: encounter.patientId,
      doctorId: encounter.doctorId,
      status: encounter.status as EncounterStatus,
      startedAt: encounter.startedAt ? encounter.startedAt.toISOString() : null,
      completedAt: encounter.completedAt ? encounter.completedAt.toISOString() : null,
      createdAt: encounter.createdAt.toISOString(),
      updatedAt: encounter.updatedAt.toISOString(),
      appointment: encounter.appointment
        ? {
            id: encounter.appointment.id,
            appointmentDate: encounter.appointment.appointmentDate.toISOString(),
            startTime: encounter.appointment.startTime,
            endTime: encounter.appointment.endTime,
            type: encounter.appointment.type,
            status: encounter.appointment.status,
          }
        : null,
      patient: encounter.patient
        ? {
            id: encounter.patient.id,
            uhid: encounter.patient.uhid,
            fullName: `${encounter.patient.user?.firstName || ''} ${encounter.patient.user?.lastName || ''}`.trim(),
            dateOfBirth: encounter.patient.dateOfBirth.toISOString(),
            gender: encounter.patient.gender,
            bloodGroup: encounter.patient.bloodGroup,
          }
        : null,
      doctor: encounter.doctor
        ? {
            id: encounter.doctor.id,
            fullName: `Dr. ${encounter.doctor.user?.firstName || ''} ${encounter.doctor.user?.lastName || ''}`.trim(),
            specialization: encounter.doctor.specialization,
          }
        : null,
      medicalRecord: formattedMedicalRecord,
    };
  }
}
