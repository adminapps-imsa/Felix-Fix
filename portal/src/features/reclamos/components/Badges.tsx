import { CheckCircle2, Clock, Bell, XCircle } from 'lucide-react';
import type React from 'react';
import { cn } from '../../../lib/cn';
import type { StatusReclamo, TipoReclamo } from '../../../types/reclamo';
import { STATUS_LABEL, TIPO_LABEL_CORTO } from '../lib/tipos';

// Mismos colores que EstadoBadge de Productos Dañados.
const STATUS_STYLE: Record<StatusReclamo, string> = {
  pendiente: 'bg-warning/15 text-warning border border-warning/30',
  notificado: 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/30',
  resuelto: 'bg-success/15 text-success border border-success/30',
  rechazado: 'bg-danger/15 text-danger border border-danger/30',
};

const STATUS_ICON: Record<StatusReclamo, React.ReactNode> = {
  pendiente: <Clock size={12} />,
  notificado: <Bell size={12} />,
  resuelto: <CheckCircle2 size={12} />,
  rechazado: <XCircle size={12} />,
};

export function StatusReclamoBadge({ status, className }: { status: StatusReclamo; className?: string }) {
  return (
    <span className={cn('badge-pill', STATUS_STYLE[status], className)}>
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
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
