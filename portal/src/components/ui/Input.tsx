import React from 'react';
import { cn } from '../../lib/cn';

const baseClass =
  'w-full rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-current placeholder:opacity-45 hover:border-black/20 dark:hover:border-white/20 focus:border-brand-500/60 focus:bg-white dark:focus:bg-white/[0.07] focus:ring-4 focus:ring-brand-500/15 disabled:opacity-60';

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseClass, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseClass, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseClass, className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * Campo con su rótulo. Casi todo es obligatorio, así que se marca lo opcional
 * (no se llena de asteriscos). `resaltar`: el campo se acaba de llenar solo y
 * destella una vez para mostrar qué cambió.
 */
export function Field({
  label,
  children,
  tag,
  opcional = false,
  resaltar = false,
  className,
}: {
  label: string;
  children: React.ReactNode;
  tag?: React.ReactNode;
  opcional?: boolean;
  resaltar?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm', resaltar && 'campo-auto', className)}>
      <span className="flex items-center gap-1.5">
        <span className="font-medium opacity-85">{label}</span>
        {opcional && <span className="text-xs opacity-50">(opcional)</span>}
        {tag}
      </span>
      {children}
    </label>
  );
}
