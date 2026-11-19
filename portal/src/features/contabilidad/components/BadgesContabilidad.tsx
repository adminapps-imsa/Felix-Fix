import { AlertTriangle, Ban, Bot, Check, CheckCircle2, Clock, XCircle, FileQuestion, Shuffle, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { DecisionLinea, EstadoDocumentoContabilidad, ValidacionDocumento } from '../../../types/contabilidad';

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

/** Igual que el badge de decisión de ProductosSection. `automatica`: lo aprobó el sistema por su tipo, no la compradora. */
export function DecisionBadge({ decision, automatica = false }: { decision: DecisionLinea; automatica?: boolean }) {
  if (!decision) return <span className="text-xs opacity-50">Sin decisión</span>;
  const auto = automatica && decision === 'aprobado';
  return (
    <span
      className={cn('badge-pill', decision === 'aprobado' ? VERDE : ROJO)}
      title={auto ? 'Se aprobó solo por su tipo; la compradora no tuvo que decidirlo' : decision === 'aprobado' ? 'Aprobado por la compradora' : 'Rechazado por la compradora'}
    >
      {auto ? <Bot size={12} /> : decision === 'aprobado' ? <Check size={12} /> : <X size={12} />}
      {auto ? 'Aprobado automáticamente' : decision === 'aprobado' ? 'Aprobado' : 'Rechazado'}
    </span>
  );
}


/** Estado del documento en contabilidad: pendiente o la respuesta del proveedor. */
export function EstadoDocumentoBadge({ estado, compacto = false }: { estado: EstadoDocumentoContabilidad; compacto?: boolean }) {
  if (estado === 'aprobado')
    return (
      <span className={cn('badge-pill', VERDE)} title="El proveedor aprobó">
        <CheckCircle2 size={12} /> {compacto ? 'Aprobado' : 'Aprobado por el proveedor'}
      </span>
    );
  if (estado === 'no_aprobado')
    return (
      <span className={cn('badge-pill', ROJO)} title="El proveedor no aprobó">
        <XCircle size={12} /> {compacto ? 'No aprobado' : 'No aprobado por el proveedor'}
      </span>
    );
  if (estado === 'no_reclamado')
    return (
      <span className={cn('badge-pill', AMBAR)} title="Contabilidad decidió no reclamarlo al proveedor">
        <Ban size={12} /> No reclamado
      </span>
    );
  return (
    <span className={cn('badge-pill', GRIS)} title="Esperando la decisión de contabilidad o la respuesta del proveedor">
      <Clock size={12} /> Pendiente
    </span>
  );
}
