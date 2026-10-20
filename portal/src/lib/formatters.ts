// Día/mes/año en hora de Panamá. 'es-PA' da mes/día (10/09/26 = 9 de octubre),
// que chocaba con las fechas dd/mm/aaaa del resto del portal.
const FECHA_HORA = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'America/Panama',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatFecha(iso: string): string {
  return FECHA_HORA.format(new Date(iso)).replace(',', '');
}

export function formatCantidad(valor: number): string {
  return new Intl.NumberFormat('es-PA').format(valor);
}

/** «menos de 1 h», «6 h», «2,5 días», «12 días». */
export function formatDuracion(dias: number | null) {
  if (dias === null) return '—';
  const horas = dias * 24;
  if (horas < 1) return 'menos de 1 h';
  if (horas < 24) return `${Math.round(horas)} h`;
  const n = new Intl.NumberFormat('es-PA', { maximumFractionDigits: dias < 10 ? 1 : 0 }).format(dias);
  return `${n} ${dias === 1 ? 'día' : 'días'}`;
}
