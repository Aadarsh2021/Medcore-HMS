import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { PrescriptionPdfService } from './prescription-pdf.service';
import {
  AuditAction,
  EncounterStatus,
  MedicineForm,
  PrescriptionStatus,
} from '@prisma/client';
import { UserRole } from '@medcore/types';
import {
  CreatePrescriptionDraftDto,
  PatientPrescriptionsQueryDto,
  UpdatePrescriptionItemsDto,
  VoidPrescriptionDto,
} from './dto';

@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly pdfService: PrescriptionPdfService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Get or Create Draft Prescription for Active Encounter (Idempotent)
  // ---------------------------------------------------------------------------
  async getOrCreateDraft(
    tenantId: string | null,
    encounterId: string,
    dto: CreatePrescriptionDraftDto,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: currentUser.id },
    });
    if (!doctor) {
      throw new ForbiddenException('Only registered doctors can create prescriptions');
    }

    const encounter = await this.prisma.patientEncounter.findUnique({
      where: { id: encounterId },
      include: {
        prescription: {
          include: { items: true },
        },
      },
    });

    if (!encounter || encounter.hospitalId !== tenantId) {
      throw new NotFoundException('Clinical encounter not found in this hospital');
    }

    if (encounter.status !== EncounterStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Prescriptions can only be drafted for IN_PROGRESS encounters. Current status: ${encounter.status}`,
      );
    }

    if (encounter.doctorId !== doctor.id) {
      throw new ForbiddenException(
        'Only the assigned attending doctor for this encounter can draft a prescription',
      );
    }

    // Idempotent return if draft already exists
    if (encounter.prescription) {
      if (encounter.prescription.status === PrescriptionStatus.DRAFT) {
        return this.formatPrescription(encounter.prescription);
      }
      throw new ConflictException(
        'A finalized prescription already exists for this encounter. Further draft creation is prohibited.',
      );
    }

    const prescription = await this.prisma.$transaction(async (tx) => {
      const created = await tx.prescription.create({
        data: {
          hospitalId: tenantId,
          encounterId: encounter.id,
          patientId: encounter.patientId,
          doctorId: doctor.id,
          status: PrescriptionStatus.DRAFT,
          notes: dto?.notes?.trim() || null,
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: tenantId,
          userId: currentUser.id,
          action: AuditAction.CREATE,
          entityName: 'Prescription',
          entityId: created.id,
          changesJson: {
            action: 'CREATE_PRESCRIPTION_DRAFT',
            encounterId: encounter.id,
            patientId: encounter.patientId,
            doctorId: doctor.id,
          },
        },
      });

      return created;
    });

    return this.formatPrescription(prescription);
  }

  // ---------------------------------------------------------------------------
  // 2. Get Prescription Details with Strict RBAC
  // ---------------------------------------------------------------------------
  async getPrescriptionById(
    tenantId: string | null,
    prescriptionId: string,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        doctor: { include: { user: true } },
        patient: { include: { user: true } },
        encounter: true,
      },
    });

    if (!prescription || prescription.hospitalId !== tenantId) {
      throw new NotFoundException('Prescription not found');
    }

    // RBAC validation
    await this.validateReadAccess(prescription, currentUser);

    return this.formatPrescription(prescription);
  }

  // ---------------------------------------------------------------------------
  // 3. Update Draft Prescription Items & Notes
  // ---------------------------------------------------------------------------
  async updateDraft(
    tenantId: string | null,
    prescriptionId: string,
    dto: UpdatePrescriptionItemsDto,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { encounter: true },
    });

    if (!prescription || prescription.hospitalId !== tenantId) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.status !== PrescriptionStatus.DRAFT) {
      throw new ConflictException(
        `Prescription cannot be edited in ${prescription.status} status. Finalized prescriptions are strictly immutable.`,
      );
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: currentUser.id },
    });
    if (!doctor || prescription.doctorId !== doctor.id) {
      throw new ForbiddenException('Only the prescribing doctor may edit this draft prescription');
    }

    if (prescription.encounter.status !== EncounterStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Cannot edit prescription for an encounter that is no longer in progress',
      );
    }

    // Validate and resolve item snapshots server-side
    const validatedItems = await Promise.all(
      dto.items.map(async (item) => {
        let medicineName = item.medicineName?.trim() || '';
        let form: MedicineForm = item.form || MedicineForm.TABLET;
        let strength: string | null = item.strength?.trim() || null;

        if (item.medicineId) {
          const catalogMed = await this.prisma.medicine.findUnique({
            where: { id: item.medicineId },
          });
          if (!catalogMed || catalogMed.hospitalId !== tenantId) {
            throw new BadRequestException(
              `Referenced medicine ${item.medicineId} does not belong to this hospital tenant`,
            );
          }
          // Server-side authoritative snapshots
          medicineName = catalogMed.name;
          form = catalogMed.form;
          strength = catalogMed.strength;
        } else {
          if (!medicineName) {
            throw new BadRequestException('Custom medication requires a valid medicineName');
          }
        }

        if (!item.dosage || !item.dosage.trim()) {
          throw new BadRequestException('Dosage is required for every medication item');
        }
        if (item.dosage.trim().length > 100) {
          throw new BadRequestException('Dosage exceeds maximum length of 100 characters');
        }
        if (item.durationDays === undefined || item.durationDays === null || item.durationDays < 1) {
          throw new BadRequestException('Duration must be at least 1 day');
        }
        if (item.durationDays > 365) {
          throw new BadRequestException('Duration cannot exceed 365 days');
        }
        if (item.quantity !== undefined && item.quantity !== null && item.quantity <= 0) {
          throw new BadRequestException('Quantity must be greater than zero if provided');
        }

        return {
          medicineId: item.medicineId || null,
          medicineName,
          form,
          strength,
          dosage: item.dosage.trim(),
          frequency: item.frequency,
          durationDays: item.durationDays,
          route: item.route?.trim() || 'ORAL',
          instructions: item.instructions?.trim() || null,
          quantity: item.quantity !== undefined && item.quantity !== null ? item.quantity : null,
        };
      }),
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      // Clear existing draft items
      await tx.prescriptionItem.deleteMany({
        where: { prescriptionId: prescription.id },
      });

      // Insert new validated items
      if (validatedItems.length > 0) {
        await tx.prescriptionItem.createMany({
          data: validatedItems.map((i) => ({
            ...i,
            prescriptionId: prescription.id,
          })),
        });
      }

      // Update prescription notes
      return tx.prescription.update({
        where: { id: prescription.id },
        data: {
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : prescription.notes,
        },
        include: { items: true },
      });
    });

    return this.formatPrescription(updated);
  }

  // ---------------------------------------------------------------------------
  // 4. Cancel Draft Prescription
  // ---------------------------------------------------------------------------
  async cancelDraft(
    tenantId: string | null,
    prescriptionId: string,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });

    if (!prescription || prescription.hospitalId !== tenantId) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.status !== PrescriptionStatus.DRAFT) {
      throw new ConflictException(
        `Only DRAFT prescriptions can be cancelled via this endpoint. Current status: ${prescription.status}`,
      );
    }

    const isHospitalAdmin =
      currentUser.role === UserRole.HOSPITAL_ADMIN ||
      currentUser.role === UserRole.SUPER_ADMIN;

    if (!isHospitalAdmin) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: currentUser.id },
      });
      if (!doctor || prescription.doctorId !== doctor.id) {
        throw new ForbiddenException(
          'Only the prescribing doctor or a hospital admin may cancel this draft',
        );
      }
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const result = await tx.prescription.update({
        where: { id: prescription.id },
        data: {
          status: PrescriptionStatus.CANCELLED,
          voidedAt: new Date(),
          voidedById: currentUser.id,
          voidReason: 'Draft discarded by doctor/admin',
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: tenantId,
          userId: currentUser.id,
          action: AuditAction.UPDATE,
          entityName: 'Prescription',
          entityId: prescription.id,
          changesJson: {
            action: 'CANCEL_DRAFT_PRESCRIPTION',
            previousStatus: PrescriptionStatus.DRAFT,
            newStatus: PrescriptionStatus.CANCELLED,
          },
        },
      });

      return result;
    });

    return this.formatPrescription(cancelled);
  }

  // ---------------------------------------------------------------------------
  // 5. Finalize Prescription (Concurrency-Safe Transaction + Out-of-Tx PDF Upload)
  // ---------------------------------------------------------------------------
  async finalizePrescription(
    tenantId: string | null,
    prescriptionId: string,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: currentUser.id },
      include: { user: true },
    });
    if (!doctor) {
      throw new ForbiddenException('Only registered doctors can finalize prescriptions');
    }

    // Step 5A: Database Transaction (Validate -> Lock -> Allocate Number -> ISSUED -> Audit -> Commit)
    const finalizedRx = await this.prisma.raw.$transaction(async (tx) => {
      // 1. SELECT FOR UPDATE to prevent race conditions on concurrent finalizations
      const lockedRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "Prescription" WHERE id = ${prescriptionId} FOR UPDATE
      `;

      if (!lockedRows || lockedRows.length === 0) {
        throw new NotFoundException('Prescription not found');
      }

      const currentStatus = lockedRows[0].status;
      if (currentStatus !== PrescriptionStatus.DRAFT) {
        throw new ConflictException(
          `Prescription is in ${currentStatus} status and cannot be finalized again.`,
        );
      }

      const rx = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          items: true,
          encounter: true,
          patient: { include: { user: true } },
          hospital: true,
        },
      });

      if (!rx || rx.hospitalId !== tenantId) {
        throw new NotFoundException('Prescription not found');
      }

      if (rx.doctorId !== doctor.id) {
        throw new ForbiddenException(
          'Only the assigned attending doctor can finalize and sign this prescription',
        );
      }

      if (rx.encounter.status !== EncounterStatus.IN_PROGRESS) {
        throw new BadRequestException(
          `Encounter must be IN_PROGRESS to finalize prescription. Current: ${rx.encounter.status}`,
        );
      }

      if (!rx.items || rx.items.length === 0) {
        throw new UnprocessableEntityException(
          'Cannot finalize an empty prescription. Add at least one medication order item.',
        );
      }

      // Concurrency-safe hospital-scoped numbering
      const currentYear = new Date().getFullYear();
      const counter = await tx.prescriptionNumberCounter.upsert({
        where: {
          hospitalId_year: {
            hospitalId: tenantId,
            year: currentYear,
          },
        },
        update: {
          nextValue: { increment: 1 },
        },
        create: {
          hospitalId: tenantId,
          year: currentYear,
          nextValue: 2,
        },
      });

      const sequenceVal = counter.nextValue - 1;
      const hospitalCode = (rx.hospital.code || 'HOSP').toUpperCase();
      const prescriptionNumber = `RX-${hospitalCode}-${currentYear}-${String(sequenceVal).padStart(6, '0')}`;
      const issuedAt = new Date();

      const updated = await tx.prescription.update({
        where: { id: rx.id },
        data: {
          status: PrescriptionStatus.ISSUED,
          prescriptionNumber,
          issuedAt,
          pdfGenerationStatus: 'PENDING',
        },
        include: {
          items: true,
          hospital: true,
          patient: { include: { user: true } },
          encounter: true,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: tenantId,
          userId: currentUser.id,
          action: AuditAction.UPDATE,
          entityName: 'Prescription',
          entityId: updated.id,
          changesJson: {
            action: 'FINALIZE_PRESCRIPTION',
            prescriptionNumber,
            issuedAt: issuedAt.toISOString(),
            itemCount: rx.items.length,
          },
        },
      });

      return updated;
    }, { maxWait: 20000, timeout: 20000 });

    // Step 5B: Post-Commit PDF Generation & S3 Upload (Failure does NOT rollback ISSUED prescription)
    try {
      const patientFullName = `${finalizedRx.patient.user.firstName} ${finalizedRx.patient.user.lastName}`;
      const doctorFullName = `${doctor.user.firstName} ${doctor.user.lastName}`;

      const { buffer, sha256 } = await this.pdfService.generatePrescriptionPdf({
        hospital: {
          id: finalizedRx.hospital.id,
          name: finalizedRx.hospital.name,
          code: finalizedRx.hospital.code,
          phone: finalizedRx.hospital.phone,
          email: finalizedRx.hospital.email,
        },
        patient: {
          id: finalizedRx.patient.id,
          uhid: finalizedRx.patient.uhid,
          fullName: patientFullName,
          gender: finalizedRx.patient.gender,
        },
        doctor: {
          id: doctor.id,
          fullName: doctorFullName,
          specialization: doctor.specialization,
          licenseNumber: doctor.licenseNumber,
          signatureUrl: doctor.signatureUrl,
        },
        prescription: {
          id: finalizedRx.id,
          hospitalId: finalizedRx.hospitalId,
          encounterId: finalizedRx.encounterId,
          patientId: finalizedRx.patientId,
          doctorId: finalizedRx.doctorId,
          prescriptionNumber: finalizedRx.prescriptionNumber!,
          issuedAt: finalizedRx.issuedAt!,
          notes: finalizedRx.notes,
        },
        items: finalizedRx.items,
      });

      const { objectKey, fileUrl } = await this.storageService.uploadPrescriptionPdf({
        hospitalId: tenantId,
        patientId: finalizedRx.patientId,
        prescriptionNumber: finalizedRx.prescriptionNumber!,
        buffer,
      });

      const persisted = await this.prisma.prescription.update({
        where: { id: finalizedRx.id },
        data: {
          pdfStorageKey: objectKey,
          signedPdfUrl: fileUrl,
          pdfGeneratedAt: new Date(),
          pdfSha256: sha256,
          pdfGenerationStatus: 'READY',
        },
        include: { items: true },
      });

      return this.formatPrescription(persisted);
    } catch (pdfErr) {
      this.logger.error(
        `PDF generation or S3 upload failed for finalized prescription ${finalizedRx.id}:`,
        pdfErr,
      );

      // Record failure status in DB without rolling back the ISSUED prescription
      await this.prisma.prescription.update({
        where: { id: finalizedRx.id },
        data: { pdfGenerationStatus: 'FAILED' },
      });

      return this.formatPrescription(finalizedRx);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Void / Cancel Finalized Prescription (Audited Immutability Workflow)
  // ---------------------------------------------------------------------------
  async voidPrescription(
    tenantId: string | null,
    prescriptionId: string,
    dto: VoidPrescriptionDto,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });

    if (!prescription || prescription.hospitalId !== tenantId) {
      throw new NotFoundException('Prescription not found');
    }

    if (prescription.status !== PrescriptionStatus.ISSUED) {
      throw new ConflictException(
        `Only finalized (ISSUED) prescriptions can be voided. Current status: ${prescription.status}`,
      );
    }

    const isHospitalAdmin =
      currentUser.role === UserRole.HOSPITAL_ADMIN ||
      currentUser.role === UserRole.SUPER_ADMIN;

    if (!isHospitalAdmin) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: currentUser.id },
      });
      if (!doctor || prescription.doctorId !== doctor.id) {
        throw new ForbiddenException(
          'Only the original prescribing doctor or a hospital admin can void this prescription',
        );
      }
    }

    if (!dto?.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException(
        'A clinical justification of at least 5 characters is required to void an issued prescription.',
      );
    }

    const voidedAt = new Date();
    const cleanReason = dto.reason.trim();

    const voided = await this.prisma.$transaction(async (tx) => {
      const result = await tx.prescription.update({
        where: { id: prescription.id },
        data: {
          status: PrescriptionStatus.CANCELLED,
          voidedAt,
          voidReason: cleanReason,
          voidedById: currentUser.id,
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: tenantId,
          userId: currentUser.id,
          action: AuditAction.UPDATE,
          entityName: 'Prescription',
          entityId: prescription.id,
          changesJson: {
            action: 'VOID_ISSUED_PRESCRIPTION',
            prescriptionNumber: prescription.prescriptionNumber,
            voidReason: cleanReason,
            voidedAt: voidedAt.toISOString(),
          },
        },
      });

      return result;
    });

    return this.formatPrescription(voided);
  }

  // ---------------------------------------------------------------------------
  // 7. Get Authorized 15-Minute Signed PDF Download URL
  // ---------------------------------------------------------------------------
  async getPdfDownloadUrl(
    tenantId: string | null,
    prescriptionId: string,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        hospital: true,
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
        encounter: true,
      },
    });

    if (!prescription || prescription.hospitalId !== tenantId) {
      throw new NotFoundException('Prescription not found');
    }

    await this.validateReadAccess(prescription, currentUser);

    if (prescription.status === PrescriptionStatus.DRAFT) {
      throw new BadRequestException('Prescription is still in DRAFT mode. PDF is not available.');
    }

    // If PDF was never generated or failed, retry generating it on demand
    let objectKey = prescription.pdfStorageKey;
    if (!objectKey) {
      this.logger.log(`Regenerating missing PDF for prescription ${prescription.id}...`);
      const patientFullName = `${prescription.patient.user.firstName} ${prescription.patient.user.lastName}`;
      const doctorFullName = `${prescription.doctor.user.firstName} ${prescription.doctor.user.lastName}`;

      const { buffer, sha256 } = await this.pdfService.generatePrescriptionPdf({
        hospital: {
          id: prescription.hospital.id,
          name: prescription.hospital.name,
          code: prescription.hospital.code,
          phone: prescription.hospital.phone,
          email: prescription.hospital.email,
        },
        patient: {
          id: prescription.patient.id,
          uhid: prescription.patient.uhid,
          fullName: patientFullName,
          gender: prescription.patient.gender,
        },
        doctor: {
          id: prescription.doctor.id,
          fullName: doctorFullName,
          specialization: prescription.doctor.specialization,
          licenseNumber: prescription.doctor.licenseNumber,
          signatureUrl: prescription.doctor.signatureUrl,
        },
        prescription: {
          id: prescription.id,
          hospitalId: prescription.hospitalId,
          encounterId: prescription.encounterId,
          patientId: prescription.patientId,
          doctorId: prescription.doctorId,
          prescriptionNumber: prescription.prescriptionNumber || `RX-${prescription.id.slice(0, 8)}`,
          issuedAt: prescription.issuedAt || prescription.createdAt,
          notes: prescription.notes,
        },
        items: prescription.items,
      });

      const uploaded = await this.storageService.uploadPrescriptionPdf({
        hospitalId: tenantId,
        patientId: prescription.patientId,
        prescriptionNumber: prescription.prescriptionNumber || prescription.id,
        buffer,
      });

      objectKey = uploaded.objectKey;

      await this.prisma.prescription.update({
        where: { id: prescription.id },
        data: {
          pdfStorageKey: objectKey,
          signedPdfUrl: uploaded.fileUrl,
          pdfGeneratedAt: new Date(),
          pdfSha256: sha256,
          pdfGenerationStatus: 'READY',
        },
      });
    }

    // 15-minute temporary pre-signed URL (PRD & ADR-004)
    const downloadUrl = await this.storageService.getSignedDownloadUrl(objectKey, 900);
    const expiresAt = new Date(Date.now() + 900 * 1000).toISOString();

    return { downloadUrl, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // 8. Get Paginated Patient Prescriptions
  // ---------------------------------------------------------------------------
  async getPatientPrescriptions(
    tenantId: string | null,
    patientId: string,
    query: PatientPrescriptionsQueryDto,
    currentUser: any,
  ) {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    // Patient isolation check
    if (currentUser.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: currentUser.id },
      });
      if (!patient || patient.id !== patientId) {
        throw new ForbiddenException('Patients are only permitted to view their own prescriptions');
      }
    }

    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const whereClause: any = {
      hospitalId: tenantId,
      patientId,
    };

    // Patients NEVER see draft prescriptions
    if (currentUser.role === UserRole.PATIENT) {
      whereClause.status = { not: PrescriptionStatus.DRAFT };
    }

    if (query.status) {
      whereClause.status = query.status;
    }

    const [total, prescriptions] = await Promise.all([
      this.prisma.prescription.count({ where: whereClause }),
      this.prisma.prescription.findMany({
        where: whereClause,
        include: {
          items: true,
          doctor: { include: { user: true } },
          patient: { include: { user: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: prescriptions.map((p) => this.formatPrescription(p)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private async validateReadAccess(prescription: any, currentUser: any): Promise<void> {
    if (currentUser.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: currentUser.id },
      });
      if (!patient || patient.id !== prescription.patientId) {
        throw new ForbiddenException('Access denied: Cannot view another patient prescription');
      }
      if (prescription.status === PrescriptionStatus.DRAFT) {
        throw new ForbiddenException('Patients cannot view draft prescriptions');
      }
      return;
    }

    if (currentUser.role === UserRole.RECEPTIONIST) {
      throw new ForbiddenException('Receptionists are not authorized to view clinical prescriptions');
    }

    if (currentUser.role === UserRole.DOCTOR && prescription.status === PrescriptionStatus.DRAFT) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: currentUser.id },
      });
      if (!doctor || prescription.doctorId !== doctor.id) {
        throw new ForbiddenException(
          'Only the assigned attending doctor can view a draft prescription',
        );
      }
    }
  }

  private formatPrescription(rx: any) {
    return {
      id: rx.id,
      hospitalId: rx.hospitalId,
      encounterId: rx.encounterId,
      patientId: rx.patientId,
      doctorId: rx.doctorId,
      prescriptionNumber: rx.prescriptionNumber || null,
      notes: rx.notes || null,
      signedPdfUrl: rx.signedPdfUrl || null,
      pdfStorageKey: rx.pdfStorageKey || null,
      pdfGeneratedAt: rx.pdfGeneratedAt ? rx.pdfGeneratedAt.toISOString() : null,
      pdfSha256: rx.pdfSha256 || null,
      pdfGenerationStatus: rx.pdfGenerationStatus || 'PENDING',
      status: rx.status,
      issuedAt: rx.issuedAt ? rx.issuedAt.toISOString() : null,
      voidedAt: rx.voidedAt ? rx.voidedAt.toISOString() : null,
      voidReason: rx.voidReason || null,
      voidedById: rx.voidedById || null,
      createdAt: rx.createdAt.toISOString(),
      updatedAt: rx.updatedAt.toISOString(),
      doctor: rx.doctor
        ? {
            id: rx.doctor.id,
            fullName: rx.doctor.user
              ? `${rx.doctor.user.firstName} ${rx.doctor.user.lastName}`
              : 'Unknown Doctor',
            specialization: rx.doctor.specialization,
            licenseNumber: rx.doctor.licenseNumber,
            signatureUrl: rx.doctor.signatureUrl || null,
          }
        : undefined,
      patient: rx.patient
        ? {
            id: rx.patient.id,
            uhid: rx.patient.uhid,
            fullName: rx.patient.user
              ? `${rx.patient.user.firstName} ${rx.patient.user.lastName}`
              : 'Unknown Patient',
            gender: rx.patient.gender,
          }
        : undefined,
      items: (rx.items || []).map((i: any) => ({
        id: i.id,
        prescriptionId: i.prescriptionId,
        medicineId: i.medicineId || null,
        medicineName: i.medicineName,
        form: i.form,
        strength: i.strength || null,
        dosage: i.dosage,
        frequency: i.frequency,
        durationDays: i.durationDays,
        route: i.route,
        instructions: i.instructions || null,
        quantity: i.quantity || null,
        dispensedQuantity: i.dispensedQuantity || 0,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  }
}
