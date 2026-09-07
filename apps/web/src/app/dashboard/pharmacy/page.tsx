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
import { Drawer } from '../../../components/ui/Drawer';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  Pill,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  FileCheck,
  History,
  ShieldAlert,
  ArrowRight,
  Search,
  Plus,
  Lock,
  Boxes,
} from 'lucide-react';
import {
  pharmacyService,
  PharmacyQueueItem,
  PharmacyBatchItem,
  PharmacyMedicineItem,
  StockMovementItem,
  DispensePlanItem,
} from '../../../lib/api/pharmacy.service';

function PharmacyHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'queue';

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [queue, setQueue] = useState<PharmacyQueueItem[]>([]);
  const [inventory, setInventory] = useState<PharmacyMedicineItem[]>([]);
  const [batches, setBatches] = useState<PharmacyBatchItem[]>([]);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dispensing Workflow State
  const [dispenseTarget, setDispenseTarget] = useState<PharmacyQueueItem | null>(null);
  const [dispensePlan, setDispensePlan] = useState<DispensePlanItem[]>([]);
  const [dispenseStep, setDispenseStep] = useState<1 | 2 | 3 | 4>(1);
  const [isDispensing, setIsDispensing] = useState(false);
  const [dispenseSuccessReceipt, setDispenseSuccessReceipt] = useState<string | null>(null);

  // GRN Receipt Modal State
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [grnSupplier, setGrnSupplier] = useState('Sun Pharma Healthcare Ltd.');
  const [grnInvoice, setGrnInvoice] = useState('INV-SP-2026-9912');
  const [grnMedicine, setGrnMedicine] = useState('med-01');
  const [grnBatchNo, setGrnBatchNo] = useState('ATV-2026-N1');
  const [grnExpiry, setGrnExpiry] = useState('2028-06-30');
  const [grnQuantity, setGrnQuantity] = useState(100);

  // Batch Detail Drawer State
  const [selectedBatch, setSelectedBatch] = useState<PharmacyBatchItem | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [q, inv, b, mov] = await Promise.all([
          pharmacyService.getQueue(),
          pharmacyService.getInventory(),
          pharmacyService.getBatches(),
          pharmacyService.getStockMovements(),
        ]);
        setQueue(q);
        setInventory(inv);
        setBatches(b);
        setMovements(mov);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const openDispenseModal = async (item: PharmacyQueueItem) => {
    setDispenseTarget(item);
    setDispenseStep(1);
    setDispenseSuccessReceipt(null);
    const plan = await pharmacyService.getDispensePlan(item.prescriptionId);
    setDispensePlan(plan);
  };

  const handleConfirmDispense = async () => {
    if (!dispenseTarget) return;
    setIsDispensing(true);
    try {
      const res = await pharmacyService.dispense(dispenseTarget.prescriptionId, dispensePlan);
      setDispenseSuccessReceipt(res.receiptNumber);
      setDispenseStep(4); // Success step
      // Refresh local queue state
      const updatedQueue = await pharmacyService.getQueue();
      setQueue(updatedQueue);
    } finally {
      setIsDispensing(false);
    }
  };

  const handleCreateGrn = async () => {
    await pharmacyService.createStockReceipt({
      supplierName: grnSupplier,
      supplierInvoiceNumber: grnInvoice,
      receivedDate: new Date().toISOString().split('T')[0],
      items: [
        {
          medicineId: grnMedicine,
          medicineName: 'Atorvastatin 20mg',
          batchNumber: grnBatchNo,
          manufacturingDate: '2026-01-01',
          expiryDate: grnExpiry,
          quantity: Number(grnQuantity),
          unitCost: 6.5,
          mrp: 14.5,
        },
      ],
    });
    setIsGrnModalOpen(false);
    const updatedMovements = await pharmacyService.getStockMovements();
    setMovements(updatedMovements);
    alert('Goods Receipt Note (GRN) created and stock movements recorded.');
  };

  const handleToggleQuarantine = async (batchId: string) => {
    await pharmacyService.toggleQuarantine(batchId, 'Quality control hold');
    const updatedBatches = await pharmacyService.getBatches();
    setBatches(updatedBatches);
    if (selectedBatch && selectedBatch.id === batchId) {
      setSelectedBatch(updatedBatches.find((b) => b.id === batchId) || null);
    }
  };

  const pendingCount = queue.filter((q) => q.status === 'PENDING_DISPENSE').length;
  const partialCount = queue.filter((q) => q.status === 'PARTIALLY_DISPENSED').length;
  const lowStockCount = inventory.filter((i) => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK').length;
  const expiringSoonCount = batches.filter((b) => {
    const diffDays = (new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24);
    return diffDays <= 60 && diffDays > 0;
  }).length;

  const tabs = [
    { id: 'queue', label: 'Dispensing Queue', count: queue.length },
    { id: 'inventory', label: 'Medicine Inventory', count: inventory.length },
    { id: 'batches', label: 'Active Batches', count: batches.length },
    { id: 'receipts', label: 'Goods Receipts (GRN)' },
    { id: 'movements', label: 'Stock Ledger (Audit)', count: movements.length },
    { id: 'expiry', label: 'Expiry Monitor', count: expiringSoonCount },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Pharmacy Hub', href: '/dashboard/pharmacy' }]}
        title="Pharmacy Hub & Medication Fulfillment"
        description="Prescription dispensing, FEFO batch allocation engine, and immutable stock ledger"
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsGrnModalOpen(true)}
          >
            New Stock Receipt (GRN)
          </Button>
        }
      />

      {/* Honest State Notice */}
      <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-200 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Phase 7 Development Preview:</strong> FEFO primary / FIFO tie-breaker allocation active. Row-level inventory ledger commits will connect with Phase 7 backend activation.
          </span>
        </div>
        <span className="font-mono text-[11px] bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 rounded font-semibold">
          Adapter Mode
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pending Dispensing"
          value={pendingCount}
          subtitle="Awaiting batch allocation"
          icon={<Clock className="w-5 h-5" />}
          trend={{ label: 'High Priority', positive: false }}
        />
        <StatCard
          title="Partially Dispensed"
          value={partialCount}
          subtitle="Partial fulfillment records"
          icon={<Layers className="w-5 h-5" />}
          trend={{ label: 'Active', positive: true }}
        />
        <StatCard
          title="Low / Out of Stock"
          value={lowStockCount}
          subtitle="At or below reorder level"
          icon={<AlertTriangle className="w-5 h-5" />}
          trend={{ label: 'Attention needed', positive: false }}
        />
        <StatCard
          title="Expiring ≤ 60 Days"
          value={expiringSoonCount}
          subtitle="FEFO priority dispatch"
          icon={<Boxes className="w-5 h-5" />}
          trend={{ label: 'FEFO Monitored', positive: true }}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Dispensing Queue */}
      {activeTab === 'queue' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Prescriptions Awaiting Medication Dispensing</CardTitle>
            <CardDescription>
              Verify prescription lines and allocate batches adhering to FEFO Primary / FIFO Tie-breaker policy
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    <th className="py-3 px-4">Prescription</th>
                    <th className="py-3 px-4">Patient (UHID)</th>
                    <th className="py-3 px-4">Attending Doctor</th>
                    <th className="py-3 px-4">Prescribed Items</th>
                    <th className="py-3 px-4">Fulfillment Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {queue.map((item) => (
                    <tr key={item.prescriptionId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-teal-600">
                          {item.prescriptionNumber}
                        </span>
                        <div className="text-[11px] text-slate-400">
                          {new Date(item.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.patientName}
                        </div>
                        <div className="text-xs font-mono text-slate-500">
                          {item.patientUhid}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div>{item.doctorName}</div>
                        <div className="text-xs text-slate-500">{item.doctorSpecialization}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium">
                          {item.items.map((it) => it.medicineName).join(', ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            item.status === 'DISPENSED'
                              ? 'success'
                              : item.status === 'PARTIALLY_DISPENSED'
                              ? 'info'
                              : 'warning'
                          }
                          dot
                        >
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {item.status !== 'DISPENSED' ? (
                          <Button
                            variant="clinical"
                            size="sm"
                            leftIcon={<Pill className="w-3.5 h-3.5" />}
                            onClick={() => openDispenseModal(item)}
                          >
                            Dispense
                          </Button>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-600 flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Medicine Inventory */}
      {activeTab === 'inventory' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Hospital Pharmacy Drug Formulary & Inventory</CardTitle>
            <CardDescription>Real-time physical stock levels and automatic reorder thresholds</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    <th className="py-3 px-4">Brand & Generic Name</th>
                    <th className="py-3 px-4">Dosage Form</th>
                    <th className="py-3 px-4">Strength</th>
                    <th className="py-3 px-4">Current Stock</th>
                    <th className="py-3 px-4">Reorder Level</th>
                    <th className="py-3 px-4">Active Batches</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inventory.map((med) => (
                    <tr key={med.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {med.name}
                        </div>
                        <div className="text-xs text-slate-500 italic">{med.genericName}</div>
                      </td>
                      <td className="py-3.5 px-4">{med.form}</td>
                      <td className="py-3.5 px-4 font-mono">{med.strength}</td>
                      <td className="py-3.5 px-4 font-bold font-mono">
                        {med.totalStock} units
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{med.reorderLevel} units</td>
                      <td className="py-3.5 px-4">{med.batchCount} batches</td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            med.status === 'IN_STOCK'
                              ? 'success'
                              : med.status === 'LOW_STOCK'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {med.status.replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Active Batches */}
      {activeTab === 'batches' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Batch Tracking & Quarantine Management</CardTitle>
            <CardDescription>Individual manufactured batch records, unit pricing, and quality quarantine holds</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    <th className="py-3 px-4">Batch Number</th>
                    <th className="py-3 px-4">Medicine</th>
                    <th className="py-3 px-4">Mfg Date</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Available Units</th>
                    <th className="py-3 px-4">MRP (₹)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {batch.batchNumber}
                      </td>
                      <td className="py-3.5 px-4 font-medium">{batch.medicineName}</td>
                      <td className="py-3.5 px-4 text-slate-500">{batch.manufacturingDate}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {batch.expiryDate}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-teal-600">
                        {batch.currentQuantity}
                      </td>
                      <td className="py-3.5 px-4 font-mono">₹{batch.mrp}</td>
                      <td className="py-3.5 px-4">
                        {batch.isQuarantined ? (
                          <Badge variant="danger" dot>Quarantined</Badge>
                        ) : (
                          <Badge variant="success" dot>Available</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant={batch.isQuarantined ? 'outline' : 'destructive'}
                          size="sm"
                          onClick={() => handleToggleQuarantine(batch.id)}
                        >
                          {batch.isQuarantined ? 'Release Hold' : 'Quarantine'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Stock Receipts (GRN) */}
      {activeTab === 'receipts' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Goods Receipt Notes (GRN) & Vendor Inward</CardTitle>
              <CardDescription>Verified supplier deliveries and batch inwarding records</CardDescription>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsGrnModalOpen(true)}
            >
              Receive New Consignment
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="font-mono font-bold text-xs text-teal-600">GRN-2026-00014</span>
                <div className="font-semibold text-sm mt-0.5">Sun Pharma Healthcare Ltd. &middot; Inv #SP-99142</div>
                <div className="text-xs text-slate-500">Received 100 units of Atorvastatin 20mg (Batch ATV-2025-A1)</div>
              </div>
              <Badge variant="success">Verified & Inwarded</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 5: Immutable Stock Ledger */}
      {activeTab === 'movements' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              Immutable Pharmacy Stock Movement Ledger
            </CardTitle>
            <CardDescription>Append-only audit trail of every dispensing, receipt, return, and disposal</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Medicine & Batch</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4 text-right">Quantity</th>
                    <th className="py-3 px-4 text-right">Balance After</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Performed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {new Date(mov.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {mov.medicineName}
                        </div>
                        <div className="font-mono text-xs text-slate-500">{mov.batchNumber}</div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={mov.quantity > 0 ? 'success' : 'info'}
                          size="sm"
                        >
                          {mov.movementType}
                        </Badge>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${mov.quantity > 0 ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300'}`}>
                        {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        {mov.balanceAfter}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-teal-600">
                        {mov.referenceNumber}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">{mov.performedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 6: Expiry Management */}
      {activeTab === 'expiry' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Pre-Expiry & Near-Expiry Batch Surveillance
            </CardTitle>
            <CardDescription>
              FEFO monitoring prioritizing consumption of earliest expiring batches before obsolescence
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/30 flex items-center justify-between">
              <div>
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  Batch AMX-2024-X4 (Amoxicillin 500mg)
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Expires on 2026-09-30 (Within 23 days) &middot; 15 units remaining in active stock
                </div>
              </div>
              <Badge variant="warning">FEFO High Priority</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Multi-Step Dispensing Modal */}
      {dispenseTarget && (
        <Modal
          isOpen={!!dispenseTarget}
          onClose={() => setDispenseTarget(null)}
          title={`Dispense Prescription: ${dispenseTarget.prescriptionNumber}`}
          description={`Patient: ${dispenseTarget.patientName} (${dispenseTarget.patientUhid})`}
          maxWidth="2xl"
          footer={
            dispenseStep < 4 ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setDispenseTarget(null)}>
                  Cancel
                </Button>
                {dispenseStep === 1 && (
                  <Button
                    variant="primary"
                    size="sm"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                    onClick={() => setDispenseStep(2)}
                  >
                    Review Requirements
                  </Button>
                )}
                {dispenseStep === 2 && (
                  <Button
                    variant="primary"
                    size="sm"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                    onClick={() => setDispenseStep(3)}
                  >
                    View FEFO Allocation
                  </Button>
                )}
                {dispenseStep === 3 && (
                  <Button
                    variant="clinical"
                    size="sm"
                    isLoading={isDispensing}
                    leftIcon={<CheckCircle2 className="w-4 h-4" />}
                    onClick={handleConfirmDispense}
                  >
                    Confirm Dispense & Deduct Stock
                  </Button>
                )}
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setDispenseTarget(null)}>
                Done
              </Button>
            )
          }
        >
          {dispenseStep === 1 && (
            <div className="space-y-4 text-xs sm:text-sm">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Prescription Reference:</span>
                  <span className="font-mono font-bold text-teal-600">{dispenseTarget.prescriptionNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-semibold">{dispenseTarget.patientName} ({dispenseTarget.patientUhid})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Prescribing Doctor:</span>
                  <span>{dispenseTarget.doctorName} ({dispenseTarget.doctorSpecialization})</span>
                </div>
              </div>
            </div>
          )}

          {dispenseStep === 2 && (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Prescribed Medication Requirements:
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border rounded-xl overflow-hidden">
                {dispenseTarget.items.map((it, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {it.medicineName} ({it.strength})
                      </div>
                      <div className="text-slate-500">{it.form}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-teal-600">
                        {it.remainingQuantity} to dispense
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        Prescribed: {it.prescribedQuantity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dispenseStep === 3 && (
            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200">
                <strong>Recommended Batch Allocation:</strong> Calculated using <em>FEFO Primary (earliest expiry)</em> and <em>FIFO Tie-Breaker</em>.
              </div>

              <div className="space-y-3">
                {dispensePlan.map((planItem, pIdx) => (
                  <div key={pIdx} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                      <span>{planItem.medicineName}</span>
                      <span className="font-mono text-teal-600 font-bold">{planItem.remainingQuantity} units</span>
                    </div>

                    <div className="space-y-1.5 pl-2 border-l-2 border-teal-600">
                      {planItem.allocations.map((alloc, aIdx) => (
                        <div key={aIdx} className="flex items-center justify-between text-[11px]">
                          <span className="font-mono font-medium">
                            Batch: <strong>{alloc.batchNumber}</strong> (Expires: {alloc.expiryDate})
                          </span>
                          <span className="font-bold font-mono text-emerald-600">
                            Allocate: {alloc.allocatedQuantity} units
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Confirming will deduct stock from the assigned batches and record an immutable entry in the inventory ledger.
                </span>
              </div>
            </div>
          )}

          {dispenseStep === 4 && (
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Dispensing Completed Successfully
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Medications have been issued to the patient and inventory ledger updated.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border font-mono text-xs space-y-1">
                <span className="text-slate-400 uppercase text-[10px]">Pharmacy Dispense Receipt</span>
                <div className="text-xl font-bold text-teal-600">{dispenseSuccessReceipt}</div>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* GRN Modal */}
      <Modal
        isOpen={isGrnModalOpen}
        onClose={() => setIsGrnModalOpen(false)}
        title="Create Goods Receipt Note (GRN)"
        description="Record incoming pharmaceutical consignment and assign batch metadata"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsGrnModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateGrn}>
              Confirm Inward Delivery
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Supplier / Distributor Name"
            value={grnSupplier}
            onChange={(e) => setGrnSupplier(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Supplier Invoice Number"
              value={grnInvoice}
              onChange={(e) => setGrnInvoice(e.target.value)}
            />
            <Input
              label="Received Batch Number"
              value={grnBatchNo}
              onChange={(e) => setGrnBatchNo(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              label="Batch Expiry Date"
              value={grnExpiry}
              onChange={(e) => setGrnExpiry(e.target.value)}
            />
            <Input
              type="number"
              label="Received Units Quantity"
              value={grnQuantity}
              onChange={(e) => setGrnQuantity(Number(e.target.value))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function PharmacyPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Pharmacy Hub...</div>}>
        <PharmacyHubContent />
      </Suspense>
    </AppShell>
  );
}
