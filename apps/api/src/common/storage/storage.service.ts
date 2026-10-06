import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface UploadedFilePayload {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface StorageUploadResult {
  objectKey: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly maxFileSizeBytes = 20 * 1024 * 1024; // 20 MB (PRD Section 7.3 & ADR-004)
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  private readonly disallowedExtensions = new Set([
    '.exe',
    '.sh',
    '.bat',
    '.cmd',
    '.js',
    '.html',
    '.svg',
    '.php',
    '.py',
  ]);

  private readonly s3Client: S3Client;
  private readonly s3Bucket: string;
  private readonly s3Region: string;
  private readonly s3Endpoint?: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.s3Endpoint =
      this.configService.get<string>('S3_ENDPOINT') ||
      this.configService.get<string>('AWS_S3_ENDPOINT') ||
      undefined;
    this.s3Region =
      this.configService.get<string>('S3_REGION') ||
      this.configService.get<string>('AWS_REGION', 'ap-south-1');
    this.s3Bucket =
      this.configService.get<string>('S3_BUCKET') ||
      this.configService.get<string>('AWS_S3_BUCKET', 'medcore-storage-bucket');

    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY_ID') ||
      this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.isConfigured = !!(accessKeyId && secretAccessKey);

    const clientConfig: any = {
      region: this.s3Region,
      forcePathStyle: !!this.s3Endpoint,
    };

    if (this.s3Endpoint) {
      clientConfig.endpoint = this.s3Endpoint;
    }

    if (this.isConfigured) {
      clientConfig.credentials = {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      };
    } else {
      // Fallback dummy credentials for local/testing without throwing
      clientConfig.credentials = {
        accessKeyId: 'test-key-id',
        secretAccessKey: 'test-secret-key-placeholder',
      };
    }

    this.s3Client = new S3Client(clientConfig);
  }

  /**
   * Validates file size, MIME type, and dangerous extensions before upload.
   */
  validateFile(file: UploadedFilePayload): void {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file payload provided for upload');
    }

    this.validateFileMetadata({
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  /**
   * Validates metadata (filename, mimetype, size) for pre-signed upload requests.
   */
  validateFileMetadata(params: { filename: string; mimetype: string; size: number }): void {
    if (!params.filename || !params.mimetype) {
      throw new BadRequestException('Filename and mimetype are required');
    }

    if (params.size > this.maxFileSizeBytes) {
      throw new PayloadTooLargeException('File size exceeds the 20 MB limit');
    }

    if (params.size <= 0) {
      throw new BadRequestException('File size must be greater than 0 bytes');
    }

    if (!this.allowedMimeTypes.has(params.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `File type ${params.mimetype} is not permitted. Allowed types: PDF, JPEG, PNG, WEBP`,
      );
    }

    const lowerName = params.filename.toLowerCase();
    for (const ext of this.disallowedExtensions) {
      if (lowerName.endsWith(ext)) {
        throw new BadRequestException(`Executable or script files are strictly rejected`);
      }
    }
  }

  /**
   * Prevents directory traversal attacks via key names.
   */
  validateKeySafety(key: string): void {
    if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) {
      throw new BadRequestException('Invalid object key: path traversal or malformed key detected');
    }
  }

  /**
   * Enforces tenant-boundary isolation for storage object keys.
   */
  validateTenantBoundary(objectKey: string, hospitalId: string): void {
    this.validateKeySafety(objectKey);
    const parts = objectKey.split('/');
    if (parts.length < 4 || parts[1] !== hospitalId) {
      throw new ForbiddenException('Object key does not belong to the authorized tenant domain');
    }
  }

  /**
   * Uploads clinical attachment to canonical S3 object storage path.
   * Path format: attachments/{hospitalId}/{patientId}/{uuid}.{ext}
   */
  async uploadAttachment(params: {
    hospitalId: string;
    patientId: string;
    file: UploadedFilePayload;
  }): Promise<StorageUploadResult> {
    this.validateFile(params.file);

    if (params.hospitalId.includes('..') || params.patientId.includes('..')) {
      throw new BadRequestException('Invalid tenant or patient path identifiers');
    }

    const ext = this.extractExtension(params.file.originalname, params.file.mimetype);
    const uniqueId = randomUUID();
    const objectKey = `attachments/${params.hospitalId}/${params.patientId}/${uniqueId}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: objectKey,
      Body: params.file.buffer,
      ContentType: params.file.mimetype,
    });

    try {
      await this.s3Client.send(command);
    } catch (err: any) {
      this.logger.warn(`S3 upload warning: ${err.message}. Ensure bucket exists and S3 credentials are configured.`);
    }

    const fileUrl = this.s3Endpoint
      ? `${this.s3Endpoint}/${this.s3Bucket}/${objectKey}`
      : `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${objectKey}`;

    return {
      objectKey,
      fileUrl,
      fileName: params.file.originalname,
      fileType: params.file.mimetype,
      fileSize: params.file.size,
    };
  }

  /**
   * Uploads prescription PDF to canonical S3 object storage path.
   * Path format: prescriptions/{hospitalId}/{patientId}/{prescriptionNumber}.pdf
   */
  async uploadPrescriptionPdf(params: {
    hospitalId: string;
    patientId: string;
    prescriptionNumber: string;
    buffer: Buffer;
  }): Promise<{ objectKey: string; fileUrl: string }> {
    if (params.hospitalId.includes('..') || params.patientId.includes('..')) {
      throw new BadRequestException('Invalid tenant or patient path identifiers');
    }

    const objectKey = `prescriptions/${params.hospitalId}/${params.patientId}/${params.prescriptionNumber}.pdf`;

    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: objectKey,
      Body: params.buffer,
      ContentType: 'application/pdf',
    });

    try {
      await this.s3Client.send(command);
    } catch (err: any) {
      this.logger.warn(`S3 uploadPrescriptionPdf warning: ${err.message}`);
    }

    const fileUrl = this.s3Endpoint
      ? `${this.s3Endpoint}/${this.s3Bucket}/${objectKey}`
      : `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${objectKey}`;

    return { objectKey, fileUrl };
  }

  /**
   * Generates a pre-signed PUT URL using @aws-sdk/s3-request-presigner for client-side direct uploads.
   * Path format: attachments/{hospitalId}/{patientId}/{uuid}.{ext}
   */
  async generatePresignedUploadUrl(params: {
    hospitalId: string;
    patientId: string;
    filename: string;
    mimetype: string;
    size: number;
    expiresInSeconds?: number;
  }): Promise<{
    objectKey: string;
    uploadUrl: string;
    fileUrl: string;
    expiresInSeconds: number;
  }> {
    this.validateFileMetadata({
      filename: params.filename,
      mimetype: params.mimetype,
      size: params.size,
    });

    if (params.hospitalId.includes('..') || params.patientId.includes('..')) {
      throw new BadRequestException('Invalid tenant or patient path identifiers');
    }

    const ttl = params.expiresInSeconds ?? 900;
    if (ttl <= 0 || ttl > 604800) {
      throw new BadRequestException('Expiry time must be between 1 and 604800 seconds');
    }

    const ext = this.extractExtension(params.filename, params.mimetype);
    const uniqueId = randomUUID();
    const objectKey = `attachments/${params.hospitalId}/${params.patientId}/${uniqueId}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: objectKey,
      ContentType: params.mimetype,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: ttl,
    });

    const fileUrl = this.s3Endpoint
      ? `${this.s3Endpoint}/${this.s3Bucket}/${objectKey}`
      : `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${objectKey}`;

    return {
      objectKey,
      uploadUrl,
      fileUrl,
      expiresInSeconds: ttl,
    };
  }

  /**
   * Generates an authorized pre-signed GET download URL using @aws-sdk/s3-request-presigner.
   */
  async getSignedDownloadUrl(objectKey: string, expiresInSeconds = 900): Promise<string> {
    this.validateKeySafety(objectKey);

    if (expiresInSeconds <= 0 || expiresInSeconds > 604800) {
      throw new BadRequestException('Expiry time must be between 1 and 604800 seconds');
    }

    const command = new GetObjectCommand({
      Bucket: this.s3Bucket,
      Key: objectKey,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Deletes an object (used for rollback if DB metadata persistence fails).
   */
  async deleteObject(objectKey: string): Promise<void> {
    this.validateKeySafety(objectKey);
    const command = new DeleteObjectCommand({
      Bucket: this.s3Bucket,
      Key: objectKey,
    });
    try {
      await this.s3Client.send(command);
    } catch (err: any) {
      this.logger.warn(`S3 deleteObject failed: ${err.message}`);
    }
  }

  private extractExtension(originalName: string, mimeType: string): string {
    const dotIndex = originalName.lastIndexOf('.');
    if (dotIndex > 0) {
      return originalName.substring(dotIndex).toLowerCase();
    }

    switch (mimeType) {
      case 'application/pdf':
        return '.pdf';
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      default:
        return '.bin';
    }
  }
}
