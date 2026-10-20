import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'aviso';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white shadow-[0_1px_2px_rgba(79,70,229,0.3),0_4px_12px_-2px_rgba(79,70,229,0.35)] hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950 dark:hover:bg-brand-500',
  secondary: 'glass-card hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-brand-400',
  danger: 'bg-danger text-white shadow-[0_1px_2px_rgba(239,68,68,0.3),0_4px_12px_-2px_rgba(239,68,68,0.3)] hover:bg-red-600',
  ghost: 'hover:bg-black/5 dark:hover:bg-white/5',
  // Amarillo para lo que hay que atender (devolver o corregir un reclamo): texto oscuro para que se lea.
  aviso:
    'bg-warning text-slate-950 shadow-[0_1px_2px_rgba(180,83,9,0.25),0_6px_16px_-4px_rgba(245,158,11,0.45)] hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300',
};

const TAMANO_CLASSES = {
  normal: 'px-4 py-2 text-sm',
  // Para la acción principal que tiene que verse (más alto, letra más grande).
  grande: 'px-6 py-3 text-base',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /**
   * `cargando`: ruedita en vez del ícono y el botón queda deshabilitado mientras trabaja.
   * `listo`: una palomita breve al terminar (el que llama la quita a los ~1,5 s).
   */
  estado?: 'cargando' | 'listo' | null;
  tamano?: keyof typeof TAMANO_CLASSES;
}

export function Button({ variant = 'primary', tamano = 'normal', className, children, estado, disabled, ...rest }: ButtonProps) {
  // Con estado, el primer ícono que traiga el botón se cambia por la ruedita o la palomita.
  const hijos = React.Children.toArray(children);
  const conIcono = estado && hijos.length > 1 && React.isValidElement(hijos[0]) && typeof hijos[0].type !== 'string';
  const icono =
    estado === 'cargando' ? <Loader2 key="estado" size={15} className="animate-spin" aria-hidden /> : estado === 'listo' ? <Check key="estado" size={15} className="anim-check" aria-hidden /> : null;
  return (
    <button
      data-variant={variant}
      disabled={disabled || estado === 'cargando'}
      aria-busy={estado === 'cargando' || undefined}
      className={cn(
        // Al presionar se hunde un poco: confirma que el clic llegó. Sin `transition: all`.
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        TAMANO_CLASSES[tamano],
        VARIANT_CLASSES[variant],
        className
      )}
      {...rest}
    >
      {icono ? (conIcono ? [icono, ...hijos.slice(1)] : [icono, ...hijos]) : children}
    </button>
  );
}
