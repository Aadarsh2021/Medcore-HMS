import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AllergyResponseData,
  AllergySeverity,
  BloodGroup,
  EncounterListItemData,
  EncounterStatus,
  FamilyHistoryResponseData,
  Gender,
  MedicationHistoryResponseData,
  PaginatedResponse,
  PatientClinicalSummaryResponseData,
  UserRole,
  VaccinationResponseData,
  VitalResponseData,
} from '@medcore/types';
import { PrismaService } from '../../database/prisma.service';
import { CreateAllergyDto } from './dto/create-allergy.dto';
import { CreateMedicationHistoryDto } from './dto/create-medication.dto';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateFamilyHistoryDto } from './dto/create-family-history.dto';
import {
  PatientEncountersQueryDto,
  PatientVitalsQueryDto,
} from './dto/patient-query.dto';

/**
 * MedicalRecordsService manages longitudinal patient health records,
 * clinical summaries, allergies, medications, immunizations, and family histories.
 */
@Injectable()
export class MedicalRecordsService {
  private readonly logger = new Logger(MedicalRecordsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // 1. Get Patient Clinical Summary (Bounded, 5 Recent Encounters)
  // ---------------------------------------------------------------------------
  async getPatientSummary(
    tenantId: string | null,
    patientId: string,
    currentUser: { id: string; role: UserRole },
  ): Promise<PatientClinicalSummaryResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    await this.verifyPatientAccess(tenantId, patientId, currentUser);

    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId: tenantId, deletedAt: null },
      include: {
        user: true,
        allergies: { orderBy: { diagnosedAt: 'desc' } },
        medicationHistories: { orderBy: { createdAt: 'desc' } },
        vaccinations: { orderBy: { administeredDate: 'desc' } },
        familyHistories: { orderBy: { createdAt: 'desc' } },
        encounters: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            doctor: { include: { user: true } },
            medicalRecord: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID '${patientId}' not found`);
    }

    return {
      patient: {
        id: patient.id,
        uhid: patient.uhid,
        fullName: `${patient.user?.firstName || ''} ${patient.user?.lastName || ''}`.trim(),
        firstName: patient.user?.firstName || '',
        lastName: patient.user?.lastName || '',
        gender: patient.gender as unknown as Gender,
        dateOfBirth: patient.dateOfBirth.toISOString(),
        bloodGroup: patient.bloodGroup as unknown as BloodGroup | null,
        emergencyContactName: patient.emergencyContactName,
        emergencyContactPhone: patient.emergencyContactPhone,
      },
      allergies: patient.allergies.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        recordId: a.recordId,
        allergen: a.allergen,
        reaction: a.reaction,
        severity: a.severity as AllergySeverity,
        diagnosedAt: a.diagnosedAt.toISOString(),
        createdAt: a.createdAt.toISOString(),
      })),
      medications: patient.medicationHistories.map((m) => ({
        id: m.id,
        patientId: m.patientId,
        recordId: m.recordId,
        medicationName: m.medicationName,
        dosage: m.dosage,
        frequency: m.frequency,
        route: m.route,
        startDate: m.startDate ? m.startDate.toISOString() : null,
        endDate: m.endDate ? m.endDate.toISOString() : null,
        isActive: m.isActive,
        notes: m.notes,
        createdAt: m.createdAt.toISOString(),
      })),
      vaccinations: patient.vaccinations.map((v) => ({
        id: v.id,
        patientId: v.patientId,
        recordId: v.recordId,
        vaccineName: v.vaccineName,
        administeredDate: v.administeredDate.toISOString(),
        batchNumber: v.batchNumber,
        nextDueDate: v.nextDueDate ? v.nextDueDate.toISOString() : null,
        notes: v.notes,
        createdAt: v.createdAt.toISOString(),
      })),
      familyHistories: patient.familyHistories.map((f) => ({
        id: f.id,
        patientId: f.patientId,
        recordId: f.recordId,
        condition: f.condition,
        relationship: f.relationship,
        notes: f.notes,
        createdAt: f.createdAt.toISOString(),
      })),
      recentEncounters: patient.encounters.map((e) => ({
        id: e.id,
        hospitalId: e.hospitalId,
        appointmentId: e.appointmentId,
        patientId: e.patientId,
        patientName: `${patient.user?.firstName || ''} ${patient.user?.lastName || ''}`.trim(),
        patientUhid: patient.uhid,
        doctorId: e.doctorId,
        doctorName: `Dr. ${e.doctor?.user?.firstName || ''} ${e.doctor?.user?.lastName || ''}`.trim(),
        status: e.status as EncounterStatus,
        startedAt: e.startedAt ? e.startedAt.toISOString() : null,
        completedAt: e.completedAt ? e.completedAt.toISOString() : null,
        chiefComplaint: e.medicalRecord?.chiefComplaint || null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Get Paginated Patient Encounters
  // ---------------------------------------------------------------------------
  async getPatientEncounters(
    tenantId: string | null,
    patientId: string,
    query: PatientEncountersQueryDto,
    currentUser: { id: string; role: UserRole },
  ): Promise<PaginatedResponse<EncounterListItemData>> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    await this.verifyPatientAccess(tenantId, patientId, currentUser);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const whereClause: any = {
      patientId,
      hospitalId: tenantId,
    };

    if (query.status) {
      whereClause.status = query.status;
    }

    if (query.from || query.to) {
      whereClause.createdAt = {};
      if (query.from) whereClause.createdAt.gte = new Date(query.from);
      if (query.to) whereClause.createdAt.lte = new Date(query.to);
    }

    const [total, encounters] = await Promise.all([
      this.prisma.patientEncounter.count({ where: whereClause }),
      this.prisma.patientEncounter.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
          medicalRecord: true,
        },
      }),
    ]);

    const data: EncounterListItemData[] = encounters.map((e) => ({
      id: e.id,
      hospitalId: e.hospitalId,
      appointmentId: e.appointmentId,
      patientId: e.patientId,
      patientName: `${e.patient?.user?.firstName || ''} ${e.patient?.user?.lastName || ''}`.trim(),
      patientUhid: e.patient?.uhid || '',
      doctorId: e.doctorId,
      doctorName: `Dr. ${e.doctor?.user?.firstName || ''} ${e.doctor?.user?.lastName || ''}`.trim(),
      status: e.status as EncounterStatus,
      startedAt: e.startedAt ? e.startedAt.toISOString() : null,
      completedAt: e.completedAt ? e.completedAt.toISOString() : null,
      chiefComplaint: e.medicalRecord?.chiefComplaint || null,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Get Paginated Patient Vitals (Time-Series)
  // ---------------------------------------------------------------------------
  async getPatientVitals(
    tenantId: string | null,
    patientId: string,
    query: PatientVitalsQueryDto,
    currentUser: { id: string; role: UserRole },
  ): Promise<VitalResponseData[]> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    await this.verifyPatientAccess(tenantId, patientId, currentUser);

    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const whereClause: any = {
      record: {
        patientId,
        hospitalId: tenantId,
      },
    };

    if (query.from || query.to) {
      whereClause.recordedAt = {};
      if (query.from) whereClause.recordedAt.gte = new Date(query.from);
      if (query.to) whereClause.recordedAt.lte = new Date(query.to);
    }

    const vitals = await this.prisma.vital.findMany({
      where: whereClause,
      take: limit,
      orderBy: { recordedAt: 'desc' },
    });

    return vitals.map((v) => ({
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
    }));
  }

  // ---------------------------------------------------------------------------
  // 4. Add Patient Allergy (Longitudinal)
  // ---------------------------------------------------------------------------
  async addAllergy(
    tenantId: string | null,
    patientId: string,
    dto: CreateAllergyDto,
  ): Promise<AllergyResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    await this.ensurePatientExistsInTenant(tenantId, patientId);

    const allergy = await this.prisma.allergy.create({
      data: {
        patientId,
        recordId: dto.recordId || null,
        allergen: dto.allergen.trim(),
        reaction: dto.reaction.trim(),
        severity: dto.severity || AllergySeverity.MODERATE,
        diagnosedAt: dto.diagnosedAt ? new Date(dto.diagnosedAt) : new Date(),
      },
    });

    return {
      id: allergy.id,
      patientId: allergy.patientId,
      recordId: allergy.recordId,
      allergen: allergy.allergen,
      reaction: allergy.reaction,
      severity: allergy.severity as AllergySeverity,
      diagnosedAt: allergy.diagnosedAt.toISOString(),
      createdAt: allergy.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Add Patient Medication History (Longitudinal)
  // ---------------------------------------------------------------------------
  async addMedicationHistory(
    tenantId: string | null,
    patientId: string,
    dto: CreateMedicationHistoryDto,
  ): Promise<MedicationHistoryResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    await this.ensurePatientExistsInTenant(tenantId, patientId);

    const med = await this.prisma.medicationHistory.create({
      data: {
        patientId,
        recordId: dto.recordId || null,
        medicationName: dto.medicationName.trim(),
        dosage: dto.dosage.trim(),
        frequency: dto.frequency.trim(),
        route: dto.route?.trim() || null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isActive: dto.isActive ?? true,
        notes: dto.notes?.trim() || null,
      },
    });

    return {
      id: med.id,
      patientId: med.patientId,
      recordId: med.recordId,
      medicationName: med.medicationName,
      dosage: med.dosage,
      frequency: med.frequency,
      route: med.route,
      startDate: med.startDate ? med.startDate.toISOString() : null,
      endDate: med.endDate ? med.endDate.toISOString() : null,
      isActive: med.isActive,
      notes: med.notes,
      createdAt: med.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Add Patient Vaccination Record (Longitudinal)
  // ---------------------------------------------------------------------------
  async addVaccination(
    tenantId: string | null,
    patientId: string,
    dto: CreateVaccinationDto,
  ): Promise<VaccinationResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    await this.ensurePatientExistsInTenant(tenantId, patientId);

    const vax = await this.prisma.vaccinationHistory.create({
      data: {
        patientId,
        recordId: dto.recordId || null,
        vaccineName: dto.vaccineName.trim(),
        administeredDate: new Date(dto.administeredDate),
        batchNumber: dto.batchNumber?.trim() || null,
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
        notes: dto.notes?.trim() || null,
      },
    });

    return {
      id: vax.id,
      patientId: vax.patientId,
      recordId: vax.recordId,
      vaccineName: vax.vaccineName,
      administeredDate: vax.administeredDate.toISOString(),
      batchNumber: vax.batchNumber,
      nextDueDate: vax.nextDueDate ? vax.nextDueDate.toISOString() : null,
      notes: vax.notes,
      createdAt: vax.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Add Patient Family History (Longitudinal)
  // ---------------------------------------------------------------------------
  async addFamilyHistory(
    tenantId: string | null,
    patientId: string,
    dto: CreateFamilyHistoryDto,
  ): Promise<FamilyHistoryResponseData> {
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    await this.ensurePatientExistsInTenant(tenantId, patientId);

    const fam = await this.prisma.familyHistory.create({
      data: {
        patientId,
        recordId: dto.recordId || null,
        condition: dto.condition.trim(),
        relationship: dto.relationship.trim(),
        notes: dto.notes?.trim() || null,
      },
    });

    return {
      id: fam.id,
      patientId: fam.patientId,
      recordId: fam.recordId,
      condition: fam.condition,
      relationship: fam.relationship,
      notes: fam.notes,
      createdAt: fam.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Security & Verification Helpers
  // ---------------------------------------------------------------------------
  private async verifyPatientAccess(
    tenantId: string,
    patientId: string,
    currentUser: { id: string; role: UserRole },
  ): Promise<void> {
    // Receptionists cannot view clinical medical records
    if (currentUser.role === UserRole.RECEPTIONIST) {
      throw new ForbiddenException('Receptionists are not permitted to access clinical records');
    }

    // Patients can only access their own record
    if (currentUser.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: currentUser.id, hospitalId: tenantId, deletedAt: null },
      });

      if (!patient || patient.id !== patientId) {
        throw new ForbiddenException('Patients may only view their own clinical records');
      }
    }
  }

  private async ensurePatientExistsInTenant(tenantId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, hospitalId: tenantId, deletedAt: null },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID '${patientId}' not found in this hospital`);
    }
  }
}
