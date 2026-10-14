import { AlertTriangle, Check, CheckCircle2, FileQuestion, Shuffle, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { DecisionLinea, ValidacionDocumento } from '../../../types/contabilidad';

const VERDE = 'border border-success/30 bg-success/15 text-success';
const ROJO = 'border border-danger/30 bg-danger/15 text-danger';
const GRIS = 'border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5';
const AMBAR = 'border border-warning/30 bg-warning/15 text-warning';

export const totalDiferencias = (v: ValidacionDocumento) => v.noEnReclamo + v.cantidadDistinta;

/** Badge del resultado de cruzar el PDF con el reclamo (+ aviso si mezcla aprobados y rechazados). */
/** `compacto`: textos cortos (el completo queda en el tooltip) para que quepan en una fila del listado. */
export function ValidacionBadges({ validacion, className, compacto = false }: { validacion: ValidacionDocumento; className?: string; compacto?: boolean }) {
  const n = totalDiferencias(validacion);
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {validacion.estado === 'ok' && (
        <span className={cn('badge-pill', VERDE)} title={compacto ? 'Cuadra con el reclamo' : undefined}>
          <CheckCircle2 size={12} /> {compacto ? 'Cuadra' : 'Cuadra con el reclamo'}
        </span>
      )}
      {validacion.estado === 'diferencias' && (
        <span className={cn('badge-pill', ROJO)}>
          <AlertTriangle size={12} /> {n} diferencia{n === 1 ? '' : 's'}
        </span>
      )}
      {validacion.estado === 'sin_leer' && (
        <span className={cn('badge-pill', GRIS)} title={compacto ? 'No se pudo leer el PDF' : undefined}>
          <FileQuestion size={12} /> {compacto ? 'PDF sin leer' : 'No se pudo leer el PDF'}
        </span>
      )}
      {validacion.mezclaDecisiones && <MezclaBadge compacto={compacto} />}
    </span>
  );
}

export function MezclaBadge({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className={cn('badge-pill', AMBAR)} title={compacto ? 'Mezcla aprobados y rechazados' : undefined}>
      <Shuffle size={12} /> {compacto ? 'Aprob. y rech.' : 'Mezcla aprobados y rechazados'}
    </span>
  );
}

/** Igual que el badge de decisión de ProductosSection. */
export function DecisionBadge({ decision }: { decision: DecisionLinea }) {
  if (!decision) return <span className="text-xs opacity-50">Sin decisión</span>;
  return (
    <span className={cn('badge-pill', decision === 'aprobado' ? VERDE : ROJO)}>
      {decision === 'aprobado' ? <Check size={12} /> : <X size={12} />}
      {decision === 'aprobado' ? 'Aprobado' : 'Rechazado'}
    </span>
  );
}

