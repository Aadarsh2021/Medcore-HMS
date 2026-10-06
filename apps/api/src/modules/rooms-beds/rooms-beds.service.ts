import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateRoomDto,
  CreateBedDto,
  AssignBedDto,
  ReleaseBedDto,
  TransferBedDto,
} from './dto/create-room.dto';
import { AuditAction } from '@prisma/client';
import { RoomType, BedStatus, RoomResponse, BedResponse } from '@medcore/types';

@Injectable()
export class RoomsBedsService {
  private readonly logger = new Logger(RoomsBedsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma.raw;
  }

  /**
   * Creates an inpatient room within the hospital facility.
   */
  async createRoom(
    hospitalId: string,
    actor: { id: string; role: string },
    dto: CreateRoomDto,
  ): Promise<RoomResponse> {
    const roomNumber = dto.roomNumber.toUpperCase().trim();

    // 1. Verify unique room number in hospital
    const existing = await this.db.room.findUnique({
      where: {
        hospitalId_roomNumber: {
          hospitalId,
          roomNumber,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Room "${roomNumber}" already exists in this hospital facility`);
    }

    // 2. Verify department if provided
    let departmentName: string | null = null;
    if (dto.departmentId) {
      const dept = await this.db.department.findFirst({
        where: { id: dto.departmentId, hospitalId },
      });
      if (!dept) {
        throw new BadRequestException('Referenced department does not belong to this hospital');
      }
      departmentName = dept.name;
    }

    const room = await this.db.room.create({
      data: {
        hospitalId,
        departmentId: dto.departmentId || null,
        roomNumber,
        name: dto.name?.trim() || null,
        type: (dto.type as any) || RoomType.GENERAL_WARD,
        floor: dto.floor?.trim() || null,
        building: dto.building?.trim() || null,
        dailyRate: dto.dailyRate || 0,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
      include: {
        department: true,
        beds: true,
      },
    });

    // Audit Log
    await this.db.auditLog.create({
      data: {
        hospitalId,
        userId: actor.id,
        action: AuditAction.CREATE,
        entityName: 'Room',
        entityId: room.id,
        changesJson: { roomNumber, type: room.type, dailyRate: room.dailyRate },
      },
    });

    return this.mapRoomToResponse(room);
  }

  /**
   * Lists all rooms with bed occupancy census counters.
   */
  async getRooms(
    hospitalId: string,
    query?: { type?: string; departmentId?: string; isActive?: boolean },
  ): Promise<RoomResponse[]> {
    const where: any = { hospitalId };

    if (query?.type) where.type = query.type;
    if (query?.departmentId) where.departmentId = query.departmentId;
    if (query?.isActive !== undefined) where.isActive = query.isActive;

    const rooms = await this.db.room.findMany({
      where,
      orderBy: { roomNumber: 'asc' },
      include: {
        department: true,
        beds: true,
      },
    });

    return rooms.map((r) => this.mapRoomToResponse(r));
  }

  /**
   * Retrieves single room details by ID.
   */
  async getRoomById(hospitalId: string, roomId: string): Promise<RoomResponse> {
    const room = await this.db.room.findFirst({
      where: { id: roomId, hospitalId },
      include: {
        department: true,
        beds: true,
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found in this hospital facility');
    }

    return this.mapRoomToResponse(room);
  }

  /**
   * Creates a bed inside a designated room.
   */
  async createBed(
    hospitalId: string,
    actor: { id: string; role: string },
    dto: CreateBedDto,
  ): Promise<BedResponse> {
    const room = await this.db.room.findFirst({
      where: { id: dto.roomId, hospitalId },
    });

    if (!room) {
      throw new NotFoundException('Room not found in this hospital facility');
    }

    const bedNumber = dto.bedNumber.toUpperCase().trim();

    // Verify unique bed in room
    const existing = await this.db.bed.findUnique({
      where: {
        hospitalId_roomId_bedNumber: {
          hospitalId,
          roomId: dto.roomId,
          bedNumber,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Bed "${bedNumber}" already exists in Room ${room.roomNumber}`);
    }

    const bed = await this.db.bed.create({
      data: {
        hospitalId,
        roomId: dto.roomId,
        bedNumber,
        status: BedStatus.AVAILABLE,
      },
      include: {
        room: true,
        currentPatient: { include: { user: true } },
      },
    });

    await this.db.auditLog.create({
      data: {
        hospitalId,
        userId: actor.id,
        action: AuditAction.CREATE,
        entityName: 'Bed',
        entityId: bed.id,
        changesJson: { bedNumber, roomId: room.id, roomNumber: room.roomNumber },
      },
    });

    return this.mapBedToResponse(bed);
  }

  /**
   * Lists beds with status and patient assignment details.
   */
  async getBeds(
    hospitalId: string,
    query?: { roomId?: string; status?: string },
  ): Promise<BedResponse[]> {
    const where: any = { hospitalId };
    if (query?.roomId) where.roomId = query.roomId;
    if (query?.status) where.status = query.status;

    const beds = await this.db.bed.findMany({
      where,
      orderBy: [{ room: { roomNumber: 'asc' } }, { bedNumber: 'asc' }],
      include: {
        room: true,
        currentPatient: { include: { user: true } },
      },
    });

    return beds.map((b) => this.mapBedToResponse(b));
  }

  /**
   * Concurrency-Safe Bed Assignment using PostgreSQL Row-Level Locking (`FOR UPDATE`).
   * Guarantees two concurrent requests cannot assign patients to the same bed.
   */
  async assignBed(
    hospitalId: string,
    actor: { id: string; role: string },
    bedId: string,
    dto: AssignBedDto,
  ): Promise<BedResponse> {
    return this.prisma.$transaction(
      async (tx: any) => {
        // 1. Explicit Row Lock on target Bed
        const lockedBeds = (await tx.$queryRawUnsafe(
          `SELECT "id", "hospitalId", "roomId", "bedNumber", "status", "currentPatientId"
           FROM "Bed"
           WHERE "id" = $1 AND "hospitalId" = $2
           FOR UPDATE;`,
          bedId,
          hospitalId,
        )) as Array<{
          id: string;
          hospitalId: string;
          roomId: string;
          bedNumber: string;
          status: BedStatus;
          currentPatientId: string | null;
        }>;

        if (!lockedBeds || lockedBeds.length === 0) {
          throw new NotFoundException('Bed not found in this hospital facility');
        }

        const bed = lockedBeds[0];

        if (bed.status !== BedStatus.AVAILABLE || bed.currentPatientId !== null) {
          throw new ConflictException(
            `Bed ${bed.bedNumber} is not available for admission (Current status: ${bed.status})`,
          );
        }

        // 2. Verify Patient in tenant
        const patient = await tx.patient.findFirst({
          where: { id: dto.patientId, hospitalId },
          include: { user: true },
        });

        if (!patient) {
          throw new NotFoundException('Patient not found in this hospital facility');
        }

        // 3. Verify Patient does not already occupy an active bed
        const existingActiveBed = await tx.bed.findFirst({
          where: {
            hospitalId,
            currentPatientId: dto.patientId,
            status: BedStatus.OCCUPIED,
          },
        });

        if (existingActiveBed) {
          throw new ConflictException(
            'Patient is already assigned to an active bed in this facility. Transfer or discharge first.',
          );
        }

        // 4. Update Bed to OCCUPIED
        const updatedBed = await tx.bed.update({
          where: { id: bedId },
          data: {
            status: BedStatus.OCCUPIED,
            currentPatientId: dto.patientId,
            currentEncounterId: dto.encounterId || null,
            assignedAt: new Date(),
          },
          include: {
            room: true,
            currentPatient: { include: { user: true } },
          },
        });

        // 5. Create BedAssignment Audit Record
        const assignment = await tx.bedAssignment.create({
          data: {
            hospitalId,
            bedId,
            patientId: dto.patientId,
            encounterId: dto.encounterId || null,
            admittedAt: new Date(),
            admittedById: actor.id,
            notes: dto.notes?.trim() || null,
          },
        });

        // 6. Audit Log
        await tx.auditLog.create({
          data: {
            hospitalId,
            userId: actor.id,
            action: AuditAction.UPDATE,
            entityName: 'Bed',
            entityId: bedId,
            changesJson: {
              action: 'ASSIGN_BED',
              patientId: dto.patientId,
              assignmentId: assignment.id,
              bedNumber: bed.bedNumber,
            },
          },
        });

        return this.mapBedToResponse(updatedBed);
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }

  /**
   * Concurrency-Safe Bed Release / Patient Discharge with Row Locking.
   */
  async releaseBed(
    hospitalId: string,
    actor: { id: string; role: string },
    bedId: string,
    dto: ReleaseBedDto,
  ): Promise<BedResponse> {
    return this.prisma.$transaction(
      async (tx: any) => {
        // Row Lock on Bed
        const lockedBeds = (await tx.$queryRawUnsafe(
          `SELECT "id", "hospitalId", "roomId", "bedNumber", "status", "currentPatientId"
           FROM "Bed"
           WHERE "id" = $1 AND "hospitalId" = $2
           FOR UPDATE;`,
          bedId,
          hospitalId,
        )) as Array<{
          id: string;
          hospitalId: string;
          roomId: string;
          bedNumber: string;
          status: BedStatus;
          currentPatientId: string | null;
        }>;

        if (!lockedBeds || lockedBeds.length === 0) {
          throw new NotFoundException('Bed not found in this hospital facility');
        }

        const bed = lockedBeds[0];

        if (bed.status !== BedStatus.OCCUPIED || !bed.currentPatientId) {
          throw new BadRequestException(`Bed ${bed.bedNumber} is not currently occupied`);
        }

        const releasedPatientId = bed.currentPatientId;

        // 1. Update latest open assignment
        const openAssignment = await tx.bedAssignment.findFirst({
          where: {
            bedId,
            patientId: releasedPatientId,
            dischargedAt: null,
          },
          orderBy: { admittedAt: 'desc' },
        });

        if (openAssignment) {
          await tx.bedAssignment.update({
            where: { id: openAssignment.id },
            data: {
              dischargedAt: new Date(),
              dischargeReason: dto.dischargeReason || 'DISCHARGED',
              dischargedById: actor.id,
              notes: dto.notes ? `${openAssignment.notes ? openAssignment.notes + ' | ' : ''}${dto.notes}` : openAssignment.notes,
            },
          });
        }

        // 2. Mark Bed AVAILABLE
        const updatedBed = await tx.bed.update({
          where: { id: bedId },
          data: {
            status: BedStatus.AVAILABLE,
            currentPatientId: null,
            currentEncounterId: null,
            assignedAt: null,
          },
          include: {
            room: true,
            currentPatient: { include: { user: true } },
          },
        });

        // 3. Audit Log
        await tx.auditLog.create({
          data: {
            hospitalId,
            userId: actor.id,
            action: AuditAction.UPDATE,
            entityName: 'Bed',
            entityId: bedId,
            changesJson: {
              action: 'RELEASE_BED',
              releasedPatientId,
              reason: dto.dischargeReason,
            },
          },
        });

        return this.mapBedToResponse(updatedBed);
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }

  /**
   * Concurrency-Safe Bed Transfer between rooms/wards.
   */
  async transferBed(
    hospitalId: string,
    actor: { id: string; role: string },
    currentBedId: string,
    dto: TransferBedDto,
  ): Promise<{ fromBed: BedResponse; toBed: BedResponse }> {
    // 1. Fetch current patient before release
    const sourceBed = await this.db.bed.findFirst({
      where: { id: currentBedId, hospitalId },
    });

    if (!sourceBed || sourceBed.status !== BedStatus.OCCUPIED || !sourceBed.currentPatientId) {
      throw new BadRequestException('Source bed is not currently occupied');
    }

    const patientId = sourceBed.currentPatientId;

    // 2. Release source bed
    const fromBed = await this.releaseBed(hospitalId, actor, currentBedId, {
      dischargeReason: 'TRANSFERRED',
      notes: dto.reason || 'Transferred to another bed',
    });

    // 3. Assign target bed
    const toBed = await this.assignBed(hospitalId, actor, dto.targetBedId, {
      patientId,
      notes: dto.reason,
    });

    return { fromBed, toBed };
  }

  private mapRoomToResponse(room: any): RoomResponse {
    const beds = room.beds || [];
    const totalBeds = beds.length;
    const occupiedBeds = beds.filter((b: any) => b.status === BedStatus.OCCUPIED).length;
    const availableBeds = beds.filter((b: any) => b.status === BedStatus.AVAILABLE).length;

    return {
      id: room.id,
      hospitalId: room.hospitalId,
      departmentId: room.departmentId,
      departmentName: room.department?.name || null,
      roomNumber: room.roomNumber,
      name: room.name,
      type: room.type,
      floor: room.floor,
      building: room.building,
      dailyRate: Number(room.dailyRate),
      isActive: room.isActive,
      totalBeds,
      availableBeds,
      occupiedBeds,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };
  }

  private mapBedToResponse(bed: any): BedResponse {
    const patientUser = bed.currentPatient?.user;
    return {
      id: bed.id,
      hospitalId: bed.hospitalId,
      roomId: bed.roomId,
      roomNumber: bed.room?.roomNumber || 'Unknown Room',
      roomType: bed.room?.type || RoomType.GENERAL_WARD,
      bedNumber: bed.bedNumber,
      status: bed.status,
      currentPatientId: bed.currentPatientId,
      currentPatientName: patientUser ? `${patientUser.firstName} ${patientUser.lastName}` : null,
      currentPatientUhid: bed.currentPatient?.uhid || null,
      currentEncounterId: bed.currentEncounterId,
      assignedAt: bed.assignedAt?.toISOString() || null,
      createdAt: bed.createdAt.toISOString(),
      updatedAt: bed.updatedAt.toISOString(),
    };
  }
}
