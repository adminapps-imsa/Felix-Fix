import React from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white shadow-[0_1px_2px_rgba(79,70,229,0.3),0_4px_12px_-2px_rgba(79,70,229,0.35)] hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950 dark:hover:bg-brand-500',
  secondary: 'glass-card hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-400',
  danger: 'bg-danger text-white shadow-[0_1px_2px_rgba(239,68,68,0.3),0_4px_12px_-2px_rgba(239,68,68,0.3)] hover:bg-red-600',
  ghost: 'hover:bg-black/5 dark:hover:bg-white/5',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button
      data-variant={variant}
      className={cn(
        // Al presionar se hunde un poco: confirma que el clic llegó. Sin `transition: all`.
        'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        VARIANT_CLASSES[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
