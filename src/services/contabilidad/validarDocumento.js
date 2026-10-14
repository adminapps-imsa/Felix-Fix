// Cruce de las filas de una nota de débito (PDF de SAP) con los productos del
// reclamo. Función pura: no lee archivos ni la BD.
//
// La descripción del PDF y la del Excel del reclamo tienen el mismo formato:
//   15803206513 "TROUSERS BOY, RED, 7
// pero el texto intermedio puede venir recortado distinto ("TROUSERS BO," vs
// "TROUSERS BOY,"). Por eso la clave es número de modelo (8+ dígitos) + talla
// (último segmento después de la última coma).
//
// Otros proveedores usan un código corto al inicio:
//   011756 "MAIA, IVORY NAVY, M      030766-1 "VERSALLES, PEACH, M
// Ahí el mismo código y talla se repite en varios colores, así que la clave
// lleva también el color (el segmento antes de la talla).

const DECISIONES = new Set(['aprobado', 'rechazado']);

const limpiarSegmento = (s) => s.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Clave de cruce "15803206513|7" o "011756|IVORY NAVY|M"; null si la descripción no tiene ese formato. */
export function claveProducto(descripcion) {
  const texto = String(descripcion ?? '').replace(/\s+/g, ' ').trim();
  const segmentos = texto.split(',');
  if (segmentos.length < 2) return null;
  const talla = limpiarSegmento(segmentos[segmentos.length - 1]);
  if (!talla) return null;
  const modelo = texto.match(/(?:^|\D)(\d{8,})(?!\d)/);
  if (modelo) return `${modelo[1]}|${talla}`;
  const codigo = texto.match(/^(\d{4,7}(?:-\d+)?)(?=\s|")/);
  if (!codigo) return null;
  const color = segmentos.length >= 3 ? limpiarSegmento(segmentos[segmentos.length - 2]) : '';
  return `${codigo[1]}|${color}|${talla}`;
}

const mismoNumero = (a, b) => a !== null && b !== null && Math.abs(Number(a) - Number(b)) < 0.0005;
const aNumeroONull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param filas          [{ material, descripcion, cantidad, valor, pagina }] del PDF
 * @param lineasReclamo  [{ LineaId, Posicion, CodigoBarra, Cantidad, Tipo, DescripcionExcel, DecStatus }]
 * @returns {{ lineas: Array<object>, validacion: object }}
 */
export function cruzar(filas, lineasReclamo) {
  const porClave = new Map();
  for (const l of lineasReclamo || []) {
    const k = claveProducto(l.DescripcionExcel);
    if (!k) continue;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(l);
  }

  // Si una clave tiene varias líneas: primero la de la misma cantidad, si no
  // la primera libre (en orden de posición). Nunca se usa dos veces la misma.
  const usadas = new Set();
  const lineas = (Array.isArray(filas) ? filas : []).map((f) => {
    const cantidadPdf = aNumeroONull(f.cantidad);
    const libres = (porClave.get(claveProducto(f.descripcion)) || []).filter((l) => !usadas.has(l.LineaId));
    const linea = libres.find((l) => mismoNumero(l.Cantidad, cantidadPdf)) || libres[0] || null;
    if (linea) usadas.add(linea.LineaId);

    const cantidadReclamo = linea ? aNumeroONull(linea.Cantidad) : null;
    return {
      material: f.material ?? null,
      descripcion: f.descripcion ?? null,
      cantidadPdf,
      valor: aNumeroONull(f.valor),
      lineaId: linea ? Number(linea.LineaId) : null,
      posicion: linea ? Number(linea.Posicion) : null,
      codigoBarra: linea?.CodigoBarra ?? null,
      tipo: linea?.Tipo ?? null,
      decision: linea && DECISIONES.has(linea.DecStatus) ? linea.DecStatus : null,
      cantidadReclamo,
      resultado: !linea ? 'no_en_reclamo' : mismoNumero(cantidadReclamo, cantidadPdf) ? 'ok' : 'cantidad_distinta',
    };
  });

  const contar = (fn) => lineas.filter(fn).length;
  const coinciden = contar((l) => l.resultado === 'ok');
  const noEnReclamo = contar((l) => l.resultado === 'no_en_reclamo');
  const cantidadDistinta = contar((l) => l.resultado === 'cantidad_distinta');
  const enReclamo = lineas.filter((l) => l.lineaId !== null);
  const aprobados = enReclamo.filter((l) => l.decision === 'aprobado').length;
  const rechazados = enReclamo.filter((l) => l.decision === 'rechazado').length;

  let estado = 'ok';
  if (!lineas.length) estado = 'sin_leer';
  else if (noEnReclamo || cantidadDistinta) estado = 'diferencias';

  return {
    lineas,
    validacion: {
      estado,
      coinciden,
      noEnReclamo,
      cantidadDistinta,
      aprobados,
      rechazados,
      sinDecision: enReclamo.length - aprobados - rechazados,
      // Advertencia aparte: una nota con productos aprobados Y rechazados.
      mezclaDecisiones: aprobados > 0 && rechazados > 0,
    },
  };
}
