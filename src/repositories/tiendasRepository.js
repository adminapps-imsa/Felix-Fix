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
