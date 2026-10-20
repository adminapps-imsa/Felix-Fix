import { getPool, sql, S } from '../config/db.js';

// Lecturas del Tablero. Solo consultas: los cálculos (series, antigüedad,
// promedios) los hace src/domain/tablero.js con estas filas.

/** Quien ve solo una parte de Productos Dañados (Gof): el mismo filtro de la lista. */
function condicionAlcance(request, resoluciones) {
  if (!resoluciones) return '1 = 1';
  const params = resoluciones.map((res, i) => {
    request.input(`resolucion${i}`, sql.VarChar(20), res);
    return `@resolucion${i}`;
  });
  return `r.Resolucion IN (${params.join(', ')})`;
}

// ---------- Productos Dañados ----------

/** Reportes abiertos con la fecha en que llegaron a su etapa actual (último evento que los dejó en ese estado). */
export async function pdAbiertos(resoluciones) {
  const request = (await getPool()).request();
  const alcance = condicionAlcance(request, resoluciones);
  const { recordset } = await request.query(`
    SELECT r.ReporteId, r.Estado, r.NombreProducto, r.Cantidad, r.Motivo, t.Codigo AS TiendaCodigo, t.Nombre AS TiendaNombre,
      COALESCE(
        (SELECT MAX(h.FechaEvento) FROM ${S}.ReportesProductoDanadoHistorial h WHERE h.ReporteId = r.ReporteId AND h.EstadoNuevo = r.Estado),
        r.FechaCreacion
      ) AS Entrada
    FROM ${S}.ReportesProductoDanado r
    INNER JOIN ${S}.Tiendas t ON t.TiendaId = r.TiendaId
    WHERE r.Estado IN ('Pendiente', 'Rechazado', 'NFValidacion', 'Aprobado', 'EnContabilidad') AND ${alcance}
  `);
  return recordset;
}

/**
 * Hitos de cada reporte con movimiento desde `desde`: creación, respuesta del
 * proveedor, documento 1700, cierre del NF, envío a contabilidad y pago.
 * Sirve para la serie (nuevos/cerrados) y para los tiempos entre etapas.
 */
export async function pdHitos(resoluciones, desde) {
  const request = (await getPool()).request();
  const alcance = condicionAlcance(request, resoluciones);
  request.input('desde', sql.DateTime2, desde);
  const { recordset } = await request.query(`
    SELECT r.ReporteId, r.Resolucion, r.FechaCreacion AS Creado,
      MIN(CASE WHEN h.Accion = 'EnviadoProveedor' THEN h.FechaEvento END) AS EnviadoProveedor,
      MIN(CASE WHEN h.Accion IN ('Aprobado', 'Rechazado') THEN h.FechaEvento END) AS Respuesta,
      MIN(CASE WHEN h.Accion = 'Documento1700' THEN h.FechaEvento END) AS Documento1700,
      MIN(CASE WHEN h.Accion = 'NFCerrado' THEN h.FechaEvento END) AS NfCerrado,
      MIN(CASE WHEN h.Accion = 'EnviadoContabilidad' THEN h.FechaEvento END) AS EnviadoContabilidad,
      MIN(CASE WHEN h.Accion = 'PagoRecibido' THEN h.FechaEvento END) AS PagoRecibido,
      MIN(CASE WHEN h.EstadoNuevo = 'Cerrado' THEN h.FechaEvento END) AS Cerrado
    FROM ${S}.ReportesProductoDanado r
    LEFT JOIN ${S}.ReportesProductoDanadoHistorial h ON h.ReporteId = r.ReporteId
    WHERE ${alcance}
      AND (r.FechaCreacion >= @desde OR EXISTS (
        SELECT 1 FROM ${S}.ReportesProductoDanadoHistorial hx WHERE hx.ReporteId = r.ReporteId AND hx.FechaEvento >= @desde))
    GROUP BY r.ReporteId, r.Resolucion, r.FechaCreacion
  `);
  return recordset;
}

/** Reportes creados desde `desde`, por tienda, motivo y división (reportes y unidades). */
export async function pdDesglose(resoluciones, desde) {
  const request = (await getPool()).request();
  const alcance = condicionAlcance(request, resoluciones);
  request.input('desde', sql.DateTime2, desde);
  const { recordsets } = await request.query(`
    SELECT t.Codigo + ' ' + t.Nombre AS etiqueta, COUNT(*) AS n, SUM(r.Cantidad) AS unidades
    FROM ${S}.ReportesProductoDanado r INNER JOIN ${S}.Tiendas t ON t.TiendaId = r.TiendaId
    WHERE r.FechaCreacion >= @desde AND ${alcance}
    GROUP BY t.Codigo, t.Nombre;

    SELECT r.Motivo AS etiqueta, COUNT(*) AS n, SUM(r.Cantidad) AS unidades
    FROM ${S}.ReportesProductoDanado r
    WHERE r.FechaCreacion >= @desde AND ${alcance}
    GROUP BY r.Motivo;

    SELECT COALESCE(NULLIF(r.Division, ''), 'Sin división') AS etiqueta, COUNT(*) AS n, SUM(r.Cantidad) AS unidades
    FROM ${S}.ReportesProductoDanado r
    WHERE r.FechaCreacion >= @desde AND ${alcance}
    GROUP BY COALESCE(NULLIF(r.Division, ''), 'Sin división');
  `);
  const num = (filas) => filas.map((f) => ({ etiqueta: f.etiqueta, n: f.n, unidades: Number(f.unidades) || 0 }));
  return { porTienda: num(recordsets[0]), porMotivo: num(recordsets[1]), porDivision: num(recordsets[2]) };
}

/** Lo que hizo el usuario en Productos Dañados desde `desde`: eventos del historial por acción, y los reportes que creó. */
export async function pdMiTrabajo({ sub, username }, desde) {
  const request = (await getPool()).request();
  request.input('sub', sql.VarChar(150), sub || '').input('username', sql.VarChar(150), username || '').input('desde', sql.DateTime2, desde);
  const { recordsets } = await request.query(`
    SELECT Accion, COUNT(DISTINCT ReporteId) AS n
    FROM ${S}.ReportesProductoDanadoHistorial
    WHERE UsuarioId = @sub AND FechaEvento >= @desde
    GROUP BY Accion;

    SELECT COUNT(*) AS creados, COALESCE(SUM(Cantidad), 0) AS unidades
    FROM ${S}.ReportesProductoDanado
    WHERE EmpleadoReportaUsuario = @username AND FechaCreacion >= @desde;

    -- Los míos que siguen abiertos, por etapa (para quien reporta: cómo van).
    SELECT Estado, COUNT(*) AS n
    FROM ${S}.ReportesProductoDanado
    WHERE EmpleadoReportaUsuario = @username
    GROUP BY Estado;
  `);
  const acciones = Object.fromEntries(recordsets[0].map((f) => [f.Accion, f.n]));
  return {
    acciones,
    creados: recordsets[1][0]?.creados || 0,
    unidades: Number(recordsets[1][0]?.unidades) || 0,
    misPorEstado: Object.fromEntries(recordsets[2].map((f) => [f.Estado, f.n])),
  };
}

// ---------- Reclamos ----------

/**
 * Reclamos abiertos (por decidir), devueltos a quien los creó y cerrados sin
 * enviar a contabilidad, con cuándo llegaron a esa etapa.
 */
export async function recAbiertos() {
  const { recordset } = await (await getPool()).request().query(`
    SELECT r.ReclamoId, r.Token, r.Status, r.Tipo, r.Origen, r.Proveedor, r.Sucursal, r.Compradora, r.CreatedBy,
      CASE r.Status WHEN 'pendiente' THEN 'porDecidir' WHEN 'devuelto' THEN 'devuelto' ELSE 'porEnviar' END AS Cola,
      CASE r.Status
        WHEN 'pendiente' THEN r.CreatedAt
        -- Devuelto: desde la última devolución de la compradora.
        WHEN 'devuelto' THEN COALESCE((SELECT MAX(c.Fecha) FROM ${S}.ReclamoComentarios c WHERE c.ReclamoId = r.ReclamoId AND c.Tipo = 'devuelto'), r.CreatedAt)
        ELSE COALESCE(r.DecisionAt, r.CreatedAt)
      END AS Entrada,
      (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token AND l.DecStatus = 'pendiente') AS LineasPendientes
    FROM ${S}.Reclamos r
    WHERE r.Status IN ('pendiente', 'devuelto')
       OR (r.Status IN ('resuelto', 'rechazado') AND r.EnviadoContabilidadAt IS NULL)
  `);
  return recordset;
}

/** Hitos de los reclamos con movimiento desde `desde`. */
export async function recHitos(desde) {
  const { recordset } = await (await getPool()).request().input('desde', sql.DateTime2, desde).query(`
    SELECT ReclamoId, CreatedAt AS Creado, DecisionAt AS Decision, EnviadoContabilidadAt AS EnviadoContabilidad
    FROM ${S}.Reclamos
    WHERE CreatedAt >= @desde OR DecisionAt >= @desde OR EnviadoContabilidadAt >= @desde
  `);
  return recordset;
}

/** Reclamos creados desde `desde` por tipo, origen y proveedor; y productos decididos en el periodo. */
export async function recDesglose(desde) {
  const { recordsets } = await (await getPool()).request().input('desde', sql.DateTime2, desde).query(`
    SELECT Tipo AS etiqueta, COUNT(*) AS n FROM ${S}.Reclamos WHERE CreatedAt >= @desde GROUP BY Tipo;
    SELECT Origen AS etiqueta, COUNT(*) AS n FROM ${S}.Reclamos WHERE CreatedAt >= @desde GROUP BY Origen;
    SELECT COALESCE(NULLIF(Proveedor, ''), 'Sin proveedor') AS etiqueta, COUNT(*) AS n
    FROM ${S}.Reclamos WHERE CreatedAt >= @desde GROUP BY COALESCE(NULLIF(Proveedor, ''), 'Sin proveedor');

    -- Productos de los reclamos creados en el periodo, por cómo quedaron.
    SELECT l.DecStatus AS etiqueta, COUNT(*) AS n, COALESCE(SUM(l.Cantidad), 0) AS unidades
    FROM ${S}.ReclamoLineas l JOIN ${S}.Reclamos r ON r.Token = l.ReclamoToken
    WHERE r.CreatedAt >= @desde
    GROUP BY l.DecStatus;
  `);
  return {
    porTipo: recordsets[0],
    porOrigen: recordsets[1],
    porProveedor: recordsets[2],
    productos: recordsets[3].map((f) => ({ etiqueta: f.etiqueta, n: f.n, unidades: Number(f.unidades) || 0 })),
  };
}

/** Lo que hizo el usuario en Reclamos desde `desde`. Los reclamos guardan el username (no el sub). */
export async function recMiTrabajo({ username }, desde) {
  const { recordset } = await (await getPool())
    .request()
    .input('username', sql.VarChar(150), username || '')
    .input('desde', sql.DateTime2, desde).query(`
      SELECT
        (SELECT COUNT(*) FROM ${S}.Reclamos WHERE CreatedBy = @username AND CreatedAt >= @desde) AS creados,
        (SELECT COUNT(*) FROM ${S}.Reclamos WHERE DecisionBy = @username AND DecisionAt >= @desde) AS cerrados,
        (SELECT COUNT(*) FROM ${S}.Reclamos WHERE EnviadoContabilidadBy = @username AND EnviadoContabilidadAt >= @desde) AS enviados,
        (SELECT COUNT(*) FROM ${S}.ReclamoLineas WHERE DecBy = @username AND DecAt >= @desde AND DecStatus = 'aprobado') AS productosAprobados,
        (SELECT COUNT(*) FROM ${S}.ReclamoLineas WHERE DecBy = @username AND DecAt >= @desde AND DecStatus = 'rechazado') AS productosRechazados,
        (SELECT COUNT(*) FROM ${S}.Reclamos WHERE CreatedBy = @username AND Status IN ('pendiente', 'notificado')) AS misAbiertos
    `);
  return recordset[0];
}

// ---------- Contabilidad (documentos de reclamos) ----------

export async function docsPendientes() {
  const { recordset } = await (await getPool()).request().query(`
    SELECT d.DocumentoId, d.NumeroDocumento, d.Total, d.EnviadoAt AS Entrada, r.ReclamoId, r.Proveedor
    FROM ${S}.ReclamoDocumentosContabilidad d JOIN ${S}.Reclamos r ON r.ReclamoId = d.ReclamoId
    WHERE d.Estado = 'pendiente'
  `);
  return recordset;
}

/** Documentos recibidos desde `desde` (fecha y monto) y su total por proveedor. */
export async function docsRecibidos(desde) {
  const { recordsets } = await (await getPool()).request().input('desde', sql.DateTime2, desde).query(`
    SELECT d.EnviadoAt, d.Total FROM ${S}.ReclamoDocumentosContabilidad d WHERE d.EnviadoAt >= @desde;

    SELECT COALESCE(NULLIF(r.Proveedor, ''), 'Sin proveedor') AS etiqueta, COUNT(*) AS n, COALESCE(SUM(d.Total), 0) AS monto
    FROM ${S}.ReclamoDocumentosContabilidad d JOIN ${S}.Reclamos r ON r.ReclamoId = d.ReclamoId
    WHERE d.EnviadoAt >= @desde
    GROUP BY COALESCE(NULLIF(r.Proveedor, ''), 'Sin proveedor');
  `);
  return {
    recibidos: recordsets[0].map((f) => ({ fecha: f.EnviadoAt, total: Number(f.Total) || 0 })),
    porProveedor: recordsets[1].map((f) => ({ etiqueta: f.etiqueta, n: f.n, monto: Number(f.monto) || 0 })),
  };
}
