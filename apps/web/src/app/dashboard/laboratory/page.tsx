'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Tabs } from '../../../components/ui/Tabs';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  FlaskConical,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Printer,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import {
  laboratoryService,
  LabOrderItem,
} from '../../../lib/api/laboratory.service';

function LaboratoryHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'orders';

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [orders, setOrders] = useState<LabOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Inspecting Order / Result Entry Modal State
  const [selectedOrder, setSelectedOrder] = useState<LabOrderItem | null>(null);
  const [isResultEntryOpen, setIsResultEntryOpen] = useState(false);
  const [resultValues, setResultValues] = useState<Record<string, string>>({});
  const [resultFlags, setResultFlags] = useState<Record<string, 'NORMAL' | 'LOW' | 'HIGH'>>({});
  const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await laboratoryService.getOrders();
        setOrders(data);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleCollectSample = async (orderId: string) => {
    await laboratoryService.collectSample(orderId, 'Venous Whole Blood (EDTA)');
    const updated = await laboratoryService.getOrders();
    setOrders(updated);
    alert('Specimen collected and barcode assigned.');
  };

  const handleStartProcessing = async (orderId: string) => {
    await laboratoryService.startProcessing(orderId);
    const updated = await laboratoryService.getOrders();
    setOrders(updated);
  };

  const openResultEntry = (order: LabOrderItem) => {
    setSelectedOrder(order);
    const vals: Record<string, string> = {};
    const flags: Record<string, any> = {};
    order.tests.forEach((t) => {
      vals[t.code] = t.result || '';
      flags[t.code] = t.flag || 'NORMAL';
    });
    setResultValues(vals);
    setResultFlags(flags);
    setIsResultEntryOpen(true);
  };

  const handleSaveResults = async () => {
    if (!selectedOrder) return;
    const formatted = selectedOrder.tests.map((t) => ({
      code: t.code,
      result: resultValues[t.code] || '0',
      unit: t.unit || 'mg/dL',
      referenceRange: t.referenceRange,
      flag: resultFlags[t.code] || 'NORMAL',
    }));
    await laboratoryService.enterResults(selectedOrder.id, formatted);
    const updated = await laboratoryService.getOrders();
    setOrders(updated);
    setIsResultEntryOpen(false);
    alert('Laboratory test measurements recorded.');
  };

  const handleApproveReport = async (orderId: string) => {
    await laboratoryService.approveResults(orderId, 'Dr. Sunanda Pillai, MD (Pathology)');
    const updated = await laboratoryService.getOrders();
    setOrders(updated);
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder(updated.find((o) => o.id === orderId) || null);
    }
    alert('Pathologist verified & approved diagnostic report.');
  };

  const openReportViewer = (order: LabOrderItem) => {
    setSelectedOrder(order);
    setIsReportViewerOpen(true);
  };

  const getStatusBadge = (status: LabOrderItem['status']) => {
    switch (status) {
      case 'APPROVED':
        return <Badge variant="success" dot>Report Approved</Badge>;
      case 'RESULTS_ENTERED':
        return <Badge variant="purple" dot>Awaiting Sign-off</Badge>;
      case 'PROCESSING':
        return <Badge variant="info" dot>Analyzing</Badge>;
      case 'SAMPLE_COLLECTED':
        return <Badge variant="warning" dot>Specimen Intake</Badge>;
      case 'ORDERED':
      default:
        return <Badge variant="neutral" dot>Order Received</Badge>;
    }
  };

  const tabs = [
    { id: 'orders', label: 'All Orders & Queue', count: orders.length },
    { id: 'specimen', label: 'Specimen Collection', count: orders.filter((o) => o.status === 'ORDERED').length },
    { id: 'processing', label: 'In Analysis', count: orders.filter((o) => o.status === 'PROCESSING').length },
    { id: 'approval', label: 'Pathologist Sign-off', count: orders.filter((o) => o.status === 'RESULTS_ENTERED').length },
    { id: 'completed', label: 'Approved Reports', count: orders.filter((o) => o.status === 'APPROVED').length },
  ];

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'specimen') return o.status === 'ORDERED';
    if (activeTab === 'processing') return o.status === 'SAMPLE_COLLECTED' || o.status === 'PROCESSING';
    if (activeTab === 'approval') return o.status === 'RESULTS_ENTERED';
    if (activeTab === 'completed') return o.status === 'APPROVED';
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Laboratory', href: '/dashboard/laboratory' }]}
        title="Clinical Pathology & Diagnostic Laboratory"
        description="Specimen intake, automated biochemistry analyzers, clinical reference ranges, and pathologist approval"
      />

      {/* Honest State Notice */}
      <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-900/60 text-cyan-900 dark:text-cyan-200 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-600 shrink-0" />
          <span>
            <strong>Laboratory Module Workflow:</strong> Operating in typed clinical adapter mode. Test orders, reference ranges, and pathologist verification adhere to standard diagnostic specifications.
          </span>
        </div>
        <span className="font-mono text-[11px] bg-cyan-100 dark:bg-cyan-900 px-2 py-0.5 rounded font-semibold">
          Adapter Mode
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Orders Today"
          value={orders.length}
          subtitle="All diagnostic requisitions"
          icon={<FlaskConical className="w-5 h-5" />}
        />
        <StatCard
          title="Specimens Awaiting Intake"
          value={orders.filter((o) => o.status === 'ORDERED').length}
          subtitle="Phlebotomy & collection"
          icon={<Clock className="w-5 h-5" />}
          trend={{ label: 'Pending', positive: false }}
        />
        <StatCard
          title="Active Analysis"
          value={orders.filter((o) => o.status === 'PROCESSING').length}
          subtitle="Automated biochemistry"
          icon={<AlertTriangle className="w-5 h-5" />}
          trend={{ label: 'Processing', positive: true }}
        />
        <StatCard
          title="Reports Approved"
          value={orders.filter((o) => o.status === 'APPROVED').length}
          subtitle="Signed by Pathologist"
          icon={<ShieldCheck className="w-5 h-5" />}
          trend={{ label: 'Available', positive: true }}
        />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Orders List Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                  <th className="py-3 px-4">Order Number</th>
                  <th className="py-3 px-4">Patient (UHID)</th>
                  <th className="py-3 px-4">Ordering Doctor</th>
                  <th className="py-3 px-4">Requested Diagnostics</th>
                  <th className="py-3 px-4">Specimen Type</th>
                  <th className="py-3 px-4">Workflow Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-mono font-bold text-teal-600">
                      {order.orderNumber}
                      {order.priority === 'URGENT' && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                          URGENT
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {order.patientName}
                      </div>
                      <div className="text-xs font-mono text-slate-500">
                        {order.patientUhid} ({order.patientAge}y, {order.patientGender})
                      </div>
                    </td>
                    <td className="py-3.5 px-4">{order.doctorName}</td>
                    <td className="py-3.5 px-4 font-medium max-w-xs truncate">
                      {order.tests.map((t) => t.name).join(', ')}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{order.specimenType}</td>
                    <td className="py-3.5 px-4">{getStatusBadge(order.status)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {order.status === 'ORDERED' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleCollectSample(order.id)}
                          >
                            Collect Specimen
                          </Button>
                        )}
                        {order.status === 'SAMPLE_COLLECTED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStartProcessing(order.id)}
                          >
                            Analyze
                          </Button>
                        )}
                        {order.status === 'PROCESSING' && (
                          <Button
                            variant="clinical"
                            size="sm"
                            onClick={() => openResultEntry(order)}
                          >
                            Enter Results
                          </Button>
                        )}
                        {order.status === 'RESULTS_ENTERED' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleApproveReport(order.id)}
                          >
                            Approve & Sign
                          </Button>
                        )}
                        {order.status === 'APPROVED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            onClick={() => openReportViewer(order)}
                          >
                            View Report
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Result Entry Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isResultEntryOpen}
          onClose={() => setIsResultEntryOpen(false)}
          title={`Clinical Result Entry: ${selectedOrder.orderNumber}`}
          description={`Patient: ${selectedOrder.patientName} (${selectedOrder.patientUhid})`}
          maxWidth="2xl"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsResultEntryOpen(false)}>
                Cancel
              </Button>
              <Button variant="clinical" size="sm" onClick={handleSaveResults}>
                Save Test Results
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {selectedOrder.tests.map((test) => (
              <div
                key={test.code}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{test.name}</span>
                  <span className="text-slate-400 font-mono">Ref: {test.referenceRange || 'Standard'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={`Result Value (${test.unit || 'units'})`}
                    value={resultValues[test.code] || ''}
                    onChange={(e) =>
                      setResultValues({ ...resultValues, [test.code]: e.target.value })
                    }
                    placeholder="e.g. 240"
                  />
                  <Select
                    label="Abnormal Clinical Flag"
                    value={resultFlags[test.code] || 'NORMAL'}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setResultFlags({ ...resultFlags, [test.code]: e.target.value as any })
                    }
                    options={[
                      { value: 'NORMAL', label: 'Normal' },
                      { value: 'HIGH', label: 'High (Abnormal)' },
                      { value: 'LOW', label: 'Low (Abnormal)' },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Official Diagnostic Report Viewer Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isReportViewerOpen}
          onClose={() => setIsReportViewerOpen(false)}
          title="Verified Diagnostic Pathology Report"
          description={`${selectedOrder.orderNumber} · Authorized Medical Report`}
          maxWidth="3xl"
          footer={
            <>
              <Button variant="outline" size="sm" leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
                Print Report
              </Button>
              <Button variant="primary" size="sm" onClick={() => setIsReportViewerOpen(false)}>
                Close
              </Button>
            </>
          }
        >
          <div className="space-y-6 text-xs sm:text-sm">
            {/* Header info */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Patient:</span>
                <div className="font-bold">{selectedOrder.patientName}</div>
              </div>
              <div>
                <span className="text-slate-500">UHID:</span>
                <div className="font-mono font-semibold text-teal-600">{selectedOrder.patientUhid}</div>
              </div>
              <div>
                <span className="text-slate-500">Ordered By:</span>
                <div>{selectedOrder.doctorName}</div>
              </div>
              <div>
                <span className="text-slate-500">Verified By:</span>
                <div className="font-semibold text-emerald-600">{selectedOrder.approvedBy || 'Pathologist'}</div>
              </div>
            </div>

            {/* Test Results Table */}
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b">
                  <tr>
                    <th className="py-2.5 px-4">Investigation</th>
                    <th className="py-2.5 px-4">Observed Value</th>
                    <th className="py-2.5 px-4">Reference Range</th>
                    <th className="py-2.5 px-4">Clinical Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedOrder.tests.map((t) => (
                    <tr key={t.code}>
                      <td className="py-3 px-4 font-medium">{t.name}</td>
                      <td className="py-3 px-4 font-bold font-mono">
                        {t.result} {t.unit}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">{t.referenceRange}</td>
                      <td className="py-3 px-4">
                        {t.flag === 'HIGH' ? (
                          <Badge variant="danger">HIGH</Badge>
                        ) : t.flag === 'LOW' ? (
                          <Badge variant="warning">LOW</Badge>
                        ) : (
                          <Badge variant="success">NORMAL</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-slate-400 italic">
              * Electronically verified and released under the authority of Department of Pathology, Metro General Hospital.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function LaboratoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Laboratory Diagnostics...</div>}>
        <LaboratoryHubContent />
      </Suspense>
    </AppShell>
  );
}
