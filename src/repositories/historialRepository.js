import { getPool, sql, S } from '../config/db.js';

/**
 * Inserta un evento de auditoría. Se pasa `transactionRequest` cuando el
 * caller ya tiene una transacción/request abierta (para insertar el evento
 * "Creado" junto con el reporte en la misma operación atómica).
 */
export async function registrarEvento(
  { reporteId, accion, estadoAnterior, estadoNuevo, usuarioId, usuarioNombre, detalle },
  request = null
) {
  const req = request || (await getPool()).request();
  await req
    .input('reporteId', sql.BigInt, reporteId)
    .input('accion', sql.VarChar(30), accion)
    .input('estadoAnterior', sql.VarChar(20), estadoAnterior || null)
    .input('estadoNuevo', sql.VarChar(20), estadoNuevo || null)
    .input('usuarioId', sql.VarChar(150), usuarioId)
    .input('usuarioNombre', sql.VarChar(150), usuarioNombre || null)
    .input('detalle', sql.NVarChar(1000), detalle || null).query(`
      INSERT INTO ${S}.ReportesProductoDanadoHistorial
        (ReporteId, Accion, EstadoAnterior, EstadoNuevo, UsuarioId, UsuarioNombre, Detalle)
      VALUES
        (@reporteId, @accion, @estadoAnterior, @estadoNuevo, @usuarioId, @usuarioNombre, @detalle)
    `);
}

export async function listarHistorialDeReporte(reporteId) {
  const pool = await getPool();
  const result = await pool.request().input('reporteId', sql.BigInt, reporteId).query(`
      SELECT HistorialId, Accion, EstadoAnterior, EstadoNuevo, UsuarioId, UsuarioNombre, Detalle, FechaEvento
      FROM ${S}.ReportesProductoDanadoHistorial
      WHERE ReporteId = @reporteId
      ORDER BY FechaEvento ASC
    `);
  return result.recordset;
}
