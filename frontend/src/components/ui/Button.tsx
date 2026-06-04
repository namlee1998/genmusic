import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility to merge tailwind classes safely
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ButtonVariant = 'primary' | 'toolbar' | 'ghost' | 'utility' | 'outline';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-primary to-primary-container text-white rounded-xl font-headline font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100',
  toolbar:
    'h-9 w-9 rounded-xl border border-outline-variant/30 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-highest transition-colors flex items-center justify-center disabled:opacity-50',
  ghost:
    'w-full flex items-center px-3 py-2 hover:bg-surface-container-highest text-left transition-colors disabled:opacity-50',
  utility: 'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50',
  outline:
    'flex items-center justify-center border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low rounded-xl transition-all disabled:opacity-50',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  className,
  children,
  ...props
}) => {
  return (
    <button
      className={cn('flex items-center justify-center gap-2', variantClasses[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
};
