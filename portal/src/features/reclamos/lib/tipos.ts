import type { StatusReclamo, TipoReclamo } from '../../../types/reclamo';

export const TIPOS: TipoReclamo[] = [
  'faltante_real',
  'sobrante_real',
  'diferencias',
  'danos_textil',
  'danos_perfumeria_cliente',
  'danos_perfumeria_gof',
];

export const TIPO_LABEL: Record<TipoReclamo, string> = {
  faltante_real: 'Faltante Real',
  sobrante_real: 'Sobrante Real',
  diferencias: 'Diferencias',
  danos_textil: 'Daños y Averías — Textil',
  danos_perfumeria_cliente: 'Daños y Averías — Perfumería (cliente devuelve)',
  danos_perfumeria_gof: 'Daños y Averías — Perfumería (detectado en GOF)',
};

export const TIPO_LABEL_CORTO: Record<TipoReclamo, string> = {
  faltante_real: 'Faltante Real',
  sobrante_real: 'Sobrante Real',
  diferencias: 'Diferencias',
  danos_textil: 'Daños Textil',
  danos_perfumeria_cliente: 'Daños Perfumería (cliente)',
  danos_perfumeria_gof: 'Daños Perfumería (GOF)',
};

export const STATUS_LABEL: Record<StatusReclamo, string> = {
  pendiente: 'Pendiente',
  // El valor interno sigue siendo 'resuelto'; solo cambia lo que se ve.
  resuelto: 'Confirmado por compradora',
  rechazado: 'Rechazado',
  notificado: 'Notificado',
};

/** Deben coincidir con TIPOS_AUTO_APROBADOS del backend (src/services/reclamos/tipos.js). */
export const TIPOS_AUTO_APROBADOS = new Set<TipoReclamo>([
  'faltante_real',
  'danos_textil',
  'danos_perfumeria_cliente',
  'danos_perfumeria_gof',
]);
export const TIPOS_SOLO_NOTIFICACION = new Set<TipoReclamo>(['danos_textil', 'danos_perfumeria_gof']);

/** El Excel no distingue subtipos de daños: se comparan por categoría. */
export const categoriaTipo = (t: TipoReclamo | null | undefined) => (t?.startsWith('danos_') ? 'danos' : t ?? null);

/** Orden de los grupos en el detalle: primero lo que requiere decisión manual. */
export function ordenTipo(t: TipoReclamo): number {
  return (TIPOS_AUTO_APROBADOS.has(t) ? 100 : 0) + TIPOS.indexOf(t);
}

export function formatFechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatPrecio(valor: number | null): string {
  if (valor === null || valor === undefined) return '—';
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(valor);
}
