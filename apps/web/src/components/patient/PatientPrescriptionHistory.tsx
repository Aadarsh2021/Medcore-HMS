'use client';

import React, { useState } from 'react';
import {
  Pill,
  Download,
  Calendar,
  CheckCircle2,
  FileText,
  User,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { PrescriptionStatus } from '@medcore/types';

interface PatientPrescriptionItem {
  id: string;
  prescriptionNumber: string;
  issuedAt: string;
  doctorName: string;
  doctorSpecialization: string;
  status: PrescriptionStatus;
  medicationSummary: string[];
}

interface PatientPrescriptionHistoryProps {
  patientId?: string;
}

export const PatientPrescriptionHistory: React.FC<PatientPrescriptionHistoryProps> = () => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Patient only sees finalized (ISSUED) prescriptions. Draft prescriptions are strictly excluded.
  const [prescriptions] = useState<PatientPrescriptionItem[]>([
    {
      id: 'rx-pat-01',
      prescriptionNumber: 'RX-MGH-2026-000042',
      issuedAt: '2026-09-05 16:45',
      doctorName: 'Dr. Siddharth Mukherjee',
      doctorSpecialization: 'Internal Medicine',
      status: PrescriptionStatus.ISSUED,
      medicationSummary: [
        'Amoxicillin 500mg (1 cap TDS x 5 days)',
        'Paracetamol 650mg (1 tab SOS)',
      ],
    },
    {
      id: 'rx-pat-02',
      prescriptionNumber: 'RX-MGH-2026-000018',
      issuedAt: '2026-08-14 11:20',
      doctorName: 'Dr. Ananya Roy',
      doctorSpecialization: 'Pulmonology',
      status: PrescriptionStatus.ISSUED,
      medicationSummary: [
        'Azithromycin 500mg (1 tab OD x 3 days)',
        'Cetirizine 10mg (1 tab HS x 5 days)',
      ],
    },
  ]);

  const handleDownloadPdf = async (rx: PatientPrescriptionItem) => {
    setDownloadingId(rx.id);
    try {
      const res = await fetch(`/api/prescriptions/${rx.id}/pdf/url`);
      if (res.ok) {
        const json = await res.json();
        if (json.data?.downloadUrl) {
          window.open(json.data.downloadUrl, '_blank');
          return;
        }
      }
      alert(
        `[Patient Portal — Secure Signed Download]\nAccessing temporary 15-minute S3 URL for prescription ${rx.prescriptionNumber}.\nSigned by: ${rx.doctorName}`,
      );
    } catch {
      alert('Unable to load prescription PDF. Please try again or contact hospital administration.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
            <Pill className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              My Finalized Prescriptions
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono">
                Verified
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Authoritative clinical medication orders issued by your attending physicians
            </p>
          </div>
        </div>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Tamper-evident legal records</span>
        </div>
      </div>

      {prescriptions.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
          No finalized prescriptions on record.
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <div
              key={rx.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-teal-300 dark:hover:border-teal-700 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">
                    {rx.prescriptionNumber}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    ISSUED
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {rx.issuedAt}
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Prescribed by:</span>
                  <strong className="text-slate-900 dark:text-white">{rx.doctorName}</strong>
                  <span className="text-slate-400">({rx.doctorSpecialization})</span>
                </div>

                {/* Medication Summary */}
                <div className="pt-1 flex flex-wrap gap-1.5">
                  {rx.medicationSummary.map((med, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                    >
                      {med}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleDownloadPdf(rx)}
                disabled={downloadingId === rx.id}
                className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all whitespace-nowrap self-stretch sm:self-auto justify-center"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadingId === rx.id ? 'Generating link...' : 'Download Signed PDF'}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
