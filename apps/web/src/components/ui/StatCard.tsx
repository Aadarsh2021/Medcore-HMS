import React from 'react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    label: string;
    positive?: boolean;
  };
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  onClick,
  className = '',
}) => {
  return (
    <div
      onClick={onClick}
      className={`p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all ${
        onClick
          ? 'cursor-pointer hover:shadow-md hover:border-teal-300 dark:hover:border-teal-700/60'
          : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
        <span className="text-xs uppercase tracking-wider font-semibold">
          {title}
        </span>
        {icon && <div className="text-teal-600 dark:text-teal-400">{icon}</div>}
      </div>
      <div className="text-2xl font-bold mt-2 text-slate-900 dark:text-white">
        {value}
      </div>
      <div className="flex items-center justify-between mt-1 text-xs">
        {subtitle && (
          <span className="text-slate-500 dark:text-slate-400 truncate">
            {subtitle}
          </span>
        )}
        {trend && (
          <span
            className={`font-semibold shrink-0 ${
              trend.positive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
};
