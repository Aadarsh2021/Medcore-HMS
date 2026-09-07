import React from 'react';

export type StatusBadgeVariant =
  | 'SCHEDULED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_DISPENSED'
  | 'DISPENSED'
  | 'ORDERED'
  | 'SAMPLE_COLLECTED'
  | 'PROCESSING'
  | 'RESULTS_ENTERED'
  | 'APPROVED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'VOID'
  | 'NORMAL'
  | 'LOW'
  | 'HIGH'
  | 'CRITICAL'
  | 'ACTIVE'
  | 'SUSPENDED';

interface StatusBadgeProps {
  status: string;
  size?: 'xs' | 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'sm',
  showDot = true,
  className = '',
}) => {
  const normalized = status.toUpperCase().replace(/\s+/g, '_');

  const getStyle = (s: string) => {
    switch (s) {
      case 'CONFIRMED':
      case 'APPROVED':
      case 'DISPENSED':
      case 'COMPLETED':
      case 'PAID':
      case 'NORMAL':
      case 'ACTIVE':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/60',
          text: 'text-emerald-700 dark:text-emerald-300',
          border: 'border-emerald-200 dark:border-emerald-800',
          dot: 'bg-emerald-500',
        };
      case 'IN_PROGRESS':
      case 'PROCESSING':
      case 'PARTIALLY_DISPENSED':
      case 'PARTIALLY_PAID':
      case 'SAMPLE_COLLECTED':
      case 'CHECKED_IN':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/60',
          text: 'text-amber-700 dark:text-amber-300',
          border: 'border-amber-200 dark:border-amber-800',
          dot: 'bg-amber-500',
        };
      case 'SCHEDULED':
      case 'ORDERED':
      case 'ISSUED':
      case 'DRAFT':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/60',
          text: 'text-blue-700 dark:text-blue-300',
          border: 'border-blue-200 dark:border-blue-800',
          dot: 'bg-blue-500',
        };
      case 'RESULTS_ENTERED':
      case 'LOW_STOCK':
      case 'HIGH':
        return {
          bg: 'bg-indigo-50 dark:bg-indigo-950/60',
          text: 'text-indigo-700 dark:text-indigo-300',
          border: 'border-indigo-200 dark:border-indigo-800',
          dot: 'bg-indigo-500',
        };
      case 'CANCELLED':
      case 'VOID':
      case 'SUSPENDED':
      case 'CRITICAL':
      case 'OUT_OF_STOCK':
      case 'EXPIRED':
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/60',
          text: 'text-rose-700 dark:text-rose-300',
          border: 'border-rose-200 dark:border-rose-800',
          dot: 'bg-rose-500',
        };
      default:
        return {
          bg: 'bg-slate-50 dark:bg-slate-800',
          text: 'text-slate-700 dark:text-slate-300',
          border: 'border-slate-200 dark:border-slate-700',
          dot: 'bg-slate-400',
        };
    }
  };

  const style = getStyle(normalized);

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2.5 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  }[size];

  const formattedLabel = status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${style.bg} ${style.text} ${style.border} ${sizeClasses} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />}
      <span>{formattedLabel}</span>
    </span>
  );
};
