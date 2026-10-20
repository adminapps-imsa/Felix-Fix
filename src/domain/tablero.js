// Reglas puras del Tablero: periodos, series por día/semana/mes, antigüedad
// de lo que espera en cada etapa y tiempos promedio entre etapas. Sin BD ni
// HTTP: el servicio les pasa filas ya leídas.
//
// Los días son de Panamá (UTC-5, sin horario de verano), igual que los
// filtros de fecha del resto del portal.

const OFFSET_PANAMA_MS = 5 * 3600_000;
const DIA_MS = 86_400_000;

/** Periodos que ofrece el Tablero (días hacia atrás). */
export const PERIODOS = [7, 30, 90, 365];
export const PERIODO_DEFECTO = 30;

export function periodoValido(valor) {
  const n = Number(valor);
  return PERIODOS.includes(n) ? n : PERIODO_DEFECTO;
}

/** Cada cuánto se agrupa la serie: por día hasta un mes, por semana hasta un trimestre, por mes el año. */
export const granularidad = (dias) => (dias <= 31 ? 'dia' : dias <= 120 ? 'semana' : 'mes');

/** 'YYYY-MM-DD' del día de Panamá en que cae la fecha. */
export function diaPanama(fecha) {
  return new Date(new Date(fecha).getTime() - OFFSET_PANAMA_MS).toISOString().slice(0, 10);
}

/** Inicio (UTC) del día de Panamá que es `dias` días antes de hoy (incluye hoy: 7 días = hoy y los 6 anteriores). */
export function inicioPeriodo(dias, ahora = new Date()) {
  const hoy = diaPanama(ahora);
  const [y, m, d] = hoy.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - (dias - 1)) + OFFSET_PANAMA_MS);
}

/** Clave del grupo de la serie: el día, el lunes de su semana o el mes. */
function claveGrupo(dia, gran) {
  if (gran === 'dia') return dia;
  if (gran === 'mes') return `${dia.slice(0, 7)}-01`;
  const f = new Date(`${dia}T00:00:00Z`);
  const desdeLunes = (f.getUTCDay() + 6) % 7;
  return new Date(f.getTime() - desdeLunes * DIA_MS).toISOString().slice(0, 10);
}

/**
 * Serie de dos medidas (p. ej. nuevos y cerrados) en grupos consecutivos, sin
 * huecos: un grupo sin movimiento sale en 0. `entradas` y `salidas` son
 * listas de fechas; las anteriores a `desde` no cuentan.
 */
export function serie({ entradas, salidas, desde, ahora = new Date(), gran }) {
  const grupos = new Map();
  const hoy = diaPanama(ahora);
  // Recorre día por día hasta hoy para no saltarse grupos vacíos (tope: un año y algo).
  for (let dia = diaPanama(desde), i = 0; dia <= hoy && i < 400; i++) {
    const clave = claveGrupo(dia, gran);
    if (!grupos.has(clave)) grupos.set(clave, { desde: clave, entradas: 0, salidas: 0 });
    dia = new Date(new Date(`${dia}T00:00:00Z`).getTime() + DIA_MS).toISOString().slice(0, 10);
  }
  const sumar = (fechas, campo) => {
    for (const f of fechas) {
      if (!f || new Date(f) < desde) continue;
      const g = grupos.get(claveGrupo(diaPanama(f), gran));
      if (g) g[campo] += 1;
    }
  };
  sumar(entradas, 'entradas');
  sumar(salidas, 'salidas');
  return [...grupos.values()];
}

/** Rangos de antigüedad (días esperando en la etapa): 0–2, 3–7, 8–14 y 15 o más. */
export const RANGOS_ANTIGUEDAD = [
  { id: 'r0', etiqueta: '0–2 días', hasta: 3 },
  { id: 'r1', etiqueta: '3–7 días', hasta: 8 },
  { id: 'r2', etiqueta: '8–14 días', hasta: 15 },
  { id: 'r3', etiqueta: '15 días o más', hasta: Infinity },
];

export const diasEntre = (desde, hasta) => Math.max(0, (new Date(hasta).getTime() - new Date(desde).getTime()) / DIA_MS);

/**
 * Lo que espera en una etapa: cuántos, cuántos por rango de antigüedad,
 * promedio de días y los más antiguos. Cada item trae `entrada` (cuándo llegó
 * a la etapa); el resto de sus campos pasa tal cual a `masAntiguos`.
 */
export function resumirCola(items, { ahora = new Date(), top = 5 } = {}) {
  const conDias = items
    .filter((i) => i.entrada)
    .map((i) => ({ ...i, dias: diasEntre(i.entrada, ahora) }))
    .sort((a, b) => b.dias - a.dias);
  const rangos = RANGOS_ANTIGUEDAD.map((r) => ({ id: r.id, etiqueta: r.etiqueta, n: 0 }));
  for (const i of conDias) rangos[RANGOS_ANTIGUEDAD.findIndex((r) => i.dias < r.hasta)].n += 1;
  const total = conDias.length;
  return {
    total,
    rangos,
    promedioDias: total ? redondear(conDias.reduce((s, i) => s + i.dias, 0) / total) : null,
    maxDias: total ? redondear(conDias[0].dias) : null,
    masAntiguos: conDias.slice(0, top).map((i) => ({ ...i, dias: Math.floor(i.dias) })),
  };
}

const redondear = (n) => Math.round(n * 10) / 10;

/**
 * Promedio de días de un tramo (de `inicio` a `fin`), contando solo los que
 * terminaron dentro del periodo. Devuelve { n, promedioDias } (null si no hubo).
 */
export function promedioTramo(pares, desde) {
  const validos = pares.filter((p) => p.inicio && p.fin && new Date(p.fin) >= desde && new Date(p.fin) >= new Date(p.inicio));
  if (!validos.length) return { n: 0, promedioDias: null };
  // Con tres decimales: un tramo de horas no debe quedar en «0 días» (el portal lo muestra en horas).
  const promedio = validos.reduce((s, p) => s + diasEntre(p.inicio, p.fin), 0) / validos.length;
  return { n: validos.length, promedioDias: Math.round(promedio * 1000) / 1000 };
}

/** Top `n` de un conteo por categoría; el resto se junta en «Otros» para no cortar el total. */
export function topConOtros(filas, n = 6) {
  const orden = [...filas].filter((f) => f.n > 0).sort((a, b) => b.n - a.n || String(a.etiqueta).localeCompare(String(b.etiqueta)));
  if (orden.length <= n + 1) return orden;
  const resto = orden.slice(n);
  return [
    ...orden.slice(0, n),
    { etiqueta: `Otros (${resto.length})`, n: resto.reduce((s, f) => s + f.n, 0), otros: true, ...sumaCampo(resto, 'unidades'), ...sumaCampo(resto, 'monto') },
  ];
}

function sumaCampo(filas, campo) {
  return filas.some((f) => f[campo] != null) ? { [campo]: filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0) } : {};
}
