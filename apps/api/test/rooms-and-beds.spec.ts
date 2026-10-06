import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { RoomsBedsService } from '../src/modules/rooms-beds/rooms-beds.service';
import { RoomsBedsController } from '../src/modules/rooms-beds/rooms-beds.controller';
import { UserRole, RoomType, BedStatus } from '@medcore/types';

describe('Phase 9 — Inpatient Rooms, Beds & Concurrency Architecture Suite', () => {
  let prisma: PrismaService;
  let db: any;
  let roomsBedsService: RoomsBedsService;
  let roomsBedsController: RoomsBedsController;

  let hospitalAId: string;
  let hospitalBId: string;
  let hospitalAdminA: { id: string; role: string; hospitalId: string };
  let nurseA: { id: string; role: string; hospitalId: string };
  let patientA1: { id: string; uhid: string };
  let patientA2: { id: string; uhid: string };

  const createdRoomIds: string[] = [];
  const createdBedIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdPatientIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = prisma.raw as any;

    roomsBedsService = new RoomsBedsService(prisma);
    roomsBedsController = new RoomsBedsController(roomsBedsService);

    // 1. Fetch hospitals
    const hospitals = await db.hospital.findMany({
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    hospitalAId = hospitals[0].id;
    hospitalBId = hospitals[1].id;

    // 2. Fetch staff for Hospital A
    const admin = await db.user.findFirst({
      where: { hospitalId: hospitalAId, role: UserRole.HOSPITAL_ADMIN as any },
    });
    hospitalAdminA = { id: admin!.id, role: UserRole.HOSPITAL_ADMIN, hospitalId: hospitalAId };

    nurseA = { id: admin!.id, role: UserRole.NURSE, hospitalId: hospitalAId };

    // 3. Fetch or create 2 patients in Hospital A
    const patients = await db.patient.findMany({
      where: { hospitalId: hospitalAId },
      take: 2,
    });

    if (patients.length >= 2) {
      patientA1 = { id: patients[0].id, uhid: patients[0].uhid };
      patientA2 = { id: patients[1].id, uhid: patients[1].uhid };
    } else {
      // Create test patients if needed
      const timestamp = Date.now();
      const user1 = await db.user.create({
        data: {
          hospitalId: hospitalAId,
          email: `inpatient_1_${timestamp}@test.org`,
          passwordHash: 'dummy',
          role: UserRole.PATIENT as any,
          firstName: 'Inpatient',
          lastName: 'One',
        },
      });
      const p1 = await db.patient.create({
        data: {
          hospitalId: hospitalAId,
          userId: user1.id,
          uhid: `UHID-INP-1-${timestamp.toString().slice(-4)}`,
          dateOfBirth: new Date('1990-01-01'),
          gender: 'MALE',
        },
      });
      patientA1 = { id: p1.id, uhid: p1.uhid };
      createdUserIds.push(user1.id);
      createdPatientIds.push(p1.id);

      const user2 = await db.user.create({
        data: {
          hospitalId: hospitalAId,
          email: `inpatient_2_${timestamp}@test.org`,
          passwordHash: 'dummy',
          role: UserRole.PATIENT as any,
          firstName: 'Inpatient',
          lastName: 'Two',
        },
      });
      const p2 = await db.patient.create({
        data: {
          hospitalId: hospitalAId,
          userId: user2.id,
          uhid: `UHID-INP-2-${timestamp.toString().slice(-4)}`,
          dateOfBirth: new Date('1992-05-15'),
          gender: 'FEMALE',
        },
      });
      patientA2 = { id: p2.id, uhid: p2.uhid };
      createdUserIds.push(user2.id);
      createdPatientIds.push(p2.id);
    }
  });

  afterAll(async () => {
    // Teardown bed assignments, beds, rooms
    if (createdBedIds.length > 0) {
      await db.bedAssignment.deleteMany({
        where: { bedId: { in: createdBedIds } },
      });
      await db.bed.deleteMany({
        where: { id: { in: createdBedIds } },
      });
    }

    if (createdRoomIds.length > 0) {
      await db.room.deleteMany({
        where: { id: { in: createdRoomIds } },
      });
    }

    if (createdPatientIds.length > 0) {
      await db.patient.deleteMany({
        where: { id: { in: createdPatientIds } },
      });
    }

    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    await prisma.$disconnect();
  });

  it('1. should create an inpatient room/ward with room number and daily rate', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const room = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `ICU_${timestamp}`,
      name: 'Cardiothoracic ICU Ward',
      type: RoomType.ICU,
      floor: '3rd Floor',
      building: 'Surgical Tower',
      dailyRate: 4500,
    });

    expect(room.success).toBe(true);
    expect(room.data.id).toBeDefined();
    expect(room.data.roomNumber).toBe(`ICU_${timestamp}`);
    expect(room.data.type).toBe(RoomType.ICU);
    expect(room.data.dailyRate).toBe(4500);

    createdRoomIds.push(room.data.id);
  });

  it('2. should reject duplicate room number in the same hospital facility', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const roomDto = {
      roomNumber: `DUP_${timestamp}`,
      name: 'Duplicate Test Ward',
      type: RoomType.GENERAL_WARD,
    };

    const first = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, roomDto);
    createdRoomIds.push(first.data.id);

    await expect(
      roomsBedsController.createRoom(hospitalAId, hospitalAdminA, roomDto),
    ).rejects.toThrow(ConflictException);
  });

  it('3. should create beds inside a designated room', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const room = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `WARD_${timestamp}`,
      name: 'Post-Op Ward',
      type: RoomType.GENERAL_WARD,
    });
    createdRoomIds.push(room.data.id);

    const bed1 = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: room.data.id,
      bedNumber: 'BED-01',
    });
    expect(bed1.success).toBe(true);
    expect(bed1.data.id).toBeDefined();
    expect(bed1.data.status).toBe(BedStatus.AVAILABLE);
    createdBedIds.push(bed1.data.id);

    const bed2 = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: room.data.id,
      bedNumber: 'BED-02',
    });
    expect(bed2.success).toBe(true);
    expect(bed2.data.status).toBe(BedStatus.AVAILABLE);
    createdBedIds.push(bed2.data.id);

    // Verify room census now reflects 2 available beds
    const roomDetails = await roomsBedsController.getRoomById(hospitalAId, room.data.id);
    expect(roomDetails.data.totalBeds).toBe(2);
    expect(roomDetails.data.availableBeds).toBe(2);
    expect(roomDetails.data.occupiedBeds).toBe(0);
  });

  it('4. should reject duplicate bed number within the same room', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const room = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `ISO_${timestamp}`,
      name: 'Isolation Ward',
    });
    createdRoomIds.push(room.data.id);

    const bedDto = { roomId: room.data.id, bedNumber: 'ISO-BED-01' };
    const bed = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, bedDto);
    createdBedIds.push(bed.data.id);

    await expect(
      roomsBedsController.createBed(hospitalAId, hospitalAdminA, bedDto),
    ).rejects.toThrow(ConflictException);
  });

  it('5. should assign an available bed to a patient and transition status to OCCUPIED', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const room = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `GEN_${timestamp}`,
    });
    createdRoomIds.push(room.data.id);

    const bed = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: room.data.id,
      bedNumber: 'B-100',
    });
    createdBedIds.push(bed.data.id);

    const assignRes = await roomsBedsController.assignBed(hospitalAId, nurseA, bed.data.id, {
      patientId: patientA1.id,
      notes: 'Initial admission post-evaluation',
    });

    expect(assignRes.success).toBe(true);
    expect(assignRes.data.status).toBe(BedStatus.OCCUPIED);
    expect(assignRes.data.currentPatientId).toBe(patientA1.id);

    // Verify bed assignment audit trail in DB
    const assignment = await db.bedAssignment.findFirst({
      where: { bedId: bed.data.id, patientId: patientA1.id },
    });
    expect(assignment).toBeDefined();
    expect(assignment?.dischargedAt).toBeNull();

    // Release bed for subsequent tests
    await roomsBedsController.releaseBed(hospitalAId, nurseA, bed.data.id, {
      dischargeReason: 'Setup for next test',
    });
  });

  // ===========================================================================
  // SECTION: CRITICAL CONCURRENCY TEST
  // ===========================================================================

  it('6. [Critical Concurrency] should prevent two patients from being assigned to the same active bed concurrently', async () => {
    // 1. Create a fresh room and single available bed
    const timestamp = Date.now().toString().slice(-4);
    const room = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `RACE_${timestamp}`,
      name: 'Contested Semi-Private Bed Room',
    });
    createdRoomIds.push(room.data.id);

    const bed = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: room.data.id,
      bedNumber: 'RACE-BED-01',
    });
    createdBedIds.push(bed.data.id);

    // 2. Launch concurrent assignment attempts for Patient 1 and Patient 2 on the SAME bed
    const [result1, result2] = await Promise.allSettled([
      roomsBedsController.assignBed(hospitalAId, nurseA, bed.data.id, {
        patientId: patientA1.id,
        notes: 'Concurrent admission attempt Patient 1',
      }),
      roomsBedsController.assignBed(hospitalAId, nurseA, bed.data.id, {
        patientId: patientA2.id,
        notes: 'Concurrent admission attempt Patient 2',
      }),
    ]);

    // 3. Exactly one assignment must succeed, and exactly one must fail
    const succeeded = [result1, result2].filter((r) => r.status === 'fulfilled');
    const rejected = [result1, result2].filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);

    const losingReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(losingReason).toBeInstanceOf(ConflictException);
    expect(losingReason.message).toMatch(/not available for admission/i);

    // 4. Verify database state directly:
    //    - Bed status is OCCUPIED
    //    - currentPatientId matches the winning assignment
    //    - Exactly 1 open BedAssignment record exists
    const dbBed = await db.bed.findUnique({
      where: { id: bed.data.id },
    });
    expect(dbBed?.status).toBe(BedStatus.OCCUPIED);
    expect([patientA1.id, patientA2.id]).toContain(dbBed?.currentPatientId);

    const openAssignments = await db.bedAssignment.findMany({
      where: { bedId: bed.data.id, dischargedAt: null },
    });
    expect(openAssignments.length).toBe(1);
    expect(openAssignments[0].patientId).toBe(dbBed?.currentPatientId);

    // Clean discharge
    await roomsBedsController.releaseBed(hospitalAId, nurseA, bed.data.id, {
      dischargeReason: 'Concurreny test complete',
    });
  });

  it('7. should discharge patient, release bed back to AVAILABLE, and record discharge timestamp', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const room = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `DISC_${timestamp}`,
    });
    createdRoomIds.push(room.data.id);

    const bed = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: room.data.id,
      bedNumber: 'DISC-BED-01',
    });
    createdBedIds.push(bed.data.id);

    // Assign
    await roomsBedsController.assignBed(hospitalAId, nurseA, bed.data.id, {
      patientId: patientA1.id,
    });

    // Release
    const releaseRes = await roomsBedsController.releaseBed(hospitalAId, nurseA, bed.data.id, {
      dischargeReason: 'CLINICALLY_DISCHARGED',
      notes: 'Patient responded well to IV antibiotics',
    });

    expect(releaseRes.success).toBe(true);
    expect(releaseRes.data.status).toBe(BedStatus.AVAILABLE);
    expect(releaseRes.data.currentPatientId).toBeNull();

    // Verify DB closed assignment
    const closedAssignment = await db.bedAssignment.findFirst({
      where: { bedId: bed.data.id, patientId: patientA1.id },
      orderBy: { admittedAt: 'desc' },
    });
    expect(closedAssignment?.dischargedAt).toBeDefined();
    expect(closedAssignment?.dischargeReason).toBe('CLINICALLY_DISCHARGED');
    expect(closedAssignment?.notes).toContain('IV antibiotics');
  });

  it('8. should transfer patient between beds and update both bed states atomically', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const room = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `XFER_${timestamp}`,
    });
    createdRoomIds.push(room.data.id);

    const sourceBed = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: room.data.id,
      bedNumber: 'BED-SRC',
    });
    createdBedIds.push(sourceBed.data.id);

    const targetBed = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: room.data.id,
      bedNumber: 'BED-TGT',
    });
    createdBedIds.push(targetBed.data.id);

    // Admit to source bed
    await roomsBedsController.assignBed(hospitalAId, nurseA, sourceBed.data.id, {
      patientId: patientA1.id,
    });

    // Transfer from source to target
    const transferRes = await roomsBedsController.transferBed(hospitalAId, nurseA, sourceBed.data.id, {
      targetBedId: targetBed.data.id,
      reason: 'Transferred to step-down bed',
    });

    expect(transferRes.success).toBe(true);

    // Source bed is now AVAILABLE
    const dbSource = await db.bed.findUnique({ where: { id: sourceBed.data.id } });
    expect(dbSource?.status).toBe(BedStatus.AVAILABLE);
    expect(dbSource?.currentPatientId).toBeNull();

    // Target bed is now OCCUPIED with patient
    const dbTarget = await db.bed.findUnique({ where: { id: targetBed.data.id } });
    expect(dbTarget?.status).toBe(BedStatus.OCCUPIED);
    expect(dbTarget?.currentPatientId).toBe(patientA1.id);

    // Clean release
    await roomsBedsController.releaseBed(hospitalAId, nurseA, targetBed.data.id, {
      dischargeReason: 'Transfer test cleanup',
    });
  });

  it('9. should reject cross-tenant bed access (Hospital B staff cannot access Hospital A beds)', async () => {
    const timestamp = Date.now().toString().slice(-4);
    const roomA = await roomsBedsController.createRoom(hospitalAId, hospitalAdminA, {
      roomNumber: `CT_${timestamp}`,
    });
    createdRoomIds.push(roomA.data.id);

    const bedA = await roomsBedsController.createBed(hospitalAId, hospitalAdminA, {
      roomId: roomA.data.id,
      bedNumber: 'CT-BED-01',
    });
    createdBedIds.push(bedA.data.id);

    // Hospital B staff attempts to assign Hospital A bed
    const hospitalAdminB = { id: 'some-b-user', role: UserRole.HOSPITAL_ADMIN, hospitalId: hospitalBId };

    await expect(
      roomsBedsController.assignBed(hospitalBId, hospitalAdminB, bedA.data.id, {
        patientId: patientA1.id,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
