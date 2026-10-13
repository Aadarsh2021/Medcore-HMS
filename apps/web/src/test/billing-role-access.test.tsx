import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { BillingHubContent } from '../app/dashboard/billing/BillingHubContent';
import { billingService, InvoiceRecord } from '../lib/api/billing.service';
import { useAuthStore } from '../stores/authStore';
import { UserRole } from '@medcore/types';
import { ApiError } from '../lib/api/client';

// Mock Next.js navigation hooks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

// Mock billingService methods
vi.mock('../lib/api/billing.service', async () => {
  const actual = await vi.importActual('../lib/api/billing.service');
  return {
    ...actual,
    billingService: {
      getInvoices: vi.fn(),
      getPatientInvoices: vi.fn(),
      getInvoiceById: vi.fn(),
      recordPayment: vi.fn(),
    },
  };
});

const MOCK_INVOICE: InvoiceRecord = {
  id: 'inv-001',
  invoiceNumber: 'INV-2026-000001',
  patientId: 'patient-uuid-1',
  patientUhid: 'MGH-2026-000001',
  patientName: 'Aarav Sharma',
  patientPhone: '+91 98765 43210',
  doctorName: 'Dr. Arvind Sharma',
  departmentName: 'Cardiology',
  status: 'ISSUED',
  issuedAt: '2026-10-13T10:00:00.000Z',
  dueDate: '2026-10-20T10:00:00.000Z',
  subtotal: 1000,
  taxAmount: 50,
  totalAmount: 1050,
  paidAmount: 0,
  balanceDue: 1050,
  lineItems: [
    {
      id: 'item-1',
      type: 'CONSULTATION',
      description: 'Cardiology OPD Consultation',
      quantity: 1,
      unitPrice: 1000,
      discount: 0,
      total: 1000,
    },
  ],
  payments: [],
};

describe('Phase 7 — Billing Role-Based UI Access Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. should query patient-scoped endpoint when logged in as PATIENT', async () => {
    useAuthStore.setState({
      user: {
        id: 'patient-user-1',
        email: 'patient@example.com',
        role: UserRole.PATIENT,
        hospitalId: 'hosp-1',
        firstName: 'Aarav',
        lastName: 'Sharma',
      },
    });

    (billingService.getPatientInvoices as any).mockResolvedValue([MOCK_INVOICE]);

    render(<BillingHubContent />);

    await waitFor(() => {
      expect(billingService.getPatientInvoices).toHaveBeenCalledWith('me');
    });

    // Staff-wide getInvoices must NOT be called for a patient
    expect(billingService.getInvoices).not.toHaveBeenCalled();

    // Verify patient-friendly header and absence of cashier 'Collect' action
    expect(screen.getByText('My Invoices & Billing Statements')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /collect/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /details/i })).toBeInTheDocument();
  });

  it('2. should query staff-wide ledger when logged in as ACCOUNTANT and render cashier controls', async () => {
    useAuthStore.setState({
      user: {
        id: 'accountant-user-1',
        email: 'accountant@metrogeneral.org',
        role: UserRole.ACCOUNTANT,
        hospitalId: 'hosp-1',
        firstName: 'Ramesh',
        lastName: 'Gupta',
      },
    });

    (billingService.getInvoices as any).mockResolvedValue([MOCK_INVOICE]);

    render(<BillingHubContent />);

    await waitFor(() => {
      expect(billingService.getInvoices).toHaveBeenCalled();
    });

    expect(billingService.getPatientInvoices).not.toHaveBeenCalled();

    // Verify staff cashier header and presence of 'Collect' action
    expect(screen.getByText('Patient Billing, Invoices & Cashier Desk')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /collect/i })).toBeInTheDocument();
  });

  it('3. should render ErrorState gracefully without uncaught rejection when receiving 403 Forbidden', async () => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.PATIENT,
        hospitalId: 'hosp-1',
        firstName: 'Test',
        lastName: 'User',
      },
    });

    (billingService.getPatientInvoices as any).mockRejectedValue(
      new ApiError(403, 'Forbidden access to billing records'),
    );

    render(<BillingHubContent />);

    await waitFor(() => {
      expect(screen.getByText('Workstation Access Restricted')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Your account is not authorized to view institutional cashier ledgers/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('4. should render session expired state gracefully when receiving 401 Unauthorized', async () => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.ACCOUNTANT,
        hospitalId: 'hosp-1',
        firstName: 'Staff',
        lastName: 'Cashier',
      },
    });

    (billingService.getInvoices as any).mockRejectedValue(
      new ApiError(401, 'Unauthorized session'),
    );

    render(<BillingHubContent />);

    await waitFor(() => {
      expect(
        screen.getByText(/Your session has expired. Please log in again to access billing records/i),
      ).toBeInTheDocument();
    });
  });
});
