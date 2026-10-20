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
function buscarFilaEncabezadoCedi(filas) {
  const limite = Math.min(filas.length, 15);
  for (let r = 0; r < limite; r += 1) {
    const headers = (filas[r] || []).map(normalizar);
    if (headers.includes('BARCODE') && headers.includes('MOTIVO')) return r;
  }
  return -1;
}

function parsearCedi(filas, filaEncabezado) {
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
  let fechaRegistro = null;

  for (const fila of datos) {
    const codigoBarra = aCodigoBarra(fila[iBarcode]);
    if (!codigoBarra || !/\d/.test(codigoBarra)) continue;

    const motivoTexto = textoCelda(fila[iMotivo]);
    const tipo = detectarTipoPorMotivo(motivoTexto);

    const diferencia = iDiferencia >= 0 ? aNumero(fila[iDiferencia]) : null;
    const averiadas = iAveriadas >= 0 ? aNumero(fila[iAveriadas]) : null;
    const esperada = iEsperada >= 0 ? aNumero(fila[iEsperada]) : null;
    const recibida = iRecibida >= 0 ? aNumero(fila[iRecibida]) : null;

    const cantidad = cantidadCedi({ tipo, esperada, recibida, diferencia, averiadas });

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

function buscarFilaEncabezadoTienda(filas) {
  const limite = Math.min(filas.length, 60);
  for (let r = 0; r < limite; r += 1) {
    const headers = (filas[r] || []).map(normalizar);
    const tieneMotivo = headers.some((h) => h === 'MOTIVO' || h.startsWith('MOTIVO'));
    const tieneDocumento = headers.some((h) => h.includes('DOCUMENTO'));
    const tieneCodigo = headers.some((h) => h.includes('CODIGO') && h.includes('BARRA'));
    if (tieneMotivo && tieneDocumento && tieneCodigo) return r;
  }
  return -1;
}

function parsearTienda(filas, filaEncabezado) {
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

  const meta = leerMetadatos(filas.slice(0, Math.min(filaEncabezado, 15)));

  const lineas = [];
  for (const fila of filasDatos) {
    // En el formato nuevo no hay bandera "RECLAMO" por fila: toda fila con
    // código de barra cuenta como línea.
    const codigoBarra = aCodigoBarra(fila[iCodigo]);
    if (!codigoBarra || !/\d/.test(codigoBarra)) continue;
    const motivoTexto = textoCelda(fila[iMotivo]);
    const cantidad = iCantidad >= 0 ? aNumero(fila[iCantidad]) : null;
    const tipo = detectarTipoPorMotivo(motivoTexto);
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
  return XLSX.read(buffer, { type: 'buffer', cellDates: true, sheetRows: MAX_FILAS_LECTURA });
}

/**
 * Busca la plantilla en las hojas del libro (en orden) y devuelve los campos
 * auto-detectables + las líneas. Lanza FormatoNoReconocidoError si ninguna
 * hoja coincide con Tienda ni CEDI.
 */
export function parsearPlantilla(buffer) {
  const wb = leerLibro(buffer);

  for (const nombreHoja of wb.SheetNames) {
    const filas = filasDeHoja(wb.Sheets[nombreHoja]);
    if (!filas.length || filas.every(esVacia)) continue;

    let resultado = null;
    const filaCedi = buscarFilaEncabezadoCedi(filas);
    if (filaCedi >= 0) {
      resultado = parsearCedi(filas, filaCedi);
    } else {
      const filaEncabezado = buscarFilaEncabezadoTienda(filas);
      if (filaEncabezado >= 0) resultado = parsearTienda(filas, filaEncabezado);
    }
    if (!resultado) continue;

    resultado.lineas = resultado.lineas.map((l, i) => ({ posicion: i + 1, ...l }));
    return { hoja: nombreHoja, ...resultado, ...resumirTipos(resultado.lineas) };
  }

  throw new FormatoNoReconocidoError();
}
