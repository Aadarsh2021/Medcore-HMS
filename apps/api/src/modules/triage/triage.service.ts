import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RoomsBedsService } from '../rooms-beds/rooms-beds.service';
import {
  RegisterEmergencyPatientDto,
  RapidBedAllocationDto,
  UpdateTriageStatusDto,
} from './triage.dto';
import {
  EmergencyPatientRecord,
  TriageLevel,
  TriageStatus,
} from './triage.types';
import {
  AppointmentType,
  AppointmentStatus,
  EncounterStatus,
  AuditAction,
} from '@medcore/types';

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsBedsService: RoomsBedsService,
  ) {}

  private get db(): any {
    return this.prisma.raw;
  }

  /**
   * Registers an emergency patient arrival with Emergency Severity Index (ESI) triage level.
   * Concurrency-safe and multi-tenant isolated.
   */
  async registerEmergencyPatient(
    hospitalId: string,
    actor: { id: string; role: string },
    dto: RegisterEmergencyPatientDto,
  ): Promise<EmergencyPatientRecord> {
    // 1. Verify patient belongs to this hospital
    const patient = await this.db.patient.findFirst({
      where: { id: dto.patientId, hospitalId },
      include: { user: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found in this hospital facility');
    }

    // 2. Verify on-call doctor belongs to this hospital
    const doctor = await this.db.doctor.findFirst({
      where: { id: dto.doctorId, hospitalId },
      include: { user: true, department: true },
    });
    if (!doctor) {
      throw new NotFoundException('Designated emergency doctor not found in this hospital');
    }

    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const timeStr = now.toTimeString().slice(0, 5);
    const endTimeStr = oneHourLater.toTimeString().slice(0, 5);

    // 3. Create Emergency Appointment & Encounter atomically
    const result = await this.prisma.$transaction(async (tx: any) => {
      const appt = await tx.appointment.create({
        data: {
          hospitalId,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          departmentId: doctor.departmentId,
          appointmentDate: now,
          startTime: timeStr,
          endTime: endTimeStr,
          type: AppointmentType.EMERGENCY,
          status: AppointmentStatus.CONFIRMED,
          notes: `[ER TRIAGE LEVEL ${dto.triageLevel}] ${dto.chiefComplaint}`,
        },
      });

      const encounter = await tx.patientEncounter.create({
        data: {
          hospitalId,
          appointmentId: appt.id,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          status: EncounterStatus.CHECKED_IN,
          startedAt: now,
        },
      });

      // 4. Create Medical Record with Vitals & Triage Metadata
      await tx.medicalRecord.create({
        data: {
          hospitalId,
          encounterId: encounter.id,
          patientId: dto.patientId,
          doctorId: dto.doctorId,
          chiefComplaint: dto.chiefComplaint,
          clinicalNotes: JSON.stringify({
            triageLevel: dto.triageLevel,
            triageStatus: TriageStatus.TRIAGED,
            erNotes: dto.notes || null,
            vitals: {
              bp: dto.bp || null,
              pulse: dto.pulse || null,
              spO2: dto.spO2 || null,
              temperature: dto.temperature || null,
            },
          }),
        },
      });

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          hospitalId,
          userId: actor.id,
          action: AuditAction.CREATE,
          entityName: 'TriageEncounter',
          entityId: encounter.id,
          changesJson: {
            triageLevel: dto.triageLevel,
            chiefComplaint: dto.chiefComplaint,
          },
        },
      });

      return { appt, encounter };
    });

    this.logger.log(
      `Emergency Patient Registered: Encounter ${result.encounter.id} | Level ${dto.triageLevel} | Tenant: ${hospitalId}`,
    );

    return {
      encounterId: result.encounter.id,
      appointmentId: result.appt.id,
      patientId: patient.id,
      patientName: `${patient.user.firstName} ${patient.user.lastName}`,
      uhid: patient.uhid,
      doctorId: doctor.id,
      doctorName: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`,
      triageLevel: dto.triageLevel,
      chiefComplaint: dto.chiefComplaint,
      vitals: {
        bp: dto.bp,
        pulse: dto.pulse,
        spO2: dto.spO2,
        temperature: dto.temperature,
      },
      bedNumber: null,
      status: TriageStatus.TRIAGED,
      arrivedAt: now.toISOString(),
    };
  }

  /**
   * Retrieves active Emergency Room board sorted by ESI Priority (Level 1 first, then 2, etc.)
   * Strictly isolated to calling hospitalId tenant.
   */
  async getEmergencyBoard(hospitalId: string): Promise<EmergencyPatientRecord[]> {
    const encounters = await this.db.patientEncounter.findMany({
      where: {
        hospitalId,
        appointment: {
          type: AppointmentType.EMERGENCY,
        },
        status: {
          in: [EncounterStatus.CHECKED_IN, EncounterStatus.IN_PROGRESS],
        },
      },
      include: {
        patient: { include: { user: true } },
        doctor: { include: { user: true } },
        medicalRecord: true,
        beds: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const parsed: EmergencyPatientRecord[] = encounters.map((enc: any) => {
      let triageLevel = TriageLevel.URGENT;
      let triageStatus = TriageStatus.ARRIVED;
      let vitals: any = {};

      if (enc.medicalRecord?.clinicalNotes) {
        try {
          const notesObj = JSON.parse(enc.medicalRecord.clinicalNotes);
          if (notesObj.triageLevel) triageLevel = notesObj.triageLevel;
          if (notesObj.triageStatus) triageStatus = notesObj.triageStatus;
          if (notesObj.vitals) vitals = notesObj.vitals;
        } catch {
          // ignore parsing error
        }
      }

      const activeBed = enc.beds && enc.beds.length > 0 ? enc.beds[0].bedNumber : null;
      if (activeBed && triageStatus !== TriageStatus.DISCHARGED) {
        triageStatus = TriageStatus.BED_ASSIGNED;
      }

      return {
        encounterId: enc.id,
        appointmentId: enc.appointmentId,
        patientId: enc.patientId,
        patientName: `${enc.patient.user.firstName} ${enc.patient.user.lastName}`,
        uhid: enc.patient.uhid,
        doctorId: enc.doctorId,
        doctorName: `Dr. ${enc.doctor.user.firstName} ${enc.doctor.user.lastName}`,
        triageLevel,
        chiefComplaint: enc.medicalRecord?.chiefComplaint || 'Emergency Consultation',
        vitals: {
          bp: vitals.bp || undefined,
          pulse: vitals.pulse || undefined,
          spO2: vitals.spO2 || undefined,
          temperature: vitals.temperature || undefined,
        },
        bedNumber: activeBed,
        status: triageStatus,
        arrivedAt: enc.createdAt.toISOString(),
      };
    });

    // Sort by ESI Priority Level ASC (1: Resuscitation first), then by arrival time
    parsed.sort((a, b) => {
      if (a.triageLevel !== b.triageLevel) {
        return a.triageLevel - b.triageLevel;
      }
      return new Date(a.arrivedAt).getTime() - new Date(b.arrivedAt).getTime();
    });

    return parsed;
  }

  /**
   * Rapid Emergency Bed Allocation using concurrency-safe RoomsBedsService.
   */
  async allocateEmergencyBed(
    hospitalId: string,
    actor: { id: string; role: string },
    dto: RapidBedAllocationDto,
  ) {
    const encounter = await this.db.patientEncounter.findFirst({
      where: { id: dto.encounterId, hospitalId },
    });
    if (!encounter) {
      throw new NotFoundException('Emergency encounter not found in this hospital');
    }

    // Allocate bed using concurrency-safe row-level lock
    const bed = await this.roomsBedsService.assignBed(hospitalId, actor, dto.bedId, {
      patientId: encounter.patientId,
      encounterId: encounter.id,
      notes: dto.notes || 'Emergency Bed Allocation',
    });

    // Update status in clinical notes
    const record = await this.db.medicalRecord.findFirst({
      where: { encounterId: encounter.id, hospitalId },
    });
    if (record) {
      let currentNotes: any = {};
      try {
        currentNotes = JSON.parse(record.clinicalNotes || '{}');
      } catch {
        currentNotes = {};
      }
      currentNotes.triageStatus = TriageStatus.BED_ASSIGNED;
      currentNotes.allocatedBedNumber = bed.bedNumber;

      await this.db.medicalRecord.update({
        where: { id: record.id },
        data: { clinicalNotes: JSON.stringify(currentNotes) },
      });
    }

    return {
      success: true,
      message: `Allocated emergency Bed ${bed.bedNumber} to patient`,
      bed,
    };
  }

  /**
   * Updates emergency triage status (e.g. ATTENDED, DISCHARGED, ADMITTED).
   */
  async updateTriageStatus(
    hospitalId: string,
    actor: { id: string; role: string },
    encounterId: string,
    dto: UpdateTriageStatusDto,
  ) {
    const encounter = await this.db.patientEncounter.findFirst({
      where: { id: encounterId, hospitalId },
    });
    if (!encounter) {
      throw new NotFoundException('Emergency encounter not found in this hospital');
    }

    const record = await this.db.medicalRecord.findFirst({
      where: { encounterId, hospitalId },
    });

    if (record) {
      let currentNotes: any = {};
      try {
        currentNotes = JSON.parse(record.clinicalNotes || '{}');
      } catch {
        currentNotes = {};
      }
      currentNotes.triageStatus = dto.status;
      if (dto.notes) {
        currentNotes.statusNotes = dto.notes;
      }

      await this.db.medicalRecord.update({
        where: { id: record.id },
        data: { clinicalNotes: JSON.stringify(currentNotes) },
      });
    }

    if (dto.status === TriageStatus.DISCHARGED || dto.status === TriageStatus.ADMITTED) {
      await this.db.patientEncounter.update({
        where: { id: encounterId },
        data: {
          status: EncounterStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } else if (dto.status === TriageStatus.ATTENDED) {
      await this.db.patientEncounter.update({
        where: { id: encounterId },
        data: { status: EncounterStatus.IN_PROGRESS },
      });
    }

    return {
      success: true,
      status: dto.status,
      message: `Updated triage status to ${dto.status}`,
    };
  }
}
