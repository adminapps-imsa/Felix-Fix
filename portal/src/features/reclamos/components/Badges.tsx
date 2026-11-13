import { CheckCircle2, Clock, Bell, XCircle, Undo2, Truck, Landmark } from 'lucide-react';
import type React from 'react';
import { cn } from '../../../lib/cn';
import type { Reclamo, StatusReclamo, TipoReclamo } from '../../../types/reclamo';
import { TIPO_LABEL_CORTO, etiquetaStatus, llevaRetiro, formatFechaCorta } from '../lib/tipos';

// Mismos colores que EstadoBadge de Productos Dañados.
const STATUS_STYLE: Record<StatusReclamo, string> = {
  pendiente: 'bg-warning/15 text-warning border border-warning/30',
  notificado: 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/30',
  resuelto: 'bg-success/15 text-success border border-success/30',
  rechazado: 'bg-danger/15 text-danger border border-danger/30',
  // Devuelto a quien lo creó: le toca corregirlo.
  devuelto: 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/30',
};

const STATUS_ICON: Record<StatusReclamo, React.ReactNode> = {
  pendiente: <Clock size={12} />,
  notificado: <Bell size={12} />,
  resuelto: <CheckCircle2 size={12} />,
  rechazado: <XCircle size={12} />,
  devuelto: <Undo2 size={12} />,
};

export function StatusReclamoBadge({
  status,
  devueltoPor,
  decisionBy,
  enviadoContabilidad,
  className,
}: {
  status: StatusReclamo;
  devueltoPor?: string | null;
  decisionBy?: string | null;
  /** Ya se envió a contabilidad (EnviadoContabilidadAt): es lo que se muestra, en vez de la decisión. */
  enviadoContabilidad?: boolean;
  className?: string;
}) {
  if (enviadoContabilidad && (status === 'resuelto' || status === 'rechazado')) {
    return (
      <span
        className={cn('badge-pill border border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300', className)}
        title={status === 'rechazado' ? 'Rechazado por la compradora y enviado a contabilidad' : 'Cerrado y enviado a contabilidad'}
      >
        <Landmark size={12} />
        Enviado a contabilidad
      </span>
    );
  }
  return (
    <span className={cn('badge-pill', STATUS_STYLE[status], className)}>
      {STATUS_ICON[status]}
      {etiquetaStatus(status, devueltoPor, decisionBy)}
    </span>
  );
}

export function TipoBadge({ tipo, count, activo }: { tipo: TipoReclamo; count?: number; activo?: boolean }) {
  return (
    <span
      className={cn(
        'badge-pill border',
        activo
          ? 'border-brand-500 bg-brand-500 text-white dark:bg-brand-400 dark:text-slate-950'
          : 'border-brand-500/20 bg-brand-500/10 text-brand-600 dark:text-brand-400'
      )}
    >
      {TIPO_LABEL_CORTO[tipo]}
      {count !== undefined && <span className="opacity-80">· {count}</span>}
    </span>
  );
}

/**
 * Reclamos que retira el proveedor: entregado (verde, con el día) o esperando
 * al proveedor (todavía no está terminado). En los demás no muestra nada.
 */
export function RetiroBadge({
  reclamo,
  className,
}: {
  reclamo: Pick<Reclamo, 'Tipo' | 'LineasDevolucion' | 'RetiroProveedor' | 'RetiroProveedorFecha'>;
  className?: string;
}) {
  if (!llevaRetiro(reclamo)) return null;
  return reclamo.RetiroProveedorFecha ? (
    <span className={cn('badge-pill border border-success/30 bg-success/15 text-success', className)} title={`Entregado al proveedor el ${formatFechaCorta(reclamo.RetiroProveedorFecha)}`}>
      <Truck size={12} /> Entregado al proveedor
    </span>
  ) : (
    <span className={cn('badge-pill border border-warning/30 bg-warning/15 text-warning', className)} title="El proveedor todavía no se lleva el producto: el reclamo no está terminado">
      <Truck size={12} /> Esperando retiro del proveedor
    </span>
  );
}
