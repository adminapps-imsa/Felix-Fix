// Qué casos ve cada compradora: los de sus mundos y marcas, según el catálogo
// de FelixApproval (compradoras_proveedores: proveedor, marca, mundo, compradora).
//
//   Reclamos: los que la tienen como «Compradora», o cuyo mundo y marca son
//     suyos en el catálogo. Si el mundo es solo de ella, cualquier marca.
//   Productos Dañados: no guardan mundo; se busca la marca del reporte en el
//     catálogo. Si la marca no está, va a la compradora principal de Belleza
//     (Perfumería y Cosméticos), la que tiene más filas de ese mundo.
//
// Solo se aplica a quien está en CompradoraUsuarios (migración 020) sin VeTodo
// (021). Los demás roles, el super administrador, una compradora con VeTodo y
// una que no está en el catálogo ven todo, como antes. La regla va en SQL para
// que listas, KPIs y Tablero cuenten lo mismo que se ve.
//
// Avisos a las compradoras: solo a la ASIGNADA al caso (correosDeAsignadas), la
// vea todo o no. Reclamos: la elegida en «Compradora». Productos Dañados: la
// dueña de la marca en el catálogo (o la principal de Belleza).
import { getPool, sql, S } from '../../config/db.js';
import { env } from '../../config/env.js';
import { tienePermiso, PERMISO_CONFIGURACION } from './permisos.js';
import { notFound } from '../../utils/httpError.js';

const CAT = env.reclamos.compradorasTabla;
// Sin distinguir mayúsculas ni acentos, y sin espacios de sobra (el catálogo trae «ZANYA LOPEZ », «Belleza»…).
const CI = 'COLLATE Latin1_General_CI_AI';
const limpio = (col) => `LTRIM(RTRIM(${col})) ${CI}`;
/** Mundo del catálogo al que pertenecen los productos dañados (divisiones Perfumería y Cosméticos). */
export const MUNDO_PRODUCTOS = 'BELLEZA';

const TTL_MS = 5 * 60 * 1000;
let cache = null; // { at, porUsuario: Map<username, { nombre, veTodo }> }

/** Nombre comparable: sin acentos, mayúsculas y espacios colapsados («Zanya López » = «ZANYA LOPEZ»). */
export const normalizarNombre = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

/** username (minúsculas) → { nombre en el catálogo, veTodo }. */
export async function mapaCompradoras() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.porUsuario;
  const { recordset } = await (await getPool()).request().query(`SELECT Username, NombreCatalogo, VeTodo FROM ${S}.CompradoraUsuarios`);
  cache = {
    at: Date.now(),
    porUsuario: new Map(recordset.map((f) => [f.Username.trim().toLowerCase(), { nombre: f.NombreCatalogo.trim(), veTodo: Boolean(f.VeTodo) }])),
  };
  return cache.porUsuario;
}

/** Nombre de catálogo si el usuario es una compradora con alcance; null si ve todo. */
export async function compradoraDe(usuario) {
  if (!usuario?.username || tienePermiso(usuario, PERMISO_CONFIGURACION)) return null;
  const c = (await mapaCompradoras()).get(usuario.username.trim().toLowerCase());
  return c && !c.veTodo ? c.nombre : null;
}

const conNombre = (request, nombre) => {
  if (!request.parameters?.compNombre) request.input('compNombre', sql.NVarChar(150), nombre);
};

/** Condición SQL sobre un reclamo (alias `a`) para la compradora `nombre`. */
export function condicionReclamo(request, nombre, a = 'r') {
  conNombre(request, nombre);
  return `(
    ${limpio(`${a}.Compradora`)} = @compNombre
    OR EXISTS (
      SELECT 1 FROM ${CAT} cx
      WHERE ${limpio('cx.compradora')} = @compNombre AND ${limpio('cx.mundo')} = ${limpio(`${a}.Mundo`)}
        AND (${limpio('cx.marca')} = ${limpio(`${a}.Marca`)}
          -- Mundo solo suyo: cualquier marca.
          OR NOT EXISTS (SELECT 1 FROM ${CAT} cy WHERE ${limpio('cy.mundo')} = ${limpio(`${a}.Mundo`)} AND ${limpio('cy.compradora')} <> @compNombre))
    )
  )`;
}

/** Condición SQL sobre un reporte de producto dañado (alias `a`) para la compradora `nombre`. */
export function condicionReporte(request, nombre, a = 'r') {
  conNombre(request, nombre);
  return `(
    EXISTS (SELECT 1 FROM ${CAT} cx WHERE ${limpio('cx.compradora')} = @compNombre AND ${limpio('cx.marca')} = ${limpio(`${a}.Marca`)})
    OR (
      NOT EXISTS (SELECT 1 FROM ${CAT} cz WHERE ${limpio('cz.marca')} = ${limpio(`${a}.Marca`)})
      AND @compNombre = (
        SELECT TOP 1 LTRIM(RTRIM(cp.compradora)) ${CI} FROM ${CAT} cp
        WHERE ${limpio('cp.mundo')} = '${MUNDO_PRODUCTOS}' AND cp.compradora IS NOT NULL
        GROUP BY LTRIM(RTRIM(cp.compradora)) ORDER BY COUNT(*) DESC
      )
    )
  )`;
}

const ES_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function puedeVerReclamo(token, nombre) {
  if (!ES_GUID.test(String(token))) return true; // el servicio responde 404
  const request = (await getPool()).request().input('token', sql.UniqueIdentifier, token);
  const { recordset } = await request.query(`SELECT COUNT(*) AS n FROM ${S}.Reclamos r WHERE r.Token = @token AND ${condicionReclamo(request, nombre)}`);
  return recordset[0].n > 0;
}

export async function puedeVerReporte(reporteId, nombre) {
  const id = Number(reporteId);
  if (!Number.isSafeInteger(id) || id <= 0) return true; // el controlador responde 404
  const request = (await getPool()).request().input('reporteId', sql.BigInt, id);
  const { recordset } = await request.query(
    `SELECT COUNT(*) AS n FROM ${S}.ReportesProductoDanado r WHERE r.ReporteId = @reporteId AND ${condicionReporte(request, nombre)}`
  );
  return recordset[0].n > 0;
}

/**
 * `router.param` para las rutas de un caso (/:token o /:id): la compradora que
 * no lo tiene en su alcance recibe 404, igual que si no existiera (detalle,
 * archivos y acciones).
 */
export const exigirAlcance = (tipo) => async (req, res, next, valor) => {
  try {
    const nombre = await compradoraDe(req.user);
    if (!nombre) return next();
    const ve = tipo === 'reclamo' ? await puedeVerReclamo(valor, nombre) : await puedeVerReporte(valor, nombre);
    return ve ? next() : next(notFound(tipo === 'reclamo' ? 'Reclamo no encontrado.' : 'Reporte no encontrado.'));
  } catch (err) {
    return next(err);
  }
};

/**
 * Usuarios (username) de las compradoras asignadas al caso, vean todo o no.
 * `caso`: { reclamo } (con su Compradora) o { reporteId }.
 */
export async function usuariosAsignados(caso) {
  let nombres;
  if (caso.reclamo) nombres = caso.reclamo.Compradora ? [caso.reclamo.Compradora] : [];
  else {
    const pool = await getPool();
    const request = pool.request().input('reporteId', sql.BigInt, Number(caso.reporteId));
    const { recordsets } = await request.query(`
      DECLARE @marca NVARCHAR(200) = (SELECT LTRIM(RTRIM(Marca)) FROM ${S}.ReportesProductoDanado WHERE ReporteId = @reporteId);
      SELECT DISTINCT LTRIM(RTRIM(cx.compradora)) AS nombre FROM ${CAT} cx
      WHERE cx.compradora IS NOT NULL AND ${limpio('cx.marca')} = @marca;
      SELECT TOP 1 LTRIM(RTRIM(cp.compradora)) AS nombre FROM ${CAT} cp
      WHERE ${limpio('cp.mundo')} = '${MUNDO_PRODUCTOS}' AND cp.compradora IS NOT NULL
      GROUP BY LTRIM(RTRIM(cp.compradora)) ORDER BY COUNT(*) DESC;`);
    const porMarca = recordsets[0].map((f) => f.nombre);
    nombres = porMarca.length ? porMarca : recordsets[1].map((f) => f.nombre);
  }
  const buscados = new Set(nombres.map(normalizarNombre));
  return [...(await mapaCompradoras())].filter(([, c]) => buscados.has(normalizarNombre(c.nombre))).map(([username]) => username);
}
