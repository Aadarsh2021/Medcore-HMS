/**
 * MedCore HMS — Pharmacy Service Adapter
 *
 * Implements the Phase 7 frontend adapter contract for:
 *   - Dispensing Queue (Prescription verification, remaining count, FEFO recommended batches)
 *   - Inventory & Batch Management (Quarantine status, stock levels)
 *   - Stock Receipts (GRN) workflow
 *   - Immutable Stock Movements Ledger
 *   - Expiry Management (<30d, <60d, <90d, Expired)
 *
 * Allocation Policy:
 *   1. FEFO Primary: earliest expiryDate ASC
 *   2. FIFO Tie-breaker: earliest createdAt ASC
 *   Hard Exclusions: expired, quarantined, zero stock
 */

export interface PharmacyQueueItem {
  prescriptionId: string;
  prescriptionNumber: string;
  patientId: string;
  patientUhid: string;
  patientName: string;
  doctorName: string;
  doctorSpecialization: string;
  issuedAt: string;
  status: 'PENDING_DISPENSE' | 'PARTIALLY_DISPENSED' | 'DISPENSED';
  itemsCount: number;
  items: Array<{
    medicineId: string;
    medicineName: string;
    strength: string;
    form: string;
    prescribedQuantity: number;
    dispensedQuantity: number;
    remainingQuantity: number;
  }>;
}

export interface PharmacyBatchItem {
  id: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string; // YYYY-MM-DD
  currentQuantity: number;
  unitCost: number;
  mrp: number;
  isQuarantined: boolean;
  quarantineReason?: string | null;
  createdAt: string;
}

export interface PharmacyMedicineItem {
  id: string;
  name: string;
  genericName: string;
  form: string;
  strength: string;
  totalStock: number;
  reorderLevel: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  batchCount: number;
}

export interface BatchAllocationProposal {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  availableQuantity: number;
  allocatedQuantity: number;
  reason: 'FEFO_PRIMARY' | 'FIFO_TIE_BREAKER';
}

export interface DispensePlanItem {
  medicineId: string;
  medicineName: string;
  prescribedQuantity: number;
  dispensedQuantity: number;
  remainingQuantity: number;
  allocations: BatchAllocationProposal[];
  isFullyAllocated: boolean;
}

export interface StockMovementItem {
  id: string;
  timestamp: string;
  medicineName: string;
  batchNumber: string;
  movementType: 'PURCHASE_RECEIPT' | 'DISPENSE' | 'ADJUSTMENT' | 'RETURN' | 'DISPOSAL';
  quantity: number; // positive or negative
  balanceAfter: number;
  referenceType: string;
  referenceNumber: string;
  performedBy: string;
}

export interface CreateStockReceiptDto {
  supplierName: string;
  supplierInvoiceNumber: string;
  receivedDate: string;
  items: Array<{
    medicineId: string;
    medicineName: string;
    batchNumber: string;
    manufacturingDate: string;
    expiryDate: string;
    quantity: number;
    unitCost: number;
    mrp: number;
  }>;
}

// Development Seed Data adhering to FEFO + FIFO policy
const SEED_BATCHES: PharmacyBatchItem[] = [
  {
    id: 'batch-ator-01',
    medicineId: 'med-01',
    medicineName: 'Atorvastatin 20mg',
    batchNumber: 'ATV-2024-B1',
    manufacturingDate: '2024-06-01',
    expiryDate: '2026-11-30', // Earlier expiry -> FEFO 1st
    currentQuantity: 40,
    unitCost: 6.5,
    mrp: 14.0,
    isQuarantined: false,
    createdAt: '2024-06-15T09:00:00.000Z',
  },
  {
    id: 'batch-ator-02',
    medicineId: 'med-01',
    medicineName: 'Atorvastatin 20mg',
    batchNumber: 'ATV-2025-A1',
    manufacturingDate: '2025-01-10',
    expiryDate: '2027-04-30', // Later expiry
    currentQuantity: 100,
    unitCost: 6.8,
    mrp: 14.5,
    isQuarantined: false,
    createdAt: '2025-01-20T10:00:00.000Z',
  },
  {
    id: 'batch-met-01',
    medicineId: 'med-02',
    medicineName: 'Metformin 500mg',
    batchNumber: 'MET-2024-C9',
    manufacturingDate: '2024-03-15',
    expiryDate: '2026-10-15',
    currentQuantity: 80,
    unitCost: 2.2,
    mrp: 5.5,
    isQuarantined: false,
    createdAt: '2024-04-01T08:00:00.000Z',
  },
  {
    id: 'batch-met-02',
    medicineId: 'med-02',
    medicineName: 'Metformin 500mg',
    batchNumber: 'MET-2024-C10',
    manufacturingDate: '2024-03-20',
    expiryDate: '2026-10-15', // Same expiry date -> FIFO tie breaker
    currentQuantity: 150,
    unitCost: 2.2,
    mrp: 5.5,
    isQuarantined: false,
    createdAt: '2024-04-10T11:00:00.000Z', // Later receipt date
  },
  {
    id: 'batch-amox-01',
    medicineId: 'med-03',
    medicineName: 'Amoxicillin 500mg',
    batchNumber: 'AMX-2024-X4',
    manufacturingDate: '2024-02-01',
    expiryDate: '2026-09-30', // Expiring within 30 days
    currentQuantity: 15,
    unitCost: 4.5,
    mrp: 11.0,
    isQuarantined: false,
    createdAt: '2024-02-15T09:00:00.000Z',
  },
  {
    id: 'batch-amox-02',
    medicineId: 'med-03',
    medicineName: 'Amoxicillin 500mg',
    batchNumber: 'AMX-2024-RECALL',
    manufacturingDate: '2024-01-10',
    expiryDate: '2026-12-31',
    currentQuantity: 60,
    unitCost: 4.5,
    mrp: 11.0,
    isQuarantined: true,
    quarantineReason: 'Packaging seal integrity verification hold',
    createdAt: '2024-01-25T14:00:00.000Z',
  },
  {
    id: 'batch-para-01',
    medicineId: 'med-04',
    medicineName: 'Paracetamol 650mg',
    batchNumber: 'PCM-2024-08',
    manufacturingDate: '2024-05-10',
    expiryDate: '2027-05-10',
    currentQuantity: 350,
    unitCost: 1.1,
    mrp: 2.5,
    isQuarantined: false,
    createdAt: '2024-05-20T10:00:00.000Z',
  },
];

const SEED_QUEUE: PharmacyQueueItem[] = [
  {
    prescriptionId: 'rx-001',
    prescriptionNumber: 'RX-2026-000001',
    patientId: 'p-001-arjun-verma',
    patientUhid: 'MGH-2025-000001',
    patientName: 'Arjun Verma',
    doctorName: 'Dr. Arvind Sharma',
    doctorSpecialization: 'Cardiology',
    issuedAt: new Date(Date.now() - 3600000).toISOString(),
    status: 'PENDING_DISPENSE',
    itemsCount: 2,
    items: [
      {
        medicineId: 'med-01',
        medicineName: 'Atorvastatin',
        strength: '20 mg',
        form: 'TABLET',
        prescribedQuantity: 30,
        dispensedQuantity: 0,
        remainingQuantity: 30,
      },
      {
        medicineId: 'med-metoprolol',
        medicineName: 'Metoprolol Succinate ER',
        strength: '50 mg',
        form: 'TABLET',
        prescribedQuantity: 30,
        dispensedQuantity: 0,
        remainingQuantity: 30,
      },
    ],
  },
  {
    prescriptionId: 'rx-002',
    prescriptionNumber: 'RX-2026-000002',
    patientId: 'p-002-kavita-patel',
    patientUhid: 'MGH-2025-000002',
    patientName: 'Kavita Patel',
    doctorName: 'Dr. Arvind Sharma',
    doctorSpecialization: 'Cardiology',
    issuedAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'PARTIALLY_DISPENSED',
    itemsCount: 2,
    items: [
      {
        medicineId: 'med-02',
        medicineName: 'Metformin Hydrochloride',
        strength: '500 mg',
        form: 'TABLET',
        prescribedQuantity: 120,
        dispensedQuantity: 60,
        remainingQuantity: 60,
      },
      {
        medicineId: 'med-telmi',
        medicineName: 'Telmisartan',
        strength: '40 mg',
        form: 'TABLET',
        prescribedQuantity: 30,
        dispensedQuantity: 30,
        remainingQuantity: 0,
      },
    ],
  },
];

const SEED_MOVEMENTS: StockMovementItem[] = [
  {
    id: 'mov-001',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    medicineName: 'Telmisartan 40mg',
    batchNumber: 'TEL-2024-K2',
    movementType: 'DISPENSE',
    quantity: -30,
    balanceAfter: 120,
    referenceType: 'PRESCRIPTION',
    referenceNumber: 'RX-2026-000002',
    performedBy: 'Priya Iyer (Pharmacist)',
  },
  {
    id: 'mov-002',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    medicineName: 'Metformin 500mg',
    batchNumber: 'MET-2024-C9',
    movementType: 'DISPENSE',
    quantity: -60,
    balanceAfter: 80,
    referenceType: 'PRESCRIPTION',
    referenceNumber: 'RX-2026-000002',
    performedBy: 'Priya Iyer (Pharmacist)',
  },
  {
    id: 'mov-003',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    medicineName: 'Atorvastatin 20mg',
    batchNumber: 'ATV-2025-A1',
    movementType: 'PURCHASE_RECEIPT',
    quantity: 100,
    balanceAfter: 140,
    referenceType: 'GOODS_RECEIPT_NOTE',
    referenceNumber: 'GRN-2026-00014',
    performedBy: 'Priya Iyer (Pharmacist)',
  },
];

export const pharmacyService = {
  async getQueue(): Promise<PharmacyQueueItem[]> {
    return SEED_QUEUE;
  },

  async getInventory(): Promise<PharmacyMedicineItem[]> {
    return [
      { id: 'med-01', name: 'Atorvastatin 20mg', genericName: 'Atorvastatin', form: 'TABLET', strength: '20 mg', totalStock: 140, reorderLevel: 50, status: 'IN_STOCK', batchCount: 2 },
      { id: 'med-02', name: 'Metformin 500mg', genericName: 'Metformin Hydrochloride', form: 'TABLET', strength: '500 mg', totalStock: 230, reorderLevel: 100, status: 'IN_STOCK', batchCount: 2 },
      { id: 'med-03', name: 'Amoxicillin 500mg', genericName: 'Amoxicillin Trihydrate', form: 'CAPSULE', strength: '500 mg', totalStock: 15, reorderLevel: 50, status: 'LOW_STOCK', batchCount: 2 },
      { id: 'med-04', name: 'Paracetamol 650mg', genericName: 'Acetaminophen', form: 'TABLET', strength: '650 mg', totalStock: 350, reorderLevel: 100, status: 'IN_STOCK', batchCount: 1 },
      { id: 'med-05', name: 'Azithromycin 500mg', genericName: 'Azithromycin Dihydrate', form: 'TABLET', strength: '500 mg', totalStock: 0, reorderLevel: 30, status: 'OUT_OF_STOCK', batchCount: 0 },
    ];
  },

  async getBatches(medicineId?: string): Promise<PharmacyBatchItem[]> {
    if (medicineId) {
      return SEED_BATCHES.filter((b) => b.medicineId === medicineId);
    }
    return SEED_BATCHES;
  },

  /**
   * Calculates recommended batch allocation adhering strictly to:
   * 1. FEFO Primary: earliest expiryDate ASC
   * 2. FIFO Tie-breaker: earliest createdAt ASC
   * Excludes: expired, quarantined, zero-stock
   */
  async getDispensePlan(prescriptionId: string): Promise<DispensePlanItem[]> {
    const rx = SEED_QUEUE.find((q) => q.prescriptionId === prescriptionId);
    if (!rx) return [];

    const plan: DispensePlanItem[] = [];

    for (const item of rx.items) {
      if (item.remainingQuantity <= 0) continue;

      const today = new Date().toISOString().split('T')[0];
      // Eligible batches
      const eligible = SEED_BATCHES.filter(
        (b) =>
          b.medicineId === item.medicineId &&
          !b.isQuarantined &&
          b.currentQuantity > 0 &&
          b.expiryDate > today,
      ).sort((a, b) => {
        // 1. FEFO Primary
        if (a.expiryDate !== b.expiryDate) {
          return a.expiryDate.localeCompare(b.expiryDate);
        }
        // 2. FIFO Tie-breaker
        return a.createdAt.localeCompare(b.createdAt);
      });

      let need = item.remainingQuantity;
      const allocations: BatchAllocationProposal[] = [];

      for (const batch of eligible) {
        if (need <= 0) break;
        const take = Math.min(need, batch.currentQuantity);
        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          availableQuantity: batch.currentQuantity,
          allocatedQuantity: take,
          reason: allocations.length === 0 ? 'FEFO_PRIMARY' : 'FIFO_TIE_BREAKER',
        });
        need -= take;
      }

      plan.push({
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        prescribedQuantity: item.prescribedQuantity,
        dispensedQuantity: item.dispensedQuantity,
        remainingQuantity: item.remainingQuantity,
        allocations,
        isFullyAllocated: need === 0,
      });
    }

    return plan;
  },

  async dispense(prescriptionId: string, _allocation: any): Promise<{ success: boolean; receiptNumber: string }> {
    // Note: Backend activation will execute authoritative row locking & ledger commit.
    const rx = SEED_QUEUE.find((q) => q.prescriptionId === prescriptionId);
    if (rx) {
      rx.status = 'DISPENSED';
      rx.items.forEach((it) => {
        it.dispensedQuantity = it.prescribedQuantity;
        it.remainingQuantity = 0;
      });
    }
    return {
      success: true,
      receiptNumber: `RCP-2026-${Math.floor(100000 + Math.random() * 900000)}`,
    };
  },

  async getStockMovements(): Promise<StockMovementItem[]> {
    return SEED_MOVEMENTS;
  },

  async createStockReceipt(dto: CreateStockReceiptDto): Promise<{ success: boolean; receiptNumber: string }> {
    const grnNumber = `GRN-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    for (const item of dto.items) {
      SEED_MOVEMENTS.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: new Date().toISOString(),
        medicineName: item.medicineName,
        batchNumber: item.batchNumber,
        movementType: 'PURCHASE_RECEIPT',
        quantity: item.quantity,
        balanceAfter: item.quantity + 50,
        referenceType: 'GOODS_RECEIPT_NOTE',
        referenceNumber: grnNumber,
        performedBy: 'Chief Pharmacist',
      });
    }
    return { success: true, receiptNumber: grnNumber };
  },

  async toggleQuarantine(batchId: string, reason?: string): Promise<boolean> {
    const batch = SEED_BATCHES.find((b) => b.id === batchId);
    if (batch) {
      batch.isQuarantined = !batch.isQuarantined;
      batch.quarantineReason = batch.isQuarantined ? reason || 'Administrative hold' : null;
      return true;
    }
    return false;
  },
};
