import { getPool, sql, S } from '../config/db.js';
import { registrarEvento } from './historialRepository.js';
import { TRANSICIONES } from '../domain/productoDanado.js';
import { condicionReporte } from '../services/acceso/alcanceCompradora.js';

const SELECT_BASE = `
  SELECT
    r.ReporteId, r.TiendaId, t.Codigo AS TiendaCodigo, t.Nombre AS TiendaNombre,
    r.EmpleadoReportaNombre, r.EmpleadoReportaUsuario,
    r.Sku, r.CodigoBarras, r.NombreProducto, r.Marca, r.Categoria, r.Division,
    r.Motivo, r.Cantidad, r.Descripcion, r.CorreosProveedor, r.Adjuntos,
    r.EnviadoProveedorAt, r.EnviadoProveedorPor, r.EnviosProveedor,
    r.EvidenciaProveedor, r.EvidenciaKey,
    r.Estado, r.Resolucion, r.PagoReferencia, r.MotivoRechazo, r.ProcesadoIntentos, r.SapDocumentoId, r.DocumentoSalidaNf,
    r.FechaCreacion, r.FechaActualizacion
  FROM ${S}.ReportesProductoDanado r
  INNER JOIN ${S}.Tiendas t ON t.TiendaId = r.TiendaId
`;

function aplicarFiltros(request, filtros) {
  const condiciones = [];
  if (filtros.tiendaId) {
    request.input('tiendaId', sql.Int, filtros.tiendaId);
    condiciones.push('r.TiendaId = @tiendaId');
  }
  if (filtros.motivo) {
    request.input('motivo', sql.NVarChar(100), filtros.motivo);
    condiciones.push('r.Motivo = @motivo');
  }
  // Quien ve solo una parte (Gof: NF y devoluciones aprobadas): lo demás no aparece en listas ni KPIs.
  if (filtros.resoluciones) {
    const params = filtros.resoluciones.map((res, i) => {
      request.input(`resolucion${i}`, sql.VarChar(20), res);
      return `@resolucion${i}`;
    });
    condiciones.push(`r.Resolucion IN (${params.join(', ')})`);
  }
  // Compradora con alcance: solo los de sus marcas (alcanceCompradora.js).
  if (filtros.compradora) condiciones.push(condicionReporte(request, filtros.compradora));
  // Tienda («Solo los reportes que creó»): solo los suyos.
  if (filtros.creador != null) {
    request.input('creador', sql.VarChar(150), filtros.creador);
    condiciones.push('r.EmpleadoReportaUsuario = @creador');
  }
  if (filtros.estado) {
    request.input('estado', sql.VarChar(20), filtros.estado);
    condiciones.push('r.Estado = @estado');
  }
  if (filtros.fechaDesde) {
    request.input('fechaDesde', sql.DateTime2, filtros.fechaDesde);
    condiciones.push('r.FechaCreacion >= @fechaDesde');
  }
  if (filtros.fechaHasta) {
    request.input('fechaHasta', sql.DateTime2, filtros.fechaHasta);
    // Exclusivo: fechaHasta es el inicio del día siguiente (hora de Panamá).
    condiciones.push('r.FechaCreacion < @fechaHasta');
  }
  if (filtros.q) {
    // [, % y _ son comodines de LIKE: se escapan para buscarlos como texto.
    request.input('q', sql.NVarChar(700), `%${filtros.q.replace(/[[%_]/g, '[$&]')}%`);
    condiciones.push('(r.Sku LIKE @q OR r.CodigoBarras LIKE @q OR r.NombreProducto LIKE @q)');
  }
  return condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
}

export async function listar(filtros, { offset, pageSize }) {
  const pool = await getPool();

  const countRequest = pool.request();
  const whereCount = aplicarFiltros(countRequest, filtros);
  const countResult = await countRequest.query(
    `SELECT COUNT(*) AS total FROM ${S}.ReportesProductoDanado r ${whereCount}`
  );
  const total = countResult.recordset[0].total;

  const dataRequest = pool.request();
  const whereData = aplicarFiltros(dataRequest, filtros);
  dataRequest.input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSize);
  const dataResult = await dataRequest.query(`
    ${SELECT_BASE}
    ${whereData}
    ORDER BY r.FechaCreacion DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  return { items: dataResult.recordset, total };
}

export async function obtenerKpis(filtros) {
  const pool = await getPool();
  const request = pool.request();
  const where = aplicarFiltros(request, filtros);
  const result = await request.query(`
    SELECT
      SUM(CASE WHEN Estado = 'Pendiente' THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN Estado = 'Devuelto' THEN 1 ELSE 0 END) AS devueltos,
      SUM(CASE WHEN Estado = 'Aprobado' THEN 1 ELSE 0 END) AS aprobados,
      SUM(CASE WHEN Estado = 'Rechazado' THEN 1 ELSE 0 END) AS rechazados,
      SUM(CASE WHEN Estado = 'NFValidacion' THEN 1 ELSE 0 END) AS nfValidacion,
      SUM(CASE WHEN Estado = 'Procesado' THEN 1 ELSE 0 END) AS procesados,
      SUM(CASE WHEN Estado = 'EnContabilidad' THEN 1 ELSE 0 END) AS enContabilidad,
      SUM(CASE WHEN Estado = 'Cerrado' THEN 1 ELSE 0 END) AS cerrados,
      SUM(CASE WHEN Estado = 'Procesado' THEN Cantidad ELSE 0 END) AS unidadesDadasBaja
    FROM ${S}.ReportesProductoDanado r
    ${where}
  `);
  const row = result.recordset[0];
  return {
    pendientes: row.pendientes || 0,
    devueltos: row.devueltos || 0,
    aprobados: row.aprobados || 0,
    rechazados: row.rechazados || 0,
    nfValidacion: row.nfValidacion || 0,
    procesados: row.procesados || 0,
    enContabilidad: row.enContabilidad || 0,
    cerrados: row.cerrados || 0,
    unidadesDadasBaja: Number(row.unidadesDadasBaja) || 0,
  };
}

export async function obtenerPorId(reporteId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('reporteId', sql.BigInt, reporteId)
    .query(`${SELECT_BASE} WHERE r.ReporteId = @reporteId`);
  return result.recordset[0] || null;
}

/**
 * Igual que asegurarValorCatalogo (reclamosRepository) pero dentro de la
 * transacción del caller: el valor nuevo solo queda en ReclamoCatalogos si el
 * reporte se crea. Devuelve el valor como ya está escrito en el catálogo.
 */
async function asegurarValorCatalogoTx(transaction, tipo, valor, usuario) {
  const { recordset } = await new sql.Request(transaction)
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

/**
 * `catalogos` (opcional): { campo: tipo } de los campos de `data` que
 * alimentan ReclamoCatalogos; se registran en la misma transacción.
 */
export async function crear(data, usuario, { catalogos = {} } = {}) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    data = { ...data };
    for (const [campo, tipo] of Object.entries(catalogos)) {
      data[campo] = await asegurarValorCatalogoTx(transaction, tipo, data[campo], usuario.username || usuario.sub);
    }
    const request = new sql.Request(transaction);
    const insertResult = await request
      .input('tiendaId', sql.Int, data.tiendaId)
      .input('empleadoReportaNombre', sql.VarChar(150), data.empleadoReportaNombre)
      .input('empleadoReportaUsuario', sql.VarChar(150), usuario.username)
      .input('codigoBarras', sql.VarChar(50), data.codigoBarras || null)
      .input('nombreProducto', sql.VarChar(200), data.nombreProducto)
      .input('marca', sql.VarChar(100), data.marca || null)
      .input('division', sql.NVarChar(100), data.division)
      .input('motivo', sql.NVarChar(100), data.motivo)
      .input('cantidad', sql.Decimal(18, 3), data.cantidad)
      .input('descripcion', sql.NVarChar(1000), data.descripcion || null)
      .input('evidenciaProveedor', sql.VarChar(20), data.evidenciaProveedor)
      .input('evidenciaKey', sql.NVarChar(500), data.evidenciaKey || null).query(`
        INSERT INTO ${S}.ReportesProductoDanado
          (TiendaId, EmpleadoReportaNombre, EmpleadoReportaUsuario, CodigoBarras,
           NombreProducto, Marca, Division, Motivo, Cantidad, Descripcion,
           EvidenciaProveedor, EvidenciaKey)
        OUTPUT INSERTED.ReporteId
        VALUES
          (@tiendaId, @empleadoReportaNombre, @empleadoReportaUsuario, @codigoBarras,
           @nombreProducto, @marca, @division, @motivo, @cantidad, @descripcion,
           @evidenciaProveedor, @evidenciaKey)
      `);

    const reporteId = insertResult.recordset[0].ReporteId;

    await registrarEvento(
      {
        reporteId,
        accion: 'Creado',
        estadoAnterior: null,
        estadoNuevo: 'Pendiente',
        usuarioId: usuario.sub,
        usuarioNombre: usuario.name,
      },
      new sql.Request(transaction)
    );

    await transaction.commit();
    return reporteId;
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/**
 * UPDATE condicional: solo cambia de estadoDesde -> estadoHacia si el
 * reporte sigue en estadoDesde. Devuelve rowsAffected para que el caller
 * detecte condiciones de carrera (0 filas = alguien más ya lo cambió).
 * `request` es el de la transacción del caller.
 */
async function transicionEstado({ reporteId, estadoDesde, estadoHacia, camposExtra = {} }, request) {
  request.input('reporteId', sql.BigInt, reporteId);

  const sets = ['Estado = @estadoHacia', 'FechaActualizacion = SYSUTCDATETIME()'];
  request.input('estadoHacia', sql.VarChar(20), estadoHacia);

  if (camposExtra.motivoRechazo !== undefined) {
    request.input('motivoRechazo', sql.NVarChar(500), camposExtra.motivoRechazo);
    sets.push('MotivoRechazo = @motivoRechazo');
  }
  if (camposExtra.resolucion !== undefined) {
    request.input('resolucion', sql.VarChar(20), camposExtra.resolucion);
    sets.push('Resolucion = @resolucion');
  }
  if (camposExtra.pagoReferencia !== undefined) {
    request.input('pagoReferencia', sql.NVarChar(200), camposExtra.pagoReferencia);
    sets.push('PagoReferencia = @pagoReferencia');
  }
  if (camposExtra.incrementarIntentos) {
    sets.push('ProcesadoIntentos = ProcesadoIntentos + 1');
  }
  if (camposExtra.documentoSalidaNf !== undefined) {
    request.input('documentoSalidaNf', sql.NVarChar(50), camposExtra.documentoSalidaNf);
    sets.push('DocumentoSalidaNf = @documentoSalidaNf');
  }
  if (camposExtra.sapDocumentoId !== undefined) {
    request.input('sapDocumentoId', sql.VarChar(50), camposExtra.sapDocumentoId);
    sets.push('SapDocumentoId = @sapDocumentoId');
  }

  const result = await request.query(`
    UPDATE ${S}.ReportesProductoDanado
    SET ${sets.join(', ')}
    WHERE ReporteId = @reporteId AND Estado = '${estadoDesde}'
  `);
  return result.rowsAffected[0] > 0;
}

/**
 * Cambio de estado + evento de historial en UNA transacción: o quedan los dos
 * o ninguno. `evento` lleva lo del historial (accion, usuario, detalle); los
 * estados se toman de la transición. `verificar` (opcional) recibe la fila
 * (Estado, Adjuntos, EnviadoProveedorAt) leída con UPDLOCK antes del cambio y puede lanzar o
 * devolver campos extra para el evento. `antesDeCambiar(transaction)`
 * (opcional, async) corre primero, dentro de la misma transacción, y puede
 * lanzar. Devuelve false si el reporte ya no estaba en estadoDesde (o no existe).
 */
async function transicionConHistorial({ reporteId, estadoDesde, estadoHacia, camposExtra, evento, verificar, antesDeCambiar }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Revisión extra dentro de la transacción (puede lanzar para abortar).
    if (antesDeCambiar) await antesDeCambiar(transaction);
    let extraEvento = {};
    if (verificar) {
      const { recordset } = await new sql.Request(transaction)
        .input('reporteId', sql.BigInt, reporteId)
        .query(`SELECT Estado, Adjuntos, EnviadoProveedorAt FROM ${S}.ReportesProductoDanado WITH (UPDLOCK, HOLDLOCK) WHERE ReporteId = @reporteId`);
      if (!recordset.length || recordset[0].Estado !== estadoDesde) {
        await transaction.rollback();
        return false;
      }
      extraEvento = verificar(recordset[0]) || {};
    }
    const ok = await transicionEstado({ reporteId, estadoDesde, estadoHacia, camposExtra }, new sql.Request(transaction));
    if (!ok) {
      await transaction.rollback();
      return false;
    }
    await registrarEvento(
      { reporteId, estadoAnterior: estadoDesde, estadoNuevo: estadoHacia, ...evento, ...extraEvento },
      new sql.Request(transaction)
    );
    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

const transicion = (nombre, datos) =>
  transicionConHistorial({ estadoDesde: TRANSICIONES[nombre].desde, estadoHacia: TRANSICIONES[nombre].hacia, ...datos });

// Compradora: lo devuelve a la tienda. `verificar` revisa, con la fila bloqueada, que no se haya enviado al proveedor.
export const devolverATienda = (reporteId, evento, verificar) => transicion('devolverATienda', { reporteId, evento, verificar });

/**
 * Tienda: guarda el formulario corregido y lo devuelve a Pendiente, con el
 * historial, en una transacción con la fila bloqueada. `verificar(fila)`
 * (regla del dominio) devuelve por qué no se puede, o null. `evento(fila, data)`
 * arma el evento del historial con la fila de antes. `evidencia` (opcional):
 * { provider, key } de la foto nueva. Un motivo nuevo queda en el catálogo.
 * Devuelve { fila } (lo de antes, para borrar la foto vieja), { bloqueado } o null si no existe.
 */
export async function corregir(reporteId, data, usuario, { verificar, evento, evidencia, catalogos = {} }) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction).input('reporteId', sql.BigInt, reporteId).query(`
      SELECT Estado, TiendaId, EmpleadoReportaNombre, CodigoBarras, NombreProducto, Marca, Division, Motivo, Cantidad, Descripcion,
             EvidenciaProveedor, EvidenciaKey
      FROM ${S}.ReportesProductoDanado WITH (UPDLOCK, HOLDLOCK) WHERE ReporteId = @reporteId`);
    const fila = recordset[0];
    const motivo = fila && verificar(fila);
    if (!fila || motivo) {
      await transaction.rollback();
      return fila ? { bloqueado: motivo } : null;
    }
    data = { ...data };
    for (const [campo, tipo] of Object.entries(catalogos)) {
      data[campo] = await asegurarValorCatalogoTx(transaction, tipo, data[campo], usuario.username || usuario.sub);
    }
    const request = new sql.Request(transaction)
      .input('reporteId', sql.BigInt, reporteId)
      .input('tiendaId', sql.Int, data.tiendaId)
      .input('empleadoReportaNombre', sql.VarChar(150), data.empleadoReportaNombre)
      .input('codigoBarras', sql.VarChar(50), data.codigoBarras || null)
      .input('nombreProducto', sql.VarChar(200), data.nombreProducto)
      .input('marca', sql.VarChar(100), data.marca || null)
      .input('division', sql.NVarChar(100), data.division)
      .input('motivo', sql.NVarChar(100), data.motivo)
      .input('cantidad', sql.Decimal(18, 3), data.cantidad)
      .input('descripcion', sql.NVarChar(1000), data.descripcion || null)
      .input('estadoDesde', sql.VarChar(20), TRANSICIONES.corregir.desde)
      .input('estadoHacia', sql.VarChar(20), TRANSICIONES.corregir.hacia);
    const sets = [
      'TiendaId = @tiendaId', 'EmpleadoReportaNombre = @empleadoReportaNombre', 'CodigoBarras = @codigoBarras',
      'NombreProducto = @nombreProducto', 'Marca = @marca', 'Division = @division', 'Motivo = @motivo',
      'Cantidad = @cantidad', 'Descripcion = @descripcion', 'Estado = @estadoHacia', 'FechaActualizacion = SYSUTCDATETIME()',
    ];
    if (evidencia) {
      request.input('evidenciaProveedor', sql.VarChar(20), evidencia.provider).input('evidenciaKey', sql.NVarChar(500), evidencia.key);
      sets.push('EvidenciaProveedor = @evidenciaProveedor', 'EvidenciaKey = @evidenciaKey');
    }
    await request.query(`UPDATE ${S}.ReportesProductoDanado SET ${sets.join(', ')} WHERE ReporteId = @reporteId AND Estado = @estadoDesde`);
    await registrarEvento(
      { reporteId, estadoAnterior: TRANSICIONES.corregir.desde, estadoNuevo: TRANSICIONES.corregir.hacia, ...evento(fila, data) },
      new sql.Request(transaction)
    );
    await transaction.commit();
    return { fila };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

// Devolución aprobada: pasa a Gof.
export const aprobar = (reporteId, evento) => transicion('aprobar', { reporteId, camposExtra: { resolucion: 'Devolucion' }, evento });

// NF: pasa al supervisor GOF.
export const rechazar = (reporteId, motivoRechazo, evento) =>
  transicion('rechazar', { reporteId, camposExtra: { motivoRechazo, resolucion: 'NF' }, evento });

// NF con Gof: check «Documento 1700» → pasa al supervisor GOF.
export const registrarDocumento1700 = (reporteId, evento) => transicion('registrarDocumento1700', { reporteId, evento });

/**
 * Otros reportes cerrados con ese «Documento salida de NF» (para no repetirlo
 * en el mismo producto). `request` (opcional): para leer dentro de una transacción.
 */
export async function reportesConDocumentoSalidaNf(numero, excluirReporteId, request) {
  const req = request || (await getPool()).request();
  const { recordset } = await req
    .input('numero', sql.NVarChar(50), numero)
    .input('excluirId', sql.BigInt, excluirReporteId)
    .query(`SELECT ReporteId, CodigoBarras FROM ${S}.ReportesProductoDanado WHERE DocumentoSalidaNf = @numero AND ReporteId <> @excluirId`);
  return recordset;
}

/**
 * Supervisor GOF: «Documento salida de NF» y cierra. `verificarRepetido(otros)`
 * recibe los otros reportes con ese número, leídos dentro de la transacción
 * del cierre bajo un candado por número (sp_getapplock): dos cierres a la vez
 * con el mismo documento no se cuelan. Lanza si el documento ya se usó.
 */
export const cerrarNf = (reporteId, documentoSalidaNf, evento, verificarRepetido) =>
  transicion('cerrarNf', {
    reporteId,
    camposExtra: { documentoSalidaNf },
    evento,
    antesDeCambiar: async (transaction) => {
      await new sql.Request(transaction)
        .input('recurso', sql.NVarChar(255), `FelixFix:${S}:doc-salida-nf:${documentoSalidaNf}`)
        .query(`
          DECLARE @r INT;
          EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
          IF @r < 0 THROW 50001, 'Otro reporte se está cerrando con este documento; intenta de nuevo.', 1;
        `);
      verificarRepetido?.(await reportesConDocumentoSalidaNf(documentoSalidaNf, reporteId, new sql.Request(transaction)));
    },
  });

// `verificar` revisa los documentos de Gof con la fila bloqueada (nadie los quita a la vez).
export const enviarAContabilidad = (reporteId, evento, verificar) => transicion('enviarAContabilidad', { reporteId, evento, verificar });

export const registrarPago = (reporteId, pagoReferencia, evento) =>
  transicion('registrarPago', { reporteId, camposExtra: { pagoReferencia }, evento });

export const marcarEnProceso = (reporteId, evento) =>
  transicion('marcarEnProceso', { reporteId, camposExtra: { incrementarIntentos: true }, evento });

export const marcarProcesado = (reporteId, sapDocumentoId, evento) =>
  transicion('marcarProcesado', { reporteId, camposExtra: { sapDocumentoId }, evento });

export const revertirAAprobadoTrasFallo = (reporteId, evento) => transicion('revertirAAprobado', { reporteId, evento });

/**
 * Guarda los correos del proveedor bajo UPDLOCK. `motivoBloqueo(estado)`
 * (regla del dominio) devuelve por qué no se puede, o null. `evento(antes)`
 * (opcional) arma el evento de historial a partir de los correos anteriores
 * (null = sin evento); va en la misma transacción.
 * Devuelve { antes }, { bloqueado: motivo } o null si no existe.
 */
export async function actualizarCorreos(reporteId, correos, motivoBloqueo, evento) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('reporteId', sql.BigInt, reporteId)
      .query(`SELECT CorreosProveedor, Estado FROM ${S}.ReportesProductoDanado WITH (UPDLOCK, HOLDLOCK) WHERE ReporteId = @reporteId`);
    const fila = recordset[0];
    const motivo = fila && motivoBloqueo(fila.Estado);
    if (!fila || motivo) {
      await transaction.rollback();
      return fila ? { bloqueado: motivo } : null;
    }
    const antes = parseJsonArray(fila.CorreosProveedor);
    await new sql.Request(transaction)
      .input('reporteId', sql.BigInt, reporteId)
      .input('correos', sql.NVarChar(sql.MAX), JSON.stringify(correos)).query(`
        UPDATE ${S}.ReportesProductoDanado
        SET CorreosProveedor = @correos, FechaActualizacion = SYSUTCDATETIME()
        WHERE ReporteId = @reporteId
      `);
    const ev = evento?.(antes);
    if (ev) await registrarEvento({ reporteId, ...ev }, new sql.Request(transaction));
    await transaction.commit();
    return { antes };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/**
 * Read-modify-write del arreglo JSON de adjuntos bajo UPDLOCK, para que dos
 * subidas/borrados a la vez sobre el mismo reporte no se pisen. `modificar`
 * recibe el arreglo actual y el estado del reporte, y devuelve el nuevo
 * arreglo (o null para no cambiar nada); si lanza, no se guarda nada.
 * `evento()` (opcional) arma el evento de historial, que se inserta en la
 * misma transacción solo si hubo cambio.
 * Devuelve { antes, despues }, o null si el reporte no existe.
 */
export async function modificarAdjuntos(reporteId, modificar, evento) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('reporteId', sql.BigInt, reporteId)
      .query(`SELECT Adjuntos, Estado FROM ${S}.ReportesProductoDanado WITH (UPDLOCK, HOLDLOCK) WHERE ReporteId = @reporteId`);
    if (!recordset.length) {
      await transaction.rollback();
      return null;
    }
    const antes = parseJsonArray(recordset[0].Adjuntos);
    const despues = modificar(antes, recordset[0].Estado);
    if (despues) {
      await new sql.Request(transaction)
        .input('reporteId', sql.BigInt, reporteId)
        .input('adjuntos', sql.NVarChar(sql.MAX), JSON.stringify(despues))
        .query(`UPDATE ${S}.ReportesProductoDanado SET Adjuntos = @adjuntos, FechaActualizacion = SYSUTCDATETIME() WHERE ReporteId = @reporteId`);
      const ev = evento?.();
      if (ev) await registrarEvento({ reporteId, ...ev }, new sql.Request(transaction));
    }
    await transaction.commit();
    return { antes, despues: despues || antes };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

/**
 * Borra el reporte y su historial en una transacción, con la fila bloqueada.
 * `motivoBloqueo(estado)` (regla del dominio) devuelve por qué no se puede, o
 * null. Devuelve { fila } con lo necesario para limpiar el disco,
 * { bloqueado: motivo } si no se puede, o null si no existe.
 */
export async function eliminar(reporteId, motivoBloqueo) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const { recordset } = await new sql.Request(transaction)
      .input('reporteId', sql.BigInt, reporteId)
      .query(
        `SELECT Estado, EvidenciaProveedor, EvidenciaKey, Adjuntos FROM ${S}.ReportesProductoDanado WITH (UPDLOCK, HOLDLOCK) WHERE ReporteId = @reporteId`
      );
    const fila = recordset[0];
    const motivo = fila && motivoBloqueo(fila.Estado);
    if (!fila || motivo) {
      await transaction.rollback();
      return fila ? { bloqueado: motivo } : null;
    }
    await new sql.Request(transaction)
      .input('reporteId', sql.BigInt, reporteId)
      .query(
        `DELETE FROM ${S}.ReportesProductoDanadoHistorial WHERE ReporteId = @reporteId; DELETE FROM ${S}.ReportesProductoDanado WHERE ReporteId = @reporteId;`
      );
    await transaction.commit();
    return { fila };
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  }
}

export function parseJsonArray(valor) {
  if (!valor) return [];
  try {
    const v = JSON.parse(valor);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Reserva el envío al proveedor ANTES de mandar el correo, con un UPDATE
 * condicional atómico: solo si sigue en `estado`, con menos de `maxEnvios` y
 * pasada la espera de `esperaMin` minutos desde el último (las mismas reglas
 * del dominio: motivoNoEnviarProveedor y bloqueoReenvio). Así dos envíos a la
 * vez no mandan dos correos. Devuelve lo anterior (para revertir si el correo
 * falla) o null si no se pudo reservar.
 */
export async function reservarEnvioProveedor(reporteId, usuario, { estado, maxEnvios, esperaMin }) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('reporteId', sql.BigInt, reporteId)
    .input('usuario', sql.NVarChar(150), usuario)
    .input('estado', sql.VarChar(20), estado)
    .input('maxEnvios', sql.Int, maxEnvios)
    .input('esperaMin', sql.Int, esperaMin).query(`
      UPDATE ${S}.ReportesProductoDanado
      SET EnviadoProveedorAt = SYSUTCDATETIME(), EnviadoProveedorPor = @usuario,
          EnviosProveedor = EnviosProveedor + 1, FechaActualizacion = SYSUTCDATETIME()
      OUTPUT DELETED.EnviosProveedor, DELETED.EnviadoProveedorAt, DELETED.EnviadoProveedorPor
      WHERE ReporteId = @reporteId AND Estado = @estado AND EnviosProveedor < @maxEnvios
        AND (EnviadoProveedorAt IS NULL OR EnviadoProveedorAt <= DATEADD(MINUTE, -@esperaMin, SYSUTCDATETIME()))
    `);
  return recordset[0] || null;
}

/** El correo no salió: devuelve contador, fecha y autor de antes (solo si nadie más reservó después). */
export async function revertirReservaEnvioProveedor(reporteId, antes) {
  const pool = await getPool();
  await pool
    .request()
    .input('reporteId', sql.BigInt, reporteId)
    .input('envios', sql.Int, antes.EnviosProveedor)
    .input('at', sql.DateTime2, antes.EnviadoProveedorAt)
    .input('por', sql.NVarChar(150), antes.EnviadoProveedorPor).query(`
      UPDATE ${S}.ReportesProductoDanado
      SET EnviosProveedor = @envios, EnviadoProveedorAt = @at, EnviadoProveedorPor = @por, FechaActualizacion = SYSUTCDATETIME()
      WHERE ReporteId = @reporteId AND EnviosProveedor = @envios + 1
    `);
}

/** Evento de historial del envío ya reservado y enviado. */
export const registrarEventoEnvioProveedor = (reporteId, evento) => registrarEvento({ reporteId, ...evento });
