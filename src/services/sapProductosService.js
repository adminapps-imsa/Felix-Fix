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

export async function consultarProductos(codigos) {
  const unicos = [...new Set((codigos || []).map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!isSapConfigured()) return { disponible: false, productos: new Map() };
  if (!unicos.length) return { disponible: true, productos: new Map() };
  try {
    const materiales = await materialesPorCodigo(unicos);
    const matnrs = [...new Set(materiales.values())];
    const [desc, prec] = matnrs.length ? await Promise.all([descripciones(matnrs), precios(matnrs)]) : [new Map(), new Map()];
    const productos = new Map();
    for (const [codigo, matnr] of materiales) {
      productos.set(codigo, { descripcion: desc.get(matnr) ?? null, precioVenta: prec.get(matnr) ?? null });
    }
    return { disponible: true, productos };
  } catch (err) {
    logger.warn({ err: err.message }, 'SAP no disponible: no se validan los códigos de barra');
    return { disponible: false, productos: new Map() };
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
