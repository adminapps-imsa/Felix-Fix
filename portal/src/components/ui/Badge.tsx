import React from 'react';
import { AlertTriangle, CalendarX, Droplet, RefreshCcw, Tag, Clock, CheckCircle2, XCircle, Loader2, PackageCheck, Landmark, Lock, FileCheck2, Undo2 } from 'lucide-react';
import type { Estado, Motivo } from '../../types/productoDanado';
import { ESTADO_LABEL, motivoLabel } from '../../types/productoDanado';
import { cn } from '../../lib/cn';

const ESTADO_STYLE: Record<Estado, string> = {
  Pendiente: 'bg-warning/15 text-warning border border-warning/30',
  Devuelto: 'bg-brand-500/10 text-brand-600 dark:text-brand-300 border border-brand-500/30',
  Aprobado: 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/30',
  EnProceso: 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/30',
  Rechazado: 'bg-danger/15 text-danger border border-danger/30',
  NFValidacion: 'bg-danger/10 text-danger border border-danger/30',
  Procesado: 'bg-success/15 text-success border border-success/30',
  EnContabilidad: 'bg-warning/15 text-warning border border-warning/30',
  Cerrado: 'bg-success/15 text-success border border-success/30',
};

const ESTADO_ICON: Record<Estado, React.ReactNode> = {
  Pendiente: <Clock size={12} />,
  Devuelto: <Undo2 size={12} />,
  Aprobado: <CheckCircle2 size={12} />,
  EnProceso: <Loader2 size={12} className="animate-spin" />,
  Rechazado: <XCircle size={12} />,
  NFValidacion: <FileCheck2 size={12} />,
  Procesado: <PackageCheck size={12} />,
  EnContabilidad: <Landmark size={12} />,
  Cerrado: <Lock size={12} />,
};

export function EstadoBadge({ estado }: { estado: Estado }) {
  return (
    <span className={cn('badge-pill', ESTADO_STYLE[estado])}>
      {ESTADO_ICON[estado]}
      {ESTADO_LABEL[estado]}
    </span>
  );
}

// Íconos de los motivos iniciales del catálogo; uno nuevo lleva el genérico.
const MOTIVO_ICON: Record<string, React.ReactNode> = {
  Deterioro: <Droplet size={12} />,
  Daño: <AlertTriangle size={12} />,
  Vencimiento: <CalendarX size={12} />,
  'Cambio / Devolución': <RefreshCcw size={12} />,
};

export function MotivoBadge({ motivo }: { motivo: Motivo }) {
  return (
    <span className="badge-pill border border-brand-500/20 bg-brand-500/10 text-brand-600 dark:text-brand-400">
      {MOTIVO_ICON[motivoLabel(motivo)] ?? <Tag size={12} />}
      {motivoLabel(motivo)}
    </span>
  );
}
