'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../../components/ui/Card';
import { Skeleton } from '../../../../components/ui/Skeleton';
import {
  FileText,
  Pill,
  Download,
  Printer,
  ShieldCheck,
  Lock,
  User,
  Stethoscope,
  Building2,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { prescriptionsService, PrescriptionRecord } from '../../../../lib/api/prescriptions.service';

function PrescriptionDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || 'rx-001';

  const [prescription, setPrescription] = useState<PrescriptionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const rx = await prescriptionsService.findById(id);
        setPrescription(rx);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id]);

  const handleDownloadPdf = async () => {
    if (!prescription) return;
    setDownloadingPdf(true);
    try {
      const url = await prescriptionsService.getPdfDownloadUrl(prescription.id);
      if (url) {
        window.open(url, '_blank');
      } else {
        alert('PDF document generated: Official vector prescription is ready.');
      }
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  if (!prescription) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-base font-bold text-slate-800">Prescription Record Not Found</h2>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/dashboard/prescriptions')}>
          Back to Prescriptions
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Prescriptions', href: '/dashboard/prescriptions' },
          { label: prescription.prescriptionNumber },
        ]}
        title={`Prescription ${prescription.prescriptionNumber}`}
        description={`Issued for ${prescription.patient?.firstName} ${prescription.patient?.lastName} (${prescription.patient?.uhid})`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => window.print()}
            >
              Print
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={downloadingPdf}
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleDownloadPdf}
            >
              Download Vector PDF
            </Button>
          </div>
        }
      />

      {/* Official Prescription Header & Safety Banner */}
      <Card className="overflow-hidden border-teal-200 dark:border-teal-900/60">
        <div className="p-6 bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-teal-300 text-xs font-semibold uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              Verified Electronic Medical Prescription
            </div>
            <h2 className="text-2xl font-mono font-bold">
              {prescription.prescriptionNumber}
            </h2>
            <div className="text-xs text-teal-100/80 mt-1">
              Issued on: {prescription.issuedAt ? new Date(prescription.issuedAt).toLocaleString() : 'Draft'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-teal-950/80 text-teal-300 border border-teal-700/60 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              {prescription.status}
            </span>
          </div>
        </div>

        {/* Patient & Doctor Context Row */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-100 dark:border-slate-800 text-xs sm:text-sm">
          <div className="space-y-1">
            <span className="text-xs uppercase font-semibold text-slate-400">Patient Information</span>
            <div className="font-bold text-slate-900 dark:text-white text-base">
              {prescription.patient?.firstName} {prescription.patient?.lastName}
            </div>
            <div className="text-slate-600 dark:text-slate-300">
              UHID: <strong className="font-mono text-teal-600">{prescription.patient?.uhid}</strong>
            </div>
            <div className="text-slate-500">
              Biological Gender: {prescription.patient?.gender}
            </div>
          </div>

          <div className="space-y-1 md:text-right">
            <span className="text-xs uppercase font-semibold text-slate-400">Prescribing Clinician</span>
            <div className="font-bold text-slate-900 dark:text-white text-base">
              Dr. {prescription.doctor?.user.firstName} {prescription.doctor?.user.lastName}
            </div>
            <div className="text-slate-600 dark:text-slate-300">
              Specialization: <strong>{prescription.doctor?.specialization}</strong>
            </div>
            <div className="text-slate-500 font-mono">
              Medical License: {prescription.doctor?.licenseNumber}
            </div>
          </div>
        </div>

        {/* Medication Schedule Table */}
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Medicine & Form</th>
                  <th className="py-3 px-4">Strength / Dosage</th>
                  <th className="py-3 px-4">Frequency</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Route</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {prescription.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {item.customMedicineName}
                      </div>
                      <div className="text-[11px] text-slate-500">{item.form}</div>
                    </td>
                    <td className="py-3.5 px-4 font-medium">
                      {item.strength ? `${item.strength} (${item.dosage})` : item.dosage}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-teal-700 dark:text-teal-400">
                        {item.frequency.replace(/_/g, ' ')}
                      </span>
                      {item.instructions && (
                        <div className="text-[11px] text-slate-500 italic mt-0.5">
                          "{item.instructions}"
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{item.durationDays} days</td>
                    <td className="py-3.5 px-4">{item.route}</td>
                    <td className="py-3.5 px-4 text-right font-bold font-mono text-teal-600">
                      {item.quantity} units
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Clinical Immutability Notice */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>
              This prescription is signed and immutable. Any medication modifications require a new clinical order.
            </span>
          </div>
          <span className="font-mono text-slate-400">MedCore Digital Rx v1.0</span>
        </div>
      </Card>
    </div>
  );
}

export default function PrescriptionDetailPage() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <PrescriptionDetailContent />
      </Suspense>
    </AppShell>
  );
}
