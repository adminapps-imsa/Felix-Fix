import { Check, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatFecha } from '../../lib/formatters';

export interface PasoRuta {
  titulo: string;
  estado: 'hecho' | 'actual' | 'pendiente';
  /** Cómo terminó un paso hecho: 'mal' para NF o rechazo. */
  tono?: 'ok' | 'mal';
  fecha?: string | null;
  quien?: string | null;
  /** Texto corto bajo el título (qué falta, a quién le toca). */
  nota?: string | null;
}

/**
 * La ruta de un caso, en orden: qué pasó, con fecha y responsable, y dónde
 * está ahora. Horizontal desde tablet; vertical en celular.
 */
export function RutaCaso({ pasos, className }: { pasos: PasoRuta[]; className?: string }) {
  return (
    <ol className={cn('grid gap-0 sm:auto-cols-fr sm:grid-flow-col sm:gap-2', className)} aria-label="Ruta del caso">
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1;
        // El tramo que sale de este paso va de color si el siguiente ya empezó.
        const tramoHecho = !ultimo && pasos[i + 1].estado !== 'pendiente';
        return (
          <li
            key={p.titulo}
            aria-current={p.estado === 'actual' ? 'step' : undefined}
            className="relative flex gap-3 pb-5 last:pb-0 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
          >
            {!ultimo && (
              <span
                aria-hidden
                className="absolute left-[11px] top-7 bottom-1 w-0.5 overflow-hidden rounded-full bg-black/10 sm:left-[calc(50%+18px)] sm:right-[calc(-50%+10px)] sm:top-[11px] sm:bottom-auto sm:h-0.5 sm:w-auto dark:bg-white/15"
              >
                {/* Tramo recorrido: se dibuja hacia el paso siguiente, uno después del otro. */}
                {tramoHecho && <span className="anim-tramo absolute inset-0 rounded-full bg-brand-500/70" style={{ animationDelay: `${i * 140}ms` }} />}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] grid size-6 shrink-0 place-items-center rounded-full',
                p.estado === 'hecho' && (p.tono === 'mal' ? 'bg-danger text-white' : p.tono === 'ok' ? 'bg-success text-white' : 'bg-brand-500 text-white'),
                // La etapa actual late despacio: es donde está el caso ahora.
                p.estado === 'actual' && 'anim-halo bg-[var(--glass-bg)] ring-2 ring-brand-500',
                p.estado === 'pendiente' && 'bg-[var(--glass-bg)] ring-2 ring-black/10 dark:ring-white/15'
              )}
            >
              {p.estado === 'hecho' && (p.tono === 'mal' ? <X size={14} strokeWidth={3} className="anim-check" /> : <Check size={14} strokeWidth={3} className="anim-check" />)}
              {p.estado === 'actual' && <span className="size-2.5 rounded-full bg-brand-500" />}
            </span>
            <span className="min-w-0 sm:px-1">
              <span className={cn('block text-sm leading-snug', p.estado === 'pendiente' ? 'opacity-50' : 'font-semibold')}>
                {p.titulo}
                {p.estado === 'actual' && <span className="sr-only"> (etapa actual)</span>}
              </span>
              {p.fecha && <span className="block text-xs opacity-65">{formatFecha(p.fecha)}</span>}
              {p.quien && <span className="block text-xs opacity-65">{p.quien}</span>}
              {p.nota && <span className={cn('block text-xs', p.estado === 'actual' ? 'font-semibold text-brand-600 dark:text-brand-400' : 'opacity-65')}>{p.nota}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
