import { PrismaService } from '../src/database/prisma.service';
import { RoomsBedsService } from '../src/modules/rooms-beds/rooms-beds.service';
import { TriageService } from '../src/modules/triage/triage.service';
import { TriageLevel, TriageStatus } from '../src/modules/triage/triage.types';
import { UserRole, EncounterStatus, BedStatus } from '@medcore/types';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('Phase 8 — Emergency Room & Triage Workflow Suite', () => {
  let prisma: PrismaService;
  let roomsBedsService: RoomsBedsService;
  let triageService: TriageService;

  let hospitalAId: string;
  let hospitalBId: string;
  let doctorA: any;
  let patientA1: any;
  let patientA2: any;
  let departmentA: any;
  let roomA: any;
  let bedA: any;

  const createdEncounterIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdBedIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    roomsBedsService = new RoomsBedsService(prisma);
    triageService = new TriageService(prisma, roomsBedsService);

    // Fetch two distinct hospital tenants
    const hospitals = await prisma.raw.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // Fetch Doctor in Hospital A
    doctorA = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true, department: true },
    });

    // Fetch Patients in Hospital A
    const patientsA = await prisma.raw.patient.findMany({
      where: { hospitalId: hospitalAId },
      include: { user: true },
      take: 2,
    });
    patientA1 = patientsA[0];
    patientA2 = patientsA[1];

    // Ensure department exists in Hospital A
    departmentA = await prisma.raw.department.findFirst({
      where: { hospitalId: hospitalAId },
    });

    // Create an Emergency Ward Room and Bed for testing in Hospital A
    roomA = await prisma.raw.room.create({
      data: {
        roomNumber: `ER-${Date.now().toString().slice(-4)}`,
        departmentId: departmentA.id,
        hospitalId: hospitalAId,
        type: 'EMERGENCY',
      },
    });

    bedA = await prisma.raw.bed.create({
      data: {
        bedNumber: `BED-ER-${Date.now().toString().slice(-4)}`,
        roomId: roomA.id,
        hospitalId: hospitalAId,
        status: BedStatus.AVAILABLE,
      },
    });
    createdBedIds.push(bedA.id);
  });

  afterAll(async () => {
    // Cleanup created test records
    for (const encId of createdEncounterIds) {
      await prisma.raw.medicalRecord.deleteMany({ where: { encounterId: encId } });
      await prisma.raw.patientEncounter.deleteMany({ where: { id: encId } });
    }
    for (const apptId of createdAppointmentIds) {
      await prisma.raw.appointment.deleteMany({ where: { id: apptId } });
    }
    for (const bedId of createdBedIds) {
      await prisma.raw.bed.deleteMany({ where: { id: bedId } });
    }
    if (roomA) {
      await prisma.raw.room.deleteMany({ where: { id: roomA.id } });
    }
    await prisma.$disconnect();
  });

  it('1. should register emergency patient arrival with ESI Level 3 (Urgent) and create atomic encounter', async () => {
    const actor = { id: doctorA.userId, role: UserRole.DOCTOR };
    const result = await triageService.registerEmergencyPatient(hospitalAId, actor, {
      patientId: patientA1.id,
      doctorId: doctorA.id,
      triageLevel: TriageLevel.URGENT,
      chiefComplaint: 'Acute abdominal pain and nausea',
      bp: '130/85',
      pulse: 88,
      temperature: 38.2,
      spO2: 98,
    });

    expect(result).toBeDefined();
    expect(result.encounterId).toBeDefined();
    expect(result.triageLevel).toBe(TriageLevel.URGENT);
    expect(result.status).toBe(TriageStatus.TRIAGED);
    expect(result.chiefComplaint).toBe('Acute abdominal pain and nausea');

    createdEncounterIds.push(result.encounterId);
    createdAppointmentIds.push(result.appointmentId);
  });

  it('2. should register high-priority emergency patient with ESI Level 1 (Resuscitation)', async () => {
    const actor = { id: doctorA.userId, role: UserRole.DOCTOR };
    const result = await triageService.registerEmergencyPatient(hospitalAId, actor, {
      patientId: patientA2.id,
      doctorId: doctorA.id,
      triageLevel: TriageLevel.RESUSCITATION,
      chiefComplaint: 'Cardiac arrest / unresponsive',
      bp: '70/40',
      pulse: 145,
      temperature: 36.5,
      spO2: 82,
    });

    expect(result).toBeDefined();
    expect(result.triageLevel).toBe(TriageLevel.RESUSCITATION);
    expect(result.status).toBe(TriageStatus.TRIAGED);

    createdEncounterIds.push(result.encounterId);
    createdAppointmentIds.push(result.appointmentId);
  });

  it('3. should retrieve live ER board strictly prioritized by ESI level (Level 1 ahead of Level 3)', async () => {
    const board = await triageService.getEmergencyBoard(hospitalAId);

    expect(board.length).toBeGreaterThanOrEqual(2);

    // Verify first patient in queue is ESI Level 1 (Resuscitation) even though Level 3 was registered first
    const level1Patient = board.find((p) => p.triageLevel === TriageLevel.RESUSCITATION);
    const level3Patient = board.find((p) => p.triageLevel === TriageLevel.URGENT);

    expect(level1Patient).toBeDefined();
    expect(level3Patient).toBeDefined();

    const level1Index = board.indexOf(level1Patient!);
    const level3Index = board.indexOf(level3Patient!);

    expect(level1Index).toBeLessThan(level3Index);
  });

  it('4. should rapidly allocate available bed to emergency patient with status transition to BED_ASSIGNED', async () => {
    const actor = { id: doctorA.userId, role: UserRole.DOCTOR };
    const resuscitationEncounterId = createdEncounterIds[1]; // patientA2 ESI 1

    const allocation = await triageService.allocateEmergencyBed(hospitalAId, actor, {
      encounterId: resuscitationEncounterId,
      bedId: bedA.id,
      notes: 'Immediate trauma resuscitation bay allocated',
    });

    expect(allocation.success).toBe(true);
    expect(allocation.bed.status).toBe(BedStatus.OCCUPIED);
    expect(allocation.bed.currentPatientId).toBe(patientA2.id);

    // Verify board now displays allocated bed
    const board = await triageService.getEmergencyBoard(hospitalAId);
    const patientRecord = board.find((p) => p.encounterId === resuscitationEncounterId);
    expect(patientRecord).toBeDefined();
    expect(patientRecord!.bedNumber).toBe(bedA.bedNumber);
    expect(patientRecord!.status).toBe(TriageStatus.BED_ASSIGNED);
  });

  it('5. should reject assigning already occupied bed with ConflictException', async () => {
    const actor = { id: doctorA.userId, role: UserRole.DOCTOR };
    const urgentEncounterId = createdEncounterIds[0]; // patientA1 ESI 3

    await expect(
      triageService.allocateEmergencyBed(hospitalAId, actor, {
        encounterId: urgentEncounterId,
        bedId: bedA.id, // already occupied
        notes: 'Trying to steal occupied bed',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('6. should update triage status through workflow (ATTENDED -> IN_PROGRESS, DISCHARGED -> COMPLETED)', async () => {
    const actor = { id: doctorA.userId, role: UserRole.DOCTOR };
    const encounterId = createdEncounterIds[0];

    // Transition to ATTENDED
    const attendedRes = await triageService.updateTriageStatus(
      hospitalAId,
      actor,
      encounterId,
      { status: TriageStatus.ATTENDED, notes: 'Doctor attending at bedside' },
    );
    expect(attendedRes.success).toBe(true);

    const encounterMid = await prisma.raw.patientEncounter.findUnique({
      where: { id: encounterId },
    });
    expect(encounterMid.status).toBe(EncounterStatus.IN_PROGRESS);

    // Transition to DISCHARGED
    const dischargedRes = await triageService.updateTriageStatus(
      hospitalAId,
      actor,
      encounterId,
      { status: TriageStatus.DISCHARGED, notes: 'Patient stabilized and discharged home' },
    );
    expect(dischargedRes.success).toBe(true);

    const encounterFinal = await prisma.raw.patientEncounter.findUnique({
      where: { id: encounterId },
    });
    expect(encounterFinal.status).toBe(EncounterStatus.COMPLETED);
    expect(encounterFinal.completedAt).toBeDefined();
  });

  it('7. should enforce strict tenant isolation: Hospital B cannot access Hospital A emergency board or allocate Hospital A beds', async () => {
    const boardB = await triageService.getEmergencyBoard(hospitalBId);
    // Hospital B must not see Hospital A patients
    const containsPatientA = boardB.some(
      (p) => p.encounterId === createdEncounterIds[0] || p.encounterId === createdEncounterIds[1],
    );
    expect(containsPatientA).toBe(false);

    // Hospital B actor attempting to allocate Hospital A encounter must be rejected
    const actorB = { id: '00000000-0000-0000-0000-000000000099', role: UserRole.DOCTOR };
    await expect(
      triageService.allocateEmergencyBed(hospitalBId, actorB, {
        encounterId: createdEncounterIds[1],
        bedId: bedA.id,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
