// Lectura de la bitácora (Configuración → Bitácora). La escribe
// services/bitacora/registro.js.
import { getPool, sql, S } from '../config/db.js';

/**
 * Condiciones comunes. `f`: { desde, hasta (Date, hasta exclusivo), usuario,
 * rol, modulo, nivel, q }. `sin`: filtros que no se aplican (para los conteos).
 */
function condiciones(request, f, sin = []) {
  const c = [];
  const usa = (k) => f[k] != null && f[k] !== '' && !sin.includes(k);
  if (usa('desde')) {
    request.input('desde', sql.DateTime2, f.desde);
    c.push('b.Fecha >= @desde');
  }
  if (usa('hasta')) {
    request.input('hasta', sql.DateTime2, f.hasta);
    c.push('b.Fecha < @hasta');
  }
  if (usa('usuario')) {
    request.input('usuario', sql.VarChar(150), f.usuario);
    c.push('b.Usuario = @usuario');
  }
  if (usa('rol')) {
    request.input('rol', sql.NVarChar(120), `%,${f.rol.replace(/[[%_]/g, '[$&]')},%`);
    c.push('b.Roles LIKE @rol');
  }
  if (usa('modulo')) {
    request.input('modulo', sql.VarChar(30), f.modulo);
    c.push('b.Modulo = @modulo');
  }
  if (usa('nivel')) {
    request.input('nivel', sql.VarChar(10), f.nivel);
    c.push('b.Nivel = @nivel');
  }
  if (usa('q')) {
    request.input('q', sql.NVarChar(220), `%${f.q.replace(/[[%_]/g, '[$&]')}%`);
    c.push(`(b.Accion LIKE @q OR b.Mensaje LIKE @q OR b.Ruta LIKE @q OR b.Codigo LIKE @q OR b.UsuarioNombre LIKE @q OR b.Usuario LIKE @q
             OR ('REC-' + RIGHT('000000' + CAST(r.ReclamoId AS VARCHAR(20)), 6)) LIKE @q OR ('PD-' + b.RecursoId) LIKE @q)`);
  }
  return c;
}

const DESDE = `
  FROM ${S}.Bitacora b
  LEFT JOIN ${S}.Reclamos r ON b.RecursoTipo = 'reclamo' AND r.Token = TRY_CONVERT(UNIQUEIDENTIFIER, b.RecursoId)`;

/** Una página de una clase ('actividad' | 'error'), lo más nuevo primero. */
export async function listar(clase, f, { offset, pageSize }) {
  const pool = await getPool();
  const req = pool.request().input('clase', sql.VarChar(10), clase).input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSize);
  const where = ['b.Clase = @clase', ...condiciones(req, f)].join(' AND ');
  const { recordsets } = await req.query(`
    SELECT COUNT(*) AS total ${DESDE} WHERE ${where};
    SELECT b.BitacoraId, b.Fecha, b.Clase, b.Nivel, b.Modulo, b.Accion, b.Mensaje, b.Codigo, b.Usuario, b.UsuarioNombre, b.Roles,
           b.Metodo, b.Ruta, b.Estado, b.DuracionMs, b.RecursoTipo, b.RecursoId, r.ReclamoId
    ${DESDE} WHERE ${where}
    ORDER BY b.Fecha DESC, b.BitacoraId DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
  return { total: recordsets[0][0].total, items: recordsets[1] };
}

/**
 * Conteos para las pestañas y los filtros, con las fechas, el usuario, el rol
 * y el texto elegidos (sin módulo ni nivel, para que se vea qué hay en cada uno).
 */
export async function resumen(f) {
  const pool = await getPool();
  const req = pool.request();
  const c = condiciones(req, f, ['modulo', 'nivel']);
  const where = c.length ? `WHERE ${c.join(' AND ')}` : '';
  const { recordset } = await req.query(`
    SELECT b.Clase, b.Nivel, b.Modulo, COUNT(*) AS n ${DESDE} ${where}
    GROUP BY b.Clase, b.Nivel, b.Modulo`);
  return recordset;
}

/** Usuarios y roles que aparecen en la bitácora (para las listas de filtros). */
export async function opciones() {
  const pool = await getPool();
  const { recordsets } = await pool.request().query(`
    SELECT b.Usuario, MAX(b.UsuarioNombre) AS UsuarioNombre, COUNT(*) AS n
    FROM ${S}.Bitacora b WHERE b.Usuario IS NOT NULL GROUP BY b.Usuario ORDER BY MAX(b.UsuarioNombre), b.Usuario;
    SELECT DISTINCT b.Roles FROM ${S}.Bitacora b WHERE b.Roles IS NOT NULL;`);
  const roles = new Set();
  for (const { Roles } of recordsets[1]) for (const r of Roles.split(',')) if (r) roles.add(r);
  return { usuarios: recordsets[0], roles: [...roles].sort((a, b) => a.localeCompare(b, 'es')) };
}

/** Lo de un reclamo en la bitácora (para su historial), del más viejo al más nuevo. */
export async function delReclamo(token) {
  const pool = await getPool();
  const { recordset } = await pool.request().input('token', sql.VarChar(64), String(token).toUpperCase()).query(`
    SELECT b.Fecha, b.Clase, b.Nivel, b.Accion, b.Mensaje, b.Usuario
    FROM ${S}.Bitacora b
    WHERE b.RecursoTipo = 'reclamo' AND UPPER(b.RecursoId) = @token
    ORDER BY b.Fecha`);
  return recordset;
}
