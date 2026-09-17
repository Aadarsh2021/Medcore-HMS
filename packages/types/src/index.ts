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

export enum AmendmentType {
  ADDENDUM = 'ADDENDUM',
  CORRECTION = 'CORRECTION',
  LATE_ENTRY = 'LATE_ENTRY',
}

export enum AmendmentSection {
  CLINICAL_NOTES = 'CLINICAL_NOTES',
  DIAGNOSIS = 'DIAGNOSIS',
  TREATMENT_PLAN = 'TREATMENT_PLAN',
  OTHER = 'OTHER',
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
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_DISPENSED = 'PARTIALLY_DISPENSED',
  DISPENSED = 'DISPENSED',
  CANCELLED = 'CANCELLED',
}

export enum StockMovementType {
  PURCHASE_RECEIPT = 'PURCHASE_RECEIPT',
  DISPENSE = 'DISPENSE',
  DISPENSE_RETURN = 'DISPENSE_RETURN',
  ADJUSTMENT_INCREASE = 'ADJUSTMENT_INCREASE',
  ADJUSTMENT_DECREASE = 'ADJUSTMENT_DECREASE',
  DAMAGE_WRITEOFF = 'DAMAGE_WRITEOFF',
  EXPIRY_DISPOSAL = 'EXPIRY_DISPOSAL',
}

export enum LabOrderStatus {
  ORDERED = 'ORDERED',
  SAMPLE_COLLECTED = 'SAMPLE_COLLECTED',
  PROCESSING = 'PROCESSING',
  RESULTS_ENTERED = 'RESULTS_ENTERED',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
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
  UPI = 'UPI',
  STRIPE = 'STRIPE',
  RAZORPAY = 'RAZORPAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
  INSURANCE = 'INSURANCE',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum RefundStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum WebhookProcessingStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  IGNORED = 'IGNORED',
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

// ------------------------------------------------------------------------------
// 6. Patient Contracts
// ------------------------------------------------------------------------------
export interface AddressDto {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface EmergencyContactDto {
  name: string;
  phone: string;
  relation: string;
}

export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup?: BloodGroup;
  allergiesSummary?: string;
  emergencyContact?: EmergencyContactDto;
  address?: AddressDto;
}

export interface UpdatePatientRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  allergiesSummary?: string;
  emergencyContact?: EmergencyContactDto;
  address?: AddressDto;
}

export interface PatientResponseData {
  id: string;
  uhid: string;
  hospitalId: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup?: BloodGroup | null;
  allergiesSummary?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    avatarUrl?: string | null;
    isActive: boolean;
  };
  address?: {
    id: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
}

export interface PatientListItemData {
  id: string;
  uhid: string;
  hospitalId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup?: BloodGroup | null;
  createdAt: string;
}

// ------------------------------------------------------------------------------
// 7. Doctor & Scheduling Contracts
// ------------------------------------------------------------------------------
export interface CreateDoctorRequest {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  departmentId: string;
  specialization: string;
  licenseNumber: string;
  consultationFee?: number;
  bio?: string;
  signatureUrl?: string;
}

export interface UpdateDoctorAdminRequest {
  departmentId?: string;
  specialization?: string;
  licenseNumber?: string;
  consultationFee?: number;
  bio?: string;
  signatureUrl?: string;
  isAvailable?: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface UpdateDoctorSelfRequest {
  bio?: string;
  signatureUrl?: string;
  phone?: string;
}

export interface DoctorResponseData {
  id: string;
  userId: string;
  hospitalId: string;
  departmentId: string;
  departmentName?: string;
  specialization: string;
  licenseNumber: string;
  consultationFee: number;
  bio?: string | null;
  signatureUrl?: string | null;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    avatarUrl?: string | null;
    isActive: boolean;
  };
}

export interface DoctorListItemData {
  id: string;
  userId: string;
  hospitalId: string;
  departmentId: string;
  departmentName: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  specialization: string;
  licenseNumber: string;
  consultationFee: number;
  isAvailable: boolean;
  createdAt: string;
}

export interface DoctorAvailabilityWindowDto {
  id?: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // e.g. "09:00"
  endTime: string; // e.g. "13:00"
  slotDurationMinutes?: number; // default 30
  maxBookingsPerSlot?: number; // default 1
  isActive?: boolean;
}

export interface SetDoctorAvailabilityRequest {
  windows: DoctorAvailabilityWindowDto[];
}

export interface DoctorAvailabilityResponseData {
  doctorId: string;
  windows: DoctorAvailabilityWindowDto[];
}

export interface CreateDoctorLeaveRequest {
  startDate: string; // ISO 8601 string
  endDate: string; // ISO 8601 string
  reason?: string;
}

export interface DoctorLeaveResponseData {
  id: string;
  doctorId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  createdAt: string;
}

export interface DoctorSlotDto {
  startTime: string; // "09:00"
  endTime: string; // "09:30"
}

export interface DoctorSlotsResponseData {
  doctorId: string;
  date: string; // "YYYY-MM-DD"
  timezone: string; // e.g. "Asia/Kolkata"
  slotDurationMinutes: number;
  slots: DoctorSlotDto[];
}

// ------------------------------------------------------------------------------
// 8. Appointment Contracts
// ------------------------------------------------------------------------------

export interface BookAppointmentRequest {
  doctorId: string;
  appointmentDate: string;  // "YYYY-MM-DD"
  startTime: string;        // "HH:mm" — must match a generated slot
  /** Admin/Receptionist only — for PATIENT role this is derived from token */
  patientId?: string;
  type?: AppointmentType;   // default REGULAR
  reason?: string;
  notes?: string;
}

export interface UpdateAppointmentStatusRequest {
  /** Allowed transitions: CONFIRMED | IN_PROGRESS | COMPLETED | NO_SHOW */
  status: AppointmentStatus;
  notes?: string;
}

export interface CancelAppointmentRequest {
  cancellationReason?: string;
}

export interface RescheduleAppointmentRequest {
  appointmentDate: string;  // "YYYY-MM-DD"
  startTime: string;        // "HH:mm"
}

export interface AppointmentPatientSummary {
  id: string;
  uhid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

export interface AppointmentDoctorSummary {
  id: string;
  firstName: string;
  lastName: string;
  specialization: string;
  consultationFee: number;
}

export interface AppointmentResponseData {
  id: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  departmentName?: string | null;
  appointmentDate: string;   // ISO date string
  startTime: string;         // "HH:mm"
  endTime: string;           // "HH:mm"
  status: AppointmentStatus;
  type: AppointmentType;
  reason?: string | null;
  notes?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  patient?: AppointmentPatientSummary | null;
  doctor?: AppointmentDoctorSummary | null;
}

export interface AppointmentListItemData {
  id: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  departmentName: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  type: AppointmentType;
  reason?: string | null;
  patientName: string;
  patientUhid: string;
  doctorName: string;
  createdAt: string;
}

// ------------------------------------------------------------------------------
// 9. Clinical Encounters & EMR Contracts
// ------------------------------------------------------------------------------

export interface RecordVitalsRequest {
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  heartRate?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  respiratoryRate?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  notes?: string | null;
}

export interface VitalResponseData {
  id: string;
  recordId: string;
  recordedAt: string;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  heartRate?: number | null;
  temperature?: number | null;
  spo2?: number | null;
  respiratoryRate?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  bmi?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface AddDiagnosisRequest {
  code?: string | null; // ICD-10
  description: string;
  type?: DiagnosisType;
  isPrimary?: boolean;
  notes?: string | null;
}

export interface DiagnosisResponseData {
  id: string;
  recordId: string;
  code?: string | null;
  description: string;
  type: DiagnosisType;
  isPrimary: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface UpdateClinicalNotesRequest {
  chiefComplaint?: string;
  presentingSymptoms?: string | null;
  clinicalNotes?: string | null;
  treatmentPlan?: string | null;
  followUpDate?: string | null;
}

export interface AttachmentResponseData {
  id: string;
  recordId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface AttachmentSignedUrlResponseData {
  attachmentId: string;
  fileName: string;
  signedUrl: string;
  expiresAt: string;
}

export interface CreateAmendmentRequest {
  amendmentType?: AmendmentType;
  section?: AmendmentSection;
  reason: string;
  content: string;
}

export interface AmendmentResponseData {
  id: string;
  recordId: string;
  amendedById: string;
  amendedByName?: string;
  amendmentNumber: number;
  amendmentType: AmendmentType;
  section: AmendmentSection;
  reason: string;
  content: string;
  createdAt: string;
}

export interface MedicalRecordResponseData {
  id: string;
  hospitalId: string;
  encounterId: string;
  patientId: string;
  doctorId: string;
  chiefComplaint: string;
  presentingSymptoms?: string | null;
  clinicalNotes?: string | null;
  treatmentPlan?: string | null;
  followUpDate?: string | null;
  createdAt: string;
  updatedAt: string;
  vitals: VitalResponseData[];
  diagnoses: DiagnosisResponseData[];
  attachments: AttachmentResponseData[];
  amendments: AmendmentResponseData[];
}

export interface EncounterResponseData {
  id: string;
  hospitalId: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  status: EncounterStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  appointment?: {
    id: string;
    appointmentDate: string;
    startTime: string;
    endTime: string;
    type: AppointmentType;
    status: AppointmentStatus;
  } | null;
  patient?: {
    id: string;
    uhid: string;
    fullName: string;
    dateOfBirth: string;
    gender: Gender;
    bloodGroup?: BloodGroup | null;
  } | null;
  doctor?: {
    id: string;
    fullName: string;
    specialization: string;
  } | null;
  medicalRecord?: MedicalRecordResponseData | null;
}

export interface EncounterListItemData {
  id: string;
  hospitalId: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientUhid: string;
  doctorId: string;
  doctorName: string;
  status: EncounterStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  chiefComplaint?: string | null;
  createdAt: string;
}

export interface CreateAllergyRequest {
  allergen: string;
  reaction: string;
  severity?: AllergySeverity;
  diagnosedAt?: string;
  recordId?: string;
}

export interface AllergyResponseData {
  id: string;
  patientId: string;
  recordId?: string | null;
  allergen: string;
  reaction: string;
  severity: AllergySeverity;
  diagnosedAt: string;
  createdAt: string;
}

export interface CreateMedicationHistoryRequest {
  medicationName: string;
  dosage: string;
  frequency: string;
  route?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
  notes?: string | null;
  recordId?: string;
}

export interface MedicationHistoryResponseData {
  id: string;
  patientId: string;
  recordId?: string | null;
  medicationName: string;
  dosage: string;
  frequency: string;
  route?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface CreateVaccinationRequest {
  vaccineName: string;
  administeredDate: string;
  batchNumber?: string | null;
  nextDueDate?: string | null;
  notes?: string | null;
  recordId?: string;
}

export interface VaccinationResponseData {
  id: string;
  patientId: string;
  recordId?: string | null;
  vaccineName: string;
  administeredDate: string;
  batchNumber?: string | null;
  nextDueDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CreateFamilyHistoryRequest {
  condition: string;
  relationship: string;
  notes?: string | null;
  recordId?: string;
}

export interface FamilyHistoryResponseData {
  id: string;
  patientId: string;
  recordId?: string | null;
  condition: string;
  relationship: string;
  notes?: string | null;
  createdAt: string;
}

export interface PatientClinicalSummaryResponseData {
  patient: {
    id: string;
    uhid: string;
    fullName: string;
    firstName: string;
    lastName: string;
    gender: Gender;
    dateOfBirth: string;
    bloodGroup?: BloodGroup | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
  };
  allergies: AllergyResponseData[];
  medications: MedicationHistoryResponseData[];
  vaccinations: VaccinationResponseData[];
  familyHistories: FamilyHistoryResponseData[];
  recentEncounters: EncounterListItemData[];
}

// ------------------------------------------------------------------------------
// 10. Prescription Management & Clinical Medication Ordering (Phase 6)
// ------------------------------------------------------------------------------

export interface MedicineSearchItemData {
  id: string;
  hospitalId: string;
  name: string;
  genericName: string;
  category: string;
  form: MedicineForm;
  strength: string;
  manufacturer: string;
}

export interface PrescriptionItemInput {
  medicineId?: string | null;
  medicineName?: string;
  form?: MedicineForm;
  strength?: string | null;
  dosage: string;
  frequency: PrescriptionFrequency;
  durationDays: number;
  route?: string;
  instructions?: string | null;
  quantity?: number | null;
}

export interface CreatePrescriptionDraftRequest {
  notes?: string | null;
}

export interface UpdatePrescriptionItemsRequest {
  notes?: string | null;
  items: PrescriptionItemInput[];
}

export interface VoidPrescriptionRequest {
  reason: string;
}

export interface PrescriptionItemData {
  id: string;
  prescriptionId: string;
  medicineId?: string | null;
  medicineName: string;
  form: MedicineForm;
  strength?: string | null;
  dosage: string;
  frequency: PrescriptionFrequency;
  durationDays: number;
  route: string;
  instructions?: string | null;
  quantity?: number | null;
  dispensedQuantity: number;
  createdAt: string;
}

export interface PrescriptionResponseData {
  id: string;
  hospitalId: string;
  encounterId: string;
  patientId: string;
  doctorId: string;
  prescriptionNumber?: string | null;
  notes?: string | null;
  signedPdfUrl?: string | null;
  pdfStorageKey?: string | null;
  pdfGeneratedAt?: string | null;
  pdfSha256?: string | null;
  pdfGenerationStatus?: string | null;
  status: PrescriptionStatus;
  issuedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  voidedById?: string | null;
  createdAt: string;
  updatedAt: string;
  doctor?: {
    id: string;
    fullName: string;
    specialization: string;
    licenseNumber: string;
    signatureUrl?: string | null;
  } | null;
  patient?: {
    id: string;
    uhid: string;
    fullName: string;
    age?: number;
    gender?: Gender;
  } | null;
  items: PrescriptionItemData[];
}

// ------------------------------------------------------------------------------
// PHARMACY & INVENTORY (PHASE 7)
// ------------------------------------------------------------------------------

export interface BatchAllocationProposal {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  availableQuantity: number;
  allocatedQuantity: number;
  unitCost: number;
  mrp: number;
  reason: 'FEFO_PRIMARY' | 'FIFO_TIE_BREAKER';
}

export interface DispensePlanItemData {
  prescriptionItemId: string;
  medicineId: string;
  medicineName: string;
  prescribedQuantity: number;
  alreadyDispensedQuantity: number;
  remainingQuantity: number;
  allocations: BatchAllocationProposal[];
  isFullyFulfillable: boolean;
}

export interface DispensePlanResponse {
  prescriptionId: string;
  prescriptionNumber: string;
  patientName: string;
  patientUhid: string;
  items: DispensePlanItemData[];
}

export interface PrescriptionDispenseResponse {
  dispenseId: string;
  dispenseNumber: string;
  prescriptionId: string;
  prescriptionNumber: string;
  prescriptionStatus: PrescriptionStatus;
  dispensedAt: string;
  notes?: string | null;
  items: Array<{
    prescriptionItemId: string;
    medicineName: string;
    quantityDispensed: number;
    dispensedBatches: Array<{
      batchId: string;
      batchNumber: string;
      quantity: number;
    }>;
  }>;
}

export interface StockReceiptResponse {
  receiptId: string;
  receiptNumber: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  receivedDate: string;
  totalCost: string;
  itemsReceived: number;
}

export interface StockAdjustmentResponse {
  batchId: string;
  batchNumber: string;
  previousQuantity: number;
  newQuantity: number;
  adjustmentType: StockMovementType;
  quantityChange: number;
  movementId: string;
}

export interface DispenseReturnResponse {
  dispenseItemId: string;
  batchId: string;
  batchNumber: string;
  quantityReturned: number;
  newBatchQuantity: number;
  movementId: string;
}

// ------------------------------------------------------------------------------
// 10. Laboratory & Diagnostics (Phase 8)
// ------------------------------------------------------------------------------

export enum LabPriority {
  ROUTINE = 'ROUTINE',
  URGENT = 'URGENT',
  STAT = 'STAT',
}

export enum LabSpecimenStatus {
  COLLECTED = 'COLLECTED',
  RECEIVED = 'RECEIVED',
  PROCESSING = 'PROCESSING',
  REJECTED = 'REJECTED',
}

export enum LabResultFlag {
  NORMAL = 'NORMAL',
  LOW = 'LOW',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface LabTestItemContract {
  id?: string;
  testId?: string;
  code: string;
  name: string;
  category: string;
  result?: string;
  unit?: string;
  referenceRange?: string;
  flag?: LabResultFlag;
  isCritical?: boolean;
  notes?: string;
}

export interface LabOrderResponse {
  id: string;
  orderNumber: string;
  patientId: string;
  patientUhid: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  doctorId: string;
  doctorName: string;
  encounterId?: string | null;
  status: LabOrderStatus;
  orderDate: string;
  specimenType?: string | null;
  priority: LabPriority;
  clinicalNotes?: string | null;
  tests: LabTestItemContract[];
  collectedAt?: string | null;
  collectedByName?: string | null;
  processedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  cancellationReason?: string | null;
  specimens?: Array<{
    id: string;
    accessionNumber: string;
    specimenType: string;
    status: LabSpecimenStatus;
    collectedAt: string;
    collectedByName?: string | null;
    rejectionReason?: string | null;
    notes?: string | null;
  }>;
  amendments?: Array<{
    id: string;
    orderItemId: string;
    previousValue: string;
    previousFlag?: LabResultFlag | null;
    newValue: string;
    newFlag?: LabResultFlag | null;
    reason: string;
    amendedByName: string;
    createdAt: string;
  }>;
}

// ------------------------------------------------------------------------------
// 11. Billing, Invoicing & Payments (Phase 9)
// ------------------------------------------------------------------------------

export interface InvoiceLineItemContract {
  id?: string;
  type: InvoiceItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
  totalPrice?: number;
  appointmentId?: string | null;
  encounterId?: string | null;
  prescriptionId?: string | null;
  dispenseId?: string | null;
  labOrderId?: string | null;
  labTestId?: string | null;
}

export interface PaymentResponse {
  id: string;
  hospitalId: string;
  invoiceId: string;
  paymentNumber?: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  transactionReference?: string | null;
  failureReason?: string | null;
  paidAt?: string | null;
  createdById?: string | null;
  createdAt: string;
}

export interface RefundResponse {
  id: string;
  hospitalId: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  providerRefundId?: string | null;
  createdById?: string | null;
  processedAt?: string | null;
  createdAt: string;
}

export interface InvoiceResponse {
  id: string;
  hospitalId: string;
  patientId: string;
  patientUhid: string;
  patientName: string;
  patientPhone?: string | null;
  appointmentId?: string | null;
  encounterId?: string | null;
  invoiceNumber: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  outstandingAmount: number;
  status: InvoiceStatus;
  issueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  issuedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  items: InvoiceLineItemContract[];
  payments?: PaymentResponse[];
  refunds?: RefundResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface BillingSummaryResponse {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalRefunded: number;
  invoiceCount: number;
}

export interface CreateInvoiceRequest {
  patientId: string;
  appointmentId?: string;
  encounterId?: string;
  dueDate?: string;
  notes?: string;
  items: Array<{
    type?: InvoiceItemType;
    description: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    tax?: number;
    appointmentId?: string;
    encounterId?: string;
    prescriptionId?: string;
    dispenseId?: string;
    labOrderId?: string;
    labTestId?: string;
  }>;
}

export interface RecordPaymentRequest {
  amount: number;
  method: PaymentMethod;
  provider?: string;
  transactionReference?: string;
  idempotencyKey?: string;
}

export interface CreateRefundRequest {
  amount: number;
  reason: string;
  idempotencyKey?: string;
}

