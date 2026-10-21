// Qué casos ve cada compradora: los de sus mundos y marcas, según el catálogo
// de FelixApproval (compradoras_proveedores: proveedor, marca, mundo, compradora).
//
//   Reclamos: los que la tienen como «Compradora», o cuyo mundo y marca son
//     suyos en el catálogo. Si el mundo es solo de ella, cualquier marca.
//   Productos Dañados: no guardan mundo; se busca la marca del reporte en el
//     catálogo. Si la marca no está, va a la compradora principal de Belleza
//     (Perfumería y Cosméticos), la que tiene más filas de ese mundo.
//
// Solo se aplica a quien está en CompradoraUsuarios (migración 020). Los demás
// roles, el super administrador y una compradora que no está en el catálogo ven
// todo, como antes. La regla va en SQL para que listas, KPIs y Tablero cuenten
// lo mismo que se ve.
import { getPool, sql, S } from '../../config/db.js';
import { env } from '../../config/env.js';
import { tienePermiso, PERMISO_CONFIGURACION } from './permisos.js';
import { datosDeUsuario } from './keycloakAdmin.js';
import { notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';

const CAT = env.reclamos.compradorasTabla;
// Sin distinguir mayúsculas ni acentos, y sin espacios de sobra (el catálogo trae «ZANYA LOPEZ », «Belleza»…).
const CI = 'COLLATE Latin1_General_CI_AI';
const limpio = (col) => `LTRIM(RTRIM(${col})) ${CI}`;
/** Mundo del catálogo al que pertenecen los productos dañados (divisiones Perfumería y Cosméticos). */
export const MUNDO_PRODUCTOS = 'BELLEZA';

const TTL_MS = 5 * 60 * 1000;
let cache = null; // { at, porUsuario: Map<username, nombre> }

/** username (minúsculas) → nombre en el catálogo. */
export async function mapaCompradoras() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.porUsuario;
  const { recordset } = await (await getPool()).request().query(`SELECT Username, NombreCatalogo FROM ${S}.CompradoraUsuarios`);
  cache = { at: Date.now(), porUsuario: new Map(recordset.map((f) => [f.Username.trim().toLowerCase(), f.NombreCatalogo.trim()])) };
  return cache.porUsuario;
}

/** Nombre de catálogo si el usuario es una compradora con alcance; null si ve todo. */
export async function compradoraDe(usuario) {
  if (!usuario?.username || tienePermiso(usuario, PERMISO_CONFIGURACION)) return null;
  return (await mapaCompradoras()).get(usuario.username.trim().toLowerCase()) || null;
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
 * Avisos: quita de `correos` a las compradoras con alcance a quienes el caso no
 * les toca. `caso`: { reclamoToken } o { reporteId }. Si algo falla, deja la
 * lista como estaba (un aviso de más es mejor que uno perdido).
 */
export async function quitarCompradorasAjenas(correos, caso) {
  if (!correos.length) return correos;
  try {
    const fuera = new Set();
    for (const [username, nombre] of await mapaCompradoras()) {
      const { correo } = await datosDeUsuario(username);
      const c = correo?.toLowerCase();
      if (!c || !correos.includes(c)) continue;
      const ve = caso.reclamoToken ? await puedeVerReclamo(caso.reclamoToken, nombre) : await puedeVerReporte(caso.reporteId, nombre);
      if (!ve) fuera.add(c);
    }
    return correos.filter((c) => !fuera.has(c));
  } catch (err) {
    logger.warn({ err: err.message }, 'No se pudo filtrar los avisos por compradora: se envían a todo el área');
    return correos;
  }
}
