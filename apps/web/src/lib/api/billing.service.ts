/**
 * MedCore HMS — Billing Service Adapter
 *
 * Implements the financial & cashier workflow:
 *   - Consolidated Invoices (Consultation, Lab Tests, Pharmacy, Room/Procedures)
 *   - Line-item adjustments and tax computation
 *   - Payment recording (Cash, Card, UPI, Insurance / TPA Pre-auth)
 *   - Official Patient Receipt generation
 *   - Insurance / TPA Claim status tracking
 *
 * Note: Operating in typed development adapter mode pending Phase 8 backend release.
 */

export interface InvoiceLineItem {
  id: string;
  type: 'CONSULTATION' | 'LAB_TEST' | 'PHARMACY' | 'PROCEDURE' | 'ROOM' | 'OTHER';
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface PaymentTransaction {
  id: string;
  transactionNumber: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'INSURANCE_CLAIM';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  paidAt: string;
  referenceNumber?: string | null;
  recordedBy: string;
}

export interface InsuranceClaimDetails {
  policyNumber: string;
  providerName: string;
  tpaName: string;
  preAuthAmount: number;
  claimStatus: 'SUBMITTED' | 'PRE_AUTH_APPROVED' | 'SETTLED' | 'REJECTED';
  approvedAmount?: number | null;
  claimReferenceNumber?: string | null;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientUhid: string;
  patientName: string;
  patientPhone: string;
  encounterId?: string;
  doctorName?: string;
  departmentName?: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  issuedAt: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number; // 5% GST or applicable tax
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  payments: PaymentTransaction[];
  insurance?: InsuranceClaimDetails | null;
}

const SEED_INVOICES: InvoiceRecord[] = [
  {
    id: 'inv-001',
    invoiceNumber: 'INV-2026-000412',
    patientId: 'p-001-arjun-verma',
    patientUhid: 'MGH-2025-000001',
    patientName: 'Arjun Verma',
    patientPhone: '+91 98765 43210',
    encounterId: 'enc-001-active',
    doctorName: 'Dr. Arvind Sharma (Cardiology)',
    departmentName: 'Cardiology',
    status: 'ISSUED',
    issuedAt: new Date(Date.now() - 7200000).toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    lineItems: [
      {
        id: 'li-1',
        type: 'CONSULTATION',
        description: 'OPD Specialist Consultation - Cardiology',
        quantity: 1,
        unitPrice: 750,
        discount: 0,
        total: 750,
      },
      {
        id: 'li-2',
        type: 'LAB_TEST',
        description: 'Comprehensive Lipid Profile & Blood Sugar',
        quantity: 1,
        unitPrice: 950,
        discount: 50,
        total: 900,
      },
      {
        id: 'li-3',
        type: 'PHARMACY',
        description: 'Prescription Dispensing (Atorvastatin 20mg x 30 tabs)',
        quantity: 1,
        unitPrice: 420,
        discount: 0,
        total: 420,
      },
    ],
    subtotal: 2070,
    taxAmount: 103.5,
    totalAmount: 2173.5,
    paidAmount: 0,
    balanceDue: 2173.5,
    payments: [],
    insurance: {
      providerName: 'Star Health & Allied Insurance',
      tpaName: 'MediAssist TPA',
      policyNumber: 'SH-POL-992140',
      preAuthAmount: 2500,
      claimStatus: 'PRE_AUTH_APPROVED',
      approvedAmount: 2173.5,
      claimReferenceNumber: 'CLM-MA-2026-778',
    },
  },
  {
    id: 'inv-002',
    invoiceNumber: 'INV-2026-000389',
    patientId: 'p-002-kavita-patel',
    patientUhid: 'MGH-2025-000002',
    patientName: 'Kavita Patel',
    patientPhone: '+91 98123 45678',
    doctorName: 'Dr. Arvind Sharma (Cardiology)',
    departmentName: 'Cardiology',
    status: 'PAID',
    issuedAt: new Date(Date.now() - 86400000).toISOString(),
    dueDate: new Date(Date.now() - 86400000).toISOString(),
    lineItems: [
      {
        id: 'li-4',
        type: 'CONSULTATION',
        description: 'Follow-up Specialist Consultation',
        quantity: 1,
        unitPrice: 500,
        discount: 0,
        total: 500,
      },
      {
        id: 'li-5',
        type: 'LAB_TEST',
        description: 'Glycated Hemoglobin (HbA1c) & Renal Function',
        quantity: 1,
        unitPrice: 650,
        discount: 0,
        total: 650,
      },
    ],
    subtotal: 1150,
    taxAmount: 57.5,
    totalAmount: 1207.5,
    paidAmount: 1207.5,
    balanceDue: 0,
    payments: [
      {
        id: 'pay-001',
        transactionNumber: 'TXN-2026-00192',
        amount: 1207.5,
        method: 'UPI',
        status: 'SUCCESS',
        paidAt: new Date(Date.now() - 80000000).toISOString(),
        referenceNumber: 'UPI/388291048123/HDFC',
        recordedBy: 'Rahul Sen (Receptionist)',
      },
    ],
  },
  {
    id: 'inv-003',
    invoiceNumber: 'INV-2026-000430',
    patientId: 'p-003-rohit-mehta',
    patientUhid: 'MGH-2025-000003',
    patientName: 'Rohit Mehta',
    patientPhone: '+91 97654 32109',
    doctorName: 'Dr. Ananya Deshmukh (General Medicine)',
    departmentName: 'General Medicine',
    status: 'DRAFT',
    issuedAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    lineItems: [
      {
        id: 'li-6',
        type: 'CONSULTATION',
        description: 'General Medicine OPD Consultation',
        quantity: 1,
        unitPrice: 500,
        discount: 0,
        total: 500,
      },
      {
        id: 'li-7',
        type: 'LAB_TEST',
        description: 'Complete Blood Count (CBC) with ESR',
        quantity: 1,
        unitPrice: 380,
        discount: 0,
        total: 380,
      },
    ],
    subtotal: 880,
    taxAmount: 44,
    totalAmount: 924,
    paidAmount: 0,
    balanceDue: 924,
    payments: [],
  },
];

export const billingService = {
  async getInvoices(query?: { status?: string; search?: string }): Promise<InvoiceRecord[]> {
    let items = [...SEED_INVOICES];
    if (query?.status) {
      items = items.filter((inv) => inv.status === query.status);
    }
    if (query?.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.patientName.toLowerCase().includes(q) ||
          inv.patientUhid.toLowerCase().includes(q),
      );
    }
    return items;
  },

  async getInvoiceById(id: string): Promise<InvoiceRecord | null> {
    return SEED_INVOICES.find((inv) => inv.id === id || inv.invoiceNumber === id) || null;
  },

  async recordPayment(
    invoiceId: string,
    payment: { amount: number; method: PaymentTransaction['method']; reference?: string; actor: string },
  ): Promise<{ success: boolean; transactionNumber: string; receiptNumber: string }> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const txnNumber = `TXN-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    const rcpNumber = `RCP-2026-${Math.floor(10000 + Math.random() * 90000)}`;

    invoice.payments.push({
      id: `pay-${Date.now()}`,
      transactionNumber: txnNumber,
      amount: payment.amount,
      method: payment.method,
      status: 'SUCCESS',
      paidAt: new Date().toISOString(),
      referenceNumber: payment.reference || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      recordedBy: payment.actor,
    });

    invoice.paidAmount += payment.amount;
    invoice.balanceDue = Math.max(0, invoice.totalAmount - invoice.paidAmount);
    invoice.status = invoice.balanceDue === 0 ? 'PAID' : 'PARTIALLY_PAID';

    return { success: true, transactionNumber: txnNumber, receiptNumber: rcpNumber };
  },

  async updateLineItems(invoiceId: string, lineItems: InvoiceLineItem[]): Promise<InvoiceRecord> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    invoice.lineItems = lineItems;
    invoice.subtotal = lineItems.reduce((acc, item) => acc + item.total, 0);
    invoice.taxAmount = Math.round(invoice.subtotal * 0.05 * 100) / 100;
    invoice.totalAmount = invoice.subtotal + invoice.taxAmount;
    invoice.balanceDue = Math.max(0, invoice.totalAmount - invoice.paidAmount);
    return invoice;
  },

  async finalizeInvoice(invoiceId: string): Promise<InvoiceRecord> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    invoice.status = 'ISSUED';
    return invoice;
  },
};
