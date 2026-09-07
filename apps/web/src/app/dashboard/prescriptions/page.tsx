'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { FileText, Pill, Download, Eye, Stethoscope, ArrowRight } from 'lucide-react';
import { prescriptionsService, PrescriptionRecord } from '../../../lib/api/prescriptions.service';
import { PrescriptionStatus } from '@medcore/types';

export default function PrescriptionsPage() {
  const router = useRouter();
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    async function load() {
      try {
        const rxs = await prescriptionsService.list();
        setPrescriptions(rxs);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const getStatusBadge = (status: PrescriptionStatus) => {
    switch (status) {
      case PrescriptionStatus.ISSUED:
        return <Badge variant="success" dot>Issued (Active)</Badge>;
      case PrescriptionStatus.DISPENSED:
        return <Badge variant="info" dot>Dispensed</Badge>;
      case PrescriptionStatus.CANCELLED:
        return <Badge variant="danger" dot>Cancelled</Badge>;
      case PrescriptionStatus.DRAFT:
      default:
        return <Badge variant="neutral" dot>Draft</Badge>;
    }
  };

  const filtered = statusFilter === 'ALL'
    ? prescriptions
    : prescriptions.filter((r) => r.status === statusFilter);

  const columns: Column<PrescriptionRecord>[] = [
    {
      header: 'Rx Number',
      accessorKey: 'prescriptionNumber',
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
          {row.prescriptionNumber}
        </span>
      ),
    },
    {
      header: 'Patient Details',
      cell: (row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">
            {row.patient?.firstName} {row.patient?.lastName}
          </div>
          <div className="text-xs font-mono text-slate-500">
            {row.patient?.uhid}
          </div>
        </div>
      ),
    },
    {
      header: 'Prescribing Doctor',
      cell: (row) => (
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-200">
            Dr. {row.doctor?.user.firstName} {row.doctor?.user.lastName}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Lic: {row.doctor?.licenseNumber}
          </div>
        </div>
      ),
    },
    {
      header: 'Prescribed Medications',
      cell: (row) => (
        <div className="text-xs space-y-0.5 max-w-xs truncate">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {row.items.map((i) => `${i.customMedicineName} (${i.strength || i.dosage})`).join(', ')}
          </span>
          <div className="text-[11px] text-slate-400">
            {row.items.length} clinical line items
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (row) => getStatusBadge(row.status),
    },
    {
      header: 'Issued Date',
      cell: (row) => (
        <span className="text-xs text-slate-500">
          {row.issuedAt ? new Date(row.issuedAt).toLocaleDateString() : 'Drafting'}
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Eye className="w-3.5 h-3.5" />}
            onClick={() => router.push(`/dashboard/prescriptions/detail?id=${row.id}`)}
          >
            View Rx
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="w-3.5 h-3.5 text-teal-600" />}
            onClick={() => router.push(`/dashboard/prescriptions/detail?id=${row.id}`)}
            title="Download Vector PDF"
          >
            PDF
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[{ label: 'Prescriptions', href: '/dashboard/prescriptions' }]}
        title="Clinical Medication Orders & Prescriptions"
        description="Official outpatient and discharge electronic prescriptions with verifiable vector PDF records"
        actions={
          <Button
            variant="primary"
            leftIcon={<Stethoscope className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/clinical')}
          >
            New Clinical Order (Encounter)
          </Button>
        }
      />

      <DataTable
        data={filtered}
        columns={columns}
        keyExtractor={(r) => r.id}
        searchPlaceholder="Search prescriptions by Rx number, patient UHID, or medicine..."
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/prescriptions/detail?id=${r.id}`)}
        emptyTitle="No prescriptions recorded"
        emptyDescription="Clinical prescriptions will appear here once finalized by an attending doctor."
        filters={
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
            {['ALL', 'ISSUED', 'DISPENSED', 'VOID'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 font-semibold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        }
      />
    </AppShell>
  );
}
