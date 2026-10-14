import { getPool, sql, S } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SELECT_BASE = `
  SELECT
    r.ReclamoId, r.Token, r.Tipo, r.Origen, r.Sucursal, r.NumeroEmbarqueFactura, r.FechaRegistro,
    r.Mundo, r.Departamento, r.Marca, r.Proveedor, r.Compradora, r.Division, r.Motivo,
    r.SapDoc1, r.SapDoc2, r.SapDoc3, r.SapDocsExtra,
    r.ArchivoExcel, r.ArchivoExcelNombre, r.ImagenesExcel, r.AdjuntosExtra,
    r.Status, r.Comentario, r.CreatedAt, r.CreatedBy, r.DecisionAt, r.DecisionBy,
    r.EnviadoContabilidadAt, r.EnviadoContabilidadBy, r.EnviadoContabilidadA,
    (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token) AS LineasTotal,
    (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token AND l.DecStatus = 'pendiente') AS LineasPendientes,
    (SELECT COUNT(*) FROM ${S}.ReclamoLineas l WHERE l.ReclamoToken = r.Token AND l.DecStatus = 'aprobado') AS LineasAprobadas
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

/** KPIs globales (no dependen del filtro de estado, para que sirvan de pestañas). */
export async function obtenerKpis() {
  const pool = await getPool();
  const { recordset } = await pool.request().query(`
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
      SUM(CASE WHEN Status IN ('resuelto', 'rechazado') AND EnviadoContabilidadAt IS NULL THEN 1 ELSE 0 END) AS porEnviarContabilidad
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
          (Token, Tipo, Origen, Sucursal, NumeroEmbarqueFactura, FechaRegistro, Mundo, Departamento, Marca,
           Proveedor, Compradora, Division, Motivo, SapDoc1, SapDoc2, SapDoc3, SapDocsExtra, ArchivoExcel, ArchivoExcelNombre,
           ImagenesExcel, AdjuntosExtra, Status, Comentario, CreatedBy)
        VALUES
          (@token, @tipo, @origen, @sucursal, @numeroEmbarqueFactura, @fechaRegistro, @mundo, @departamento, @marca,
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
    await transaction.rollback();
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
export async function actualizarDecisionLinea(token, posicion, { desde, hacia, comentario, usuario, tiposBloqueados }) {
  const pool = await getPool();
  const req = pool
    .request()
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
        `SELECT ImagenesExcel, AdjuntosExtra, Status, EnviadoContabilidadAt FROM ${S}.Reclamos WITH (UPDLOCK, HOLDLOCK) WHERE Token = @token`
      );
    if (!recordset[0]) {
      await transaction.rollback();
      return null;
    }
    const actual = {
      imagenes: parseJsonArray(recordset[0].ImagenesExcel),
      adjuntos: parseJsonArray(recordset[0].AdjuntosExtra),
    };
    const { Status, EnviadoContabilidadAt } = recordset[0];
    const nuevo = modificar(actual, { Status, EnviadoContabilidadAt });
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
    await transaction.rollback();
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
      .query(`DELETE FROM ${S}.ReclamoLineas WHERE ReclamoToken = @token; DELETE FROM ${S}.Reclamos WHERE Token = @token;`);
    await transaction.commit();
    return { fila: recordset[0] };
  } catch (err) {
    await transaction.rollback();
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
