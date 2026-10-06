export enum TriageLevel {
  RESUSCITATION = 1,
  EMERGENT = 2,
  URGENT = 3,
  LESS_URGENT = 4,
  NON_URGENT = 5,
}

export enum TriageStatus {
  ARRIVED = 'ARRIVED',
  TRIAGED = 'TRIAGED',
  BED_ASSIGNED = 'BED_ASSIGNED',
  ATTENDED = 'ATTENDED',
  DISCHARGED = 'DISCHARGED',
  ADMITTED = 'ADMITTED',
}

export interface EmergencyPatientRecord {
  encounterId: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  doctorId: string;
  doctorName: string;
  triageLevel: TriageLevel;
  chiefComplaint: string;
  vitals?: {
    bp?: string;
    pulse?: number;
    spO2?: number;
    temperature?: number;
  };
  bedNumber?: string | null;
  status: TriageStatus;
  arrivedAt: string;
}
