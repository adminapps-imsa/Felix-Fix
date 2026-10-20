import { getPool, sql, S } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SELECT_BASE = `
  SELECT
    r.ReclamoId, r.Token, r.Tipo, r.Origen, r.Sucursal, r.NumeroEmbarqueFactura, r.FechaRegistro, r.FechaLlegadaMercancia,
    r.Mundo, r.Departamento, r.Marca, r.Proveedor, r.Compradora, r.Division, r.Motivo,
    r.SapDoc1, r.SapDoc2, r.SapDoc3, r.SapDocsExtra,
    r.ArchivoExcel, r.ArchivoExcelNombre, r.ImagenesExcel, r.AdjuntosExtra,
    r.Status, r.Comentario, r.CreatedAt, r.CreatedBy, r.DecisionAt, r.DecisionBy,
    r.EnviadoContabilidadAt, r.EnviadoContabilidadBy, r.EnviadoContabilidadA,
    r.RetiroProveedorFecha, r.RetiroProveedorFoto, r.RetiroProveedorPor, r.RetiroProveedorRegistradoAt,
    (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token) AS LineasTotal,
    (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token AND l.DecStatus = 'pendiente') AS LineasPendientes,
    (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token AND l.DecStatus = 'aprobado') AS LineasAprobadas,
    (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token AND l.Tipo = 'devolucion') AS LineasDevolucion
  FROM ${S}.Reclamos r
`;

function aplicarFiltros(request, filtros) {
  const condiciones = [];
  if (filtros.status) {
    request.input('status', sql.VarChar(15), filtros.status);
    condiciones.push('r.Status = @status');
  }
  // Cerrados por la compradora que todavía no se mandan a contabilidad (tarea de Gof / Torre de Control).
  if (filtros.porEnviar) {
    condiciones.push("r.Status IN ('resuelto', 'rechazado') AND r.EnviadoContabilidadAt IS NULL");
  }
  if (filtros.q) {
    request.input('q', sql.NVarChar(700), `%${filtros.q.replace(/[[%_]/g, '[$&]')}%`);
    condiciones.push(`(
      CAST(r.ReclamoId AS VARCHAR(20)) LIKE @q OR r.Proveedor LIKE @q OR r.Sucursal LIKE @q OR r.Marca LIKE @q
      OR r.Compradora LIKE @q OR r.NumeroEmbarqueFactura LIKE @q OR r.Division LIKE @q OR r.Motivo LIKE @q
      OR r.SapDoc1 LIKE @q OR r.SapDoc2 LIKE @q OR r.SapDoc3 LIKE @q OR r.SapDocsExtra LIKE @q
    )`);
  }
  return condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
}

export async function listar(filtros, { offset, pageSize }) {
  const pool = await getPool();

  const countRequest = pool.request();
  const whereCount = aplicarFiltros(countRequest, filtros);
  const { recordset: countRows } = await countRequest.query(
    `SELECT COUNT(*) AS total FROM ${S}.Reclamos r ${whereCount}`
  );

  const dataRequest = pool.request();
  const whereData = aplicarFiltros(dataRequest, filtros);
  dataRequest.input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSize);
  const { recordset } = await dataRequest.query(`
    ${SELECT_BASE}
    ${whereData}
    ORDER BY r.CreatedAt DESC, r.ReclamoId DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  return { items: recordset, total: countRows[0].total };
}

/**
 * KPIs globales (no dependen del filtro de estado, para que sirvan de pestañas).
 * `username` (opcional): además cuenta los devueltos que creó ese usuario (los que le toca corregir).
 */
export async function obtenerKpis(username = null) {
  const pool = await getPool();
  const { recordset } = await pool.request().input('username', sql.VarChar(150), username).query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN Status = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN Status = 'notificado' THEN 1 ELSE 0 END) AS notificados,
      SUM(CASE WHEN Status = 'resuelto' THEN 1 ELSE 0 END) AS resueltos,
      SUM(CASE WHEN Status = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
      -- Solo productos de reclamos abiertos: los de reclamos cerrados ya no se deciden.
      (SELECT COUNT(*) FROM ${S}.ReclamoLineas l
         JOIN ${S}.Reclamos rr ON rr.Token = l.ReclamoToken
        WHERE l.DecStatus = 'pendiente' AND rr.Status IN ('pendiente', 'notificado')) AS productosPorDecidir,
      SUM(CASE WHEN Status IN ('resuelto', 'rechazado') AND EnviadoContabilidadAt IS NULL THEN 1 ELSE 0 END) AS porEnviarContabilidad,
      SUM(CASE WHEN Status = 'devuelto' THEN 1 ELSE 0 END) AS devueltos,
      SUM(CASE WHEN Status = 'devuelto' AND CreatedBy = @username THEN 1 ELSE 0 END) AS misDevueltos
    FROM ${S}.Reclamos
  `);
  const row = recordset[0];
  return {
    total: row.total || 0,
    pendientes: row.pendientes || 0,
    notificados: row.notificados || 0,
    resueltos: row.resueltos || 0,
    rechazados: row.rechazados || 0,
    productosPorDecidir: row.productosPorDecidir || 0,
    porEnviarContabilidad: row.porEnviarContabilidad || 0,
    devueltos: row.devueltos || 0,
    misDevueltos: row.misDevueltos || 0,
  };
}

export async function obtenerPorToken(token) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('token', sql.UniqueIdentifier, token)
    .query(`${SELECT_BASE} WHERE r.Token = @token`);
  return recordset[0] || null;
}

const LINEAS_POR_INSERT = 100; // 8 parámetros por fila, bajo el límite de 2100 de SQL Server

/** Inserta el encabezado + todas sus líneas en una sola transacción. */
/**
 * Reclamos cuyos documentos SAP (los del formulario o los que traen sus PDF
 * adjuntos) contienen alguno de los números dados. Es un filtro amplio
 * (LIKE): el dominio decide si de verdad coinciden. `request` (opcional):
 * para leer dentro de una transacción.
 */
export async function buscarPorDocumentosSap(docs, request) {
  const claves = [...new Set(docs.map((d) => String(d ?? '').trim()).filter(Boolean))];
  if (!claves.length) return [];
  const req = request || (await getPool()).request();
  const columnas = ['SapDoc1', 'SapDoc2', 'SapDoc3', 'SapDocsExtra', 'AdjuntosExtra'];
  const condiciones = claves.map((c, i) => {
    // Comodines de LIKE escapados: el número se busca tal cual dentro del texto.
    req.input(`doc${i}`, sql.NVarChar(60), `%${c.replace(/[[%_]/g, '[$&]')}%`);
    return columnas.map((col) => `${col} LIKE @doc${i}`).join(' OR ');
  });
  const { recordset } = await req.query(`
    SELECT ReclamoId, Token, Status, SapDoc1, SapDoc2, SapDoc3, SapDocsExtra, AdjuntosExtra
    FROM ${S}.Reclamos
    WHERE ${condiciones.map((c) => `(${c})`).join(' OR ')}
  `);
  return recordset;
}

/**
 * Crea el reclamo con sus líneas en una transacción. `motivoBloqueo(filas)`
 * (opcional, regla del dominio) recibe los reclamos que ya tienen alguno de
 * `docsSap` y devuelve por qué no se puede crear, o null. Esa revisión corre
 * dentro de la transacción con un candado de aplicación, así dos altas con el
 * mismo documento a la vez no se cuelan. Devuelve { bloqueado: motivo } si no
 * se creó.
 */
export async function crear(data, lineas, { docsSap = [], motivoBloqueo } = {}) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (motivoBloqueo) {
      // Solo serializa las altas de reclamos entre sí; no bloquea filas.
      await new sql.Request(transaction)
        .input('recurso', sql.NVarChar(255), `FelixFix:${S}:reclamos-documentos-sap`)
        .query(`
          DECLARE @r INT;
          EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
          IF @r < 0 THROW 50001, 'Otro reclamo se está creando en este momento; intenta de nuevo.', 1;
        `);
      const motivo = motivoBloqueo(await buscarPorDocumentosSap(docsSap, new sql.Request(transaction)));
      if (motivo) {
        await transaction.rollback();
        return { bloqueado: motivo };
      }
    }
    await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, data.token)
      .input('tipo', sql.VarChar(40), data.tipo)
      .input('origen', sql.VarChar(10), data.origen)
      .input('sucursal', sql.NVarChar(150), data.sucursal || null)
      .input('numeroEmbarqueFactura', sql.NVarChar(100), data.numeroEmbarqueFactura || null)
      .input('fechaRegistro', sql.Date, data.fechaRegistro)
      .input('fechaLlegada', sql.Date, data.fechaLlegadaMercancia)
      .input('mundo', sql.NVarChar(100), data.mundo)
      .input('departamento', sql.NVarChar(100), data.departamento)
      .input('marca', sql.NVarChar(100), data.marca)
      .input('proveedor', sql.NVarChar(200), data.proveedor)
      .input('compradora', sql.NVarChar(150), data.compradora)
      .input('division', sql.NVarChar(100), data.division || null)
      .input('motivo', sql.NVarChar(100), data.motivo || null)
      .input('sapDoc1', sql.NVarChar(50), data.sapDoc1 || null)
      .input('sapDoc2', sql.NVarChar(50), data.sapDoc2 || null)
      .input('sapDoc3', sql.NVarChar(50), data.sapDoc3 || null)
      .input('sapDocsExtra', sql.NVarChar(sql.MAX), JSON.stringify(data.sapDocsExtra || []))
      .input('archivoExcel', sql.NVarChar(200), data.archivoExcel)
      .input('archivoExcelNombre', sql.NVarChar(255), data.archivoExcelNombre || null)
      .input('status', sql.VarChar(15), data.status)
      .input('comentario', sql.NVarChar(1000), data.comentario || null)
      .input('adjuntosExtra', sql.NVarChar(sql.MAX), JSON.stringify(data.adjuntosExtra || []))
      .input('createdBy', sql.VarChar(150), data.createdBy).query(`
        INSERT INTO ${S}.Reclamos
          (Token, Tipo, Origen, Sucursal, NumeroEmbarqueFactura, FechaRegistro, FechaLlegadaMercancia, Mundo, Departamento, Marca,
           Proveedor, Compradora, Division, Motivo, SapDoc1, SapDoc2, SapDoc3, SapDocsExtra, ArchivoExcel, ArchivoExcelNombre,
           ImagenesExcel, AdjuntosExtra, Status, Comentario, CreatedBy)
        VALUES
          (@token, @tipo, @origen, @sucursal, @numeroEmbarqueFactura, @fechaRegistro, @fechaLlegada, @mundo, @departamento, @marca,
           @proveedor, @compradora, @division, @motivo, @sapDoc1, @sapDoc2, @sapDoc3, @sapDocsExtra, @archivoExcel, @archivoExcelNombre,
           '[]', @adjuntosExtra, @status, @comentario, @createdBy)
      `);

    for (let i = 0; i < lineas.length; i += LINEAS_POR_INSERT) {
      const lote = lineas.slice(i, i + LINEAS_POR_INSERT);
      const req = new sql.Request(transaction).input('token', sql.UniqueIdentifier, data.token);
      const values = lote.map((l, j) => {
        req
          .input(`pos${j}`, sql.Int, l.posicion)
          .input(`cod${j}`, sql.VarChar(50), l.codigoBarra.slice(0, 50))
          .input(`cant${j}`, sql.Decimal(18, 3), l.cantidad ?? null)
          .input(`tipo${j}`, sql.VarChar(40), l.tipo)
          .input(`desc${j}`, sql.NVarChar(300), l.descripcion ? l.descripcion.slice(0, 300) : null)
          .input(`st${j}`, sql.VarChar(10), l.decStatus)
          .input(`com${j}`, sql.NVarChar(500), l.decComentario || null)
          .input(`by${j}`, sql.VarChar(150), l.decBy || null);
        const decAt = l.decStatus === 'pendiente' ? 'NULL' : 'SYSUTCDATETIME()';
        return `(@token, @pos${j}, @cod${j}, @cant${j}, @tipo${j}, @desc${j}, @st${j}, @com${j}, ${decAt}, @by${j})`;
      });
      await req.query(`
        INSERT INTO ${S}.ReclamoLineas
          (ReclamoToken, Posicion, CodigoBarra, Cantidad, Tipo, DescripcionExcel, DecStatus, DecComentario, DecAt, DecBy)
        VALUES ${values.join(',\n')}
      `);
    }

    await transaction.commit();
    return {};
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/**
 * Decisión de TODO el reclamo. UPDATE condicional: solo desde 'pendiente' y
 * sin productos pendientes de decidir (se comprueba en el mismo UPDATE).
 */
export async function decidir(token, { status, comentario, usuario }) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('token', sql.UniqueIdentifier, token)
    .input('status', sql.VarChar(15), status)
    .input('comentario', sql.NVarChar(1000), comentario || null)
    .input('usuario', sql.VarChar(150), usuario).query(`
      UPDATE ${S}.Reclamos
      SET Status = @status, Comentario = COALESCE(@comentario, Comentario),
          DecisionAt = SYSUTCDATETIME(), DecisionBy = @usuario
      WHERE Token = @token AND Status = 'pendiente'
        AND NOT EXISTS (SELECT 1 FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = @token AND l.DecStatus = 'pendiente')
    `);
  return result.rowsAffected[0] > 0;
}

/** Último envío a contabilidad. Solo de reclamos cerrados (resuelto o rechazado). */
export async function registrarEnvioContabilidad(token, { usuario, para }) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('token', sql.UniqueIdentifier, token)
    .input('usuario', sql.VarChar(150), usuario)
    .input('para', sql.NVarChar(1000), para.slice(0, 1000)).query(`
      UPDATE ${S}.Reclamos
      SET EnviadoContabilidadAt = SYSUTCDATETIME(), EnviadoContabilidadBy = @usuario, EnviadoContabilidadA = @para
      WHERE Token = @token AND Status IN ('resuelto', 'rechazado')
    `);
  return result.rowsAffected[0] > 0;
}

/**
 * Corre `fn` (verificar + enviar el correo + registrar) con un candado de
 * aplicación por reclamo, dueño la transacción (que no escribe nada: solo
 * sostiene el candado y al final se descarta). Sin espera: si otro envío del
 * mismo reclamo lo tiene, devuelve { ocupado: true } sin correr `fn`; si no,
 * { resultado }.
 */
export async function conCandadoEnvioContabilidad(token, fn) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('recurso', sql.NVarChar(255), `FelixFix:${S}:reclamo-envio-contabilidad:${String(token).toLowerCase()}`)
      .query(`
        DECLARE @r INT;
        EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 0;
        SELECT @r AS r;
      `);
    if (recordset[0].r < 0) return { ocupado: true };
    return { resultado: await fn() };
  } finally {
    // Libera el candado. Si falla (conexión caída), el candado se suelta igual con la sesión.
    await transaction.rollback().catch(() => {});
  }
}

export async function listarLineas(token) {
  const pool = await getPool();
  const { recordset } = await pool.request().input('token', sql.UniqueIdentifier, token).query(`
    SELECT LineaId, Posicion, CodigoBarra, Cantidad, Tipo, DescripcionExcel,
           DecStatus, DecComentario, DecAt, DecBy, CreatedAt
    FROM ${S}.ReclamoLineas
    WHERE ReclamoToken = @token
    ORDER BY Posicion
  `);
  return recordset;
}

export async function obtenerLinea(token, posicion) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('token', sql.UniqueIdentifier, token)
    .input('pos', sql.Int, posicion)
    .query(`SELECT * FROM ${S}.ReclamoLineas WHERE ReclamoToken = @token AND Posicion = @pos`);
  return recordset[0] || null;
}

/**
 * Decide o deshace la decisión de una línea. UPDATE condicional sobre el
 * estado esperado (evita pisar la decisión de otro admin en paralelo) y
 * nunca sobre un tipo auto-aprobado — defensa en profundidad además del 409
 * del servicio. También exige, en el mismo UPDATE, que el reclamo siga abierto
 * ('pendiente' o 'notificado'): otro usuario pudo cerrarlo mientras tanto.
 */
export async function actualizarDecisionLinea(token, posicion, cambio) {
  const pool = await getPool();
  return updateDecisionLinea(pool.request(), token, posicion, cambio);
}

/**
 * Lo mismo para varias líneas, en UNA transacción (todo o nada si falla la
 * BD). Las que no cumplen la condición (ya decididas, auto-aprobadas) se
 * omiten, no es error. El reclamo queda bloqueado (UPDLOCK) mientras tanto,
 * para que no se cierre a mitad del lote. Devuelve cuántas se actualizaron.
 */
export async function actualizarDecisionLineas(token, posiciones, cambio) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .query(`SELECT Status FROM ${S}.Reclamos WITH (UPDLOCK, HOLDLOCK) WHERE Token = @token`);
    let actualizadas = 0;
    for (const pos of posiciones) {
      if (await updateDecisionLinea(new sql.Request(transaction), token, pos, cambio)) actualizadas += 1;
    }
    await transaction.commit();
    return actualizadas;
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

async function updateDecisionLinea(req, token, posicion, { desde, hacia, comentario, usuario, tiposBloqueados }) {
  req
    .input('token', sql.UniqueIdentifier, token)
    .input('pos', sql.Int, posicion)
    .input('hacia', sql.VarChar(10), hacia)
    .input('comentario', sql.NVarChar(500), comentario || null)
    .input('usuario', sql.VarChar(150), usuario || null);
  const bloqueados = [...tiposBloqueados].map((t, i) => {
    req.input(`bl${i}`, sql.VarChar(40), t);
    return `@bl${i}`;
  });
  const condDesde = desde === 'pendiente' ? "DecStatus = 'pendiente'" : "DecStatus <> 'pendiente'";
  const setDecAt = hacia === 'pendiente' ? 'NULL' : 'SYSUTCDATETIME()';
  const result = await req.query(`
    UPDATE ${S}.ReclamoLineas
    SET DecStatus = @hacia, DecComentario = @comentario, DecAt = ${setDecAt}, DecBy = @usuario
    WHERE ReclamoToken = @token AND Posicion = @pos AND ${condDesde}
      ${bloqueados.length ? `AND Tipo NOT IN (${bloqueados.join(', ')})` : ''}
      AND EXISTS (SELECT 1 FROM ${S}.Reclamos r WHERE r.Token = @token AND r.Status IN ('pendiente', 'notificado'))
  `);
  return result.rowsAffected[0] > 0;
}

/**
 * Read-modify-write de los arreglos JSON de archivos (ImagenesExcel /
 * AdjuntosExtra) bajo UPDLOCK, para que dos subidas/borrados concurrentes
 * sobre el mismo reclamo no se pisen entre sí.
 *
 * `modificar` recibe { imagenes, adjuntos } y { Status, EnviadoContabilidadAt }
 * (leídos bajo el mismo bloqueo; puede lanzar para abortar) y devuelve el
 * nuevo par (o null para no cambiar nada). Devuelve lo que devolvió `modificar`, o null si el
 * reclamo no existe.
 */
export async function modificarArchivos(token, modificar) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .query(
        `SELECT ImagenesExcel, AdjuntosExtra, Status, EnviadoContabilidadAt, CreatedBy FROM ${S}.Reclamos WITH (UPDLOCK, HOLDLOCK) WHERE Token = @token`
      );
    if (!recordset[0]) {
      await transaction.rollback();
      return null;
    }
    const actual = {
      imagenes: parseJsonArray(recordset[0].ImagenesExcel),
      adjuntos: parseJsonArray(recordset[0].AdjuntosExtra),
    };
    const { Status, EnviadoContabilidadAt, CreatedBy } = recordset[0];
    const nuevo = modificar(actual, { Status, EnviadoContabilidadAt, CreatedBy });
    if (nuevo) {
      await new sql.Request(transaction)
        .input('token', sql.UniqueIdentifier, token)
        .input('imagenes', sql.NVarChar(sql.MAX), JSON.stringify(nuevo.imagenes))
        .input('adjuntos', sql.NVarChar(sql.MAX), JSON.stringify(nuevo.adjuntos))
        .query(`UPDATE ${S}.Reclamos SET ImagenesExcel = @imagenes, AdjuntosExtra = @adjuntos WHERE Token = @token`);
    }
    await transaction.commit();
    return nuevo ?? actual;
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/**
 * Borra líneas + encabezado en una transacción, con la fila bloqueada.
 * `motivoBloqueo({ Status, EnviadoContabilidadAt })` (regla del dominio)
 * devuelve por qué no se puede, o null. Devuelve { fila } (la fila borrada,
 * para limpiar disco), { bloqueado: motivo } (no borra nada), o null si no existe.
 */
export async function eliminar(token, motivoBloqueo) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .query(
        `SELECT ReclamoId, ArchivoExcel, ImagenesExcel, AdjuntosExtra, Status, EnviadoContabilidadAt
         FROM ${S}.Reclamos WITH (UPDLOCK, HOLDLOCK) WHERE Token = @token`
      );
    if (!recordset[0]) {
      await transaction.rollback();
      return null;
    }
    const motivo = motivoBloqueo(recordset[0]);
    if (motivo) {
      await transaction.rollback();
      return { bloqueado: motivo };
    }
    await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .input('reclamoId', sql.BigInt, recordset[0].ReclamoId)
      .query(`
        DELETE FROM ${S}.ReclamoComentarios WHERE ReclamoId = @reclamoId;
        DELETE FROM ${S}.ReclamoLineas WHERE ReclamoToken = @token;
        DELETE FROM ${S}.Reclamos WHERE Token = @token;`);
    await transaction.commit();
    return { fila: recordset[0] };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/**
 * Proveedor -> mundo/departamento/marca por coincidencia de substring en
 * ambos sentidos (mayúsculas, trim). CHARINDEX en vez de LIKE para que un
 * '%' o '_' en el nombre del proveedor no actúe como comodín. Si la tabla
 * aún no existe (migración sin correr) no rompe el flujo: devuelve null.
 */
export async function buscarRelacionProveedor(proveedor) {
  const p = String(proveedor || '').trim();
  if (!p) return null;
  try {
    const pool = await getPool();
    const { recordset } = await pool.request().input('p', sql.NVarChar(200), p.toUpperCase()).query(`
      SELECT TOP 1 Proveedor, Mundo, Departamento, Marca
      FROM ${S}.ProveedorRelaciones
      WHERE Activo = 1 AND LEN(LTRIM(RTRIM(Proveedor))) > 0
        AND (CHARINDEX(UPPER(LTRIM(RTRIM(Proveedor))), @p) > 0 OR CHARINDEX(@p, UPPER(LTRIM(RTRIM(Proveedor)))) > 0)
      ORDER BY CASE WHEN UPPER(LTRIM(RTRIM(Proveedor))) = @p THEN 0 ELSE 1 END, LEN(Proveedor) DESC
    `);
    return recordset[0] || null;
  } catch (err) {
    logger.warn({ err: err.message }, 'No se pudo consultar ProveedorRelaciones');
    return null;
  }
}

/** Filas del catálogo proveedor -> mundo/división/marca/compradora de FelixApproval. */
export async function listarCatalogoProveedores() {
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
    SELECT proveedor, mundo, division, marca, compradora
    FROM ${env.reclamos.compradorasTabla}
  `);
  return recordset;
}

/** Valores activos de un catálogo local ('division' | 'motivo'), por nombre. */
export async function listarCatalogo(tipo) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('tipo', sql.VarChar(20), tipo)
    .query(`SELECT Valor FROM ${S}.ReclamoCatalogos WHERE Tipo = @tipo AND Activo = 1 ORDER BY Valor`);
  return recordset.map((r) => r.Valor);
}

/**
 * Devuelve el valor tal como ya está en el catálogo (la comparación no
 * distingue mayúsculas) o lo agrega si es nuevo. Si dos usuarios agregan el
 * mismo valor a la vez, el índice único hace que uno inserte y el otro lo lea.
 */
export async function asegurarValorCatalogo(tipo, valor, usuario) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('tipo', sql.VarChar(20), tipo)
    .input('valor', sql.NVarChar(100), valor)
    .input('usuario', sql.VarChar(150), usuario || null).query(`
      BEGIN TRY
        INSERT INTO ${S}.ReclamoCatalogos (Tipo, Valor, CreatedBy)
        SELECT @tipo, @valor, @usuario
        WHERE NOT EXISTS (SELECT 1 FROM ${S}.ReclamoCatalogos WHERE Tipo = @tipo AND Valor = @valor);
      END TRY
      BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
      END CATCH;
      UPDATE ${S}.ReclamoCatalogos SET Activo = 1 WHERE Tipo = @tipo AND Valor = @valor AND Activo = 0;
      SELECT Valor FROM ${S}.ReclamoCatalogos WHERE Tipo = @tipo AND Valor = @valor;
    `);
  return recordset[0]?.Valor || valor;
}

export function parseJsonArray(valor) {
  if (!valor) return [];
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// Devolución a quien lo creó (compradora → creador → compradora)
// ------------------------------------------------------------------

/** Comentarios de devolución y reenvío del reclamo, del más viejo al más nuevo. */
export async function listarComentarios(reclamoId) {
  const pool = await getPool();
  const { recordset } = await pool.request().input('reclamoId', sql.BigInt, reclamoId).query(`
    SELECT ComentarioId, Tipo, Texto, Usuario, Fecha
    FROM ${S}.ReclamoComentarios WHERE ReclamoId = @reclamoId ORDER BY Fecha, ComentarioId
  `);
  return recordset;
}

/**
 * Cambio de estado con su comentario en una sola transacción, con la fila
 * bloqueada. `verificar(fila)` (regla del dominio) devuelve el motivo si no se
 * puede, o null. Devuelve null (no existe), { bloqueado } o { ok: true }.
 */
async function cambiarConComentario(token, { desde, hacia, tipo, texto, usuario, verificar }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .query(`
        SELECT ReclamoId, Status, CreatedBy, SapDoc1, SapDoc2, SapDoc3, SapDocsExtra, AdjuntosExtra
        FROM ${S}.Reclamos WITH (UPDLOCK, HOLDLOCK) WHERE Token = @token`);
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
    const r = await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .input('desde', sql.VarChar(15), desde)
      .input('hacia', sql.VarChar(15), hacia)
      .input('reclamoId', sql.BigInt, fila.ReclamoId)
      .input('tipo', sql.VarChar(15), tipo)
      .input('texto', sql.NVarChar(1000), texto || null)
      .input('usuario', sql.VarChar(150), usuario).query(`
        DECLARE @n INT;
        UPDATE ${S}.Reclamos SET Status = @hacia WHERE Token = @token AND Status = @desde;
        SET @n = @@ROWCOUNT;
        IF @n = 1
          INSERT INTO ${S}.ReclamoComentarios (ReclamoId, Tipo, Texto, Usuario) VALUES (@reclamoId, @tipo, @texto, @usuario);
        SELECT @n AS insertados;
      `);
    if (!r.recordset[0]?.insertados) {
      await transaction.rollback();
      return { bloqueado: { mensaje: 'El reclamo cambió mientras tanto. Recarga el detalle.' } };
    }
    await transaction.commit();
    return { ok: true };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/** Compradora: pendiente → devuelto, con su comentario. */
export const devolver = (token, { comentario, usuario, verificar }) =>
  cambiarConComentario(token, { desde: 'pendiente', hacia: 'devuelto', tipo: 'devuelto', texto: comentario, usuario, verificar });

/** Quien lo creó: devuelto → pendiente, con su respuesta (opcional). */
export const reenviar = (token, { comentario, usuario, verificar }) =>
  cambiarConComentario(token, { desde: 'devuelto', hacia: 'pendiente', tipo: 'reenviado', texto: comentario, usuario, verificar });

/**
 * Quien lo creó corrige los datos del reclamo devuelto. Mismo candado que el
 * alta (documentos SAP únicos): `motivoDocs(filasConEsosDocs)` revisa que los
 * documentos no estén en otro reclamo. `verificar(fila)`: que siga devuelto y
 * sea de quien corrige. Devuelve null, { bloqueado } o { ok: true }.
 */
export async function actualizarDatos(token, datos, { docsSap, verificar, motivoDocs }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('recurso', sql.NVarChar(255), `FelixFix:${S}:reclamos-documentos-sap`)
      .query(`
        DECLARE @r INT;
        EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @r < 0 THROW 50001, 'Otro reclamo se está guardando en este momento; intenta de nuevo.', 1;
      `);
    const { recordset } = await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .query(`SELECT ReclamoId, Status, CreatedBy FROM ${S}.Reclamos WITH (UPDLOCK, HOLDLOCK) WHERE Token = @token`);
    const fila = recordset[0];
    if (!fila) {
      await transaction.rollback();
      return null;
    }
    const motivo = verificar(fila) || motivoDocs(await buscarPorDocumentosSap(docsSap, new sql.Request(transaction)));
    if (motivo) {
      await transaction.rollback();
      return { bloqueado: motivo };
    }
    await new sql.Request(transaction)
      .input('token', sql.UniqueIdentifier, token)
      .input('sucursal', sql.NVarChar(150), datos.sucursal || null)
      .input('numeroEmbarqueFactura', sql.NVarChar(100), datos.numeroEmbarqueFactura || null)
      .input('fechaRegistro', sql.Date, datos.fechaRegistro)
      .input('fechaLlegada', sql.Date, datos.fechaLlegadaMercancia)
      .input('mundo', sql.NVarChar(100), datos.mundo)
      .input('departamento', sql.NVarChar(100), datos.departamento)
      .input('marca', sql.NVarChar(100), datos.marca)
      .input('proveedor', sql.NVarChar(200), datos.proveedor)
      .input('compradora', sql.NVarChar(150), datos.compradora)
      .input('division', sql.NVarChar(100), datos.division || null)
      .input('sapDoc1', sql.NVarChar(50), datos.sapDoc1 || null)
      .input('sapDoc2', sql.NVarChar(50), datos.sapDoc2 || null)
      .input('sapDoc3', sql.NVarChar(50), datos.sapDoc3 || null)
      .input('sapDocsExtra', sql.NVarChar(sql.MAX), JSON.stringify(datos.sapDocsExtra || [])).query(`
        UPDATE ${S}.Reclamos
        SET Sucursal = @sucursal, NumeroEmbarqueFactura = @numeroEmbarqueFactura, FechaRegistro = @fechaRegistro,
            FechaLlegadaMercancia = @fechaLlegada, Mundo = @mundo, Departamento = @departamento, Marca = @marca,
            Proveedor = @proveedor, Compradora = @compradora, Division = @division,
            SapDoc1 = @sapDoc1, SapDoc2 = @sapDoc2, SapDoc3 = @sapDoc3, SapDocsExtra = @sapDocsExtra
        WHERE Token = @token AND Status = 'devuelto'
      `);
    await transaction.commit();
    return { ok: true };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

// ------------------------------------------------------------------
// Retiro del proveedor (reclamos de devolución). No toca el estado.
// ------------------------------------------------------------------

/**
 * Guarda (o reemplaza) la marca de retiro con la fila bloqueada.
 * `verificar(fila)` (regla del dominio) devuelve el motivo si no se puede.
 * Devuelve null (no existe), { bloqueado } o { fotoAnterior } (para borrarla después del commit).
 */
export async function registrarRetiro(token, { fecha, foto, usuario }, verificar) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction).input('token', sql.UniqueIdentifier, token).query(`
      SELECT r.Tipo, r.RetiroProveedorFoto,
        (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token AND l.Tipo = 'devolucion') AS LineasDevolucion
      FROM ${S}.Reclamos r WITH (UPDLOCK, HOLDLOCK) WHERE r.Token = @token`);
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
      .input('token', sql.UniqueIdentifier, token)
      .input('fecha', sql.Date, fecha)
      .input('foto', sql.NVarChar(200), foto)
      .input('usuario', sql.VarChar(150), usuario).query(`
        UPDATE ${S}.Reclamos
        SET RetiroProveedorFecha = @fecha, RetiroProveedorFoto = @foto, RetiroProveedorPor = @usuario, RetiroProveedorRegistradoAt = SYSUTCDATETIME()
        WHERE Token = @token`);
    await transaction.commit();
    return { fotoAnterior: fila.RetiroProveedorFoto };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/** Quita la marca de retiro. Devuelve null (no existe) o { foto } que tenía (para borrarla después). */
export async function quitarRetiro(token) {
  const pool = await getPool();
  const { recordset } = await pool.request().input('token', sql.UniqueIdentifier, token).query(`
    UPDATE ${S}.Reclamos
    SET RetiroProveedorFecha = NULL, RetiroProveedorFoto = NULL, RetiroProveedorPor = NULL, RetiroProveedorRegistradoAt = NULL
    OUTPUT DELETED.RetiroProveedorFoto AS foto
    WHERE Token = @token`);
  return recordset[0] ? { foto: recordset[0].foto } : null;
}
