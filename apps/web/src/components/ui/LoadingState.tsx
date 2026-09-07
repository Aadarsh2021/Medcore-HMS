import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  subtext?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading Clinical Records...',
  subtext = 'Synchronizing with MedCore Hospital Information System',
  className = '',
}) => {
  return (
    <div
      className={`p-12 text-center flex flex-col items-center justify-center space-y-3 ${className}`}
    >
      <Loader2 className="w-8 h-8 text-teal-600 dark:text-teal-400 animate-spin" />
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        {message}
      </div>
      {subtext && (
        <div className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
          {subtext}
        </div>
      )}
    </div>
  );
};
