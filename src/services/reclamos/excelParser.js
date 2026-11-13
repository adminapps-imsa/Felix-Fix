import * as XLSX from 'xlsx';

/**
 * Parseo de las plantillas Excel de reclamos ("Tienda" y "CEDI").
 *
 * Solo lee valores de celda (SheetJS). Las fotos embebidas son objetos
 * "drawing" que SheetJS no ve — esas se extraen aparte en excelImages.js.
 */

export class FormatoNoReconocidoError extends Error {
  constructor() {
    super(
      'El Excel no coincide con la plantilla de Tienda ni con la de CEDI (no se encontraron las columnas de código de barra y MOTIVO).'
    );
    this.name = 'FormatoNoReconocidoError';
  }
}

/**
 * Al Excel le falta algo de la plantilla (una columna, o un dato en una
 * fila): el mensaje dice qué y dónde, para corregirlo y volver a subirlo.
 * `faltas`: textos cortos («En la hoja «Averia» falta la columna BARCODE»).
 */
export class PlantillaIncompletaError extends Error {
  constructor(faltas, titulo = 'Al Excel le falta información de la plantilla:') {
    const max = 12;
    const lista = faltas.slice(0, max).map((f) => `• ${f}`).join('\n');
    const mas = faltas.length > max ? `\n• y ${faltas.length - max} más` : '';
    super(`${titulo}\n${lista}${mas}\nCorrígelo y vuelve a subirlo.`);
    this.name = 'PlantillaIncompletaError';
    this.code = 'PLANTILLA_INCOMPLETA';
    this.faltas = faltas;
  }
}

/** «la columna X» / «las columnas X y Y». */
const columnas = (nombres) =>
  nombres.length === 1 ? `la columna ${nombres[0]}` : `las columnas ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;

/** Lista de filas para un mensaje: «filas 5 (2050…), 7 (2050…)». */
const filasTexto = (filas) => {
  const max = 8;
  const t = filas.slice(0, max).map((f) => (f.codigo ? `${f.fila} (${f.codigo})` : `${f.fila}`)).join(', ');
  return `${filas.length === 1 ? 'la fila' : 'las filas'} ${t}${filas.length > max ? ` y ${filas.length - max} más` : ''}`;
};

/** Fecha en texto que no existe o no es dd/mm/aaaa (p. ej. 31/02/2024 o 13/25/2024). */
export class FechaInvalidaError extends Error {
  constructor(texto) {
    super(`El Excel tiene una fecha inválida: "${texto}". Usa el formato dd/mm/aaaa con una fecha que exista.`);
    this.name = 'FechaInvalidaError';
  }
}

/** trim + mayúsculas + sin acentos + espacios colapsados. */
export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** MOTIVO de una línea -> tipo. No distingue subtipos de daños de perfumería. */
export function detectarTipoPorMotivo(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  // "DIFERENCIAS (SOBRANTE)" o "DIFERENCIAS CAMBIO DE TALLA" son diferencias,
  // no sobrante/faltante real: la plantilla CEDI usa FALTANTE REAL para esos.
  if (t.startsWith('DIFERENCIA')) return 'diferencias';
  if (t.includes('FALTANTE')) return 'faltante_real';
  // Antes que SOBRANTE: «SOBRANTE NO ESPERADO» es su propio motivo.
  if (t.includes('SOBRANTE') && t.includes('NO ESPERADO')) return 'sobrante_no_esperado';
  if (t.includes('SOBRANTE')) return 'sobrante_real';
  if (t.includes('DIFERENCIA')) return 'diferencias';
  // «DEVOLUCIÓN», «DEVOLUCION AL PROVEEDOR», «DEVOLUCIONES»…
  if (t.includes('DEVOLUCI')) return 'devolucion';
  if (t.includes('DEFECTUOS')) return 'danos_textil';
  return null;
}

function aNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let s = String(valor ?? '').replace(/\s/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ''); // 1,234.5
  else s = s.replace(',', '.'); // 1,5
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los códigos de barra suelen venir como número en Excel (EAN-13 cabe en un
 * double sin perder precisión); se convierten a texto sin notación científica
 * ni ".0".
 */
function aCodigoBarra(valor) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return '';
    return Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
  }
  return String(valor ?? '')
    .trim()
    .replace(/\.0+$/, '')
    .replace(/\s+/g, '');
}

/**
 * CEDI no trae una sola "cantidad reclamada": para daños son las unidades
 * averiadas; para faltante/sobrante/diferencias, la diferencia.
 */
export function cantidadCedi({ tipo, esperada, recibida, diferencia, averiadas }) {
  if (tipo?.startsWith('danos_') && averiadas) return Math.abs(averiadas);
  if (diferencia !== null && diferencia !== undefined) return Math.abs(diferencia);
  if (esperada !== null && esperada !== undefined && recibida !== null && recibida !== undefined) return Math.abs(esperada - recibida);
  if (averiadas !== null && averiadas !== undefined) return Math.abs(averiadas);
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** true si año/mes/día forman una fecha real (descarta 31/02, 29/02 de año no bisiesto, mes 13…). */
function fechaExiste(anio, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Fecha de celda (Date, serial de Excel o texto dd/mm/aaaa) -> 'AAAA-MM-DD'.
 * Un texto con forma de fecha que no existe lanza FechaInvalidaError (no se
 * adivina si venía como mm/dd).
 */
function aFechaIso(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${pad2(valor.getMonth() + 1)}-${pad2(valor.getDate())}`;
  }
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    const d = XLSX.SSF.parse_date_code(valor);
    if (d) return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
  }
  const s = String(valor ?? '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const anio = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    if (!fechaExiste(anio, Number(m[2]), Number(m[1]))) throw new FechaInvalidaError(s);
    return `${anio}-${pad2(m[2])}-${pad2(m[1])}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    if (!fechaExiste(Number(m[1]), Number(m[2]), Number(m[3]))) throw new FechaInvalidaError(s);
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

function textoCelda(valor) {
  if (valor instanceof Date) return aFechaIso(valor) || '';
  return String(valor ?? '').trim();
}

/**
 * Celdas numéricas cuyo texto mostrado conserva ceros a la izquierda (formato
 * "0000000000000" de EAN/UPC): se pasan a texto con ese valor mostrado
 * (cell.w), porque con raw:true SheetJS daría el número sin los ceros. Solo
 * si el texto son solo dígitos y vale lo mismo que el número, así nunca se
 * cambia el valor (un "1.23E+12" o "1,234" se dejan como número).
 */
function conservarCerosIzquierda(ws) {
  for (const ref of Object.keys(ws)) {
    if (ref[0] === '!') continue;
    const cell = ws[ref];
    if (cell?.t !== 'n' || typeof cell.w !== 'string') continue;
    const w = cell.w.trim();
    if (/^0\d+$/.test(w) && Number(w) === cell.v) {
      cell.t = 's';
      cell.v = w;
    }
  }
}

/*
 * Límites de lectura. Un Excel puede declarar un rango gigante (A1:XFD1048576)
 * con una sola celda al final: sheet_to_json con defval llenaría miles de
 * millones de celdas y congelaría la API para todos. Las plantillas tienen
 * pocas columnas y un reclamo admite 2000 productos, así que se lee solo
 * hasta donde hay datos reales y nunca más de estos topes.
 */
const MAX_FILAS_LECTURA = 5000;
const MAX_COLUMNAS_LECTURA = 100;

/** Recorta el rango de la hoja a la última celda con datos, dentro de los topes. */
function acotarRango(ws) {
  let maxFila = -1;
  let maxCol = -1;
  for (const ref of Object.keys(ws)) {
    if (ref[0] === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(ref);
    if (r < MAX_FILAS_LECTURA && c < MAX_COLUMNAS_LECTURA) {
      if (r > maxFila) maxFila = r;
      if (c > maxCol) maxCol = c;
    }
  }
  if (maxFila < 0) {
    delete ws['!ref'];
    return;
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxFila, c: maxCol } });
}

function filasDeHoja(ws) {
  acotarRango(ws);
  conservarCerosIzquierda(ws);
  if (!ws['!ref']) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
}

const esVacia = (fila) => !fila || fila.every((c) => textoCelda(c) === '');

function buscarColumna(headers, predicado) {
  return headers.findIndex((h) => h && predicado(h));
}

/** Valores distintos (en orden de aparición) de una columna, para las filas con código de barra. */
function distintos(filas, idx, idxCodigo, max = 50) {
  if (idx < 0) return [];
  const vistos = new Map();
  for (const fila of filas) {
    if (!aCodigoBarra(fila[idxCodigo])) continue;
    const v = textoCelda(fila[idx]);
    if (v && !vistos.has(v.toUpperCase())) vistos.set(v.toUpperCase(), v);
    if (vistos.size >= max) break;
  }
  return [...vistos.values()];
}

/** Primer valor no vacío de una columna (filas con código de barra). */
function primero(filas, idx, idxCodigo) {
  if (idx < 0) return null;
  for (const fila of filas) {
    if (!aCodigoBarra(fila[idxCodigo])) continue;
    if (textoCelda(fila[idx])) return fila[idx];
  }
  return null;
}

/** Documentos SAP: textos cortos, sin duplicados (columna DOCUMENTO de ambas plantillas). */
const documentosSap = (filas, idx, idxCodigo) => distintos(filas, idx, idxCodigo).filter((d) => d.length <= 50);

/** Comentarios por línea -> un comentario general (sin repetidos, máx. 1000 caracteres). */
const comentarioGeneral = (filas, idx, idxCodigo) => distintos(filas, idx, idxCodigo).join(' | ').slice(0, 1000) || null;

// ------------------------------------------------------------------
// Detección de columna de cantidad (plantilla Tienda)
// ------------------------------------------------------------------

const RE_CANTIDAD = /CANTIDAD|\bCANT\b|\bCANT\.|\bQTY\b|UNIDADES/;
// Columnas que mencionan cantidad pero NO son la cantidad reclamada.
const RE_CANTIDAD_REFERENCIA = /ESPERAD|FACTURAD|PEDID|ENVIAD|SOLICITAD|ORDENAD|DESPACHAD|RECIBID|SISTEMA|TEORIC/;
const RE_NO_CANTIDAD = /PRECIO|COSTO|VALOR|MONTO|IMPORTE|\$|B\/\./;

function puntajeCantidad(h) {
  if (!RE_CANTIDAD.test(h) || RE_NO_CANTIDAD.test(h)) return -1;
  let score = 40;
  if (h.includes('RECLAM')) score = 100;
  else if (h === 'CANTIDAD' || h === 'CANT' || h === 'CANT.' || h === 'QTY') score = 80;
  else if (h.includes('DIFERENCIA') || h.includes('FALTANTE') || h.includes('SOBRANTE') || h.includes('AVERIAD') || h.includes('DEVOLUCI'))
    score = 70;
  if (RE_CANTIDAD_REFERENCIA.test(h)) score -= 50;
  return score;
}

/**
 * Elige la columna de cantidad reclamada: por nombre (priorizando
 * "reclamada", penalizando esperada/facturada/recibida…) y validando que sus
 * valores sean mayormente numéricos, para no tomar por accidente una columna
 * de texto que casualmente contenga "UNIDADES".
 */
function elegirColumnaCantidad(headers, filasDatos, idxCodigo) {
  const candidatas = headers
    .map((h, idx) => ({ idx, score: puntajeCantidad(h) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const c of candidatas) {
    let conValor = 0;
    let numericos = 0;
    for (const fila of filasDatos) {
      if (!aCodigoBarra(fila[idxCodigo])) continue;
      const v = fila[c.idx];
      if (textoCelda(v) === '') continue;
      conValor += 1;
      if (aNumero(v) !== null) numericos += 1;
    }
    if (conValor === 0 || numericos / conValor >= 0.8) return c.idx;
  }
  return -1;
}

// ------------------------------------------------------------------
// Metadatos del bloque de arriba de la tabla (pares etiqueta -> valor por fila)
// ------------------------------------------------------------------

const ETIQUETAS_META = [
  {
    campo: 'sucursal',
    match: (l) => ['TIENDA', 'TIENDAS', 'SUCURSAL', 'SUCURSALES'].includes(l) || l.startsWith('TIENDA ') || l.startsWith('SUCURSAL '),
  },
  { campo: 'proveedor', match: (l) => l === 'PROVEEDOR' || l.startsWith('PROVEEDOR ') || l.startsWith('NOMBRE PROVEEDOR') },
  { campo: 'fechaRegistro', match: (l) => l === 'FECHA' || l.startsWith('FECHA ') },
  { campo: 'numeroEmbarqueFactura', match: (l) => l.includes('EMBARQUE') || l.includes('FACTURA') },
  { campo: 'mundo', match: (l) => l === 'MUNDO' },
  { campo: 'departamento', match: (l) => l === 'DEPARTAMENTO' || l === 'DEPTO' || l === 'DPTO' },
  { campo: 'marca', match: (l) => l === 'MARCA' },
  // Solo en el encabezado de la plantilla CEDI.
  { campo: 'division', match: (l) => l === 'DIVISION' },
];

const limpiarEtiqueta = (t) => normalizar(t).replace(/[:.#\s]+$/, '').trim();
const esEtiquetaConocida = (t) => ETIQUETAS_META.some((e) => e.match(limpiarEtiqueta(t)));

function leerMetadatos(filas) {
  const meta = {};
  for (const fila of filas) {
    for (let c = 0; c < fila.length; c += 1) {
      const texto = textoCelda(fila[c]);
      if (!texto) continue;

      // "TIENDA: Albrook" en una sola celda
      const dosPuntos = texto.indexOf(':');
      const etiqueta = limpiarEtiqueta(dosPuntos > 0 ? texto.slice(0, dosPuntos) : texto);
      const def = ETIQUETAS_META.find((e) => e.match(etiqueta));
      if (!def || meta[def.campo]) continue;

      let valor = dosPuntos > 0 ? texto.slice(dosPuntos + 1).trim() : '';
      let raw = valor;
      if (!valor) {
        // Siguiente celda no vacía a la derecha, en la misma fila.
        for (let d = c + 1; d < fila.length; d += 1) {
          const t = textoCelda(fila[d]);
          if (!t) continue;
          if (!esEtiquetaConocida(t)) {
            valor = t;
            raw = fila[d];
          }
          break;
        }
      }
      if (!valor) continue;
      meta[def.campo] = def.campo === 'fechaRegistro' ? aFechaIso(raw) : valor;
    }
  }
  return meta;
}

// ------------------------------------------------------------------
// Plantillas
// ------------------------------------------------------------------

/**
 * Fila de títulos de la tabla CEDI (BARCODE + MOTIVO). La plantilla vieja la
 * tiene en la fila 1; la nueva trae antes un encabezado como el de Tienda
 * (PROVEEDOR, MARCA, DIVISIÓN, FACTURA / EMBARQUE).
 */
const REQ_CEDI = [
  { nombre: 'BARCODE', ok: (h) => h === 'BARCODE' },
  { nombre: 'MOTIVO', ok: (h) => h === 'MOTIVO' },
];
const buscarFilaEncabezadoCedi = (filas) => filaDeTitulos(filas, REQ_CEDI, 15).fila;

function parsearCedi(filas, filaEncabezado, faltas = [], nombreHoja = '') {
  const headers = (filas[filaEncabezado] || []).map(normalizar);
  const iBarcode = headers.indexOf('BARCODE');
  const iMotivo = headers.indexOf('MOTIVO');
  const iFecha = headers.indexOf('FECHA');
  const iDescripcion = buscarColumna(headers, (h) => h.startsWith('DESCRIPCION'));
  const iEsperada = buscarColumna(headers, (h) => h.includes('ESPERADA'));
  const iRecibida = buscarColumna(headers, (h) => h.includes('RECIBIDA'));
  const iDiferencia = buscarColumna(headers, (h) => h === 'DIFERENCIA' || h.startsWith('DIFERENCIA'));
  const iAveriadas = buscarColumna(headers, (h) => h.includes('AVERIAD'));
  const iDocumento = buscarColumna(headers, (h) => h.startsWith('DOCUMENTO'));
  const iProducto = headers.indexOf('PRODUCTO');

  const datos = filas.slice(filaEncabezado + 1);
  const meta = leerMetadatos(filas.slice(0, filaEncabezado));

  const lineas = [];
  const sinCantidad = [];
  let fechaRegistro = null;

  for (const [i, fila] of datos.entries()) {
    const codigoBarra = aCodigoBarra(fila[iBarcode]);
    if (!codigoBarra || !/\d/.test(codigoBarra)) continue;

    const motivoTexto = textoCelda(fila[iMotivo]);
    const tipo = detectarTipoPorMotivo(motivoTexto);

    const diferencia = iDiferencia >= 0 ? aNumero(fila[iDiferencia]) : null;
    const averiadas = iAveriadas >= 0 ? aNumero(fila[iAveriadas]) : null;
    const esperada = iEsperada >= 0 ? aNumero(fila[iEsperada]) : null;
    const recibida = iRecibida >= 0 ? aNumero(fila[iRecibida]) : null;

    const cantidad = cantidadCedi({ tipo, esperada, recibida, diferencia, averiadas });
    if (cantidad === null) sinCantidad.push({ fila: filaEncabezado + i + 2, codigo: codigoBarra });

    if (!fechaRegistro && iFecha >= 0) fechaRegistro = aFechaIso(fila[iFecha]);

    lineas.push({
      codigoBarra,
      cantidad,
      tipo,
      motivoTexto,
      descripcion: iDescripcion >= 0 ? textoCelda(fila[iDescripcion]) || null : null,
      // La fila tal como viene en la plantilla, para mostrarla en el formulario.
      cedi: {
        fecha: iFecha >= 0 ? aFechaIso(fila[iFecha]) : null,
        producto: iProducto >= 0 ? aCodigoBarra(fila[iProducto]) || null : null,
        esperada,
        recibida,
        diferencia,
        averiadas,
        documento: iDocumento >= 0 ? textoCelda(fila[iDocumento]) || null : null,
      },
    });
  }

  if (sinCantidad.length) {
    faltas.push(
      `En la hoja «${nombreHoja.trim()}» no se sabe la cantidad de ${filasTexto(sinCantidad)}: llena DIFERENCIA (o ESPERADA y RECIBIDA, o AVERIADAS).`
    );
  }
  // Sin encabezado (plantilla vieja) no hay proveedor: se infiere después vía
  // SAP (código -> última OC). DOCUMENTO es el documento SAP de cada línea,
  // no la factura/embarque.
  return {
    formato: 'cedi',
    fechaRegistro: meta.fechaRegistro || fechaRegistro,
    numeroEmbarqueFactura: meta.numeroEmbarqueFactura || null,
    documentosSap: documentosSap(datos, iDocumento, iBarcode),
    comentario: comentarioGeneral(datos, buscarColumna(headers, (h) => h.startsWith('COMENTARIO')), iBarcode),
    proveedor: meta.proveedor || null,
    sucursal: null,
    division: meta.division || null,
    mundo: meta.mundo || null,
    departamento: meta.departamento || null,
    marca: meta.marca || null,
    lineas,
  };
}

const REQ_TIENDA = [
  { nombre: 'CODIGO DE BARRA', ok: (h) => h.includes('CODIGO') && h.includes('BARRA') },
  { nombre: 'MOTIVO', ok: (h) => h === 'MOTIVO' || h.startsWith('MOTIVO') },
  { nombre: 'DOCUMENTO', ok: (h) => h.includes('DOCUMENTO') },
];
const buscarFilaEncabezadoTienda = (filas) => filaDeTitulos(filas, REQ_TIENDA, 60).fila;

function parsearTienda(filas, filaEncabezado, faltas = [], nombreHoja = '') {
  const headers = (filas[filaEncabezado] || []).map(normalizar);
  const iCodigo = buscarColumna(headers, (h) => h.includes('CODIGO') && h.includes('BARRA'));
  const iMotivo = buscarColumna(headers, (h) => h === 'MOTIVO' || h.startsWith('MOTIVO'));
  const iDescripcion = buscarColumna(headers, (h) => h.startsWith('DESCRIPCION'));
  const iDocumento = buscarColumna(headers, (h) => h.includes('DOCUMENTO'));
  // Columnas de la tabla que repiten el mismo dato en cada fila (formato real
  // de la plantilla Tienda): se usan si no vienen en el bloque de arriba.
  const iFecha = buscarColumna(headers, (h) => h.startsWith('FECHA'));
  const iFactura = buscarColumna(headers, (h) => h.includes('FACTURA'));
  const iEmbarque = buscarColumna(headers, (h) => h.includes('EMBARQUE') || h.includes('ENTREGA'));
  const iDepartamento = buscarColumna(headers, (h) => h === 'DEPARTAMENTO' || h === 'DEPTO' || h === 'DPTO');
  const iComentario = buscarColumna(headers, (h) => h.startsWith('COMENTARIO'));

  const filasDatos = filas.slice(filaEncabezado + 1);
  const iCantidad = elegirColumnaCantidad(headers, filasDatos, iCodigo);
  const hoja = nombreHoja.trim();
  if (iCantidad < 0) faltas.push(`En la hoja «${hoja}» falta la columna CANTIDAD.`);
  const sinCantidad = [];

  const meta = leerMetadatos(filas.slice(0, Math.min(filaEncabezado, 15)));

  const lineas = [];
  for (const [i, fila] of filasDatos.entries()) {
    // En el formato nuevo no hay bandera "RECLAMO" por fila: toda fila con
    // código de barra cuenta como línea.
    const codigoBarra = aCodigoBarra(fila[iCodigo]);
    if (!codigoBarra || !/\d/.test(codigoBarra)) continue;
    const motivoTexto = textoCelda(fila[iMotivo]);
    const cantidad = iCantidad >= 0 ? aNumero(fila[iCantidad]) : null;
    if (iCantidad >= 0 && cantidad === null) sinCantidad.push({ fila: filaEncabezado + i + 2, codigo: codigoBarra });
    // «Sobrante no esperado» es solo de CEDI: en Tienda cuenta como sobrante.
    const detectado = detectarTipoPorMotivo(motivoTexto);
    const tipo = detectado === 'sobrante_no_esperado' ? 'sobrante_real' : detectado;
    const abs = cantidad === null ? null : Math.abs(cantidad);
    lineas.push({
      codigoBarra,
      cantidad: abs,
      tipo,
      motivoTexto,
      descripcion: iDescripcion >= 0 ? textoCelda(fila[iDescripcion]) || null : null,
      // Mismas columnas que CEDI para el formulario: la cantidad va en
      // "unidades averiadas" si es daño, si no en "diferencia".
      cedi: {
        fecha: iFecha >= 0 ? aFechaIso(fila[iFecha]) : null,
        producto: null,
        esperada: null,
        recibida: null,
        diferencia: tipo?.startsWith('danos_') ? null : abs,
        averiadas: tipo?.startsWith('danos_') ? abs : null,
        documento: iDocumento >= 0 ? textoCelda(fila[iDocumento]) || null : null,
      },
    });
  }

  if (sinCantidad.length) faltas.push(`En la hoja «${hoja}» falta la CANTIDAD en ${filasTexto(sinCantidad)}.`);

  // "4168 - 001 / 23069": factura y embarque (si son distintos) en el mismo campo.
  const facturaEmbarque = [
    ...distintos(filasDatos, iFactura, iCodigo, 3),
    ...(iEmbarque !== iFactura ? distintos(filasDatos, iEmbarque, iCodigo, 3) : []),
  ]
    .join(' / ')
    .slice(0, 100);
  const fechaTabla = aFechaIso(primero(filasDatos, iFecha, iCodigo));
  const depto = primero(filasDatos, iDepartamento, iCodigo);

  return {
    formato: 'tienda',
    sucursal: meta.sucursal || null,
    proveedor: meta.proveedor || null,
    fechaRegistro: meta.fechaRegistro || fechaTabla || null,
    numeroEmbarqueFactura: meta.numeroEmbarqueFactura || facturaEmbarque || null,
    documentosSap: documentosSap(filasDatos, iDocumento, iCodigo),
    comentario: comentarioGeneral(filasDatos, iComentario, iCodigo),
    mundo: meta.mundo || null,
    departamento: meta.departamento || (depto !== null ? textoCelda(depto) : null),
    marca: meta.marca || null,
    lineas,
  };
}

// ------------------------------------------------------------------
// Plantilla CEDI por hojas (desde 2026-11-12): «Averia», «Diferencia» y
// «Sobrante NO esperado». La primera hoja (resumen) no se lee.
//   Averia      -> productos defectuosos o con daño (daños).
//   Diferencia  -> diferencia negativa = faltante (con DOCUMENTO obligatorio),
//                  positiva = sobrante. COMENTARIO es opcional.
//   Sobrante NO esperado -> CODIGO (opcional), REFERENCIA, COLOR, TALLA, CANTIDAD.
// ------------------------------------------------------------------

/** Columna de referencia en «Sobrante NO esperado»: REFERENCIA, ESTILO, MODELO o REF. */
const esColumnaReferencia = (h) => h.startsWith('REFERENCIA') || h.startsWith('ESTILO') || h.startsWith('MODELO') || h === 'REF' || h === 'REF.';

// `requeridas`: columnas sin las que la hoja no se puede leer; si falta alguna,
// el error dice cuál (antes solo se decía que la hoja no se reconocía).
const HOJAS_CEDI = [
  {
    clave: 'averia',
    nombre: (n) => n.startsWith('AVERIA'),
    requeridas: [
      { nombre: 'BARCODE', ok: (x) => x === 'BARCODE' },
      { nombre: 'AVERIA', ok: (x) => x.startsWith('AVERIA') },
    ],
  },
  {
    clave: 'diferencia',
    nombre: (n) => n.startsWith('DIFERENCIA'),
    requeridas: [
      { nombre: 'BARCODE', ok: (x) => x === 'BARCODE' },
      { nombre: 'DIFERENCIA', ok: (x) => x.startsWith('DIFERENCIA') },
    ],
  },
  {
    clave: 'sobrante',
    nombre: (n) => n.includes('SOBRANTE') && n.includes('NO ESPERADO'),
    requeridas: [
      { nombre: 'REFERENCIA (o ESTILO / CODIGO)', ok: (x) => esColumnaReferencia(x) || x.startsWith('CODIGO') },
      { nombre: 'CANTIDAD', ok: (x) => x.startsWith('CANTIDAD') },
    ],
  },
];

/** Columnas requeridas que no están en esos títulos (normalizados). */
const faltantesEn = (requeridas, headers) => requeridas.filter((r) => !headers.some((h) => h && r.ok(h))).map((r) => r.nombre);

/**
 * Fila de títulos de una tabla: la primera (entre las primeras `limite`) que
 * trae todas las requeridas. Si ninguna, { fila: -1, faltan } con lo que le
 * falta a la que más se acerca (para decir qué columna falta).
 */
function filaDeTitulos(filas, requeridas, limite = 15) {
  let mejor = { fila: -1, faltan: requeridas.map((r) => r.nombre) };
  for (let r = 0; r < Math.min(filas.length, limite); r += 1) {
    const faltan = faltantesEn(requeridas, (filas[r] || []).map(normalizar));
    if (!faltan.length) return { fila: r, faltan };
    if (faltan.length < mejor.faltan.length) mejor = { fila: -1, faltan };
  }
  return mejor;
}

/**
 * Hojas de la plantilla CEDI por hojas que trae el libro: [{ clave, nombreHoja, filas, filaEncabezado }].
 * Las que tienen el nombre de una hoja de la plantilla pero no sus títulos van
 * a `ignoradas` ([{ hoja, columnas }]) para avisar, en vez de perderlas sin decir nada.
 */
function hojasCedi(wb, ignoradas = []) {
  const encontradas = [];
  for (const nombreHoja of wb.SheetNames) {
    const def = HOJAS_CEDI.find((d) => d.nombre(normalizar(nombreHoja)));
    if (!def || encontradas.some((e) => e.clave === def.clave)) continue;
    const filas = filasDeHoja(wb.Sheets[nombreHoja]);
    const { fila, faltan } = filaDeTitulos(filas, def.requeridas);
    if (fila >= 0) encontradas.push({ clave: def.clave, nombreHoja, filas, filaEncabezado: fila });
    // Hoja con datos y el nombre de la plantilla, pero sin alguno de sus títulos.
    else if (filas.some((f) => !esVacia(f))) ignoradas.push({ hoja: nombreHoja.trim(), faltan });
  }
  return encontradas;
}

/** Aviso para las hojas de la plantilla CEDI que no se pudieron leer (null si no hay). */
export function motivoHojasNoReconocidas(ignoradas) {
  if (!ignoradas?.length) return null;
  const lista = ignoradas.map((h) => `en la hoja «${h.hoja}» ${h.faltan.length > 1 ? 'faltan' : 'falta'} ${columnas(h.faltan)}`).join('; ');
  return {
    mensaje: `No se pudo leer el Excel: ${lista}. Agrega ${ignoradas.length === 1 && ignoradas[0].faltan.length === 1 ? 'ese título' : 'esos títulos'} en la fila de títulos y vuelve a subirlo.`,
    code: 'HOJA_NO_RECONOCIDA',
  };
}

// ------------------------------------------------------------------
// Fotos por fila (hoja «Averia»): una foto cuenta si está anclada en la fila
// (dibujo flotante) o puesta «en la celda» (Excel 365: la celda trae vm="…").
// Se lee el XML del libro (SheetJS con bookFiles), sin otra dependencia.
// ------------------------------------------------------------------

function archivoLibro(wb, ruta) {
  const f = wb.files?.[ruta] ?? wb.files?.[`/${ruta}`];
  if (!f) return null;
  const c = f.content ?? f.asNodeBuffer?.() ?? f._data ?? f;
  if (typeof c === 'string') return c;
  try {
    return Buffer.from(c).toString('utf8');
  } catch {
    return null;
  }
}

function resolverRuta(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const partes = base.split('/').slice(0, -1);
  for (const p of target.split('/')) {
    if (p === '..') partes.pop();
    else if (p !== '.') partes.push(p);
  }
  return partes.join('/');
}

/** Relaciones de una parte del paquete: [{ id, type, ruta }]. */
function relacionesDe(wb, parte) {
  const i = parte.lastIndexOf('/');
  const xml = archivoLibro(wb, `${parte.slice(0, i)}/_rels/${parte.slice(i + 1)}.rels`);
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => ({
    id: /\bId="([^"]*)"/.exec(tag)?.[1],
    type: /\bType="([^"]*)"/.exec(tag)?.[1] || '',
    ruta: resolverRuta(parte, /\bTarget="([^"]*)"/.exec(tag)?.[1] || ''),
  }));
}

/** Números de fila (1 = primera fila de Excel) de la hoja que tienen una foto. */
export function filasConFoto(wb, nombreHoja) {
  const filas = new Set();
  try {
    const idx = wb.SheetNames.indexOf(nombreHoja);
    const rid = wb.Workbook?.Sheets?.[idx]?.id;
    const hoja = relacionesDe(wb, 'xl/workbook.xml').find((r) => r.id === rid)?.ruta;
    const xml = hoja && archivoLibro(wb, hoja);
    if (!xml) return filas;
    // Fotos «en la celda».
    for (const [tag] of xml.matchAll(/<c\b[^>]*>/g)) {
      if (!/\bvm="/.test(tag)) continue;
      const fila = /\br="[A-Z]+(\d+)"/.exec(tag)?.[1];
      if (fila) filas.add(Number(fila));
    }
    // Fotos flotantes: la fila donde empieza cada imagen del dibujo.
    for (const rel of relacionesDe(wb, hoja).filter((r) => r.type.endsWith('/drawing'))) {
      const dibujo = archivoLibro(wb, rel.ruta) || '';
      for (const [anclaje] of dibujo.matchAll(/<(\w+:)?(?:twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/\1?(?:twoCellAnchor|oneCellAnchor)>/g)) {
        if (!/<(\w+:)?pic\b/.test(anclaje)) continue;
        const fila = /<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/.exec(anclaje)?.[1];
        if (fila !== undefined) filas.add(Number(fila) + 1);
      }
    }
  } catch {
    // Libro raro: sin información de fotos (se pedirán en el formulario).
  }
  return filas;
}

/**
 * Hoja «Averia»: unidades = suma de las columnas numéricas entre AVERIA y la
 * primera de FOTO / DOCUMENTO / COMENTARIO (p. ej. «Manchado»). DOCUMENTO es
 * el documento SAP de la avería (23294 - NOIR, 2026-11-13: antes no se leía y
 * el PDF de ese documento no se aceptaba al crear).
 */
function lineasAveria({ filas, filaEncabezado, nombreHoja }, wb, averiasSinFoto, faltas) {
  const conFoto = filasConFoto(wb, nombreHoja);
  const headers = (filas[filaEncabezado] || []).map(normalizar);
  const iBarcode = headers.indexOf('BARCODE');
  const iProducto = headers.indexOf('PRODUCTO');
  const iDescripcion = buscarColumna(headers, (h) => h.startsWith('DESCRIPCION'));
  const iAveria = buscarColumna(headers, (h) => h.startsWith('AVERIA'));
  const iFoto = buscarColumna(headers, (h) => h.startsWith('FOTO'));
  const iDocumento = buscarColumna(headers, (h) => h.startsWith('DOCUMENTO'));
  const iComentario = buscarColumna(headers, (h) => h.startsWith('COMENTARIO'));
  // Las unidades no pueden incluir el número de documento ni otra columna de texto.
  const fin = Math.min(...[iFoto, iDocumento, iComentario].filter((c) => c > iAveria), headers.length);
  const hoja = nombreHoja.trim();
  if (fin - iAveria <= 1) {
    faltas.push(`En la hoja «${hoja}» falta la columna de unidades averiadas (por ejemplo «Manchado»), a la derecha de AVERIA.`);
  }
  const sinUnidades = [];
  const lineas = [];
  filas.slice(filaEncabezado + 1).forEach((fila, i) => {
    const codigoBarra = aCodigoBarra(fila[iBarcode]);
    if (!codigoBarra || !/\d/.test(codigoBarra)) return;
    const filaExcel = filaEncabezado + i + 2;
    if (!conFoto.has(filaExcel)) averiasSinFoto.push({ hoja: nombreHoja.trim(), fila: filaExcel, codigoBarra });
    let unidades = null;
    for (let c = iAveria + 1; c < fin; c += 1) {
      const n = aNumero(fila[c]);
      if (n !== null) unidades = (unidades ?? 0) + Math.abs(n);
    }
    if (unidades === null && fin - iAveria > 1) sinUnidades.push({ fila: filaExcel, codigo: codigoBarra });
    const averia = textoCelda(fila[iAveria]);
    lineas.push({
      codigoBarra,
      cantidad: unidades,
      tipo: 'danos_textil',
      motivoTexto: `DEFECTUOSO / AVERÍA${averia ? ` (${averia})` : ''}`,
      descripcion: iDescripcion >= 0 ? textoCelda(fila[iDescripcion]) || null : null,
      cedi: {
        fecha: null,
        producto: iProducto >= 0 ? aCodigoBarra(fila[iProducto]) || null : null,
        esperada: null,
        recibida: null,
        diferencia: null,
        averiadas: unidades,
        documento: iDocumento >= 0 ? textoCelda(fila[iDocumento]) || null : null,
      },
    });
  });
  if (sinUnidades.length) faltas.push(`En la hoja «${hoja}» faltan las unidades averiadas en ${filasTexto(sinUnidades)}.`);
  return lineas;
}

/** Hoja «Diferencia»: el signo decide faltante (negativa) o sobrante (positiva). */
function lineasDiferencia({ filas, filaEncabezado, nombreHoja }, faltantesSinDocumento) {
  const headers = (filas[filaEncabezado] || []).map(normalizar);
  const iBarcode = headers.indexOf('BARCODE');
  const iProducto = headers.indexOf('PRODUCTO');
  const iDescripcion = buscarColumna(headers, (h) => h.startsWith('DESCRIPCION'));
  const iEsperada = buscarColumna(headers, (h) => h.includes('ESPERADA'));
  const iRecibida = buscarColumna(headers, (h) => h.includes('RECIBIDA'));
  const iDiferencia = buscarColumna(headers, (h) => h.startsWith('DIFERENCIA'));
  const iDocumento = buscarColumna(headers, (h) => h.startsWith('DOCUMENTO'));
  const lineas = [];
  filas.slice(filaEncabezado + 1).forEach((fila, i) => {
    const codigoBarra = aCodigoBarra(fila[iBarcode]);
    if (!codigoBarra || !/\d/.test(codigoBarra)) return;
    const esperada = iEsperada >= 0 ? aNumero(fila[iEsperada]) : null;
    const recibida = iRecibida >= 0 ? aNumero(fila[iRecibida]) : null;
    let diferencia = iDiferencia >= 0 ? aNumero(fila[iDiferencia]) : null;
    if (diferencia === null && esperada !== null && recibida !== null) diferencia = recibida - esperada;
    if (!diferencia) return; // sin diferencia no hay nada que reclamar
    const faltante = diferencia < 0;
    const documento = iDocumento >= 0 ? textoCelda(fila[iDocumento]) || null : null;
    if (faltante && !documento) faltantesSinDocumento.push({ hoja: nombreHoja.trim(), fila: filaEncabezado + i + 2, codigoBarra, sinColumna: iDocumento < 0 });
    lineas.push({
      codigoBarra,
      cantidad: Math.abs(diferencia),
      tipo: faltante ? 'faltante_real' : 'sobrante_real',
      motivoTexto: faltante ? 'FALTANTE' : 'SOBRANTE',
      descripcion: iDescripcion >= 0 ? textoCelda(fila[iDescripcion]) || null : null,
      cedi: {
        fecha: null,
        producto: iProducto >= 0 ? aCodigoBarra(fila[iProducto]) || null : null,
        esperada,
        recibida,
        diferencia,
        averiadas: null,
        documento,
      },
    });
  });
  return lineas;
}

/** Hoja «Sobrante NO esperado»: el código es opcional; la descripción es «REFERENCIA, COLOR, TALLA». */
function lineasSobranteNoEsperado({ filas, filaEncabezado, nombreHoja }, faltas) {
  const headers = (filas[filaEncabezado] || []).map(normalizar);
  const iCodigo = buscarColumna(headers, (h) => h.startsWith('CODIGO') || h === 'BARCODE');
  const iReferencia = buscarColumna(headers, esColumnaReferencia);
  const iColor = buscarColumna(headers, (h) => h.startsWith('COLOR'));
  const iTalla = buscarColumna(headers, (h) => h.startsWith('TALLA'));
  const iCantidad = buscarColumna(headers, (h) => h.startsWith('CANTIDAD'));
  const iDocumento = buscarColumna(headers, (h) => h.startsWith('DOCUMENTO'));
  const hoja = nombreHoja.trim();
  const sinCantidad = [];
  const sinProducto = [];
  const lineas = [];
  for (const [i, fila] of filas.slice(filaEncabezado + 1).entries()) {
    const filaExcel = filaEncabezado + i + 2;
    const codigo = iCodigo >= 0 ? aCodigoBarra(fila[iCodigo]) : '';
    const referencia = iReferencia >= 0 ? textoCelda(fila[iReferencia]).slice(0, 100) || null : null;
    const color = iColor >= 0 ? textoCelda(fila[iColor]).slice(0, 100) || null : null;
    const talla = iTalla >= 0 ? textoCelda(fila[iTalla]).slice(0, 50) || null : null;
    const n = iCantidad >= 0 ? aNumero(fila[iCantidad]) : null;
    if (!codigo && !referencia && !color && !talla && n === null) continue;
    if (n === null) sinCantidad.push({ fila: filaExcel, codigo: codigo || referencia });
    if (!codigo && !referencia) sinProducto.push({ fila: filaExcel });
    const cantidad = n === null ? null : Math.abs(n);
    lineas.push({
      codigoBarra: codigo && /\d/.test(codigo) ? codigo : null,
      cantidad,
      tipo: 'sobrante_no_esperado',
      motivoTexto: 'SOBRANTE NO ESPERADO',
      descripcion: [referencia, color, talla].filter(Boolean).join(', ') || null,
      referencia,
      color,
      talla,
      cedi: {
        fecha: null,
        producto: null,
        esperada: null,
        recibida: null,
        diferencia: cantidad,
        averiadas: null,
        documento: iDocumento >= 0 ? textoCelda(fila[iDocumento]) || null : null,
      },
    });
  }
  if (sinCantidad.length) faltas.push(`En la hoja «${hoja}» falta la CANTIDAD en ${filasTexto(sinCantidad)}.`);
  if (sinProducto.length) faltas.push(`En la hoja «${hoja}» falta el CODIGO o la REFERENCIA en ${filasTexto(sinProducto)}.`);
  return lineas;
}

function parsearCediHojas(hojas, wb) {
  const faltantesSinDocumento = [];
  const averiasSinFoto = [];
  const faltas = [];
  const lineas = [];
  for (const h of hojas) {
    if (h.clave === 'averia') lineas.push(...lineasAveria(h, wb, averiasSinFoto, faltas));
    else if (h.clave === 'diferencia') lineas.push(...lineasDiferencia(h, faltantesSinDocumento));
    else lineas.push(...lineasSobranteNoEsperado(h, faltas));
  }
  if (faltas.length) throw new PlantillaIncompletaError(faltas);
  // Documentos SAP y comentario: de TODAS las hojas que los traigan (el NOIR
  // traía uno en «Diferencia» y otro en «Averia», y solo se leía el primero).
  const documentos = [];
  const comentarios = [];
  for (const clave of ['diferencia', 'averia', 'sobrante']) {
    const h = hojas.find((x) => x.clave === clave);
    if (!h) continue;
    const headers = (h.filas[h.filaEncabezado] || []).map(normalizar);
    const datos = h.filas.slice(h.filaEncabezado + 1);
    // Fila con producto: BARCODE en Averia/Diferencia; CODIGO o REFERENCIA en Sobrante NO esperado.
    const iBarcode = clave === 'sobrante' ? buscarColumna(headers, (x) => esColumnaReferencia(x) || x.startsWith('CODIGO')) : headers.indexOf('BARCODE');
    for (const d of documentosSap(datos, buscarColumna(headers, (x) => x.startsWith('DOCUMENTO')), iBarcode)) {
      if (!documentos.some((y) => y.toUpperCase() === d.toUpperCase())) documentos.push(d);
    }
    const c = comentarioGeneral(datos, buscarColumna(headers, (x) => x.startsWith('COMENTARIO')), iBarcode);
    if (c && !comentarios.some((y) => y.toUpperCase() === c.toUpperCase())) comentarios.push(c);
  }
  const comentario = comentarios.join(' | ').slice(0, 1000) || null;
  return {
    formato: 'cedi',
    plantilla: 'cedi_hojas',
    hojaNombre: hojas.map((h) => h.nombreHoja.trim()).join(', '),
    fechaRegistro: null,
    numeroEmbarqueFactura: null,
    documentosSap: documentos,
    comentario,
    proveedor: null,
    sucursal: null,
    division: null,
    mundo: null,
    departamento: null,
    marca: null,
    faltantesSinDocumento,
    averiasSinFoto,
    lineas,
  };
}

/** Mensaje para los faltantes de la hoja Diferencia que no traen DOCUMENTO (null si no hay). */
export function motivoFaltantesSinDocumento(faltantes) {
  if (!faltantes?.length) return null;
  const hoja = faltantes[0].hoja;
  if (faltantes[0].sinColumna) {
    return {
      mensaje: `Los faltantes deben tener su documento: a la hoja «${hoja}» le falta la columna DOCUMENTO. Agrégala con el documento SAP de cada faltante y vuelve a subir el Excel.`,
      code: 'FALTANTE_SIN_DOCUMENTO',
    };
  }
  const lista = faltantes.slice(0, 10).map((f) => `fila ${f.fila} (${f.codigoBarra})`).join(', ');
  const mas = faltantes.length > 10 ? ` y ${faltantes.length - 10} más` : '';
  return {
    mensaje: `Los faltantes deben tener su documento: en la hoja «${hoja}» falta el DOCUMENTO en ${lista}${mas}.`,
    code: 'FALTANTE_SIN_DOCUMENTO',
  };
}

function resumirTipos(lineas) {
  const desglose = {};
  const orden = [];
  for (const l of lineas) {
    if (!l.tipo) continue;
    if (!(l.tipo in desglose)) {
      desglose[l.tipo] = 0;
      orden.push(l.tipo);
    }
    desglose[l.tipo] += 1;
  }
  // Más frecuente; en empate, el que aparece primero en el Excel.
  let tipoSugerido = null;
  for (const t of orden) {
    if (!tipoSugerido || desglose[t] > desglose[tipoSugerido]) tipoSugerido = t;
  }
  return { desglose, tipoSugerido, lineasSinMotivo: lineas.filter((l) => !l.tipo).length };
}

/** Lanza si el buffer no es un libro de Excel legible. */
export function leerLibro(buffer) {
  // sheetRows: no carga filas más allá del tope (ver MAX_FILAS_LECTURA).
  // bookFiles: deja leer el XML del libro (fotos por fila en la hoja «Averia»).
  return XLSX.read(buffer, { type: 'buffer', cellDates: true, sheetRows: MAX_FILAS_LECTURA, bookFiles: true });
}

/**
 * Busca la plantilla en las hojas del libro (en orden) y devuelve los campos
 * auto-detectables + las líneas. Lanza FormatoNoReconocidoError si ninguna
 * hoja coincide con Tienda ni CEDI.
 */
export function parsearPlantilla(buffer) {
  const wb = leerLibro(buffer);

  // Plantilla CEDI por hojas (Averia / Diferencia / Sobrante NO esperado).
  const hojasIgnoradas = [];
  const hojas = hojasCedi(wb, hojasIgnoradas);
  if (hojas.length || hojasIgnoradas.length) {
    const { hojaNombre, ...resultado } = parsearCediHojas(hojas, wb);
    resultado.hojasIgnoradas = hojasIgnoradas;
    resultado.lineas = resultado.lineas.map((l, i) => ({ posicion: i + 1, ...l }));
    return { hoja: hojaNombre, ...resultado, ...resumirTipos(resultado.lineas) };
  }

  // Plantilla Tienda o CEDI clásica: una sola hoja con la tabla. Si otra hoja
  // también trae productos con la plantilla, no se elige una en silencio.
  let elegido = null;
  const otras = [];
  let cercana = null; // la hoja que más se parece a una plantilla, para decir qué columna falta
  for (const nombreHoja of wb.SheetNames) {
    const filas = filasDeHoja(wb.Sheets[nombreHoja]);
    if (!filas.length || filas.every(esVacia)) continue;

    const faltas = [];
    let resultado = null;
    const filaCedi = buscarFilaEncabezadoCedi(filas);
    if (filaCedi >= 0) {
      resultado = parsearCedi(filas, filaCedi, faltas, nombreHoja);
    } else {
      const filaEncabezado = buscarFilaEncabezadoTienda(filas);
      if (filaEncabezado >= 0) resultado = parsearTienda(filas, filaEncabezado, faltas, nombreHoja);
    }
    if (!resultado) {
      for (const [plantilla, req, limite] of [['Tienda', REQ_TIENDA, 60], ['CEDI', REQ_CEDI, 15]]) {
        const { faltan } = filaDeTitulos(filas, req, limite);
        // Solo si tiene al menos una de las columnas: una hoja de listas («Hoja1») no cuenta.
        if (faltan.length < req.length && (!cercana || faltan.length < cercana.faltan.length)) cercana = { hoja: nombreHoja.trim(), plantilla, faltan };
      }
      continue;
    }
    if (elegido) {
      if (resultado.lineas.length) otras.push(nombreHoja.trim());
      continue;
    }
    elegido = { nombreHoja, resultado, faltas };
  }

  if (!elegido) {
    if (cercana) {
      throw new PlantillaIncompletaError([
        `En la hoja «${cercana.hoja}» ${cercana.faltan.length > 1 ? 'faltan' : 'falta'} ${columnas(cercana.faltan)} de la plantilla de ${cercana.plantilla}.`,
      ]);
    }
    throw new FormatoNoReconocidoError();
  }
  const { nombreHoja, resultado, faltas } = elegido;
  if (otras.length && elegido.resultado.lineas.length) {
    throw new PlantillaIncompletaError(
      [`Hay productos en ${otras.length === 1 ? 'la hoja' : 'las hojas'} «${[nombreHoja.trim(), ...otras].join('», «')}». Deja todos los productos en una sola hoja.`],
      'El Excel trae la tabla de productos en más de una hoja:'
    );
  }
  if (faltas.length) throw new PlantillaIncompletaError(faltas);
  resultado.lineas = resultado.lineas.map((l, i) => ({ posicion: i + 1, ...l }));
  return { hoja: nombreHoja, ...resultado, ...resumirTipos(resultado.lineas) };
}
