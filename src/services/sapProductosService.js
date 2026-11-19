/**
 * Consulta de productos en SAP (Oracle, solo lectura) para el módulo de Reclamos.
 *
 * Se usa para:
 *   1. Validar los códigos de barra del Excel (¿existe el producto?).
 *   2. Enriquecer cada línea con descripción y precio de venta.
 *   3. Plantilla CEDI (no trae proveedor): primer código de barra válido ->
 *      su orden de compra más reciente -> proveedor.
 *
 * De dónde sale cada dato (mandante y esquema en env.sap):
 *   - Código de barra: MEAN.EAN11 (índice MEAN~N). Un material puede tener
 *     varios; se acepta cualquiera. Se prueban variantes con/sin ceros a la
 *     izquierda porque Excel los pierde y SAP_V_BARCODE los rellena a 12/15.
 *   - Descripción: MAKT en español (SPRAS 'S').
 *   - Precio de venta: A073 + KONP, condición VKP0, org. ventas 1100, canal FM
 *     (los mismos criterios que la vista SAP_V_PRECIO_VENTA), vigente hoy.
 *     A diferencia de la vista, no filtra materiales bloqueados: un producto
 *     dañado o descontinuado igual necesita su precio.
 *   - Proveedor: última OC (EKPO -> EKKO -> LFA1.NAME1), por el material o su
 *     artículo genérico (MARA.SATNR).
 *
 * Contrato (el resto del módulo ya lo respeta):
 *   - consultarProductos(codigos) -> { disponible, productos: Map<codigo, {descripcion, precioVenta}> }
 *     `disponible: false` => la validación no se pudo hacer (la UI lo muestra
 *     como "validación no disponible", NO como "producto no encontrado").
 *   - proveedorPorCodigoBarra(codigo) -> string | null
 *   - Nunca debe lanzar por SAP caído: devolver disponible:false / null y
 *     dejar que el usuario complete a mano.
 */
import { env, isSapConfigured, SCHEMA_PATTERN } from '../config/env.js';
import { getSapOraclePool } from '../config/oracle.js';
import { logger } from '../utils/logger.js';

const PRECIO = { kschl: 'VKP0', vkorg: '1100', vtweg: 'FM' };
const LOTE = 500; // Oracle admite hasta 1000 elementos en un IN

if (!SCHEMA_PATTERN.test(env.sap.esquema)) throw new Error(`SAP_ESQUEMA inválido: "${env.sap.esquema}"`);
const T = (tabla) => `${env.sap.esquema}.${tabla}`;

async function consultar(sql, binds) {
  const pool = await getSapOraclePool();
  const conn = await pool.getConnection();
  try {
    conn.callTimeout = env.sap.timeoutMs;
    const { rows } = await conn.execute(sql, { mandt: env.sap.mandante, ...binds });
    return rows;
  } finally {
    await conn.close();
  }
}

/** Consulta `valores` en lotes con un IN (:v0, :v1, ...). `armar(inList)` devuelve el SQL. */
async function enLotes(valores, armar, binds = {}) {
  const filas = [];
  for (let i = 0; i < valores.length; i += LOTE) {
    const lote = valores.slice(i, i + LOTE);
    const lista = lote.map((v, j) => [`v${j}`, v]);
    filas.push(...(await consultar(armar(lista.map(([k]) => `:${k}`).join(',')), { ...binds, ...Object.fromEntries(lista) })));
  }
  return filas;
}

/** Formas en que el mismo código puede estar guardado en MEAN.EAN11. */
function variantes(codigo) {
  const c = String(codigo).trim();
  const out = new Set([c]);
  if (/^\d+$/.test(c)) {
    const sinCeros = c.replace(/^0+/, '') || '0';
    out.add(sinCeros);
    for (const n of [12, 13, 14, 15]) if (sinCeros.length <= n) out.add(sinCeros.padStart(n, '0'));
  }
  return [...out];
}

/** Map<codigo original, MATNR>. */
async function materialesPorCodigo(codigos) {
  const porVariante = new Map();
  for (const c of codigos) for (const v of variantes(c)) if (!porVariante.has(v)) porVariante.set(v, c);

  const filas = await enLotes(
    [...porVariante.keys()],
    (lista) => `SELECT EAN11, MATNR, HPEAN FROM ${T('MEAN')} WHERE MANDT = :mandt AND EAN11 IN (${lista})`
  );
  // Si un código aparece en varios materiales, gana el que lo tiene como principal.
  filas.sort((a, b) => (b.HPEAN === 'X') - (a.HPEAN === 'X'));
  const out = new Map();
  for (const f of filas) {
    const original = porVariante.get(f.EAN11);
    if (original && !out.has(original)) out.set(original, f.MATNR);
  }
  return out;
}

async function descripciones(matnrs) {
  const filas = await enLotes(
    matnrs,
    (lista) => `SELECT MATNR, MAKTX FROM ${T('MAKT')} WHERE MANDT = :mandt AND SPRAS = 'S' AND MATNR IN (${lista})`
  );
  return new Map(filas.map((f) => [f.MATNR, f.MAKTX?.trim() || null]));
}

async function precios(matnrs) {
  const hoy = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const filas = await enLotes(
    matnrs,
    (lista) => `
      SELECT a.MATNR, MAX(p.KBETR) KBETR
        FROM ${T('A073')} a
        JOIN ${T('KONP')} p ON p.MANDT = a.MANDT AND p.KNUMH = a.KNUMH AND p.KSCHL = a.KSCHL
       WHERE a.MANDT = :mandt AND a.KAPPL = 'V' AND a.KSCHL = :kschl AND a.VKORG = :vkorg AND a.VTWEG = :vtweg
         AND a.MATNR IN (${lista}) AND a.DATAB <= :hoy AND a.DATBI >= :hoy AND p.LOEVM_KO = ' '
       GROUP BY a.MATNR`,
    { ...PRECIO, hoy }
  );
  return new Map(filas.map((f) => [f.MATNR, f.KBETR == null ? null : Number(f.KBETR)]));
}

// Productos ya consultados (descripción y precio cambian poco): 10 min en
// memoria, así abrir el detalle de un reclamo no vuelve a ir a SAP cada vez.
// Si SAP no respondió, por 1 min no se le insiste (cada intento esperaba
// hasta 20 s la conexión y el detalle tardaba eso en abrir; 2026-11-18).
const productosCache = new Map(); // codigo -> { producto | null, exp }
const PRODUCTO_TTL = 10 * 60 * 1000;
const NO_ENCONTRADO_TTL = 60 * 1000;
const PAUSA_SAP_CAIDO = 60 * 1000;
let sapCaidoHasta = 0;

const enCache = (codigo) => {
  const c = productosCache.get(codigo);
  return c && c.exp > Date.now() ? c : null;
};

async function buscarProductos(unicos) {
  const materiales = await materialesPorCodigo(unicos);
  const matnrs = [...new Set(materiales.values())];
  const [desc, prec] = matnrs.length ? await Promise.all([descripciones(matnrs), precios(matnrs)]) : [new Map(), new Map()];
  for (const codigo of unicos) {
    const matnr = materiales.get(codigo);
    const producto = matnr ? { descripcion: desc.get(matnr) ?? null, precioVenta: prec.get(matnr) ?? null } : null;
    // No encontrado: solo 1 min (Data puede crearlo en cualquier momento).
    productosCache.set(codigo, { producto, exp: Date.now() + (producto ? PRODUCTO_TTL : NO_ENCONTRADO_TTL) });
  }
}

/**
 * `esperaMaxMs`: para solo mostrar (el detalle), cuánto esperar a SAP como
 * máximo; si no alcanza, devuelve disponible:false y la consulta sigue y
 * queda en caché para la próxima vez. Sin él (crear, validar) espera todo.
 */
export async function consultarProductos(codigos, { esperaMaxMs = null } = {}) {
  const unicos = [...new Set((codigos || []).map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!isSapConfigured()) return { disponible: false, productos: new Map() };
  if (!unicos.length) return { disponible: true, productos: new Map() };
  const faltan = unicos.filter((c) => !enCache(c));
  if (faltan.length) {
    // Solo al mostrar se salta SAP si acaba de fallar; crear y validar siempre lo intentan.
    if (esperaMaxMs && sapCaidoHasta > Date.now()) return { disponible: false, productos: new Map() };
    const busqueda = buscarProductos(faltan).catch((err) => {
      sapCaidoHasta = Date.now() + PAUSA_SAP_CAIDO;
      logger.warn({ err: err.message }, 'SAP no disponible: no se validan los códigos de barra');
      return 'error';
    });
    let resultado;
    if (esperaMaxMs) {
      let timer;
      const tope = new Promise((resolve) => {
        timer = setTimeout(() => resolve('tarde'), esperaMaxMs);
      });
      resultado = await Promise.race([busqueda, tope]);
      clearTimeout(timer);
      if (resultado === 'tarde') logger.warn({ codigos: faltan.length, esperaMaxMs }, 'SAP lento: el detalle se muestra sin validar los códigos');
    } else {
      resultado = await busqueda;
    }
    if (resultado === 'error' || resultado === 'tarde') return { disponible: false, productos: new Map() };
  }
  const productos = new Map();
  for (const codigo of unicos) {
    const p = enCache(codigo)?.producto;
    if (p) productos.set(codigo, p);
  }
  return { disponible: true, productos };
}

/**
 * Material SAP (MATNR) de cada código de barras -> { disponible, materiales: Map<codigo, MATNR> }.
 * Nunca lanza.
 */
export async function materialesDeCodigos(codigos) {
  const unicos = [...new Set((codigos || []).map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!isSapConfigured()) return { disponible: false, materiales: new Map() };
  if (!unicos.length) return { disponible: true, materiales: new Map() };
  try {
    return { disponible: true, materiales: await materialesPorCodigo(unicos) };
  } catch (err) {
    logger.warn({ err: err.message }, 'SAP no disponible: no se buscan los materiales');
    return { disponible: false, materiales: new Map() };
  }
}

/**
 * Documento de material en SAP (MSEG, por su número) y el material del código
 * de barras del reporte, para validar el «Documento salida de NF».
 * -> { disponible, encontrado, matnr, lineas: [{ mjahr, bwart, lgort, werks, matnr, menge }] }
 * Nunca lanza: SAP caído o sin configurar => { disponible: false }.
 */
export async function documentoMaterialSap(numero, codigoBarra) {
  if (!isSapConfigured()) return { disponible: false };
  const codigo = String(codigoBarra ?? '').trim();
  try {
    const [filas, materiales] = await Promise.all([
      consultar(
        `SELECT MJAHR, BWART, LGORT, WERKS, MATNR, MENGE FROM ${T('MSEG')} WHERE MANDT = :mandt AND MBLNR = :mblnr`,
        { mblnr: String(numero) }
      ),
      codigo ? materialesPorCodigo([codigo]) : Promise.resolve(new Map()),
    ]);
    return {
      disponible: true,
      encontrado: filas.length > 0,
      matnr: materiales.get(codigo) ?? null,
      lineas: filas.map((f) => ({
        mjahr: f.MJAHR,
        bwart: String(f.BWART).trim(),
        lgort: String(f.LGORT).trim(),
        werks: String(f.WERKS).trim(),
        matnr: f.MATNR,
        menge: Number(f.MENGE),
      })),
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'SAP no disponible: no se pudo validar el documento salida de NF');
    return { disponible: false };
  }
}

export async function proveedorPorCodigoBarra(codigo) {
  const c = String(codigo ?? '').trim();
  if (!c || !isSapConfigured()) return null;
  try {
    const matnr = (await materialesPorCodigo([c])).get(c);
    if (!matnr) return null;
    const [fila] = await consultar(
      `SELECT NAME1 FROM (
         SELECT l.NAME1
           FROM ${T('EKPO')} p
           JOIN ${T('EKKO')} k ON k.MANDT = p.MANDT AND k.EBELN = p.EBELN
           JOIN ${T('LFA1')} l ON l.MANDT = k.MANDT AND l.LIFNR = k.LIFNR
          WHERE p.MANDT = :mandt AND p.LOEKZ = ' '
            AND p.MATNR IN (SELECT :matnr FROM dual UNION SELECT SATNR FROM ${T('MARA')} WHERE MANDT = :mandt AND MATNR = :matnr AND SATNR <> ' ')
          ORDER BY k.BEDAT DESC, k.EBELN DESC)
        WHERE ROWNUM = 1`,
      { matnr }
    );
    return fila?.NAME1?.trim() || null;
  } catch (err) {
    logger.warn({ err: err.message, codigo: c }, 'SAP no disponible: no se pudo inferir el proveedor');
    return null;
  }
}
