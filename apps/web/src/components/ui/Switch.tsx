import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  return (
    <label
      className={`inline-flex items-center gap-3 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
        />
        <div
          className={`w-10 h-5 rounded-full transition-colors ${
            checked ? 'bg-teal-600 dark:bg-teal-500' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          } shadow-xs`}
        />
      </div>
      {(label || description) && (
        <div>
          {label && (
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {label}
            </div>
          )}
          {description && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {description}
            </div>
          )}
        </div>
      )}
    </label>
  );
};
