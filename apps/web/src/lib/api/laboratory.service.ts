/**
 * MedCore HMS — Laboratory Service Adapter
 *
 * Implements the full clinical Laboratory lifecycle:
 *   Doctor Order -> Specimen Intake / Collection -> Processing
 *   -> Result Entry with reference ranges & abnormal flags
 *   -> Pathologist Review & Approval -> Patient & Doctor Report Viewer
 */

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
  status: 'ORDERED' | 'SAMPLE_COLLECTED' | 'PROCESSING' | 'RESULTS_ENTERED' | 'APPROVED' | 'CANCELLED';
  orderDate: string;
  specimenType: string;
  priority: 'ROUTINE' | 'URGENT' | 'STAT';
  tests: Array<{
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
  processedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}

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

export const laboratoryService = {
  async getOrders(): Promise<LabOrderItem[]> {
    return SEED_LAB_ORDERS;
  },

  async getOrderById(id: string): Promise<LabOrderItem | null> {
    return SEED_LAB_ORDERS.find((o) => o.id === id || o.orderNumber === id) || null;
  },

  async collectSample(orderId: string, specimenDetails: string): Promise<boolean> {
    const order = await this.getOrderById(orderId);
    if (order) {
      order.status = 'SAMPLE_COLLECTED';
      order.specimenType = specimenDetails;
      order.collectedAt = new Date().toISOString();
      return true;
    }
    return false;
  },

  async startProcessing(orderId: string): Promise<boolean> {
    const order = await this.getOrderById(orderId);
    if (order) {
      order.status = 'PROCESSING';
      order.processedAt = new Date().toISOString();
      return true;
    }
    return false;
  },

  async enterResults(
    orderId: string,
    results: Array<{ code: string; result: string; unit?: string; referenceRange?: string; flag?: any; notes?: string }>,
  ): Promise<boolean> {
    const order = await this.getOrderById(orderId);
    if (order) {
      order.tests = order.tests.map((t) => {
        const found = results.find((r) => r.code === t.code);
        return found ? { ...t, ...found } : t;
      });
      order.status = 'RESULTS_ENTERED';
      return true;
    }
    return false;
  },

  async approveResults(orderId: string, pathologistName: string): Promise<boolean> {
    const order = await this.getOrderById(orderId);
    if (order) {
      order.status = 'APPROVED';
      order.approvedAt = new Date().toISOString();
      order.approvedBy = pathologistName;
      return true;
    }
    return false;
  },
};
