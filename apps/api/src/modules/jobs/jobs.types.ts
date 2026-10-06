import { NotificationChannel } from '@medcore/types';

export interface BaseJobPayload {
  hospitalId: string;
  enqueuedAt: string;
  correlationId?: string;
}

export interface AppointmentReminderJobPayload extends BaseJobPayload {
  appointmentId?: string;
}

export interface ExpiryScanJobPayload extends BaseJobPayload {
  windowDays?: number;
}

export interface LowStockScanJobPayload extends BaseJobPayload {}

export interface NoShowProcessingJobPayload extends BaseJobPayload {
  cutoffDate?: string;
}

export interface NotificationDispatchJobPayload extends BaseJobPayload {
  userId: string;
  title: string;
  message: string;
  channel?: NotificationChannel;
  metadataJson?: any;
}
