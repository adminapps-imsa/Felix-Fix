import React, { useState } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Sección de un formulario: título, ayuda corta y sus campos. Las secciones se
 * separan con una línea y aire, así el formulario se lee por bloques.
 * `paso`: solo cuando el formulario es una secuencia real (se llena en orden);
 * el número pasa a un visto cuando la sección está completa.
 */
export function SeccionForm({
  titulo,
  ayuda,
  paso,
  completa = false,
  className,
  children,
}: {
  titulo: string;
  ayuda?: React.ReactNode;
  paso?: number;
  completa?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-4 border-t border-black/[0.07] pt-6 first:border-t-0 first:pt-0 dark:border-white/[0.08]', className)}>
      <header className="flex items-start gap-3">
        {paso !== undefined && (
          <span
            aria-hidden
            className={cn(
              'mt-px grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-200',
              completa ? 'bg-success text-white' : 'bg-brand-500/12 text-brand-700 dark:text-brand-300'
            )}
          >
            {/* key: al completarse se monta el visto y entra con su animación. */}
            {completa ? <Check key="ok" size={15} strokeWidth={3} className="anim-check" /> : <span key="n">{paso}</span>}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-semibold leading-snug">
            {titulo}
            {completa && <span className="sr-only"> (completo)</span>}
          </h3>
          {ayuda && <p className="text-sm opacity-60">{ayuda}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * Zona para elegir un archivo: se toca para abrir el selector o se suelta el
 * archivo encima. Al arrastrar encima se ilumina para confirmar que lo recibe.
 */
export function ZonaArchivo({
  icono: Icono,
  titulo,
  ayuda,
  accept,
  multiple = false,
  onArchivos,
  activa = false,
  compacta = false,
  disabled = false,
}: {
  icono: LucideIcon;
  titulo: React.ReactNode;
  ayuda?: React.ReactNode;
  accept: string;
  multiple?: boolean;
  onArchivos: (archivos: File[]) => void;
  /** Ya tiene un archivo: borde sólido de marca en vez de punteado. */
  activa?: boolean;
  compacta?: boolean;
  disabled?: boolean;
}) {
  const [encima, setEncima] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        if (disabled) return;
        const archivos = Array.from(e.dataTransfer.files);
        if (archivos.length) onArchivos(multiple ? archivos : archivos.slice(0, 1));
      }}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-2xl border text-sm transition-[border-color,background-color,box-shadow] duration-150 ease-[var(--ease-out)]',
        'focus-within:ring-4 focus-within:ring-brand-500/15',
        compacta ? 'px-4 py-2.5' : 'px-4 py-4',
        encima
          ? 'border-brand-500 bg-brand-500/10 shadow-[0_0_0_4px] shadow-brand-500/10'
          : activa
            ? 'border-brand-500/40 bg-brand-500/[0.04]'
            : 'border-dashed border-black/20 hover:border-brand-500/50 hover:bg-brand-500/[0.03] dark:border-white/20',
        disabled && 'pointer-events-none opacity-60'
      )}
    >
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-xl transition-transform duration-150 ease-[var(--ease-out)] group-hover:-translate-y-0.5',
          compacta ? 'size-8' : 'size-10',
          encima || activa ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
        )}
      >
        <Icono size={compacta ? 16 : 19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{encima ? 'Suelta el archivo aquí' : titulo}</span>
        {ayuda && <span className="block text-xs opacity-60">{ayuda}</span>}
      </span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const archivos = Array.from(e.target.files || []);
          e.target.value = '';
          if (archivos.length) onArchivos(archivos);
        }}
      />
    </label>
  );
}
