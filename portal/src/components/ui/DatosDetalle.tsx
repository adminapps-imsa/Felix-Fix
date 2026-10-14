import type React from 'react';
import { cn } from '../../lib/cn';

/**
 * Bloque de datos de una pantalla de detalle: título con icono y filas
 * "etiqueta → valor". Se usa en columnas lado a lado, así que todas las filas
 * miden lo mismo y quedan alineadas entre columnas.
 */
export function SeccionDatos({ icono, titulo, className, children }: { icono: React.ReactNode; titulo: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('min-w-0', className)}>
      <h2 className="flex h-6 items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-300">
        {icono}
        {titulo}
      </h2>
      <dl className="divide-y divide-black/5 dark:divide-white/5">{children}</dl>
    </section>
  );
}

/**
 * Una fila "etiqueta → valor". Desde tablet la fila tiene alto fijo y el valor
 * largo se corta con "…" (el texto completo queda en el tooltip); en celular,
 * con una sola columna, baja de línea.
 */
export function Dato({ label, value, mono, title }: { label: string; value: React.ReactNode; mono?: boolean; title?: string }) {
  const vacio = value === null || value === undefined || value === '';
  const tooltip = title ?? (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined);
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 py-1.5 text-sm md:h-10 md:py-0">
      <dt className="shrink-0 opacity-60">{label}</dt>
      <dd
        title={vacio ? undefined : tooltip}
        className={cn(
          'min-w-0 break-words text-right font-semibold md:truncate',
          mono && 'font-mono text-[13px]',
          vacio && 'font-normal opacity-40'
        )}
      >
        {vacio ? '—' : value}
      </dd>
    </div>
  );
}
