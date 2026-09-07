import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  id: string;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepItem[];
  activeStepIndex: number;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  activeStepIndex,
  className = '',
}) => {
  return (
    <div className={`w-full flex items-center justify-between gap-2 ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx < activeStepIndex;
        const isCurrent = idx === activeStepIndex;

        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                  isCompleted
                    ? 'bg-teal-600 text-white'
                    : isCurrent
                    ? 'bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-2 border-teal-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
              </div>
              <div className="hidden sm:block">
                <div
                  className={`text-xs font-semibold ${
                    isCurrent
                      ? 'text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {step.label}
                </div>
                {step.description && (
                  <div className="text-[10px] text-slate-400">
                    {step.description}
                  </div>
                )}
              </div>
            </div>

            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 rounded ${
                  idx < activeStepIndex
                    ? 'bg-teal-600'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
