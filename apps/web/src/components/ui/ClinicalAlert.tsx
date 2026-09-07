import React from 'react';
import { ShieldAlert, AlertOctagon, HeartCrack, Zap } from 'lucide-react';

export type ClinicalAlertSeverity = 'MODERATE' | 'SEVERE' | 'CRITICAL_PANIC';

interface ClinicalAlertProps {
  severity: ClinicalAlertSeverity;
  type: 'ALLERGY' | 'DRUG_INTERACTION' | 'PANIC_LAB' | 'FALL_RISK';
  title: string;
  description: string;
  actionRequired?: string;
  className?: string;
}

export const ClinicalAlert: React.FC<ClinicalAlertProps> = ({
  severity,
  type,
  title,
  description,
  actionRequired,
  className = '',
}) => {
  const isPanic = severity === 'CRITICAL_PANIC' || severity === 'SEVERE';

  const getIcon = () => {
    switch (type) {
      case 'ALLERGY':
        return <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />;
      case 'DRUG_INTERACTION':
        return <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />;
      case 'PANIC_LAB':
        return <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 animate-pulse" />;
      case 'FALL_RISK':
        return <HeartCrack className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />;
    }
  };

  return (
    <div
      className={`p-3.5 rounded-xl border flex items-start gap-3 ${
        isPanic
          ? 'bg-rose-50/90 dark:bg-rose-950/70 border-rose-300 dark:border-rose-900 text-rose-950 dark:text-rose-100 shadow-sm'
          : 'bg-amber-50/90 dark:bg-amber-950/70 border-amber-300 dark:border-amber-900 text-amber-950 dark:text-amber-100'
      } ${className}`}
    >
      {getIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/70 dark:bg-black/40 border text-slate-800 dark:text-slate-200">
            {type.replace('_', ' ')}
          </span>
          <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
            {severity.replace('_', ' ')}
          </span>
        </div>
        <div className="text-sm font-semibold mt-1">{title}</div>
        <div className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">{description}</div>
        {actionRequired && (
          <div className="text-[11px] font-medium text-rose-800 dark:text-rose-300 mt-1.5 flex items-center gap-1.5">
            <span className="underline">Required Clinical Action:</span> {actionRequired}
          </div>
        )}
      </div>
    </div>
  );
};
