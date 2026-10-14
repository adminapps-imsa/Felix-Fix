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
