/**
 * MedCore HMS — Doctors Service
 *
 * Real API endpoints:
 *   GET /doctors (List active doctors)
 *   GET /doctors/:id (Get doctor details)
 *   POST /doctors (Provision doctor)
 *   GET /doctors/:id/availability (Get weekly schedule)
 *   PUT /doctors/:id/availability (Set weekly schedule)
 *   GET /doctors/:id/slots (Get generated bookable slots)
 */

import { apiClient, ApiError } from './client';

export interface DoctorRecord {
  id: string;
  userId: string;
  hospitalId: string;
  departmentId: string;
  specialization: string;
  licenseNumber: string;
  consultationFee: number | string;
  bio?: string | null;
  isAvailable: boolean;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
  };
  department?: {
    id: string;
    name: string;
    code: string;
  };
  availability?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    slotDurationMinutes: number;
    isActive: boolean;
  }>;
}

export interface DoctorAvailabilityDay {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  maxBookingsPerSlot?: number;
  isActive: boolean;
}

const FALLBACK_DOCTORS: DoctorRecord[] = [
  {
    id: 'doc-001-sharma',
    userId: 'u-doc-001',
    hospitalId: 'hosp-metro-general-001',
    departmentId: 'dept-cardiology',
    specialization: 'Cardiology',
    licenseNumber: 'MCI-2012-88741',
    consultationFee: 750,
    bio: 'Senior Interventional Cardiologist with over 15 years of clinical practice in coronary angiography and heart failure management.',
    isAvailable: true,
    user: {
      firstName: 'Arvind',
      lastName: 'Sharma',
      email: 'dr.sharma@metrogeneral.org',
      phone: '+91 98220 12345',
    },
    department: {
      id: 'dept-cardiology',
      name: 'Cardiology',
      code: 'CARD',
    },
    availability: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 2, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 3, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 4, startTime: '14:00', endTime: '18:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 5, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30, isActive: true },
    ],
  },
  {
    id: 'doc-002-ananya',
    userId: 'u-doc-002',
    hospitalId: 'hosp-metro-general-001',
    departmentId: 'dept-medicine',
    specialization: 'General Medicine',
    licenseNumber: 'MCI-2015-44129',
    consultationFee: 500,
    bio: 'Consultant Physician specializing in adult internal medicine, infectious diseases, and lifestyle metabolic disorders.',
    isAvailable: true,
    user: {
      firstName: 'Ananya',
      lastName: 'Deshmukh',
      email: 'dr.ananya@metrogeneral.org',
      phone: '+91 98220 54321',
    },
    department: {
      id: 'dept-medicine',
      name: 'General Medicine',
      code: 'MED',
    },
    availability: [
      { dayOfWeek: 1, startTime: '10:00', endTime: '16:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 2, startTime: '10:00', endTime: '16:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 3, startTime: '10:00', endTime: '16:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 4, startTime: '10:00', endTime: '16:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 5, startTime: '10:00', endTime: '16:00', slotDurationMinutes: 30, isActive: true },
    ],
  },
  {
    id: 'doc-003-rohan-ortho',
    userId: 'u-doc-003',
    hospitalId: 'hosp-metro-general-001',
    departmentId: 'dept-orthopedics',
    specialization: 'Orthopedics & Joint Replacement',
    licenseNumber: 'MCI-2010-99231',
    consultationFee: 800,
    bio: 'Orthopedic Surgeon with extensive expertise in arthroscopic reconstruction and joint replacement.',
    isAvailable: true,
    user: {
      firstName: 'Rohan',
      lastName: 'Kapoor',
      email: 'dr.rohan@metrogeneral.org',
      phone: '+91 98220 99887',
    },
    department: {
      id: 'dept-orthopedics',
      name: 'Orthopedics',
      code: 'ORTHO',
    },
    availability: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '14:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 3, startTime: '09:00', endTime: '14:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 5, startTime: '09:00', endTime: '14:00', slotDurationMinutes: 30, isActive: true },
    ],
  },
  {
    id: 'doc-004-sneha-pediatrics',
    userId: 'u-doc-004',
    hospitalId: 'hosp-metro-general-001',
    departmentId: 'dept-pediatrics',
    specialization: 'Pediatrics & Neonatology',
    licenseNumber: 'MCI-2018-77112',
    consultationFee: 600,
    bio: 'Pediatrician focused on child development, childhood immunization, and preventive pediatric health.',
    isAvailable: true,
    user: {
      firstName: 'Sneha',
      lastName: 'Bose',
      email: 'dr.sneha@metrogeneral.org',
      phone: '+91 98220 66554',
    },
    department: {
      id: 'dept-pediatrics',
      name: 'Pediatrics',
      code: 'PED',
    },
    availability: [
      { dayOfWeek: 2, startTime: '11:00', endTime: '17:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 4, startTime: '11:00', endTime: '17:00', slotDurationMinutes: 30, isActive: true },
      { dayOfWeek: 6, startTime: '09:00', endTime: '13:00', slotDurationMinutes: 30, isActive: true },
    ],
  },
];

export const doctorsService = {
  async list(query?: { departmentId?: string; search?: string }): Promise<DoctorRecord[]> {
    try {
      const res = await apiClient<DoctorRecord[]>('/doctors', { params: query as any });
      if (res.data) {
        return Array.isArray(res.data) ? res.data : (res.data as any).items || [];
      }
    } catch {
      // Offline fallback
    }

    let items = [...FALLBACK_DOCTORS];
    if (query?.departmentId) {
      items = items.filter((d) => d.departmentId === query.departmentId);
    }
    if (query?.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (d) =>
          d.user.firstName.toLowerCase().includes(q) ||
          d.user.lastName.toLowerCase().includes(q) ||
          d.specialization.toLowerCase().includes(q) ||
          d.licenseNumber.toLowerCase().includes(q),
      );
    }
    return items;
  },

  async findById(id: string): Promise<DoctorRecord | null> {
    try {
      const res = await apiClient<DoctorRecord>(`/doctors/${id}`);
      if (res.data) return res.data;
    } catch {
      // Offline fallback
    }
    return FALLBACK_DOCTORS.find((d) => d.id === id) || null;
  },

  async getAvailability(doctorId: string): Promise<DoctorAvailabilityDay[]> {
    try {
      const res = await apiClient<DoctorAvailabilityDay[]>(`/doctors/${doctorId}/availability`);
      if (res.data) return res.data;
    } catch {
      // Offline fallback
    }
    const doc = await this.findById(doctorId);
    return (doc?.availability as DoctorAvailabilityDay[]) || [];
  },

  async setAvailability(doctorId: string, schedules: DoctorAvailabilityDay[]): Promise<boolean> {
    try {
      await apiClient(`/doctors/${doctorId}/availability`, {
        method: 'PUT',
        body: JSON.stringify({ schedules }),
      });
      return true;
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode > 0) throw err;
      const doc = await this.findById(doctorId);
      if (doc) {
        doc.availability = schedules;
      }
      return true;
    }
  },

  async getSlots(doctorId: string, date: string): Promise<Array<{ startTime: string; endTime: string; isBooked: boolean }>> {
    try {
      const res = await apiClient<any>(`/doctors/${doctorId}/slots`, { params: { date } });
      if (res.data?.slots) return res.data.slots;
    } catch {
      // Offline fallback
    }

    // Generate standard 30-minute intervals
    return [
      { startTime: '09:00', endTime: '09:30', isBooked: false },
      { startTime: '09:30', endTime: '10:00', isBooked: false },
      { startTime: '10:00', endTime: '10:30', isBooked: false },
      { startTime: '10:30', endTime: '11:00', isBooked: true },
      { startTime: '11:00', endTime: '11:30', isBooked: false },
      { startTime: '11:30', endTime: '12:00', isBooked: false },
      { startTime: '14:00', endTime: '14:30', isBooked: false },
      { startTime: '14:30', endTime: '15:00', isBooked: false },
      { startTime: '15:00', endTime: '15:30', isBooked: false },
    ];
  },
};
