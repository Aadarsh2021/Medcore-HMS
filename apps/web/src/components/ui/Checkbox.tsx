import React from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  return (
    <label
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
        />
        <div
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            checked
              ? 'bg-teal-600 border-teal-600 text-white'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
          }`}
        >
          {checked && <Check className="w-3 h-3 stroke-[3]" />}
        </div>
      </div>
      {(label || description) && (
        <div className="text-xs">
          {label && (
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              {label}
            </div>
          )}
          {description && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {description}
            </div>
          )}
        </div>
      )}
    </label>
  );
};
