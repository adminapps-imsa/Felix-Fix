import { getPool, sql, S } from '../config/db.js';

export async function listarTiendasActivas() {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(`SELECT TiendaId, Codigo, Nombre, Direccion FROM ${S}.Tiendas WHERE Activo = 1 ORDER BY Nombre`);
  return result.recordset;
}

export async function obtenerTiendaPorId(tiendaId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('tiendaId', sql.Int, tiendaId)
    .query(`SELECT TiendaId, Codigo, Nombre FROM ${S}.Tiendas WHERE TiendaId = @tiendaId`);
  return result.recordset[0] || null;
}

/** Tienda y «Solo lo que crea» de cada usuario que tiene algo asignado. */
export async function listarUsuarioTiendas() {
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT u.Username, u.TiendaId, u.SoloPropios, u.UpdatedAt, u.UpdatedBy
    FROM ${S}.UsuarioTiendas u
    WHERE u.TiendaId IS NOT NULL OR u.SoloPropios = 1
  `);
  return recordset;
}

/** Guarda la tienda (null = todas) y «Solo lo que crea» de un usuario. */
export async function guardarUsuarioTienda(username, tiendaId, soloPropios, usuario) {
  const pool = await getPool();
  await pool
    .request()
    .input('username', sql.VarChar(150), username)
    .input('tiendaId', sql.Int, tiendaId)
    .input('soloPropios', sql.Bit, soloPropios)
    .input('usuario', sql.VarChar(150), usuario).query(`
      MERGE ${S}.UsuarioTiendas WITH (HOLDLOCK) AS d
      USING (SELECT @username AS Username) AS o ON d.Username = o.Username
      WHEN MATCHED THEN UPDATE SET TiendaId = @tiendaId, SoloPropios = @soloPropios, UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @usuario
      WHEN NOT MATCHED THEN INSERT (Username, TiendaId, SoloPropios, UpdatedBy) VALUES (@username, @tiendaId, @soloPropios, @usuario);
    `);
}
