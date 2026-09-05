// ==============================================================================
// MedCore HMS — Core Type Definitions & API Contracts
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. Roles & Permissions
// ------------------------------------------------------------------------------
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  HOSPITAL_ADMIN = 'HOSPITAL_ADMIN',
  DOCTOR = 'DOCTOR',
  NURSE = 'NURSE',
  RECEPTIONIST = 'RECEPTIONIST',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
  PHARMACIST = 'PHARMACIST',
  ACCOUNTANT = 'ACCOUNTANT',
  PATIENT = 'PATIENT',
}

// ------------------------------------------------------------------------------
// 2. Clinical & Operational Enums
// ------------------------------------------------------------------------------
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum BloodGroup {
  A_POSITIVE = 'A_POSITIVE',
  A_NEGATIVE = 'A_NEGATIVE',
  B_POSITIVE = 'B_POSITIVE',
  B_NEGATIVE = 'B_NEGATIVE',
  AB_POSITIVE = 'AB_POSITIVE',
  AB_NEGATIVE = 'AB_NEGATIVE',
  O_POSITIVE = 'O_POSITIVE',
  O_NEGATIVE = 'O_NEGATIVE',
}

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum AppointmentType {
  REGULAR = 'REGULAR',
  FOLLOW_UP = 'FOLLOW_UP',
  EMERGENCY = 'EMERGENCY',
}

export enum EncounterStatus {
  CHECKED_IN = 'CHECKED_IN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum DiagnosisType {
  PROVISIONAL = 'PROVISIONAL',
  CONFIRMED = 'CONFIRMED',
}

export enum AllergySeverity {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
}

export enum MedicineForm {
  TABLET = 'TABLET',
  CAPSULE = 'CAPSULE',
  SYRUP = 'SYRUP',
  INJECTION = 'INJECTION',
  TOPICAL = 'TOPICAL',
  DROPS = 'DROPS',
  INHALER = 'INHALER',
  OTHER = 'OTHER',
}

export enum PrescriptionFrequency {
  OD = 'OD',     // Once daily
  BD = 'BD',     // Twice daily
  TDS = 'TDS',   // Three times daily
  QID = 'QID',   // Four times daily
  PRN = 'PRN',   // As needed
  SOS = 'SOS',   // In emergency
  STAT = 'STAT', // Immediately
}

export enum PrescriptionStatus {
  ISSUED = 'ISSUED',
  DISPENSED = 'DISPENSED',
  CANCELLED = 'CANCELLED',
}

export enum LabOrderStatus {
  ORDERED = 'ORDERED',
  SAMPLE_COLLECTED = 'SAMPLE_COLLECTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  VOID = 'VOID',
}

export enum InvoiceItemType {
  CONSULTATION = 'CONSULTATION',
  LAB_TEST = 'LAB_TEST',
  PHARMACY = 'PHARMACY',
  PROCEDURE = 'PROCEDURE',
  ROOM = 'ROOM',
  OTHER = 'OTHER',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  STRIPE = 'STRIPE',
  RAZORPAY = 'RAZORPAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
  INSURANCE = 'INSURANCE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  READ = 'READ',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW_CONFIDENTIAL = 'VIEW_CONFIDENTIAL',
  EXPORT = 'EXPORT',
}

// ------------------------------------------------------------------------------
// 3. API Response Envelopes
// ------------------------------------------------------------------------------
export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown> | string[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T = unknown> {
  success: true;
  data: T[];
  meta: PaginationMeta;
  message?: string;
}

// ------------------------------------------------------------------------------
// 4. Authentication Contracts
// ------------------------------------------------------------------------------
export interface JwtPayload {
  sub: string;            // userId
  email: string;
  role: UserRole;
  hospitalId: string | null;
  deviceId?: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  role: UserRole;
  hospitalId: string | null;
  hospitalName?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: AuthSessionUser;
  tokens: AuthTokens;
}

// ------------------------------------------------------------------------------
// 5. Clinical Calculations
// ------------------------------------------------------------------------------
export function calculateBMI(heightCm: number, weightKg: number): number {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return 0;
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}
