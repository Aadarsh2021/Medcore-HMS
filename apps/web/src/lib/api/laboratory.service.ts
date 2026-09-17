/**
 * MedCore HMS — Laboratory Service Adapter
 *
 * Implements the full clinical Laboratory lifecycle:
 *   Doctor Order -> Specimen Intake / Collection -> Processing
 *   -> Result Entry with reference ranges & abnormal flags
 *   -> Pathologist Review & Approval -> Patient & Doctor Report Viewer
 *
 * Production Mode: Communicates directly with NestJS Laboratory API.
 * In production or API error states, real error states are propagated (no silent fallback to fake clinical data).
 */

import { apiClient, ApiError } from './client';

export interface LabOrderItem {
  id: string;
  orderNumber: string;
  patientId: string;
  patientUhid: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  doctorId: string;
  doctorName: string;
  encounterId?: string;
  status: 'ORDERED' | 'SAMPLE_COLLECTED' | 'PROCESSING' | 'RESULTS_ENTERED' | 'APPROVED' | 'CANCELLED' | 'REJECTED';
  orderDate: string;
  specimenType: string;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  tests: Array<{
    id?: string;
    testId?: string;
    code: string;
    name: string;
    category: string;
    result?: string;
    unit?: string;
    referenceRange?: string;
    flag?: 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL';
    notes?: string;
  }>;
  collectedAt?: string;
  collectedByName?: string;
  processedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  cancellationReason?: string;
  specimens?: Array<{
    id: string;
    accessionNumber: string;
    specimenType: string;
    status: string;
    collectedAt: string;
    collectedByName?: string;
    rejectionReason?: string;
    notes?: string;
  }>;
  amendments?: Array<{
    id: string;
    orderItemId: string;
    previousValue: string;
    previousFlag?: string;
    newValue: string;
    newFlag?: string;
    reason: string;
    amendedByName: string;
    createdAt: string;
  }>;
}

// Development Demo Seed Orders (Available only if explicitly toggled in development)
const SEED_LAB_ORDERS: LabOrderItem[] = [
  {
    id: 'lab-001',
    orderNumber: 'LAB-2026-000101',
    patientId: 'p-001-arjun-verma',
    patientUhid: 'MGH-2025-000001',
    patientName: 'Arjun Verma',
    patientAge: 38,
    patientGender: 'Male',
    doctorId: 'doc-001-sharma',
    doctorName: 'Dr. Arvind Sharma',
    status: 'RESULTS_ENTERED',
    orderDate: new Date(Date.now() - 14400000).toISOString(),
    specimenType: 'Venous Blood (EDTA + Serum)',
    priority: 'URGENT',
    collectedAt: new Date(Date.now() - 10800000).toISOString(),
    processedAt: new Date(Date.now() - 7200000).toISOString(),
    tests: [
      {
        code: 'LIPID-01',
        name: 'Serum Total Cholesterol',
        category: 'Clinical Biochemistry',
        result: '242',
        unit: 'mg/dL',
        referenceRange: '< 200',
        flag: 'HIGH',
        notes: 'Borderline high risk for coronary artery disease',
      },
      {
        code: 'LIPID-02',
        name: 'LDL Cholesterol (Direct)',
        category: 'Clinical Biochemistry',
        result: '158',
        unit: 'mg/dL',
        referenceRange: '< 100',
        flag: 'HIGH',
        notes: 'Therapeutic target < 70 mg/dL for known cardiac history',
      },
      {
        code: 'LIPID-03',
        name: 'HDL Cholesterol',
        category: 'Clinical Biochemistry',
        result: '41',
        unit: 'mg/dL',
        referenceRange: '> 40',
        flag: 'NORMAL',
      },
      {
        code: 'LIPID-04',
        name: 'Serum Triglycerides',
        category: 'Clinical Biochemistry',
        result: '185',
        unit: 'mg/dL',
        referenceRange: '< 150',
        flag: 'HIGH',
      },
    ],
  },
  {
    id: 'lab-002',
    orderNumber: 'LAB-2026-000102',
    patientId: 'p-002-kavita-patel',
    patientUhid: 'MGH-2025-000002',
    patientName: 'Kavita Patel',
    patientAge: 45,
    patientGender: 'Female',
    doctorId: 'doc-001-sharma',
    doctorName: 'Dr. Arvind Sharma',
    status: 'APPROVED',
    orderDate: new Date(Date.now() - 86400000).toISOString(),
    specimenType: 'Whole Blood (Fluoride / EDTA)',
    priority: 'ROUTINE',
    collectedAt: new Date(Date.now() - 80000000).toISOString(),
    processedAt: new Date(Date.now() - 72000000).toISOString(),
    approvedAt: new Date(Date.now() - 60000000).toISOString(),
    approvedBy: 'Dr. Sunanda Pillai, MD (Pathology)',
    tests: [
      {
        code: 'GLUC-01',
        name: 'Fasting Plasma Glucose (FPG)',
        category: 'Clinical Biochemistry',
        result: '138',
        unit: 'mg/dL',
        referenceRange: '70 - 99',
        flag: 'HIGH',
        notes: 'Consistent with diabetic range',
      },
      {
        code: 'HBA1C-01',
        name: 'Glycated Hemoglobin (HbA1c)',
        category: 'Clinical Biochemistry',
        result: '7.2',
        unit: '%',
        referenceRange: '< 5.7 (Normal), 5.7-6.4 (Prediabetes)',
        flag: 'HIGH',
        notes: 'Suboptimal glycemic control',
      },
      {
        code: 'KFT-01',
        name: 'Serum Creatinine',
        category: 'Renal Profile',
        result: '0.85',
        unit: 'mg/dL',
        referenceRange: '0.59 - 1.04',
        flag: 'NORMAL',
      },
    ],
  },
  {
    id: 'lab-003',
    orderNumber: 'LAB-2026-000103',
    patientId: 'p-003-rohit-mehta',
    patientUhid: 'MGH-2025-000003',
    patientName: 'Rohit Mehta',
    patientAge: 30,
    patientGender: 'Male',
    doctorId: 'doc-002-ananya',
    doctorName: 'Dr. Ananya Deshmukh',
    status: 'SAMPLE_COLLECTED',
    orderDate: new Date(Date.now() - 7200000).toISOString(),
    specimenType: 'Nasopharyngeal Swab + EDTA Blood',
    priority: 'ROUTINE',
    collectedAt: new Date(Date.now() - 3600000).toISOString(),
    tests: [
      {
        code: 'CBC-01',
        name: 'Complete Blood Count (CBC) with Differential',
        category: 'Hematology',
      },
      {
        code: 'CRP-01',
        name: 'C-Reactive Protein (Quantitative)',
        category: 'Serology',
      },
    ],
  },
  {
    id: 'lab-004',
    orderNumber: 'LAB-2026-000104',
    patientId: 'p-004-meera-nair',
    patientUhid: 'MGH-2025-000004',
    patientName: 'Meera Nair',
    patientAge: 57,
    patientGender: 'Female',
    doctorId: 'doc-002-ananya',
    doctorName: 'Dr. Ananya Deshmukh',
    status: 'ORDERED',
    orderDate: new Date(Date.now() - 1800000).toISOString(),
    specimenType: 'Clean Catch Midstream Urine',
    priority: 'ROUTINE',
    tests: [
      {
        code: 'URINE-01',
        name: 'Complete Urine Routine & Microscopic Exam',
        category: 'Clinical Pathology',
      },
    ],
  },
];

const isExplicitMockEnabled =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_ENABLE_LAB_MOCK === 'true';

export const laboratoryService = {
  /**
   * Fetch all laboratory orders and active worklists
   */
  async getOrders(filters?: { status?: string; patientId?: string; priority?: string; search?: string }): Promise<LabOrderItem[]> {
    if (isExplicitMockEnabled) {
      return SEED_LAB_ORDERS;
    }

    const response = await apiClient<LabOrderItem[]>('/laboratory/orders', {
      params: filters,
    });
    return response.data || [];
  },

  /**
   * Fetch order details by UUID or orderNumber
   */
  async getOrderById(id: string): Promise<LabOrderItem | null> {
    if (isExplicitMockEnabled) {
      return SEED_LAB_ORDERS.find((o) => o.id === id || o.orderNumber === id) || null;
    }

    try {
      const response = await apiClient<LabOrderItem>(`/laboratory/orders/${id}`);
      return response.data || null;
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Record specimen collection and barcode assignment
   */
  async collectSample(orderId: string, specimenDetails: string, notes?: string): Promise<boolean> {
    if (isExplicitMockEnabled) {
      const order = SEED_LAB_ORDERS.find((o) => o.id === orderId);
      if (order) {
        order.status = 'SAMPLE_COLLECTED';
        order.specimenType = specimenDetails;
        order.collectedAt = new Date().toISOString();
        return true;
      }
      return false;
    }

    await apiClient(`/laboratory/orders/${orderId}/collect`, {
      method: 'POST',
      body: JSON.stringify({
        specimenType: specimenDetails,
        notes,
      }),
    });
    return true;
  },

  /**
   * Begin analyzer analysis on collected specimen
   */
  async startProcessing(orderId: string): Promise<boolean> {
    if (isExplicitMockEnabled) {
      const order = SEED_LAB_ORDERS.find((o) => o.id === orderId);
      if (order) {
        order.status = 'PROCESSING';
        order.processedAt = new Date().toISOString();
        return true;
      }
      return false;
    }

    await apiClient(`/laboratory/orders/${orderId}/process`, {
      method: 'POST',
    });
    return true;
  },

  /**
   * Enter test measurements with server-side authoritative reference range evaluation
   */
  async enterResults(
    orderId: string,
    results: Array<{ code: string; result: string; unit?: string; referenceRange?: string; flag?: any; notes?: string }>,
  ): Promise<boolean> {
    if (isExplicitMockEnabled) {
      const order = SEED_LAB_ORDERS.find((o) => o.id === orderId);
      if (order) {
        order.tests = order.tests.map((t) => {
          const found = results.find((r) => r.code === t.code);
          return found ? { ...t, ...found } : t;
        });
        order.status = 'RESULTS_ENTERED';
        return true;
      }
      return false;
    }

    await apiClient(`/laboratory/orders/${orderId}/results`, {
      method: 'POST',
      body: JSON.stringify({
        results: results.map((r) => ({
          code: r.code,
          resultValue: r.result,
          unit: r.unit,
          referenceRange: r.referenceRange,
          flag: r.flag,
          notes: r.notes,
        })),
      }),
    });
    return true;
  },

  /**
   * Pathologist clinical sign-off and certification
   */
  async approveResults(orderId: string, pathologistName: string, remarks?: string): Promise<boolean> {
    if (isExplicitMockEnabled) {
      const order = SEED_LAB_ORDERS.find((o) => o.id === orderId);
      if (order) {
        order.status = 'APPROVED';
        order.approvedAt = new Date().toISOString();
        order.approvedBy = pathologistName;
        return true;
      }
      return false;
    }

    await apiClient(`/laboratory/orders/${orderId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        pathologistName,
        clinicalRemarks: remarks,
      }),
    });
    return true;
  },

  /**
   * Create laboratory diagnostic order
   */
  async createOrder(payload: {
    patientId: string;
    doctorId: string;
    encounterId?: string;
    priority?: any;
    specimenType?: string;
    clinicalNotes?: string;
    items: Array<{ testId: string; technicianNotes?: string }>;
  }): Promise<LabOrderItem> {
    const response = await apiClient<LabOrderItem>('/laboratory/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.data!;
  },

  /**
   * Cancel unfinalized diagnostic order
   */
  async cancelOrder(orderId: string, reason: string): Promise<boolean> {
    if (isExplicitMockEnabled) {
      const order = SEED_LAB_ORDERS.find((o) => o.id === orderId);
      if (order) {
        order.status = 'CANCELLED';
        order.cancellationReason = reason;
        return true;
      }
      return false;
    }

    await apiClient(`/laboratory/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return true;
  },

  /**
   * Retrieve diagnostic test catalog
   */
  async getCatalog(query?: { categoryId?: string; search?: string; page?: number; limit?: number }) {
    const response = await apiClient<any>('/laboratory/catalog', {
      params: query,
    });
    return response.data;
  },

  /**
   * Retrieve diagnostic categories
   */
  async getCategories() {
    const response = await apiClient<any[]>('/laboratory/categories');
    return response.data || [];
  },
};
