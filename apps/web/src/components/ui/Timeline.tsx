import React from 'react';

export interface TimelineItem {
  id: string;
  title: string;
  timestamp: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ items, className = '' }) => {
  return (
    <div className={`relative pl-6 space-y-6 ${className}`}>
      {/* Vertical Track line */}
      <div className="absolute top-2 bottom-2 left-2.5 w-0.5 bg-slate-200 dark:bg-slate-800" />

      {items.map((item) => (
        <div key={item.id} className="relative flex items-start gap-4 group">
          {/* Node Icon/Bullet */}
          <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-2 border-teal-600 dark:border-teal-400 flex items-center justify-center shrink-0 z-10 shadow-xs">
            {item.icon ? (
              <div className="w-2.5 h-2.5 text-teal-600 dark:text-teal-400">
                {item.icon}
              </div>
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400" />
            )}
          </div>

          <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {item.title}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {item.timestamp}
              </span>
            </div>
            {item.description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {item.description}
              </p>
            )}
            {item.badge && <div className="mt-2">{item.badge}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};
