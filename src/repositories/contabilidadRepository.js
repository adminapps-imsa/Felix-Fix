import { getPool, sql, S } from '../config/db.js';

// Bandeja de contabilidad: documentos (notas de débito) de los reclamos
// enviados a contabilidad, con los datos del reclamo para listarlos.
const SELECT_BASE = `
  SELECT
    d.DocumentoId, d.ReclamoId, d.AdjuntoFilename, d.AdjuntoNombre, d.NumeroDocumento, d.TipoDocumento,
    d.Movimiento, d.FechaDocumento, d.Total, d.Lineas, d.Validacion, d.Estado, d.EnviadoAt, d.EnviadoPor,
    d.CreatedAt, d.UpdatedAt,
    r.Token AS ReclamoToken, r.Proveedor, r.NumeroEmbarqueFactura, r.Compradora, r.AdjuntosExtra,
    r.Status AS ReclamoStatus, r.Comentario AS DecisionComentario
  FROM ${S}.ReclamoDocumentosContabilidad d
  JOIN ${S}.Reclamos r ON r.ReclamoId = d.ReclamoId
`;

/** "REC-000008" como texto en SQL (mismo formato que numeroReclamo del servicio). */
const NUMERO_RECLAMO_SQL = `('REC-' + CASE WHEN LEN(CAST(r.ReclamoId AS VARCHAR(20))) >= 6
    THEN CAST(r.ReclamoId AS VARCHAR(20)) ELSE RIGHT('000000' + CAST(r.ReclamoId AS VARCHAR(20)), 6) END)`;

function aplicarFiltros(request, filtros) {
  const condiciones = [];
  if (filtros.estado) {
    request.input('estado', sql.NVarChar(30), filtros.estado);
    condiciones.push('d.Estado = @estado');
  }
  if (filtros.q) {
    request.input('q', sql.NVarChar(700), `%${filtros.q.replace(/[[%_]/g, '[$&]')}%`);
    condiciones.push(`(
      d.NumeroDocumento LIKE @q OR ${NUMERO_RECLAMO_SQL} LIKE @q OR CAST(r.ReclamoId AS VARCHAR(20)) LIKE @q
      OR r.Proveedor LIKE @q OR r.NumeroEmbarqueFactura LIKE @q
    )`);
  }
  return condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
}

export async function listar(filtros, { offset, pageSize }) {
  const pool = await getPool();

  const countRequest = pool.request();
  const whereCount = aplicarFiltros(countRequest, filtros);
  const { recordset: countRows } = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM ${S}.ReclamoDocumentosContabilidad d
    JOIN ${S}.Reclamos r ON r.ReclamoId = d.ReclamoId
    ${whereCount}
  `);

  const dataRequest = pool.request();
  const whereData = aplicarFiltros(dataRequest, filtros);
  dataRequest.input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSize);
  const { recordset } = await dataRequest.query(`
    ${SELECT_BASE}
    ${whereData}
    ORDER BY d.EnviadoAt DESC, d.DocumentoId DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  return { items: recordset, total: countRows[0].total };
}

export async function obtenerPorId(documentoId) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('id', sql.Int, documentoId)
    .query(`${SELECT_BASE} WHERE d.DocumentoId = @id`);
  return recordset[0] || null;
}

/** Líneas (JSON) de todos los documentos guardados de un reclamo. */
export async function lineasDeReclamo(reclamoId) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('reclamoId', sql.BigInt, reclamoId)
    .query(`SELECT DocumentoId, Lineas FROM ${S}.ReclamoDocumentosContabilidad WHERE ReclamoId = @reclamoId`);
  return recordset;
}

/**
 * Guarda el documento de un adjunto. Si no existe se inserta; si existe y
 * sigue 'pendiente', se actualizan datos, validación y fecha de envío (el
 * reclamo se reenvió). MERGE con HOLDLOCK: dos envíos en paralelo no chocan
 * con la UNIQUE (ReclamoId, AdjuntoFilename).
 * @returns 'insertado' | 'actualizado' | 'sin_cambios' (ya no está pendiente)
 */
export async function guardarDocumento(doc) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('reclamoId', sql.BigInt, doc.reclamoId)
    .input('filename', sql.NVarChar(255), doc.adjuntoFilename)
    .input('nombre', sql.NVarChar(255), doc.adjuntoNombre?.slice(0, 255) ?? null)
    .input('numero', sql.NVarChar(50), doc.numeroDocumento?.slice(0, 50) ?? null)
    .input('tipo', sql.NVarChar(100), doc.tipoDocumento?.slice(0, 100) ?? null)
    .input('movimiento', sql.NVarChar(150), doc.movimiento?.slice(0, 150) ?? null)
    .input('fecha', sql.Date, doc.fechaDocumento ?? null)
    .input('total', sql.Decimal(18, 2), doc.total ?? null)
    .input('lineas', sql.NVarChar(sql.MAX), JSON.stringify(doc.lineas ?? []))
    .input('validacion', sql.NVarChar(sql.MAX), JSON.stringify(doc.validacion ?? {}))
    .input('usuario', sql.NVarChar(150), doc.enviadoPor?.slice(0, 150) ?? null).query(`
      MERGE ${S}.ReclamoDocumentosContabilidad WITH (HOLDLOCK) AS t
      USING (SELECT @reclamoId AS ReclamoId, @filename AS AdjuntoFilename) AS s
        ON t.ReclamoId = s.ReclamoId AND t.AdjuntoFilename = s.AdjuntoFilename
      WHEN MATCHED AND t.Estado = 'pendiente' THEN
        UPDATE SET AdjuntoNombre = @nombre, NumeroDocumento = @numero, TipoDocumento = @tipo, Movimiento = @movimiento,
                   FechaDocumento = @fecha, Total = @total, Lineas = @lineas, Validacion = @validacion,
                   EnviadoAt = SYSUTCDATETIME(), EnviadoPor = @usuario, UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (ReclamoId, AdjuntoFilename, AdjuntoNombre, NumeroDocumento, TipoDocumento, Movimiento,
                FechaDocumento, Total, Lineas, Validacion, EnviadoPor)
        VALUES (@reclamoId, @filename, @nombre, @numero, @tipo, @movimiento, @fecha, @total, @lineas, @validacion, @usuario)
      OUTPUT $action AS Accion;
    `);
  const accion = recordset[0]?.Accion;
  return accion === 'INSERT' ? 'insertado' : accion === 'UPDATE' ? 'actualizado' : 'sin_cambios';
}
