'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Tabs } from '../../../components/ui/Tabs';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardContent } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { Drawer } from '../../../components/ui/Drawer';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  Receipt,
  CreditCard,
  Building2,
  Clock,
  ShieldCheck,
  Printer,
  Eye,
  FileText,
} from 'lucide-react';
import {
  billingService,
  InvoiceRecord,
  PaymentTransaction,
} from '../../../lib/api/billing.service';

export function BillingHubContent({ defaultTab = 'invoices' }: { defaultTab?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialInvoiceId = searchParams.get('id');

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);

  // Selected Invoice Detail Drawer State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);

  // Payment Recording Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentTransaction['method']>('UPI');
  const [paymentRef, setPaymentRef] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ txn: string; rcp: string } | null>(null);

  useEffect(() => {
    async function loadInvoices() {
      setIsLoading(true);
      try {
        const data = await billingService.getInvoices();
        setInvoices(data);
        if (initialInvoiceId) {
          const found = data.find((i) => i.id === initialInvoiceId);
          if (found) setSelectedInvoice(found);
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadInvoices();
  }, [initialInvoiceId]);

  const openInvoiceDetail = (inv: InvoiceRecord) => {
    setSelectedInvoice(inv);
  };

  const openPaymentModal = (inv: InvoiceRecord) => {
    setSelectedInvoice(inv);
    setPaymentAmount(inv.balanceDue);
    setPaymentRef('');
    setIsPaymentModalOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || paymentAmount <= 0) return;
    setIsProcessingPayment(true);
    try {
      const res = await billingService.recordPayment(selectedInvoice.id, {
        amount: paymentAmount,
        method: paymentMethod,
        reference: paymentRef,
        actor: 'Cashier Desk 1',
      });
      setLastReceipt({ txn: res.transactionNumber, rcp: res.receiptNumber });
      const updated = await billingService.getInvoices();
      setInvoices(updated);
      setSelectedInvoice(updated.find((i) => i.id === selectedInvoice.id) || null);
      setIsPaymentModalOpen(false);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const getStatusBadge = (status: InvoiceRecord['status']) => {
    switch (status) {
      case 'PAID':
        return <Badge variant="success" dot>Fully Paid</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="info" dot>Partially Paid</Badge>;
      case 'ISSUED':
        return <Badge variant="warning" dot>Issued (Unpaid)</Badge>;
      case 'VOID':
        return <Badge variant="danger" dot>Voided</Badge>;
      case 'DRAFT':
      default:
        return <Badge variant="neutral" dot>Draft</Badge>;
    }
  };

  const totalOutstanding = invoices.reduce((acc, i) => acc + i.balanceDue, 0);
  const totalCollected = invoices.reduce((acc, i) => acc + i.paidAmount, 0);

  const filteredInvoices = statusFilter === 'ALL'
    ? invoices
    : invoices.filter((i) => i.status === statusFilter);

  const tabs = [
    { id: 'invoices', label: 'All Invoices', count: invoices.length },
    { id: 'unpaid', label: 'Unpaid & Outstanding', count: invoices.filter((i) => i.balanceDue > 0).length },
    { id: 'paid', label: 'Settled & Paid', count: invoices.filter((i) => i.status === 'PAID').length },
    { id: 'insurance', label: 'Insurance / TPA Claims', count: invoices.filter((i) => i.insurance).length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Billing & Cashier', href: '/dashboard/billing' }]}
        title="Patient Billing, Invoices & Cashier Desk"
        description="Consolidated consultation, diagnostic lab, procedure, and pharmacy itemized billing"
      />

      {/* Honest State Notice */}
      <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Phase 8 Development Preview:</strong> Consolidated invoice itemization and cashier receipts active in adapter mode. Payment gateway integration will activate with Phase 8 release.
          </span>
        </div>
        <span className="font-mono text-[11px] bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded font-semibold">
          Adapter Mode
        </span>
      </div>

      {/* Financial Overview KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Invoices"
          value={invoices.length}
          subtitle="Consultation & care charges"
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          title="Outstanding Balance"
          value={`₹${totalOutstanding.toLocaleString()}`}
          subtitle="Pending collection"
          icon={<Clock className="w-5 h-5" />}
          trend={{ label: 'Unpaid', positive: false }}
        />
        <StatCard
          title="Total Collections"
          value={`₹${totalCollected.toLocaleString()}`}
          subtitle="Cash, UPI & Card settled"
          icon={<CreditCard className="w-5 h-5" />}
          trend={{ label: 'Verified', positive: true }}
        />
        <StatCard
          title="Insurance Pre-Auth"
          value="1 Claim"
          subtitle="Approved by Star Health TPA"
          icon={<ShieldCheck className="w-5 h-5" />}
          trend={{ label: 'Approved', positive: true }}
        />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Invoices List Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                  <th className="py-3 px-4">Invoice Number</th>
                  <th className="py-3 px-4">Patient (UHID)</th>
                  <th className="py-3 px-4">Department / Doctor</th>
                  <th className="py-3 px-4">Bill Amount</th>
                  <th className="py-3 px-4">Paid Amount</th>
                  <th className="py-3 px-4">Balance Due</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-mono font-bold text-teal-600">
                      {inv.invoiceNumber}
                      <div className="text-[11px] font-normal text-slate-400">
                        {new Date(inv.issuedAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {inv.patientName}
                      </div>
                      <div className="text-xs font-mono text-slate-500">{inv.patientUhid}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>{inv.departmentName || 'Outpatient'}</div>
                      <div className="text-xs text-slate-500">{inv.doctorName}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold">₹{inv.totalAmount}</td>
                    <td className="py-3.5 px-4 font-mono text-emerald-600 font-semibold">
                      ₹{inv.paidAmount}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-rose-600">
                      ₹{inv.balanceDue}
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(inv.status)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {inv.balanceDue > 0 && (
                          <Button
                            variant="clinical"
                            size="sm"
                            leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                            onClick={() => openPaymentModal(inv)}
                          >
                            Collect
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                          onClick={() => openInvoiceDetail(inv)}
                        >
                          Details
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Detail Drawer */}
      {selectedInvoice && (
        <Drawer
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          title={`Invoice ${selectedInvoice.invoiceNumber}`}
          subtitle={`Patient: ${selectedInvoice.patientName} (${selectedInvoice.patientUhid})`}
          width="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs">
                Balance Due:{' '}
                <strong className="text-base text-rose-600 font-mono ml-1">
                  ₹{selectedInvoice.balanceDue}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" leftIcon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
                  Print Statement
                </Button>
                {selectedInvoice.balanceDue > 0 && (
                  <Button
                    variant="clinical"
                    size="sm"
                    leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setIsPaymentModalOpen(true);
                      setPaymentAmount(selectedInvoice.balanceDue);
                    }}
                  >
                    Collect Payment
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-6 text-xs sm:text-sm">
            {/* Demographic row */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Invoice Date:</span>
                <div className="font-semibold">{new Date(selectedInvoice.issuedAt).toLocaleDateString()}</div>
              </div>
              <div>
                <span className="text-slate-500">Payment Status:</span>
                <div>{getStatusBadge(selectedInvoice.status)}</div>
              </div>
              <div>
                <span className="text-slate-500">Consulting Clinician:</span>
                <div>{selectedInvoice.doctorName || 'Outpatient Staff'}</div>
              </div>
              <div>
                <span className="text-slate-500">Department:</span>
                <div className="font-semibold">{selectedInvoice.departmentName || 'Cardiology'}</div>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                Itemized Clinical & Pharmacy Services
              </h4>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 font-semibold border-b">
                    <tr>
                      <th className="py-2.5 px-3">Service Category</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedInvoice.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3">
                          <Badge variant="neutral" size="sm">
                            {item.type}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-medium">{item.description}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono">₹{item.unitPrice}</td>
                        <td className="py-2.5 px-3 text-right font-bold font-mono">₹{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calculations Summary */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal:</span>
                <span className="font-mono font-semibold">₹{selectedInvoice.subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Applicable Hospital GST / Taxes (5%):</span>
                <span className="font-mono">₹{selectedInvoice.taxAmount}</span>
              </div>
              <div className="flex justify-between pt-2 border-t font-bold text-sm">
                <span>Total Bill Amount:</span>
                <span className="font-mono text-teal-600">₹{selectedInvoice.totalAmount}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Paid to Date:</span>
                <span className="font-mono">₹{selectedInvoice.paidAmount}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-bold">
                <span>Net Balance Due:</span>
                <span className="font-mono">₹{selectedInvoice.balanceDue}</span>
              </div>
            </div>

            {/* Insurance pre-auth banner if available */}
            {selectedInvoice.insurance && (
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-xs space-y-1">
                <div className="flex items-center justify-between font-bold text-blue-900 dark:text-blue-200">
                  <span>Insurance Pre-Authorization ({selectedInvoice.insurance.providerName})</span>
                  <Badge variant="info">{selectedInvoice.insurance.claimStatus}</Badge>
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  TPA: {selectedInvoice.insurance.tpaName} &middot; Policy: {selectedInvoice.insurance.policyNumber}
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  Pre-Authorized Cap: <strong className="font-mono">₹{selectedInvoice.insurance.preAuthAmount}</strong>
                </div>
              </div>
            )}
          </div>
        </Drawer>
      )}

      {/* Payment Recording Modal */}
      {isPaymentModalOpen && selectedInvoice && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title="Cashier Payment Settlement (Preview)"
          description={`Record preview settlement for Invoice ${selectedInvoice.invoiceNumber}`}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="clinical"
                size="sm"
                isLoading={isProcessingPayment}
                onClick={handleRecordPayment}
              >
                Record Preview Settlement (Adapter)
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <strong>Payment Integration Pending:</strong> Real-time payment gateway webhooks and POS card terminals are pending Phase 8 backend release. This cashier desk demonstrates the settlement and receipt generation workflow in isolated adapter mode.
            </div>

            <Input
              label="Settlement Amount (₹)"
              type="number"
              required
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value))}
            />
            <Select
              label="Payment Method"
              required
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              options={[
                { value: 'UPI', label: 'UPI (QR / GooglePay / PhonePe)' },
                { value: 'CASH', label: 'Cash Counter' },
                { value: 'CARD', label: 'Credit / Debit Card POS' },
                { value: 'BANK_TRANSFER', label: 'Bank IMPS / NEFT' },
                { value: 'INSURANCE_CLAIM', label: 'Insurance Direct TPA Settlement' },
              ]}
            />
            <Input
              label="Transaction / Authorization Reference"
              placeholder="e.g. UPI/1239810/HDFC or POS Auth Code"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* Receipt Modal */}
      {lastReceipt && (
        <Modal
          isOpen={!!lastReceipt}
          onClose={() => setLastReceipt(null)}
          title="Hospital Payment Receipt (Preview)"
          description="Issued by Cashier Desk · Adapter Simulation Mode"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Print Receipt
              </Button>
              <Button size="sm" onClick={() => setLastReceipt(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Receipt Voucher:</span>
              <span className="font-mono font-bold text-teal-600 dark:text-teal-400">{lastReceipt.rcp}</span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Transaction ID:</span>
              <span className="font-mono text-slate-600 dark:text-slate-400">{lastReceipt.txn}</span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
              <strong>Notice:</strong> This is a development adapter demonstration receipt. No real monetary transaction has taken place. Full merchant settlement will activate upon Phase 8 deployment.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
