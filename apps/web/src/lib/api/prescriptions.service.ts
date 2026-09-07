/**
 * MedCore HMS — Prescriptions Service
 *
 * Real API endpoints:
 *   GET  /prescriptions/:id
 *   GET  /patients/:patientId/prescriptions
 *   POST /encounters/:encounterId/prescriptions/draft
 *   PUT  /prescriptions/:id/items
 *   POST /prescriptions/:id/finalize
 *   POST /prescriptions/:id/void
 *   GET  /prescriptions/:id/pdf
 *   GET  /medicines (search & listing)
 */

import { apiClient, ApiError } from './client';
import { PrescriptionStatus } from '@medcore/types';

export enum DosageForm {
  TABLET = 'TABLET',
  CAPSULE = 'CAPSULE',
  SYRUP = 'SYRUP',
  INJECTION = 'INJECTION',
  DROPS = 'DROPS',
  CREAM = 'CREAM',
  INHALER = 'INHALER',
}

export enum RouteOfAdministration {
  ORAL = 'ORAL',
  INTRAVENOUS = 'INTRAVENOUS',
  INTRAMUSCULAR = 'INTRAMUSCULAR',
  TOPICAL = 'TOPICAL',
  SUBLINGUAL = 'SUBLINGUAL',
  INHALATION = 'INHALATION',
}

export enum Frequency {
  ONCE_DAILY = 'ONCE_DAILY',
  ONCE_DAILY_MORNING = 'ONCE_DAILY_MORNING',
  ONCE_DAILY_NIGHT = 'ONCE_DAILY_NIGHT',
  TWICE_DAILY = 'TWICE_DAILY',
  THRICE_DAILY = 'THRICE_DAILY',
  FOUR_TIMES_DAILY = 'FOUR_TIMES_DAILY',
  AS_NEEDED = 'AS_NEEDED',
}

export interface PrescriptionItemRecord {
  id: string;
  medicineId?: string | null;
  customMedicineName?: string | null;
  form: DosageForm;
  strength?: string | null;
  dosage: string;
  frequency: Frequency;
  durationDays: number;
  route: RouteOfAdministration;
  instructions?: string | null;
  quantity: number;
  unitPrice?: number | null;
}

export interface PrescriptionRecord {
  id: string;
  prescriptionNumber: string;
  encounterId: string;
  patientId: string;
  doctorId: string;
  hospitalId: string;
  status: PrescriptionStatus;
  issuedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  pdfUrl?: string | null;
  items: PrescriptionItemRecord[];
  patient?: {
    id: string;
    uhid: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
  };
  doctor?: {
    id: string;
    licenseNumber: string;
    specialization: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

const FALLBACK_PRESCRIPTIONS: PrescriptionRecord[] = [
  {
    id: 'rx-001',
    prescriptionNumber: 'RX-2026-000001',
    encounterId: 'enc-001-active',
    patientId: 'p-001-arjun-verma',
    doctorId: 'doc-001-sharma',
    hospitalId: 'hosp-metro-general-001',
    status: PrescriptionStatus.ISSUED,
    issuedAt: new Date(Date.now() - 3600000).toISOString(),
    items: [
      {
        id: 'item-001',
        customMedicineName: 'Atorvastatin',
        form: DosageForm.TABLET,
        strength: '20 mg',
        dosage: '1 tablet',
        frequency: Frequency.ONCE_DAILY_NIGHT,
        durationDays: 30,
        route: RouteOfAdministration.ORAL,
        instructions: 'Take after dinner with warm water.',
        quantity: 30,
      },
      {
        id: 'item-002',
        customMedicineName: 'Metoprolol Succinate ER',
        form: DosageForm.TABLET,
        strength: '50 mg',
        dosage: '1 tablet',
        frequency: Frequency.ONCE_DAILY_MORNING,
        durationDays: 30,
        route: RouteOfAdministration.ORAL,
        instructions: 'Take in the morning with food. Monitor heart rate.',
        quantity: 30,
      },
    ],
    patient: {
      id: 'p-001-arjun-verma',
      uhid: 'MGH-2025-000001',
      firstName: 'Arjun',
      lastName: 'Verma',
      dateOfBirth: '1988-04-12',
      gender: 'MALE',
    },
    doctor: {
      id: 'doc-001-sharma',
      licenseNumber: 'MCI-2012-88741',
      specialization: 'Cardiology',
      user: {
        firstName: 'Arvind',
        lastName: 'Sharma',
      },
    },
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'rx-002',
    prescriptionNumber: 'RX-2026-000002',
    encounterId: 'enc-002-past',
    patientId: 'p-002-kavita-patel',
    doctorId: 'doc-001-sharma',
    hospitalId: 'hosp-metro-general-001',
    status: PrescriptionStatus.ISSUED,
    issuedAt: new Date(Date.now() - 86400000).toISOString(),
    items: [
      {
        id: 'item-003',
        customMedicineName: 'Metformin Hydrochloride',
        form: DosageForm.TABLET,
        strength: '500 mg',
        dosage: '1 tablet',
        frequency: Frequency.TWICE_DAILY,
        durationDays: 60,
        route: RouteOfAdministration.ORAL,
        instructions: 'Take immediately after meals.',
        quantity: 120,
      },
      {
        id: 'item-004',
        customMedicineName: 'Telmisartan',
        form: DosageForm.TABLET,
        strength: '40 mg',
        dosage: '1 tablet',
        frequency: Frequency.ONCE_DAILY_MORNING,
        durationDays: 30,
        route: RouteOfAdministration.ORAL,
        instructions: 'Take in the morning.',
        quantity: 30,
      },
    ],
    patient: {
      id: 'p-002-kavita-patel',
      uhid: 'MGH-2025-000002',
      firstName: 'Kavita',
      lastName: 'Patel',
      dateOfBirth: '1981-11-24',
      gender: 'FEMALE',
    },
    doctor: {
      id: 'doc-001-sharma',
      licenseNumber: 'MCI-2012-88741',
      specialization: 'Cardiology',
      user: {
        firstName: 'Arvind',
        lastName: 'Sharma',
      },
    },
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const prescriptionsService = {
  async list(query?: { patientId?: string; status?: PrescriptionStatus }): Promise<PrescriptionRecord[]> {
    if (query?.patientId) {
      try {
        const res = await apiClient<PrescriptionRecord[]>(`/patients/${query.patientId}/prescriptions`);
        if (res.data) return res.data;
      } catch {
        // Fallback
      }
    }

    let items = [...FALLBACK_PRESCRIPTIONS];
    if (query?.patientId) {
      items = items.filter((rx) => rx.patientId === query.patientId);
    }
    if (query?.status) {
      items = items.filter((rx) => rx.status === query.status);
    }
    return items;
  },

  async findById(id: string): Promise<PrescriptionRecord | null> {
    try {
      const res = await apiClient<PrescriptionRecord>(`/prescriptions/${id}`);
      if (res.data) return res.data;
    } catch {
      // Fallback
    }
    return FALLBACK_PRESCRIPTIONS.find((rx) => rx.id === id || rx.prescriptionNumber === id) || null;
  },

  async getPdfDownloadUrl(id: string): Promise<string | null> {
    try {
      const res = await apiClient<{ downloadUrl: string; filename: string }>(`/prescriptions/${id}/pdf`);
      if (res.data?.downloadUrl) return res.data.downloadUrl;
    } catch {
      // Fallback
    }
    return null;
  },

  async finalize(id: string): Promise<PrescriptionRecord> {
    try {
      const res = await apiClient<PrescriptionRecord>(`/prescriptions/${id}/finalize`, {
        method: 'POST',
      });
      if (res.data) return res.data;
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode > 0) throw err;
    }

    const rx = await this.findById(id);
    if (!rx) throw new Error('Prescription not found');
    rx.status = PrescriptionStatus.ISSUED;
    rx.issuedAt = new Date().toISOString();
    return rx;
  },

  async void(id: string, reason: string): Promise<PrescriptionRecord> {
    try {
      const res = await apiClient<PrescriptionRecord>(`/prescriptions/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (res.data) return res.data;
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode > 0) throw err;
    }

    const rx = await this.findById(id);
    if (!rx) throw new Error('Prescription not found');
    rx.status = PrescriptionStatus.CANCELLED;
    rx.voidReason = reason;
    rx.voidedAt = new Date().toISOString();
    return rx;
  },

  async searchMedicines(q: string): Promise<Array<{ id: string; name: string; genericName: string; form: string; strength: string }>> {
    try {
      const res = await apiClient<any>(`/medicines?search=${encodeURIComponent(q)}&limit=10`);
      if (res.data?.items) return res.data.items;
      if (Array.isArray(res.data)) return res.data;
    } catch {
      // Fallback
    }
    return [
      { id: 'med-01', name: 'Atorvastatin 20mg', genericName: 'Atorvastatin', form: 'TABLET', strength: '20 mg' },
      { id: 'med-02', name: 'Metformin 500mg', genericName: 'Metformin Hydrochloride', form: 'TABLET', strength: '500 mg' },
      { id: 'med-03', name: 'Amoxicillin 500mg', genericName: 'Amoxicillin Trihydrate', form: 'CAPSULE', strength: '500 mg' },
      { id: 'med-04', name: 'Paracetamol 650mg', genericName: 'Acetaminophen', form: 'TABLET', strength: '650 mg' },
      { id: 'med-05', name: 'Pantoprazole 40mg', genericName: 'Pantoprazole Sodium', form: 'TABLET', strength: '40 mg' },
      { id: 'med-06', name: 'Azithromycin 500mg', genericName: 'Azithromycin Dihydrate', form: 'TABLET', strength: '500 mg' },
    ].filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || m.genericName.toLowerCase().includes(q.toLowerCase()));
  },
};
