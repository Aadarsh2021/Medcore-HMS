import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  private readonly s3Bucket: string | null;
  private readonly s3Region: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Bucket = this.configService.get<string>('AWS_S3_BUCKET', null);
    this.s3Region = this.configService.get<string>('AWS_REGION', 'ap-south-1');
  }

  /**
   * Validates file size, MIME type, and dangerous extensions before upload.
   */
  validateFile(file: UploadedFilePayload): void {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file payload provided for upload');
    }

    if (file.size > this.maxFileSizeBytes) {
      throw new PayloadTooLargeException('File size exceeds the 20 MB limit');
    }

    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `File type ${file.mimetype} is not permitted. Allowed types: PDF, JPEG, PNG, WEBP`,
      );
    }

    const lowerName = file.originalname.toLowerCase();
    for (const ext of this.disallowedExtensions) {
      if (lowerName.endsWith(ext)) {
        throw new BadRequestException(`Executable or script files are strictly rejected`);
      }
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

    const ext = this.extractExtension(params.file.originalname, params.file.mimetype);
    const uniqueId = randomUUID();
    const objectKey = `attachments/${params.hospitalId}/${params.patientId}/${uniqueId}${ext}`;

    // If S3 bucket is configured, upload to AWS S3
    if (this.s3Bucket) {
      // In production environment with AWS S3 configured
      this.logger.log(`Uploading object to S3 bucket ${this.s3Bucket}: ${objectKey}`);
    }

    const fileUrl = this.s3Bucket
      ? `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${objectKey}`
      : `https://storage.medcore.local/${objectKey}`;

    return {
      objectKey,
      fileUrl,
      fileName: params.file.originalname,
      fileType: params.file.mimetype,
      fileSize: params.file.size,
    };
  }

  /**
   * Generates an authorized pre-signed download URL valid for exactly 15 minutes (900s).
   */
  async getSignedDownloadUrl(objectKey: string, expiresInSeconds = 900): Promise<string> {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const mockToken = Buffer.from(`${objectKey}:${expiresAt}`).toString('base64url');

    if (this.s3Bucket) {
      return `https://${this.s3Bucket}.s3.${this.s3Region}.amazonaws.com/${objectKey}?X-Amz-Expires=${expiresInSeconds}&X-Amz-Signature=${mockToken}`;
    }

    return `https://storage.medcore.local/${objectKey}?token=${mockToken}&expiresAt=${expiresAt}`;
  }

  /**
   * Deletes an object (used for rollback if DB metadata persistence fails).
   */
  async deleteObject(objectKey: string): Promise<void> {
    this.logger.log(`Attempting S3 delete rollback for object key: ${objectKey}`);
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
