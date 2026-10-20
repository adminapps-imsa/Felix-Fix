import type { LucideIcon } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Lista vacía o pantalla con error, con ícono, una frase clara y (si aplica)
 * la acción que sigue: «No hay reclamos pendientes · Crear reclamo».
 */
export function EstadoVacio({
  icono: Icono,
  titulo,
  texto,
  accion,
  tono = 'neutro',
  className,
}: {
  icono: LucideIcon;
  titulo: string;
  texto?: React.ReactNode;
  accion?: React.ReactNode;
  tono?: 'neutro' | 'error';
  className?: string;
}) {
  return (
    <div role={tono === 'error' ? 'alert' : undefined} className={cn('anim-aparecer flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span className={cn('grid size-14 place-items-center rounded-2xl', tono === 'error' ? 'bg-danger/10 text-danger' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400')}>
        <Icono size={26} aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-semibold">{titulo}</p>
        {texto && <p className="text-sm opacity-65">{texto}</p>}
      </div>
      {accion}
    </div>
  );
}

/** Botón «Reintentar» para un EstadoVacio de error. */
export function BotonReintentar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-400">
      <RefreshCw size={15} aria-hidden /> Reintentar
    </button>
  );
}
