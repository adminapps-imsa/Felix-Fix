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
// lleva también el color (el segmento antes de la talla). El código corto
// también puede ser alfanumérico (con al menos un dígito):
//   OPWB1205 "CAMISA OXFORD, AMPARO BLUE, S      TE2032 "BLUSA, ROSA, M
// o con partes separadas por guion (23294 - NOIR, 2026-11-13):
//   A67-28888 "LADIES 2PCS SET PIJ, BLACK, M     A67-X29121 "LADIES 2PCS SE, OFF WHITE, S
// o solo letras, el nombre del modelo (Steven Madden, REC-000011, 2026-11-13):
//   WANDA "DRESS OPEN, BLACK PU, 9.5
// Solo letras exige la comilla justo después, para no tomar como código la
// primera palabra de una descripción suelta ("TROUSERS BOY, RED, 7").
//
// Desde el 2026-11-19 manda el código de barras: si se tienen los materiales SAP
// de los códigos de barras del reclamo, cada fila se cruza primero por material
// y la descripción queda de respaldo (el Excel puede traer la talla o el color
// mal escritos, p. ej. «KKL» por «XXL» en REC-000021).

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
  // Partes alfanuméricas unidas por guion, con al menos un dígito y 4 a 24 caracteres.
  const conDigito = texto.match(/^((?=[A-Z0-9-]*\d)[A-Z0-9]+(?:-[A-Z0-9]+)*)(?=\s|")/i);
  const soloLetras = texto.match(/^([A-Z]{3,24})(?=\s*")/i);
  const codigo = conDigito && conDigito[1].length >= 4 && conDigito[1].length <= 24 ? conDigito : soloLetras;
  if (!codigo) return null;
  const color = segmentos.length >= 3 ? limpiarSegmento(segmentos[segmentos.length - 2]) : '';
  return `${codigo[1].toUpperCase()}|${color}|${talla}`;
}

const mismoNumero = (a, b) => a !== null && b !== null && Math.abs(Number(a) - Number(b)) < 0.0005;
const aNumeroONull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param filas          [{ material, descripcion, cantidad, valor, pagina }] del PDF
 * @param lineasReclamo  [{ LineaId, Posicion, CodigoBarra, Cantidad, Tipo, DescripcionExcel, DecStatus }]
 * @param materiales     (opcional) Map<código de barras, material SAP> de los productos del
 *                       reclamo: la fila del PDF que no cuadra por descripción se busca por
 *                       material (la descripción del Excel puede venir mal escrita, p. ej.
 *                       talla «KKL» por «XXL» en REC-000021, 2026-11-19).
 * @returns {{ lineas: Array<object>, validacion: object }}
 */
export function cruzar(filas, lineasReclamo, materiales = new Map()) {
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
  const elegir = (candidatas, cantidadPdf) => {
    const libres = candidatas.filter((l) => !usadas.has(l.LineaId));
    const linea = libres.find((l) => mismoNumero(l.Cantidad, cantidadPdf)) || libres[0] || null;
    if (linea) usadas.add(linea.LineaId);
    return linea;
  };
  const lista = Array.isArray(filas) ? filas : [];
  // 1.º por material SAP del código de barras (manda); 2.º, las que no cuadraron, por descripción.
  const elegidas = lista.map(() => null);
  if (materiales.size) {
    lista.forEach((f, i) => {
      if (!f.material) return;
      const m = normMaterial(f.material);
      const candidatas = (lineasReclamo || []).filter((l) => {
        const mat = l.CodigoBarra ? materiales.get(String(l.CodigoBarra).trim()) : null;
        return mat && normMaterial(mat) === m;
      });
      elegidas[i] = elegir(candidatas, aNumeroONull(f.cantidad));
    });
  }
  lista.forEach((f, i) => {
    if (!elegidas[i]) elegidas[i] = elegir(porClave.get(claveProducto(f.descripcion)) || [], aNumeroONull(f.cantidad));
  });
  // Para el mensaje de error: el producto del reclamo sin cruzar con el mismo modelo
  // (código) que la fila que no está, o sea, probablemente la misma prenda mal escrita.
  const modelo = (d) => claveProducto(d)?.split('|')[0] ?? null;
  const parecidoDe = (f) => {
    const m = modelo(f.descripcion);
    if (!m) return null;
    const l = (lineasReclamo || []).find((x) => !usadas.has(x.LineaId) && modelo(x.DescripcionExcel) === m);
    return l ? { posicion: Number(l.Posicion), codigoBarra: l.CodigoBarra ?? null, descripcion: l.DescripcionExcel ?? null } : null;
  };

  const lineas = lista.map((f, i) => {
    const cantidadPdf = aNumeroONull(f.cantidad);
    const linea = elegidas[i];
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
      ...(!linea && { parecido: parecidoDe(f) }),
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

/**
 * Material comparable: el PDF lo trae con un prefijo («345-200032507002») y
 * SAP con ceros a la izquierda («000000200032507002»): se queda lo que va
 * después del último guion, sin ceros a la izquierda. Antes el prefijo hacía
 * que el cruce por material nunca coincidiera.
 */
const normMaterial = (m) => String(m ?? '').trim().toUpperCase().replace(/^.*-/, '').replace(/^0+/, '');

/**
 * Los faltantes deben venir en los 911 (devolución) que se suben al crear el
 * reclamo. El PDF no trae el código de barras: cada faltante se busca por su
 * producto (referencia, color y talla de la descripción, como en el 912) y,
 * si así no aparece, por el material SAP de su código de barras.
 * Las cantidades se comparan por producto (sumando filas repetidas).
 *
 * @param faltantes   [{ posicion, codigoBarra, descripcion, cantidad }]
 * @param filas       filas de los PDF ({ material, descripcion, cantidad })
 * @param materiales  Map<codigoBarra, MATNR> (vacío si SAP no responde)
 * @returns {{ noEstan, cantidadDistinta: [{ lineas, cantidad, cantidad911 }], sinVerificar }}
 */
export function faltantesContra911(faltantes, filas, materiales = new Map()) {
  const sumar = (mapa, k, n) => mapa.set(k, (mapa.get(k) ?? 0) + (Number(n) || 0));
  const porClave = new Map();
  const porMaterial = new Map();
  for (const f of filas || []) {
    const k = claveProducto(f.descripcion);
    if (k) sumar(porClave, k, f.cantidad);
    if (f.material) sumar(porMaterial, normMaterial(f.material), f.cantidad);
  }
  const noEstan = [];
  const sinVerificar = [];
  const grupos = new Map(); // producto -> { lineas, cantidad, cantidad911 }
  for (const l of faltantes || []) {
    const k = claveProducto(l.descripcion);
    const m = l.codigoBarra ? materiales.get(String(l.codigoBarra).trim()) : null;
    let id = null;
    let en911 = 0;
    // Manda el código de barras (material SAP); la descripción del Excel es el respaldo.
    if (m && porMaterial.has(normMaterial(m))) [id, en911] = [`M:${normMaterial(m)}`, porMaterial.get(normMaterial(m))];
    else if (k && porClave.has(k)) [id, en911] = [`K:${k}`, porClave.get(k)];
    if (!id) {
      (k || m ? noEstan : sinVerificar).push(l);
      continue;
    }
    const g = grupos.get(id) ?? { lineas: [], cantidad: 0, cantidad911: en911 };
    g.lineas.push(l);
    g.cantidad += Number(l.cantidad) || 0;
    grupos.set(id, g);
  }
  const cantidadDistinta = [...grupos.values()].filter((g) => !mismoNumero(g.cantidad, g.cantidad911));
  return { noEstan, cantidadDistinta, sinVerificar };
}
