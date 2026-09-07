import React from 'react';
import { User, Phone, AlertTriangle, HeartPulse, ShieldAlert } from 'lucide-react';
import { Badge } from './Badge';

export interface PatientBannerProps {
  fullName: string;
  uhid: string;
  age: number;
  gender: string;
  bloodGroup?: string;
  phone?: string;
  allergies?: Array<{ allergen: string; severity: string }>;
  vitalsSummary?: {
    bp?: string;
    pulse?: string;
    temperature?: string;
    spo2?: string;
  };
  className?: string;
}

export const PatientBanner: React.FC<PatientBannerProps> = ({
  fullName,
  uhid,
  age,
  gender,
  bloodGroup,
  phone,
  allergies = [],
  vitalsSummary,
  className = '',
}) => {
  const hasSevereAllergy = allergies.some(
    (a) => a.severity === 'SEVERE' || a.severity === 'CRITICAL',
  );

  return (
    <div
      className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 ${className}`}
    >
      {/* Patient Core ID */}
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/70 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center shrink-0 text-sm">
          {fullName.charAt(0)}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {fullName}
            </h2>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {uhid}
            </span>
            <span className="text-xs text-slate-500">
              {age} yrs &middot; {gender}
            </span>
            {bloodGroup && (
              <Badge variant="danger" size="sm">
                {bloodGroup}
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3">
            {phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" />
                {phone}
              </span>
            )}
            <span>Outpatient General Clinic</span>
          </div>
        </div>
      </div>

      {/* Allergies & Latest Vitals */}
      <div className="flex flex-wrap items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
        {/* Allergies */}
        {allergies.length > 0 && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-50/80 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900">
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-rose-800 dark:text-rose-300">Allergies:</span>{' '}
              <span className="text-rose-700 dark:text-rose-200">
                {allergies.map((a) => a.allergen).join(', ')}
              </span>
            </div>
          </div>
        )}

        {/* Vitals Summary */}
        {vitalsSummary && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
            <HeartPulse className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              BP: {vitalsSummary.bp || '120/80'}
            </span>
            <span className="text-slate-400">&middot;</span>
            <span className="text-slate-600 dark:text-slate-400">
              HR: {vitalsSummary.pulse || '72'} bpm
            </span>
            <span className="text-slate-400">&middot;</span>
            <span className="text-slate-600 dark:text-slate-400">
              SpO2: {vitalsSummary.spo2 || '99'}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
