import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../src/database/database.module';
import { PrismaService } from '../src/database/prisma.service';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway';
import { StorageService } from '../src/common/storage/storage.service';
import { StorageController } from '../src/common/storage/storage.controller';
import { SupabaseService } from '../src/modules/auth/supabase.service';
import { UserRole } from '@medcore/types';

describe('Phase 11 & Phase 12 — Realtime Gateway & Storage Hardening Suite', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let realtimeGateway: RealtimeGateway;
  let storageService: StorageService;
  let storageController: StorageController;

  let hospitalAId: string;
  let hospitalBId: string;
  let patientA: any;
  let patientB: any;
  let doctorA: any;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
      ],
      providers: [
        RealtimeGateway,
        StorageService,
        StorageController,
        SupabaseService,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    realtimeGateway = moduleRef.get<RealtimeGateway>(RealtimeGateway);
    storageService = moduleRef.get<StorageService>(StorageService);
    storageController = moduleRef.get<StorageController>(StorageController);

    // Retrieve hospital A with active doctors and patients
    const hospitalA = await prisma.raw.hospital.findFirst({
      where: {
        doctors: { some: {} },
        patients: { some: {} },
      },
    });
    if (!hospitalA) {
      throw new Error('Test suite requires a hospital with both doctors and patients in database');
    }
    hospitalAId = hospitalA.id;

    // Retrieve a distinct hospital B
    const hospitalB = await prisma.raw.hospital.findFirst({
      where: { id: { not: hospitalAId } },
    });
    if (!hospitalB) {
      throw new Error('Test suite requires at least 2 hospitals in database');
    }
    hospitalBId = hospitalB.id;

    // Retrieve patient from Hospital A
    patientA = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    if (!patientA) {
      throw new Error('Test patient in hospital A not found');
    }

    // Retrieve patient from Hospital B (or create/find)
    patientB = await prisma.raw.patient.findFirst({
      where: { hospitalId: hospitalBId },
      include: { user: true },
    });
    if (!patientB) {
      throw new Error('Test patient in hospital B not found');
    }

    // Retrieve doctor in Hospital A
    const doctorRecord = await prisma.raw.doctor.findFirst({
      where: { hospitalId: hospitalAId },
      include: { user: true },
    });
    doctorA = doctorRecord?.user;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await moduleRef.close();
  });

  // ===========================================================================
  // SECTION 1: REALTIME GATEWAY & EVENT CHANNELS (PHASE 11)
  // ===========================================================================

  describe('Section 1: Realtime Socket Gateway', () => {
    it('1. should reject unauthenticated socket connection missing token', async () => {
      const mockSocket: any = {
        id: 'sock-unauth-1',
        handshake: { auth: {}, query: {}, headers: {} },
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      await realtimeGateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Authentication token required',
      });
    });

    it('2. should authenticate socket user and join tenant and private user rooms', async () => {
      const mockSocket: any = {
        id: 'sock-auth-1',
        handshake: {
          auth: { token: `test-token-:${patientA.userId}:${hospitalAId}:PATIENT` },
          query: {},
          headers: {},
        },
        emit: jest.fn(),
        disconnect: jest.fn(),
        join: jest.fn().mockResolvedValue(true),
        data: {},
      };

      await realtimeGateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.join).toHaveBeenCalledWith(`user:${patientA.userId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`hospital:${hospitalAId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          success: true,
          userId: patientA.userId,
          hospitalId: hospitalAId,
        }),
      );
    });

    it('3. should auto-join doctor private room when authenticated as DOCTOR', async () => {
      if (!doctorA) return;

      const mockSocket: any = {
        id: 'sock-doc-1',
        handshake: {
          auth: { token: `test-token-:${doctorA.id}:${hospitalAId}:DOCTOR` },
          query: {},
          headers: {},
        },
        emit: jest.fn(),
        disconnect: jest.fn(),
        join: jest.fn().mockResolvedValue(true),
        data: {},
      };

      await realtimeGateway.handleConnection(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith(`user:${doctorA.id}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`hospital:${hospitalAId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`doctor:${doctorA.id}`);
    });

    it('4. should handle bed room subscription for inpatient tracking', async () => {
      const mockSocket: any = {
        id: 'sock-bed-sub',
        data: {
          user: { id: doctorA.id, hospitalId: hospitalAId, role: 'DOCTOR' },
        },
        join: jest.fn().mockResolvedValue(true),
      };

      const result = await realtimeGateway.handleSubscribeBeds(mockSocket);
      expect(result.success).toBe(true);
      expect(result.room).toBe(`beds:${hospitalAId}`);
      expect(mockSocket.join).toHaveBeenCalledWith(`beds:${hospitalAId}`);
    });

    it('5. should handle queue subscription for OPD tokens', async () => {
      const mockSocket: any = {
        id: 'sock-queue-sub',
        data: {
          user: { id: doctorA.id, hospitalId: hospitalAId, role: 'DOCTOR' },
        },
        join: jest.fn().mockResolvedValue(true),
      };

      const result = await realtimeGateway.handleSubscribeQueue(mockSocket, {
        departmentId: 'dept-cardio',
      });
      expect(result.success).toBe(true);
      expect(result.room).toBe(`queue:${hospitalAId}:dept-cardio`);
      expect(mockSocket.join).toHaveBeenCalledWith(`queue:${hospitalAId}:dept-cardio`);
    });

    it('6. should broadcast bed status changes, queue calls, and critical lab values', () => {
      const mockServer: any = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      realtimeGateway.server = mockServer;

      // Bed status
      realtimeGateway.emitBedStatusChange(hospitalAId, {
        bedId: 'bed-101',
        bedNumber: 'B-101',
        status: 'OCCUPIED',
        roomId: 'room-1',
      });
      expect(mockServer.to).toHaveBeenCalledWith(`beds:${hospitalAId}`);
      expect(mockServer.emit).toHaveBeenCalledWith('bed.status_changed', expect.any(Object));

      // Queue ticket called
      realtimeGateway.emitQueueTicketCalled(hospitalAId, {
        ticketNumber: 'A-042',
        doctorName: 'Dr. Sharma',
      });
      expect(mockServer.to).toHaveBeenCalledWith(`queue:${hospitalAId}`);
      expect(mockServer.emit).toHaveBeenCalledWith('queue.ticket_called', expect.any(Object));

      // Critical lab alert
      realtimeGateway.emitCriticalLabAlert(hospitalAId, {
        orderId: 'lab-ord-1',
        testName: 'Serum Potassium',
        value: '6.8 mmol/L (CRITICAL HIGH)',
        patientId: patientA.id,
        orderingDoctorId: doctorA.id,
      });
      expect(mockServer.to).toHaveBeenCalledWith(`hospital:${hospitalAId}`);
      expect(mockServer.to).toHaveBeenCalledWith(`doctor:${doctorA.id}`);
      expect(mockServer.emit).toHaveBeenCalledWith('lab.critical_value', expect.any(Object));
    });
  });

  // ===========================================================================
  // SECTION 2: STORAGE HARDENING & IDOR / BOLA PROTECTION (PHASE 12)
  // ===========================================================================

  describe('Section 2: Storage Hardening & Access Control', () => {
    it('7. should reject upload request exceeding 20 MB max file size limit', () => {
      expect(() =>
        storageService.validateFileMetadata({
          filename: 'large_scan.pdf',
          mimetype: 'application/pdf',
          size: 25 * 1024 * 1024, // 25 MB
        }),
      ).toThrow(PayloadTooLargeException);
    });

    it('8. should reject dangerous executable or script file extensions', () => {
      const maliciousFiles = [
        'payload.exe',
        'script.sh',
        'exploit.bat',
        'backdoor.cmd',
        'malware.php',
        'attack.js',
      ];

      for (const name of maliciousFiles) {
        expect(() =>
          storageService.validateFileMetadata({
            filename: name,
            mimetype: 'application/pdf', // spoofed mimetype
            size: 1024,
          }),
        ).toThrow(BadRequestException);
      }
    });

    it('9. should reject unsupported MIME types', () => {
      expect(() =>
        storageService.validateFileMetadata({
          filename: 'archive.zip',
          mimetype: 'application/zip',
          size: 1024,
        }),
      ).toThrow(UnsupportedMediaTypeException);
    });

    it('10. should generate pre-signed upload URL for authorized clinical document', async () => {
      const res = await storageController.getPresignedUpload(
        { id: doctorA.id, hospitalId: hospitalAId, role: UserRole.DOCTOR },
        {
          filename: 'chest_xray.png',
          mimetype: 'image/png',
          size: 1024 * 500,
          patientId: patientA.id,
        },
      );

      expect(res.success).toBe(true);
      expect(res.data.uploadUrl).toBeDefined();
      expect(res.data.objectKey).toContain(`attachments/${hospitalAId}/${patientA.id}/`);
      expect(res.data.expiresInSeconds).toBe(900);
    });

    it('11. should prevent Doctor from uploading attachment for patient from another hospital (tenant barrier)', async () => {
      await expect(
        storageController.getPresignedUpload(
          { id: doctorA.id, hospitalId: hospitalAId, role: UserRole.DOCTOR },
          {
            filename: 'lab_report.pdf',
            mimetype: 'application/pdf',
            size: 2048,
            patientId: patientB.id, // Belongs to Hospital B
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('12. should prevent Patient from uploading attachment for a different patient (patient IDOR)', async () => {
      await expect(
        storageController.getPresignedUpload(
          { id: patientA.userId, hospitalId: hospitalAId, role: UserRole.PATIENT },
          {
            filename: 'my_record.pdf',
            mimetype: 'application/pdf',
            size: 2048,
            patientId: patientB.id, // Attempting to upload to Patient B
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('13. should generate pre-signed download URL valid for 15 minutes', async () => {
      const objectKey = `attachments/${hospitalAId}/${patientA.id}/doc-123.pdf`;
      const res = await storageController.getPresignedDownload(
        { id: doctorA.id, hospitalId: hospitalAId, role: UserRole.DOCTOR },
        objectKey,
      );

      expect(res.success).toBe(true);
      expect(res.data.downloadUrl).toContain(objectKey);
      expect(res.data.expiresInSeconds).toBe(900);
    });

    it('14. should prevent User from Hospital B from downloading Hospital A documents (cross-tenant storage block)', async () => {
      const hospitalAObjectKey = `attachments/${hospitalAId}/${patientA.id}/doc-123.pdf`;

      // Hospital Admin or Doctor from Hospital B
      await expect(
        storageController.getPresignedDownload(
          { id: 'user-b-1', hospitalId: hospitalBId, role: UserRole.HOSPITAL_ADMIN },
          hospitalAObjectKey,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('15. should prevent Patient from downloading another patient clinical document (patient BOLA block)', async () => {
      // Patient A tries to download an attachment belonging to Patient B in Hospital A
      const otherPatientKey = `attachments/${hospitalAId}/different-patient-uuid/doc-sensitive.pdf`;

      await expect(
        storageController.getPresignedDownload(
          { id: patientA.userId, hospitalId: hospitalAId, role: UserRole.PATIENT },
          otherPatientKey,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('16. should reject object keys containing directory traversal sequences', async () => {
      const maliciousKey = `attachments/${hospitalAId}/../../etc/passwd`;
      await expect(
        storageService.getSignedDownloadUrl(maliciousKey),
      ).rejects.toThrow(BadRequestException);

      await expect(
        storageService.generatePresignedUploadUrl({
          hospitalId: `../escape`,
          patientId: patientA.id,
          filename: 'valid.pdf',
          mimetype: 'application/pdf',
          size: 1024,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('17. should reject invalid signed URL expiry configurations', async () => {
      const objectKey = `attachments/${hospitalAId}/${patientA.id}/doc.pdf`;
      await expect(
        storageService.getSignedDownloadUrl(objectKey, -1),
      ).rejects.toThrow(BadRequestException);

      await expect(
        storageService.getSignedDownloadUrl(objectKey, 700000), // > 7 days
      ).rejects.toThrow(BadRequestException);
    });

    it('18. should produce AWS SigV4 signed URLs with X-Amz-Signature query parameters', async () => {
      const uploadRes = await storageService.generatePresignedUploadUrl({
        hospitalId: hospitalAId,
        patientId: patientA.id,
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        size: 5000,
        expiresInSeconds: 600,
      });

      expect(uploadRes.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(uploadRes.uploadUrl).toContain('X-Amz-Signature=');

      const downloadUrl = await storageService.getSignedDownloadUrl(uploadRes.objectKey, 600);
      expect(downloadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(downloadUrl).toContain('X-Amz-Signature=');
    });
  });
});

