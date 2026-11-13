// Tienda de cada usuario (Configuración → Tiendas, tabla UsuarioTiendas,
// migración 035). Quien está en una tienda ve solo lo de esa tienda (y, con
// «Solo lo que crea», solo lo suyo). Las reglas están en domain/tienda.js;
// aquí, cómo se leen y el SQL equivalente, para que listas, KPIs y Tablero
// cuenten lo mismo que se ve.
//
// El super administrador (Configuración) ve todo aunque esté en una tienda.
import { getPool, sql, S } from '../../config/db.js';
import { tienePermiso, PERMISO_CONFIGURACION } from './permisos.js';
import { notFound } from '../../utils/httpError.js';
import { veReclamo, veReporte, formasDe } from '../../domain/tienda.js';
import { logger } from '../../utils/logger.js';

const CI = 'COLLATE Latin1_General_CI_AI';
const limpio = (col) => `LTRIM(RTRIM(${col})) ${CI}`;

const TTL_MS = 30 * 1000;
let cache = null; // { at, porUsuario: Map<username, { tiendaId, codigo, nombre, soloPropios }> }

export function invalidarTiendas() {
  cache = null;
}

/** username (minúsculas) → { tiendaId, codigo, nombre, soloPropios }. */
export async function mapaTiendasUsuarios() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.porUsuario;
  try {
    const { recordset } = await (await getPool()).request().query(`
      SELECT u.Username, u.TiendaId, u.SoloPropios, t.Codigo, t.Nombre
      FROM ${S}.UsuarioTiendas u
      LEFT JOIN ${S}.Tiendas t ON t.TiendaId = u.TiendaId
      WHERE u.TiendaId IS NOT NULL OR u.SoloPropios = 1
    `);
    cache = {
      at: Date.now(),
      porUsuario: new Map(
        recordset.map((f) => [
          f.Username.trim().toLowerCase(),
          { tiendaId: f.TiendaId ?? null, codigo: f.Codigo ?? null, nombre: f.Nombre ?? null, soloPropios: Boolean(f.SoloPropios) },
        ])
      ),
    };
  } catch (err) {
    // Sin la tabla o sin BD: con lo anterior si lo hay; si no, el error sube (nunca ver de más en silencio).
    if (!cache) throw err;
    logger.warn({ err: err.message }, 'No se pudieron leer las tiendas de los usuarios: se usan las anteriores');
  }
  return cache.porUsuario;
}

/**
 * Alcance de tienda del usuario de la petición: null (ve todo) o
 * { tiendaId, codigo, nombre, soloPropios, username }.
 */
export async function tiendaDe(usuario) {
  if (!usuario?.username || tienePermiso(usuario, PERMISO_CONFIGURACION)) return null;
  const t = (await mapaTiendasUsuarios()).get(usuario.username.trim().toLowerCase());
  return t ? { ...t, username: usuario.username } : null;
}

/**
 * `condicion` o, además, los casos que creó `username` (columna `columna`):
 * quien crea un caso siempre lo ve, aunque no entre en su tienda ni en sus
 * marcas de compradora. Sin condición (ve todo) o sin usuario, la deja igual.
 */
export function oPropio(request, condicion, columna, username) {
  if (!condicion || !username) return condicion;
  if (!request.parameters?.yoCreador) request.input('yoCreador', sql.VarChar(150), String(username).trim());
  return `(${condicion} OR ${limpio(columna)} = @yoCreador)`;
}

/** Condición SQL sobre un reporte de Productos Dañados (alias `a`), o null si ve todo. */
export function condicionReporteTienda(request, alcance, a = 'r') {
  if (!alcance) return null;
  const partes = [];
  if (alcance.tiendaId != null) {
    if (!request.parameters?.tdaId) request.input('tdaId', sql.Int, alcance.tiendaId);
    partes.push(`${a}.TiendaId = @tdaId`);
  }
  if (alcance.soloPropios) {
    if (!request.parameters?.tdaCreador) request.input('tdaCreador', sql.VarChar(150), alcance.username);
    partes.push(`${limpio(`${a}.EmpleadoReportaUsuario`)} = @tdaCreador`);
  }
  return partes.length ? oPropio(request, `(${partes.join(' AND ')})`, `${a}.EmpleadoReportaUsuario`, alcance.username) : null;
}

/**
 * Condición SQL sobre un reclamo (alias `a`) para una tienda: los de origen
 * Tienda con esa sucursal (por nombre, código o alias; sin acentos ni
 * espacios, igual que esSucursalDe). `prefijo` separa los parámetros cuando
 * hay dos condiciones en la misma consulta (alcance y filtro).
 */
export function condicionSucursal(request, tienda, a = 'r', prefijo = 'tda') {
  const formas = formasDe(tienda);
  if (!formas.length) return '1 = 0';
  const params = formas.map((f, i) => {
    const n = `${prefijo}F${i}`;
    if (!request.parameters?.[n]) request.input(n, sql.NVarChar(150), f);
    return `@${n}`;
  });
  return `(${a}.Origen = 'tienda' AND REPLACE(LTRIM(RTRIM(${a}.Sucursal)), ' ', '') ${CI} IN (${params.join(', ')}))`;
}

/** Condición SQL sobre un reclamo (alias `a`) para el alcance del usuario, o null si ve todo. */
export function condicionReclamoTienda(request, alcance, a = 'r') {
  if (!alcance) return null;
  const partes = [];
  if (alcance.tiendaId != null) partes.push(condicionSucursal(request, alcance, a));
  if (alcance.soloPropios) {
    if (!request.parameters?.tdaCreador) request.input('tdaCreador', sql.VarChar(150), alcance.username);
    partes.push(`${limpio(`${a}.CreatedBy`)} = @tdaCreador`);
  }
  return partes.length ? oPropio(request, `(${partes.join(' AND ')})`, `${a}.CreatedBy`, alcance.username) : null;
}

const ES_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `router.param` para las rutas de un caso (/:token o /:id): quien está en una
 * tienda y no ve el caso recibe 404, igual que si no existiera (detalle,
 * archivos y acciones).
 */
export const exigirTienda = (tipo) => async (req, res, next, valor) => {
  try {
    const alcance = await tiendaDe(req.user);
    if (!alcance) return next();
    const pool = await getPool();
    let fila = null;
    if (tipo === 'reclamo') {
      if (!ES_GUID.test(String(valor))) return next(); // el servicio responde 404
      const { recordset } = await pool.request().input('token', sql.UniqueIdentifier, valor)
        .query(`SELECT Origen, Sucursal, CreatedBy FROM ${S}.Reclamos WHERE Token = @token`);
      fila = recordset[0];
      if (fila && !veReclamo(alcance, fila)) return next(notFound('Reclamo no encontrado.'));
    } else {
      const id = Number(valor);
      if (!Number.isSafeInteger(id) || id <= 0) return next(); // el controlador responde 404
      const { recordset } = await pool.request().input('id', sql.BigInt, id)
        .query(`SELECT TiendaId, EmpleadoReportaUsuario FROM ${S}.ReportesProductoDanado WHERE ReporteId = @id`);
      fila = recordset[0];
      if (fila && !veReporte(alcance, fila)) return next(notFound('Reporte no encontrado.'));
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Alcance de un usuario en Reclamos: { compradora, tienda, username }
 * (cualquiera puede ser null). Condición SQL sobre un reclamo (alias `a`) con
 * las dos reglas, más los que creó `username`, o '1 = 1' si ve todo. Acepta
 * también solo el nombre de la compradora (texto).
 */
export function condicionAlcanceReclamo(request, alcance, a, condicionCompradora) {
  const { compradora = null, tienda = null, username = null } = typeof alcance === 'string' || alcance == null ? { compradora: alcance } : alcance;
  const partes = [];
  if (compradora) partes.push(condicionCompradora(request, compradora, a));
  const enTienda = condicionReclamoTienda(request, tienda, a);
  if (enTienda) partes.push(enTienda);
  return partes.length ? oPropio(request, `(${partes.join(' AND ')})`, `${a}.CreatedBy`, username) : '1 = 1';
}
