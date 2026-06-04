import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-on-surface">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            'input-field flex h-11 w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-error focus:ring-error',
            className,
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';
