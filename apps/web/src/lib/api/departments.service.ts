/**
 * MedCore HMS — Departments Service
 *
 * Supports hospital department directory and staff counts.
 */

export interface DepartmentRecord {
  id: string;
  name: string;
  code: string;
  description: string;
  headDoctorName: string;
  doctorCount: number;
  activeAppointmentsToday: number;
  isActive: boolean;
}

const DEPARTMENTS: DepartmentRecord[] = [
  {
    id: 'dept-cardiology',
    name: 'Cardiology',
    code: 'CARD',
    description: 'Comprehensive adult and pediatric cardiovascular diagnostics, coronary intervention, and cardiac intensive care.',
    headDoctorName: 'Dr. Arvind Sharma, MD, DM',
    doctorCount: 4,
    activeAppointmentsToday: 14,
    isActive: true,
  },
  {
    id: 'dept-medicine',
    name: 'General Medicine',
    code: 'MED',
    description: 'Outpatient primary care, infectious diseases, geriatric management, and acute internal medicine stabilization.',
    headDoctorName: 'Dr. Ananya Deshmukh, MD',
    doctorCount: 6,
    activeAppointmentsToday: 22,
    isActive: true,
  },
  {
    id: 'dept-orthopedics',
    name: 'Orthopedics & Joint Care',
    code: 'ORTHO',
    description: 'Advanced arthroplasty, complex trauma management, arthroscopy, and sports rehabilitation.',
    headDoctorName: 'Dr. Rohan Kapoor, MS (Ortho)',
    doctorCount: 3,
    activeAppointmentsToday: 9,
    isActive: true,
  },
  {
    id: 'dept-pediatrics',
    name: 'Pediatrics & Neonatology',
    code: 'PED',
    description: 'Well-child clinics, neonatal intensive care (NICU), pediatric critical care, and adolescent medicine.',
    headDoctorName: 'Dr. Sneha Bose, MD (Pediatrics)',
    doctorCount: 4,
    activeAppointmentsToday: 11,
    isActive: true,
  },
  {
    id: 'dept-radiology',
    name: 'Diagnostic Imaging & Radiology',
    code: 'RAD',
    description: 'Digital X-ray, multi-slice computed tomography (CT), 3T MRI, high-resolution ultrasound, and fluoroscopy.',
    headDoctorName: 'Dr. Manish Kulkarni, MD (Radiology)',
    doctorCount: 2,
    activeAppointmentsToday: 18,
    isActive: true,
  },
  {
    id: 'dept-pathology',
    name: 'Pathology & Laboratory Medicine',
    code: 'PATH',
    description: 'Fully automated clinical biochemistry, hematology, medical microbiology, histopathology, and blood banking.',
    headDoctorName: 'Dr. Sunanda Pillai, MD (Pathology)',
    doctorCount: 3,
    activeAppointmentsToday: 29,
    isActive: true,
  },
];

export const departmentsService = {
  async list(): Promise<DepartmentRecord[]> {
    return DEPARTMENTS;
  },

  async findById(id: string): Promise<DepartmentRecord | null> {
    return DEPARTMENTS.find((d) => d.id === id || d.code === id) || null;
  },
};
