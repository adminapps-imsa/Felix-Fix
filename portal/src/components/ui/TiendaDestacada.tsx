import { Store, Warehouse } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * La tienda del caso, grande y a la vista («Vía España · TD04»), para que la
 * compradora sepa de un vistazo de dónde viene. `cedi`: el caso es del centro
 * de distribución, no de una tienda.
 */
export function TiendaDestacada({ nombre, codigo, cedi = false, className }: { nombre?: string | null; codigo?: string | null; cedi?: boolean; className?: string }) {
  const Icono = cedi ? Warehouse : Store;
  const titulo = cedi ? 'CEDI' : nombre?.trim() || 'Tienda sin indicar';
  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 rounded-2xl border px-3.5 py-2 shadow-sm',
        cedi ? 'border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.05]' : 'border-brand-500/30 bg-brand-500/[0.08]',
        className
      )}
    >
      <span
        aria-hidden
        className={cn('grid size-9 shrink-0 place-items-center rounded-xl', cedi ? 'bg-black/10 dark:bg-white/15' : 'bg-brand-500 text-white dark:bg-brand-400')}
      >
        <Icono size={18} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide opacity-60">{cedi ? 'Centro de distribución' : 'Tienda'}</span>
        <span className="block text-lg font-bold leading-tight">
          {titulo}
          {!cedi && codigo && <span className="ml-2 align-middle text-xs font-semibold opacity-55">{codigo}</span>}
        </span>
      </span>
    </div>
  );
}
