import { getPool, sql, S } from '../config/db.js';

// Bandeja de contabilidad: documentos (notas de débito) de los reclamos
// enviados a contabilidad, con los datos del reclamo para listarlos.
const SELECT_BASE = `
  SELECT
    d.DocumentoId, d.ReclamoId, d.AdjuntoFilename, d.AdjuntoNombre, d.NumeroDocumento, d.TipoDocumento,
    d.Movimiento, d.FechaDocumento, d.Total, d.Lineas, d.Validacion, d.Estado, d.EnviadoAt, d.EnviadoPor,
    d.CreatedAt, d.UpdatedAt,
    d.EnviadoProveedorAt, d.EnviadoProveedorPor, d.EnviadoProveedorA, d.ComentarioProveedor, d.EnviosProveedor,
    d.RespuestaAt, d.RespuestaPor, d.RegistroSap, d.RespuestaArchivo, d.RespuestaArchivoNombre,
    d.DecisionConta, d.DecisionContaAt, d.DecisionContaPor, d.DecisionContaComentario,
    r.CorreosProveedor,
    r.Token AS ReclamoToken, r.Proveedor, r.NumeroEmbarqueFactura, r.Compradora, r.AdjuntosExtra,
    r.Status AS ReclamoStatus, r.Comentario AS DecisionComentario, r.DecisionBy AS ReclamoDecisionBy
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
 * sigue 'pendiente', se actualizan datos y validación (el reclamo se
 * reenvió); EnviadoAt conserva la PRIMERA fecha de envío (de ahí se cuenta
 * cuánto lleva esperando en contabilidad, también en el Tablero). MERGE con HOLDLOCK: dos envíos en paralelo no chocan
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
                   EnviadoPor = @usuario, UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (ReclamoId, AdjuntoFilename, AdjuntoNombre, NumeroDocumento, TipoDocumento, Movimiento,
                FechaDocumento, Total, Lineas, Validacion, EnviadoPor)
        VALUES (@reclamoId, @filename, @nombre, @numero, @tipo, @movimiento, @fecha, @total, @lineas, @validacion, @usuario)
      OUTPUT $action AS Accion;
    `);
  const accion = recordset[0]?.Accion;
  return accion === 'INSERT' ? 'insertado' : accion === 'UPDATE' ? 'actualizado' : 'sin_cambios';
}

/** Documentos pendientes cuya validación guardada tiene diferencias (para revalidarlos). */
export async function pendientesConDiferencias() {
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT d.DocumentoId, d.ReclamoId, d.Lineas, d.Validacion, r.Token AS ReclamoToken
    FROM ${S}.ReclamoDocumentosContabilidad d
    JOIN ${S}.Reclamos r ON r.ReclamoId = d.ReclamoId
    WHERE d.Estado = 'pendiente' AND JSON_VALUE(d.Validacion, '$.estado') = 'diferencias'`);
  return recordset;
}

/** Cambia solo líneas y validación de un documento que sigue pendiente. */
export async function actualizarValidacion(documentoId, { lineas, validacion }) {
  const pool = await getPool();
  const { rowsAffected } = await pool
    .request()
    .input('id', sql.Int, documentoId)
    .input('lineas', sql.NVarChar(sql.MAX), JSON.stringify(lineas ?? []))
    .input('validacion', sql.NVarChar(sql.MAX), JSON.stringify(validacion ?? {}))
    .query(`UPDATE ${S}.ReclamoDocumentosContabilidad SET Lineas = @lineas, Validacion = @validacion, UpdatedAt = SYSUTCDATETIME()
            WHERE DocumentoId = @id AND Estado = 'pendiente'`);
  return rowsAffected[0] > 0;
}

// ------------------------------------------------------------------
// Envío al proveedor (contabilidad manda la nota de débito)
// ------------------------------------------------------------------

/**
 * Reserva el envío antes de mandar el correo: solo una petición a la vez por
 * documento (un doble clic no manda dos correos). Una reserva de más de 2 min
 * se da por caída. true si se reservó.
 */
export async function reservarEnvioProveedor(documentoId) {
  const pool = await getPool();
  const { rowsAffected } = await pool.request().input('id', sql.Int, documentoId).query(`
    UPDATE ${S}.ReclamoDocumentosContabilidad SET EnviandoProveedorAt = SYSUTCDATETIME()
    WHERE DocumentoId = @id
      AND (EnviandoProveedorAt IS NULL OR EnviandoProveedorAt < DATEADD(MINUTE, -2, SYSUTCDATETIME()))`);
  return rowsAffected[0] === 1;
}

export async function liberarEnvioProveedor(documentoId) {
  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.Int, documentoId)
    .query(`UPDATE ${S}.ReclamoDocumentosContabilidad SET EnviandoProveedorAt = NULL WHERE DocumentoId = @id`);
}

/** El correo salió: guarda el envío en el documento y los correos en el reclamo (para la próxima vez). */
export async function registrarEnvioProveedor(documentoId, { usuario, para, comentario }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('id', sql.Int, documentoId)
      .input('usuario', sql.NVarChar(150), usuario.slice(0, 150))
      .input('para', sql.NVarChar(2000), para.join(', ').slice(0, 2000))
      .input('comentario', sql.NVarChar(2000), comentario ? comentario.slice(0, 2000) : null)
      .input('correos', sql.NVarChar(sql.MAX), JSON.stringify(para)).query(`
        UPDATE ${S}.ReclamoDocumentosContabilidad
           SET EnviadoProveedorAt = SYSUTCDATETIME(), EnviadoProveedorPor = @usuario, EnviadoProveedorA = @para,
               ComentarioProveedor = @comentario, EnviosProveedor = EnviosProveedor + 1, EnviandoProveedorAt = NULL,
               UpdatedAt = SYSUTCDATETIME()
         WHERE DocumentoId = @id;
        UPDATE r SET CorreosProveedor = @correos
          FROM ${S}.Reclamos r JOIN ${S}.ReclamoDocumentosContabilidad d ON d.ReclamoId = r.ReclamoId
         WHERE d.DocumentoId = @id;`);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

// ------------------------------------------------------------------
// Respuesta del proveedor (aprobado: nota de crédito; no aprobado: registro SAP + documento)
// ------------------------------------------------------------------

/**
 * Guarda la respuesta si el documento sigue pendiente (la regla se revisa con
 * la fila bloqueada). `verificar(fila)` devuelve el motivo para no hacerlo o null.
 * -> null (no existe) | { bloqueado } | { ok: true }
 */
export async function registrarRespuesta(documentoId, { estado, registroSap, archivo, archivoNombre, usuario }, verificar) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('id', sql.Int, documentoId)
      .query(`SELECT DocumentoId, Estado, DecisionConta FROM ${S}.ReclamoDocumentosContabilidad WITH (UPDLOCK, HOLDLOCK) WHERE DocumentoId = @id`);
    const fila = recordset[0];
    if (!fila) {
      await transaction.rollback();
      return null;
    }
    const motivo = verificar(fila);
    if (motivo) {
      await transaction.rollback();
      return { bloqueado: motivo };
    }
    await new sql.Request(transaction)
      .input('id', sql.Int, documentoId)
      .input('estado', sql.NVarChar(30), estado)
      .input('registro', sql.NVarChar(50), registroSap ? registroSap.slice(0, 50) : null)
      .input('archivo', sql.NVarChar(255), archivo)
      .input('nombre', sql.NVarChar(255), archivoNombre ? archivoNombre.slice(0, 255) : null)
      .input('usuario', sql.NVarChar(150), usuario.slice(0, 150)).query(`
        UPDATE ${S}.ReclamoDocumentosContabilidad
           SET Estado = @estado, RegistroSap = @registro, RespuestaArchivo = @archivo, RespuestaArchivoNombre = @nombre,
               RespuestaAt = SYSUTCDATETIME(), RespuestaPor = @usuario, UpdatedAt = SYSUTCDATETIME()
         WHERE DocumentoId = @id`);
    await transaction.commit();
    return { ok: true };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/** Quita la respuesta (vuelve a pendiente). -> null | { bloqueado } | { archivoAnterior } */
export async function quitarRespuesta(documentoId, verificar) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('id', sql.Int, documentoId)
      .query(`SELECT DocumentoId, Estado, RespuestaArchivo FROM ${S}.ReclamoDocumentosContabilidad WITH (UPDLOCK, HOLDLOCK) WHERE DocumentoId = @id`);
    const fila = recordset[0];
    if (!fila) {
      await transaction.rollback();
      return null;
    }
    const motivo = verificar(fila);
    if (motivo) {
      await transaction.rollback();
      return { bloqueado: motivo };
    }
    await new sql.Request(transaction).input('id', sql.Int, documentoId).query(`
      UPDATE ${S}.ReclamoDocumentosContabilidad
         SET Estado = 'pendiente', RegistroSap = NULL, RespuestaArchivo = NULL, RespuestaArchivoNombre = NULL,
             RespuestaAt = NULL, RespuestaPor = NULL, UpdatedAt = SYSUTCDATETIME()
       WHERE DocumentoId = @id`);
    await transaction.commit();
    return { archivoAnterior: fila.RespuestaArchivo };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

// ------------------------------------------------------------------
// Decisión de contabilidad: reclamar o no al proveedor
// ------------------------------------------------------------------

async function conFilaBloqueada(documentoId, verificar, cambiar) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction).input('id', sql.Int, documentoId).query(`
      SELECT DocumentoId, Estado, DecisionConta, EnviadoProveedorAt
      FROM ${S}.ReclamoDocumentosContabilidad WITH (UPDLOCK, HOLDLOCK) WHERE DocumentoId = @id`);
    const fila = recordset[0];
    if (!fila) {
      await transaction.rollback();
      return null;
    }
    const motivo = verificar(fila);
    if (motivo) {
      await transaction.rollback();
      return { bloqueado: motivo };
    }
    await cambiar(new sql.Request(transaction).input('id', sql.Int, documentoId));
    await transaction.commit();
    return { ok: true };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/** Reclamar (sigue pendiente) o no reclamar (queda 'no_reclamado'). -> null | { bloqueado } | { ok } */
export function registrarDecision(documentoId, { decision, comentario, usuario }, verificar) {
  return conFilaBloqueada(documentoId, verificar, (req) =>
    req
      .input('decision', sql.NVarChar(20), decision)
      .input('comentario', sql.NVarChar(2000), comentario ? comentario.slice(0, 2000) : null)
      .input('usuario', sql.NVarChar(150), usuario.slice(0, 150)).query(`
        UPDATE ${S}.ReclamoDocumentosContabilidad
           SET DecisionConta = @decision, DecisionContaComentario = @comentario, DecisionContaAt = SYSUTCDATETIME(),
               DecisionContaPor = @usuario, UpdatedAt = SYSUTCDATETIME(),
               Estado = CASE WHEN @decision = 'no_reclamar' THEN 'no_reclamado' ELSE Estado END
         WHERE DocumentoId = @id`)
  );
}

/** Quita la decisión: vuelve a pendiente sin decisión. */
export function quitarDecision(documentoId, verificar) {
  return conFilaBloqueada(documentoId, verificar, (req) =>
    req.query(`
      UPDATE ${S}.ReclamoDocumentosContabilidad
         SET DecisionConta = NULL, DecisionContaComentario = NULL, DecisionContaAt = NULL, DecisionContaPor = NULL,
             Estado = 'pendiente', UpdatedAt = SYSUTCDATETIME()
       WHERE DocumentoId = @id`)
  );
}
