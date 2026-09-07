import React from 'react';
import { Stethoscope, Building2, Clock, Award, Phone } from 'lucide-react';
import { Badge } from './Badge';

export interface DoctorBannerProps {
  fullName: string;
  specialization: string;
  departmentName: string;
  licenseNumber: string;
  consultationFee: number;
  opdRoom?: string;
  phone?: string;
  className?: string;
}

export const DoctorBanner: React.FC<DoctorBannerProps> = ({
  fullName,
  specialization,
  departmentName,
  licenseNumber,
  consultationFee,
  opdRoom = 'OPD Room 204',
  phone,
  className = '',
}) => {
  return (
    <div
      className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 ${className}`}
    >
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center shrink-0">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {fullName}
            </h2>
            <Badge variant="info" size="sm">
              {specialization}
            </Badge>
            <span className="font-mono text-xs text-slate-500">
              License: {licenseNumber}
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              {departmentName}
            </span>
            <span>&middot;</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {opdRoom}
            </span>
            {phone && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {phone}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
            Consultation Fee
          </div>
          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
            ₹{consultationFee.toLocaleString()}
          </div>
        </div>
        <div className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
          Active OPD Duty
        </div>
      </div>
    </div>
  );
};
