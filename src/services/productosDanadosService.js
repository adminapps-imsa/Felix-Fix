import fs from 'node:fs/promises';
import path from 'node:path';
import { detectarTipoArchivo } from '../utils/tipoArchivo.js';
import * as repo from '../repositories/productosDanadosRepository.js';
import { parseJsonArray } from '../repositories/productosDanadosRepository.js';
import { listarCatalogo } from '../repositories/reclamosRepository.js';
import { reporteAdjuntoPath, evidenciaAbsolutePath } from '../config/almacenamiento.js';
import { nombresDeUsuarios, datosDeUsuario } from './acceso/keycloakAdmin.js';
import { plantillaReporteProveedor } from './correo/plantillaReporteProveedor.js';
import { enviarCorreo, correoConfigurado, correoDesactivado, validarDestinatarios, MSG_DESACTIVADO } from './correo/mailer.js';
import { avisarEtapa } from './correo/avisosProductosDanados.js';
import { conLogoEnLinea } from './correo/diseno.js';
import { env } from '../config/env.js';
import * as historialRepo from '../repositories/historialRepository.js';
import { saveEvidence, getEvidenceStream } from './evidenceStorage/index.js';
import { darDeBajaInventario, SapBajaError, SapNoImplementadoError } from './sapBajaService.js';
import { documentoMaterialSap } from './sapProductosService.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { badRequest, conflict, notFound, badGateway, forbidden, serviceUnavailable } from '../utils/httpError.js';
import { tienePermiso } from './acceso/permisos.js';
import { compradoraDe } from './acceso/alcanceCompradora.js';
import { exigirDivision } from './divisiones.js';
import {
  esDocGof,
  motivoNoEditable,
  motivoNoAgregarAdjunto,
  motivoNoEliminarAdjunto,
  motivoNoEnviarContabilidad,
  motivoNoEliminar,
  motivoNoEnviarProveedor,
  bloqueoReenvio,
  ESTADO_ENVIO_PROVEEDOR,
  MAX_ENVIOS_PROVEEDOR,
  ESPERA_REENVIO_MIN,
  alcanceVista,
  creadorVisible,
  esDelCreador,
  puedeVerReporte,
  motivoNoDocumento1700,
  motivoNoValidarNf,
  validarDocumentoSalidaNf,
  mismoCodigo,
  motivoNoDevolverATienda,
  motivoNoCorregir,
  cambiosAlCorregir,
} from '../domain/productoDanado.js';
import { logger } from '../utils/logger.js';

const ALLOWED_MAGIC_TYPES = new Set(['jpg', 'png', 'webp']);
// Catálogos (ReclamoCatalogos): la división es la misma de Reclamos.
const CAT_DIVISION = 'division';
const CAT_MOTIVO = 'motivo_producto';

const autor = (usuario) => usuario.username || usuario.sub;

/** El archivo subido ya quedó referenciado en la BD: errorHandler no lo borra (ver middleware/upload.js). */
function marcarGuardado(multerFile) {
  if (multerFile) multerFile.borrarSiFalla = false;
}

function aDto(r) {
  return { ...r, CorreosProveedor: parseJsonArray(r.CorreosProveedor), Adjuntos: parseJsonArray(r.Adjuntos) };
}

export async function catalogos() {
  const [divisiones, motivos] = await Promise.all([listarCatalogo(CAT_DIVISION), listarCatalogo(CAT_MOTIVO)]);
  return { divisiones, motivos };
}

// Las fechas del filtro ('YYYY-MM-DD') son días en hora de Panamá (UTC-5, sin
// horario de verano) y FechaCreacion está en UTC: el día empieza a las 05:00 UTC.
const OFFSET_PANAMA_H = 5;

/** Inicio (UTC) del día 'YYYY-MM-DD' de Panamá, más `dias` días. */
export function inicioDiaPanama(fecha, dias = 0) {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias, OFFSET_PANAMA_H));
}

async function toFiltros(query, usuario) {
  return {
    resoluciones: usuario ? alcanceVista(usuario.permisos || new Set()) : null,
    compradora: await compradoraDe(usuario),
    creador: usuario ? creadorVisible(usuario) : null,
    tiendaId: query.tienda ? Number(query.tienda) : undefined,
    motivo: query.motivo || undefined,
    estado: query.estado || undefined,
    fechaDesde: query.fechaDesde ? inicioDiaPanama(query.fechaDesde) : undefined,
    // Exclusivo: inicio del día siguiente (el repo compara con <).
    fechaHasta: query.fechaHasta ? inicioDiaPanama(query.fechaHasta, 1) : undefined,
    q: query.q?.trim() || undefined,
  };
}

export async function listarReportes(query, usuario) {
  const filtros = await toFiltros(query, usuario);
  const pagination = parsePagination(query);
  const { items, total } = await repo.listar(filtros, pagination);
  return { data: items.map(aDto), pagination: buildPaginationMeta({ ...pagination, total }) };
}

export async function obtenerKpis(query, usuario) {
  return repo.obtenerKpis(await toFiltros(query, usuario));
}

/** Quien ve solo una parte (Gof, Tienda) no abre los demás reportes (ni su foto ni sus adjuntos): responde como si no existieran. */
function exigirVisible(reporte, usuario) {
  if (!usuario) return;
  if (!puedeVerReporte(alcanceVista(usuario.permisos || new Set()), reporte) || !esDelCreador(creadorVisible(usuario), reporte))
    throw notFound('Reporte no encontrado.');
}

/**
 * Tienda («Solo los reportes que creó»): un reporte de otra persona responde
 * 404 en todas las rutas /:id (detalle, archivos y acciones), como si no existiera.
 */
export async function exigirPropio(reporteId, usuario) {
  const creador = creadorVisible(usuario);
  if (creador === null) return;
  const reporte = await repo.obtenerPorId(reporteId);
  if (reporte && !esDelCreador(creador, reporte)) throw notFound('Reporte no encontrado.');
}

/** `usuario` (opcional): se pasa en las consultas para aplicar lo que puede ver. */
export async function obtenerDetalle(reporteId, usuario) {
  const reporte = await repo.obtenerPorId(reporteId);
  if (!reporte) throw notFound('Reporte no encontrado.');
  exigirVisible(reporte, usuario);
  const historial = await historialRepo.listarHistorialDeReporte(reporteId);
  const dto = aDto(reporte);
  const nombres = await nombresDeUsuarios([...dto.Adjuntos.map((a) => a.uploaded_by), dto.EnviadoProveedorPor]);
  dto.Adjuntos = dto.Adjuntos.map((a) => ({ ...a, uploaded_by_nombre: nombres.get(a.uploaded_by) || a.uploaded_by }));
  dto.EnviadoProveedorPorNombre = dto.EnviadoProveedorPor ? nombres.get(dto.EnviadoProveedorPor) || dto.EnviadoProveedorPor : null;
  return { ...dto, historial };
}

export async function obtenerEvidencia(reporteId, usuario) {
  const reporte = await repo.obtenerPorId(reporteId);
  if (reporte) exigirVisible(reporte, usuario);
  if (!reporte || !reporte.EvidenciaKey) throw notFound('Este reporte no tiene evidencia adjunta.');
  const stream = await getEvidenceStream(reporte.EvidenciaProveedor, reporte.EvidenciaKey);
  if (!stream) throw notFound('El archivo de evidencia ya no está disponible.');
  // Content-Type por la extensión guardada (solo se aceptan JPG, PNG y WebP).
  const ext = path.extname(reporte.EvidenciaKey).slice(1).toLowerCase();
  return { stream, contentType: MIME_FOTO[ext] || 'application/octet-stream' };
}

async function validarArchivoEvidencia(multerFile) {
  const detected = await detectarTipoArchivo(multerFile.path);
  if (!detected || !ALLOWED_MAGIC_TYPES.has(detected.ext)) {
    await fs.unlink(multerFile.path).catch(() => {});
    throw badRequest('El archivo subido no es una imagen JPG/PNG/WEBP válida.');
  }
}

export async function crearReporte(data, multerFile, usuario) {
  // Antes de guardar la foto: una división que no es del catálogo no crea nada.
  data = { ...data, division: await exigirDivision(data.division) };
  let evidencia = { provider: 'local', key: null };
  if (multerFile) {
    await validarArchivoEvidencia(multerFile);
    evidencia = await saveEvidence(multerFile);
  }

  // Motivo: un valor nuevo queda en el catálogo; uno existente (con otras
  // mayúsculas) se guarda como ya está escrito allí. Se registra en la misma
  // transacción que el reporte: si la creación falla, el catálogo no cambia.
  // La división no: solo las del catálogo (exigirDivision, arriba).
  const reporteId = await repo.crear(
    { ...data, evidenciaProveedor: evidencia.provider, evidenciaKey: evidencia.key },
    usuario,
    { catalogos: { motivo: CAT_MOTIVO } }
  );
  // Ya referenciada en la BD: errorHandler no debe borrarla si algo falla después.
  marcarGuardado(multerFile);
  const detalle = await obtenerDetalle(reporteId);
  avisarEtapa('nuevo', detalle);
  return detalle;
}

// Cambios de estado: el UPDATE condicional y el historial van en una sola
// transacción (repo); el aviso sale solo después del commit.
const eventoDe = (usuario, accion, detalle) => ({ accion, usuarioId: usuario.sub, usuarioNombre: usuario.name, detalle });

export async function aprobarReporte(reporteId, usuario) {
  const ok = await repo.aprobar(reporteId, eventoDe(usuario, 'Aprobado'));
  if (!ok) throw conflict('El reporte ya no está en estado Pendiente.');
  const detalle = await obtenerDetalle(reporteId);
  avisarEtapa('aprobado', detalle);
  return detalle;
}

export async function rechazarReporte(reporteId, motivoRechazo, usuario) {
  const ok = await repo.rechazar(reporteId, motivoRechazo, eventoDe(usuario, 'Rechazado', motivoRechazo));
  if (!ok) throw conflict('El reporte ya no está en estado Pendiente.');
  const detalle = await obtenerDetalle(reporteId);
  avisarEtapa('nf', detalle, { detalle: motivoRechazo });
  return detalle;
}

// ------------------------------------------------------------------
// Devolver a la tienda: la compradora lo regresa (antes de enviarlo al
// proveedor) y la tienda corrige el formulario y lo reenvía.
// ------------------------------------------------------------------

export async function devolverATienda(reporteId, { comentario }, usuario) {
  const texto = String(comentario ?? '').trim();
  const r = await existeOFallar(reporteId);
  exigirVisible(r, usuario);
  // Primero con lo leído (mensaje claro); después, con la fila bloqueada, dentro de la transacción.
  const motivo = motivoNoDevolverATienda(r, texto);
  if (motivo) throw r.Estado === 'Pendiente' && !r.EnviadoProveedorAt ? badRequest(motivo) : conflict(motivo);
  const ok = await repo.devolverATienda(reporteId, eventoDe(usuario, 'DevueltoTienda', texto.slice(0, 1000)), (fila) => {
    const m = motivoNoDevolverATienda(fila, texto);
    if (m) throw conflict(m);
  });
  if (!ok) throw conflict('El reporte ya no está Pendiente.');
  const detalle = await obtenerDetalle(reporteId);
  logger.info({ reporteId, usuario: autor(usuario), para: detalle.EmpleadoReportaUsuario }, 'Reporte devuelto a la tienda');
  avisarEtapa('devuelto', detalle, { detalle: texto });
  return detalle;
}

/**
 * Tienda: corrige el formulario del reporte devuelto (los mismos campos del
 * alta y, si quiere, una foto nueva) y lo reenvía a la compradora (Pendiente).
 * Lo puede hacer cualquiera con «Crear reportes» (lo revisa la ruta).
 */
export async function corregirReporte(reporteId, data, multerFile, usuario) {
  const r = await existeOFallar(reporteId);
  exigirVisible(r, usuario);
  const motivo = motivoNoCorregir(r);
  if (motivo) throw conflict(motivo);
  const { respuesta, ...formulario } = data;
  const datos = { ...formulario, division: await exigirDivision(formulario.division) };

  let evidencia = null;
  if (multerFile) {
    await validarArchivoEvidencia(multerFile);
    evidencia = await saveEvidence(multerFile);
  }
  const texto = String(respuesta ?? '').trim();
  const res = await repo.corregir(reporteId, datos, usuario, {
    verificar: motivoNoCorregir,
    evidencia,
    catalogos: { motivo: CAT_MOTIVO },
    evento: (antes, nuevos) => {
      const cambios = cambiosAlCorregir(antes, nuevos, { fotoNueva: Boolean(evidencia) });
      const detalle = [cambios.length ? `Corrigió: ${cambios.join(', ')}` : 'Sin cambios en el formulario', texto && `Respuesta: ${texto}`]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 1000);
      return eventoDe(usuario, 'Corregido', detalle);
    },
  });
  if (!res) throw notFound('Reporte no encontrado.');
  if (res.bloqueado) throw conflict(res.bloqueado);
  marcarGuardado(multerFile);

  // La foto anterior ya no la usa nadie (solo después del commit).
  const vieja = res.fila;
  if (evidencia && vieja.EvidenciaKey && vieja.EvidenciaProveedor === 'local') {
    await fs.unlink(evidenciaAbsolutePath(vieja.EvidenciaKey)).catch((err) => {
      if (err.code !== 'ENOENT') logger.error({ err, reporteId }, 'No se pudo borrar la foto anterior de un reporte corregido');
    });
  }
  const detalle = await obtenerDetalle(reporteId);
  logger.info({ reporteId, usuario: autor(usuario) }, 'Reporte corregido y reenviado a la compradora');
  // El detalle del aviso: qué corrigió y su respuesta (el último evento del historial).
  avisarEtapa('reenviado', detalle, { detalle: detalle.historial.at(-1)?.Detalle });
  return detalle;
}

// ------------------------------------------------------------------
// Después de la respuesta del proveedor
//   NF: supervisor GOF lo cierra.
//   Devolución aprobada: Gof sube el documento y lo envía a contabilidad;
//   contabilidad confirma el pago del proveedor y se cierra.
// ------------------------------------------------------------------

// NF: Gof marca el check «Documento 1700» y lo pasa al supervisor GOF.
export async function registrarDocumento1700(reporteId, { confirmado }, usuario) {
  const motivo = motivoNoDocumento1700({ confirmado });
  if (motivo) throw badRequest(motivo);
  const ok = await repo.registrarDocumento1700(reporteId, eventoDe(usuario, 'Documento1700', 'Documento 1700 hecho en SAP'));
  if (!ok) throw conflict('El reporte ya no está en NF esperando el documento 1700 de Gof.');
  const detalle = await obtenerDetalle(reporteId);
  avisarEtapa('nfValidar', detalle, { detalle: 'Gof marcó el documento 1700.' });
  return detalle;
}

// NF por validar: el supervisor GOF escribe el «Documento salida de NF» y cierra.
// El número se valida contra SAP: salida 551 del Almacén NF, del mismo producto y
// tienda, y sin haberse usado ya para cerrar otro reporte del mismo producto.
export async function cerrarNf(reporteId, { numero, comentario }, usuario) {
  const motivo = motivoNoValidarNf({ numero });
  if (motivo) throw badRequest(motivo, { code: 'DOC_SALIDA_NF_FORMATO' });
  const num = String(numero).trim();
  const r = await existeOFallar(reporteId);
  // Sin consultar SAP si el reporte no está esperando al supervisor GOF.
  if (r.Estado !== 'NFValidacion') throw conflict('El reporte ya no está esperando la validación del supervisor GOF.');
  const repetidoEn = (otros) => otros.find((o) => mismoCodigo(o.CodigoBarras, r.CodigoBarras))?.ReporteId ?? null;
  const sap = await documentoMaterialSap(num, r.CodigoBarras);
  const v = validarDocumentoSalidaNf({ numero: num, sap, tiendaCodigo: r.TiendaCodigo, codigoBarras: r.CodigoBarras, repetidoEn: repetidoEn(await repo.reportesConDocumentoSalidaNf(num, reporteId)) });
  if (v.code === 'SAP_NO_DISPONIBLE') throw serviceUnavailable(v.mensaje, { code: v.code });
  if (v.code) throw badRequest(v.mensaje, { code: v.code });
  const cantidadSap = v.lineas.reduce((t, l) => t + l.menge, 0);
  const detalleEvento = [`Documento salida de NF: ${num} (SAP: 551 desde almacén 1700, ${r.TiendaCodigo}, ${cantidadSap} unid.)`, comentario]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 1000);
  // SAP (lento) va fuera; el «ya se usó» se repite dentro de la transacción del cierre,
  // con un candado por número, para que dos cierres a la vez no pasen los dos.
  const ok = await repo.cerrarNf(reporteId, num, eventoDe(usuario, 'NFCerrado', detalleEvento), (otros) => {
    const otro = repetidoEn(otros);
    if (!otro) return;
    const rep = validarDocumentoSalidaNf({ numero: num, repetidoEn: otro });
    throw badRequest(rep.mensaje, { code: rep.code });
  });
  if (!ok) throw conflict('El reporte ya no está esperando la validación del supervisor GOF.');
  const detalle = await obtenerDetalle(reporteId);
  avisarEtapa('nfCerrado', detalle, { detalle: detalleEvento });
  return detalle;
}

export async function enviarAContabilidad(reporteId, usuario) {
  await existeOFallar(reporteId);
  let docs = [];
  // Los documentos se revisan con la fila bloqueada, en la misma transacción del cambio.
  const ok = await repo.enviarAContabilidad(reporteId, eventoDe(usuario, 'EnviadoContabilidad'), (fila) => {
    const adjuntos = parseJsonArray(fila.Adjuntos);
    const motivo = motivoNoEnviarContabilidad(adjuntos);
    if (motivo) throw badRequest(motivo);
    docs = adjuntos.filter(esDocGof);
    return { detalle: `Documentos: ${docs.map((d) => d.originalname).join(', ')}`.slice(0, 1000) };
  });
  if (!ok) throw conflict('El reporte ya no está con Gof (ya se envió a contabilidad o cambió de estado).');
  const detalle = await obtenerDetalle(reporteId);
  avisarEtapa('contabilidad', detalle, { detalle: `Documentos: ${docs.map((d) => d.originalname).join(', ')}` });
  return detalle;
}

export async function registrarPago(reporteId, { referencia, comentario }, usuario) {
  const ok = await repo.registrarPago(
    reporteId,
    referencia,
    eventoDe(usuario, 'PagoRecibido', [`Referencia: ${referencia}`, comentario].filter(Boolean).join(' · ').slice(0, 1000))
  );
  if (!ok) throw conflict('El reporte ya no está en contabilidad esperando el pago.');
  const detalle = await obtenerDetalle(reporteId);
  avisarEtapa('pagado', detalle, { detalle: `Referencia: ${referencia}` });
  return detalle;
}

/**
 * Aprobado -> EnProceso -> Procesado (o de vuelta a Aprobado si SAP falla).
 * El UPDATE condicional en el repositorio (WHERE Estado = 'Aprobado') es lo
 * que evita que dos peticiones concurrentes (doble clic, dos supervisores)
 * disparen dos bajas en SAP para el mismo reporte.
 */
export async function procesarReporte(reporteId, usuario) {
  const tomadoParaProceso = await repo.marcarEnProceso(reporteId, eventoDe(usuario, 'EnProceso'));
  if (!tomadoParaProceso) {
    throw conflict('El reporte no está en estado Aprobado (ya fue procesado, está en proceso, o fue rechazado).');
  }

  try {
    // Dentro del try: si esta lectura falla, el reporte también vuelve a Aprobado.
    const reporte = await repo.obtenerPorId(reporteId);
    if (!reporte) throw new Error('El reporte no se encontró después de marcarlo EnProceso.');
    const { sapDocumentoId } = await darDeBajaInventario({
      reporteId,
      sku: reporte.Sku,
      cantidad: reporte.Cantidad,
      motivo: reporte.Motivo,
      tiendaCodigo: reporte.TiendaCodigo,
      idempotencyKey: String(reporteId),
    });

    await repo.marcarProcesado(reporteId, sapDocumentoId, eventoDe(usuario, 'ProcesadoOk', `SAP documento ${sapDocumentoId}`));
    return obtenerDetalle(reporteId);
  } catch (err) {
    // Si darDeBajaInventario() ya había confirmado éxito y el fallo ocurrió
    // después (ej. al guardar el evento de historial), el reporte ya quedó
    // "Procesado" en la BD: no hay que revertirlo ni reportar un 502 falso.
    const estadoActual = await repo.obtenerPorId(reporteId);
    if (estadoActual?.Estado === 'Procesado') {
      return obtenerDetalle(reporteId);
    }

    const esperado = err instanceof SapBajaError || err instanceof SapNoImplementadoError;
    if (!esperado) logger.error({ err }, 'Fallo inesperado al procesar baja en SAP');

    await repo.revertirAAprobadoTrasFallo(reporteId, eventoDe(usuario, 'ProcesadoError', err.message?.slice(0, 1000)));

    const reporteActualizado = await obtenerDetalle(reporteId);
    throw badGateway('No se pudo registrar la baja en SAP. El reporte sigue Aprobado y se puede reintentar.', {
      code: 'SAP_BAJA_FAILED',
      retryable: true,
      reporte: reporteActualizado,
    });
  }
}

// ------------------------------------------------------------------
// Correos del proveedor y adjuntos (para el futuro envío del reporte)
// ------------------------------------------------------------------

async function existeOFallar(reporteId) {
  const r = await repo.obtenerPorId(reporteId);
  if (!r) throw notFound('Reporte no encontrado.');
  return r;
}

/*
 * Correos y adjuntos del proveedor: los edita quien trabaja con el proveedor
 * (compradora, administrador) en cualquier reporte; quien solo crea reportes
 * (Tienda, Gof), únicamente en los que creó.
 */
const EDITAN_CUALQUIER_REPORTE = ['productos_danados.aprobar', 'productos_danados.enviar', 'productos_danados.procesar'];

export function puedeEditarReporte(usuario, r) {
  if (EDITAN_CUALQUIER_REPORTE.some((p) => tienePermiso(usuario, p))) return true;
  return tienePermiso(usuario, 'productos_danados.crear') && Boolean(usuario?.username) && r.EmpleadoReportaUsuario === usuario.username;
}

async function exigirEdicion(reporteId, usuario) {
  const r = await existeOFallar(reporteId);
  if (!puedeEditarReporte(usuario, r)) throw forbidden('Solo puedes cambiar los correos y archivos de los reportes que tú creaste.');
}

export async function guardarCorreos(reporteId, correos, usuario) {
  await exigirEdicion(reporteId, usuario);
  // Estado y cambio bajo UPDLOCK; el historial va en la misma transacción.
  const res = await repo.actualizarCorreos(reporteId, correos, motivoNoEditable, (antes) => {
    const agregados = correos.filter((c) => !antes.includes(c));
    const quitados = antes.filter((c) => !correos.includes(c));
    if (!agregados.length && !quitados.length) return null;
    return eventoDe(
      usuario,
      'CorreosActualizados',
      [agregados.length && `Agregó: ${agregados.join(', ')}`, quitados.length && `Quitó: ${quitados.join(', ')}`]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 1000)
    );
  });
  if (!res) throw notFound('Reporte no encontrado.');
  if (res.bloqueado) throw conflict(res.bloqueado);
  return obtenerDetalle(reporteId);
}

/** Magic bytes: el MIME del navegador no es confiable. xlsx = 'xlsx', xls = 'cfb'. */
async function tipoAdjunto(multerFile) {
  const d = await detectarTipoArchivo(multerFile.path);
  if (d?.ext === 'pdf') return 'pdf';
  if (d?.ext === 'xlsx' || d?.ext === 'cfb') return 'excel';
  return null;
}

/** Documentos que sube Gof en una devolución aprobada (van a contabilidad, no al proveedor). */

/**
 * `etapa: 'gof'` = documento de Gof para contabilidad: solo mientras el
 * reporte está en Aprobado (con Gof). Sin etapa = adjunto para el proveedor.
 */
export async function agregarAdjunto(reporteId, multerFile, usuario, { etapa } = {}) {
  if (!multerFile) throw badRequest('Selecciona un archivo PDF o Excel.');
  try {
    // Los documentos de Gof tienen su propio permiso (documentar), validado en la ruta.
    if (etapa !== 'gof') await exigirEdicion(reporteId, usuario);
    const tipo = await tipoAdjunto(multerFile);
    if (!tipo) throw badRequest('El archivo no es un PDF o Excel válido.');
    const adj = {
      filename: multerFile.filename,
      originalname: path.basename(multerFile.originalname || multerFile.filename).slice(0, 255),
      tipo,
      uploaded_at: new Date().toISOString(),
      uploaded_by: autor(usuario),
      ...(etapa === 'gof' ? { etapa: 'gof' } : {}),
    };
    // El historial va en la misma transacción: si algo falla, el archivo no
    // quedó referenciado y se puede borrar sin riesgo.
    const res = await repo.modificarAdjuntos(
      reporteId,
      (a, estado) => {
        const motivo = motivoNoAgregarAdjunto(estado, { gof: etapa === 'gof' });
        if (motivo) throw conflict(motivo);
        return [...a, adj];
      },
      () => eventoDe(usuario, 'AdjuntoAgregado', etapa === 'gof' ? `Documento para contabilidad: ${adj.originalname}` : adj.originalname)
    );
    if (!res) throw notFound('Reporte no encontrado.');
  } catch (err) {
    await fs.unlink(multerFile.path).catch(() => {});
    throw err;
  }
  marcarGuardado(multerFile);
  return obtenerDetalle(reporteId);
}

function indice(idx) {
  const n = Number(idx);
  if (!Number.isInteger(n) || n < 0) throw notFound('Adjunto no encontrado.');
  return n;
}

/**
 * Posición del adjunto pedido. `f` (opcional): su nombre en disco, que manda
 * el portal. Si en la posición `idx` hay otro (alguien quitó uno antes y la
 * lista se corrió), se busca por nombre; si ya no está, 404. Sin `f`, solo la posición.
 */
function indiceAdjunto(adjuntos, idx, f) {
  const i = indice(idx);
  if (!f || adjuntos[i]?.filename === f) return i;
  const j = adjuntos.findIndex((a) => a?.filename === f);
  if (j < 0) throw notFound('El archivo ya no existe. Recarga el detalle.');
  return j;
}

export async function obtenerAdjunto(reporteId, idx, usuario, f) {
  const r = await existeOFallar(reporteId);
  exigirVisible(r, usuario);
  const adjuntos = parseJsonArray(r.Adjuntos);
  const adj = adjuntos[indiceAdjunto(adjuntos, idx, f)];
  if (!adj) throw notFound('Adjunto no encontrado.');
  const ext = path.extname(adj.filename).toLowerCase();
  const contentType =
    adj.tipo === 'pdf'
      ? 'application/pdf'
      : ext === '.xls'
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return { ruta: reporteAdjuntoPath(adj.filename), nombre: adj.originalname || adj.filename, contentType };
}

// Mismos permisos que la ruta de adjuntos para el proveedor.

export async function eliminarAdjunto(reporteId, idx, usuario, f) {
  indice(idx);
  const editaProveedor = puedeEditarReporte(usuario, await existeOFallar(reporteId));
  let borrado = null;
  const res = await repo.modificarAdjuntos(reporteId, (a, estado) => {
    // La posición se resuelve con la lista leída bajo el bloqueo.
    const i = indiceAdjunto(a, idx, f);
    if (!a[i]) return null;
    // Primero quién puede (403), después si el estado lo permite (409).
    if (esDocGof(a[i])) {
      if (!tienePermiso(usuario, 'productos_danados.documentar')) throw forbidden('Solo Gof puede quitar los documentos para contabilidad.');
    } else if (!editaProveedor) {
      throw forbidden('Solo puedes quitar archivos de los reportes que tú creaste.');
    }
    const motivo = motivoNoEliminarAdjunto(estado, a[i]);
    if (motivo) throw conflict(motivo);
    borrado = a[i];
    return a.filter((_, k) => k !== i);
  }, () => eventoDe(usuario, 'AdjuntoEliminado', borrado.originalname));
  if (!res) throw notFound('Reporte no encontrado.');
  if (!borrado) throw notFound('Adjunto no encontrado.');
  // Solo después del commit (cambio + historial): si la BD falla, el archivo sigue referenciado.
  await fs.unlink(reporteAdjuntoPath(borrado.filename)).catch((err) => {
    if (err.code !== 'ENOENT') logger.error({ err, archivo: borrado.filename }, 'No se pudo borrar un adjunto de reporte');
  });
  return obtenerDetalle(reporteId);
}

// ------------------------------------------------------------------
// Envío al proveedor por correo
// ------------------------------------------------------------------

const MIME_FOTO = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

async function leerStream(stream) {
  const partes = [];
  for await (const p of stream) partes.push(p);
  return Buffer.concat(partes);
}

/** Todo lo que lleva el correo: reporte, foto, adjuntos y quién lo envía. */
async function armarCorreo(reporteId, usuario) {
  const r = await existeOFallar(reporteId);
  const correos = parseJsonArray(r.CorreosProveedor);
  // Los documentos de Gof son para contabilidad, no para el proveedor.
  const adjuntos = parseJsonArray(r.Adjuntos).filter((a) => !esDocGof(a));

  let foto = null;
  if (r.EvidenciaKey) {
    const stream = await getEvidenceStream(r.EvidenciaProveedor, r.EvidenciaKey).catch(() => null);
    if (stream) {
      const ext = path.extname(r.EvidenciaKey).slice(1).toLowerCase();
      foto = { buffer: await leerStream(stream), tipo: MIME_FOTO[ext] || 'image/jpeg', ext: ext || 'jpg' };
    }
  }

  const archivos = [];
  let total = foto?.buffer.length || 0;
  for (const a of adjuntos) {
    const ruta = reporteAdjuntoPath(a.filename);
    const st = await fs.stat(ruta).catch(() => null);
    if (!st) continue; // archivo ya no disponible: se omite
    total += st.size;
    archivos.push({ filename: a.originalname || a.filename, path: ruta });
  }
  const maxBytes = env.correo.maxAdjuntosMb * 1024 * 1024;
  const avisos = [];
  if (total > maxBytes) avisos.push(`Los archivos suman ${(total / 1048576).toFixed(1)} MB y el máximo es ${env.correo.maxAdjuntosMb} MB.`);
  if (!correos.length) avisos.push('Agrega y guarda al menos un correo del proveedor.');
  if (motivoNoEnviarProveedor(r.Estado)) avisos.push(motivoNoEnviarProveedor(r.Estado));
  if (correoDesactivado()) avisos.push(MSG_DESACTIVADO);

  const remitente = await datosDeUsuario(autor(usuario));
  if (!remitente.nombre || remitente.nombre === autor(usuario)) remitente.nombre = usuario.name || remitente.nombre;
  return { r, correos, foto, archivos, remitente, avisos, excede: total > maxBytes };
}

export async function vistaPreviaCorreo(reporteId, usuario) {
  const { r, correos, foto, archivos, remitente, avisos } = await armarCorreo(reporteId, usuario);
  const { asunto, html } = plantillaReporteProveedor(r, {
    remitente,
    conFoto: Boolean(foto),
    adjuntos: archivos.map((a) => a.filename),
    // En la vista previa la foto va como data: (la CSP del portal lo permite).
    srcFoto: foto ? `data:${foto.tipo};base64,${foto.buffer.toString('base64')}` : undefined,
  });
  let dominioAviso = null;
  try {
    validarDestinatarios(correos);
  } catch (err) {
    dominioAviso = err.message;
  }
  return {
    asunto,
    html: conLogoEnLinea(html),
    para: correos,
    cc: remitente.correo ? [remitente.correo] : [],
    responderA: remitente.correo,
    adjuntos: archivos.map((a) => a.filename),
    conFoto: Boolean(foto),
    configurado: correoConfigurado(),
    avisos: [...avisos, ...(dominioAviso ? [dominioAviso] : []), ...(bloqueoReenvio(r) ? [bloqueoReenvio(r)] : [])],
  };
}

/**
 * Envía el reporte a los correos del proveedor guardados. Con copia a quien
 * envía (y "Responder a" ella), así la respuesta del proveedor le llega a la
 * compradora. `soloA` (opcional) manda el correo a otras direcciones en vez
 * de las del proveedor, para pruebas; no marca el reporte como enviado.
 */
export async function enviarAlProveedor(reporteId, usuario, { soloA } = {}) {
  const { r, correos, foto, archivos, remitente, excede } = await armarCorreo(reporteId, usuario);
  const prueba = Array.isArray(soloA) && soloA.length > 0;
  // El estado no se puede bloquear mientras sale el correo (n8n tarda hasta un
  // minuto): se revisa justo antes de enviar.
  if (!prueba && motivoNoEnviarProveedor(r.Estado)) throw conflict(motivoNoEnviarProveedor(r.Estado));
  const bloqueo = prueba ? null : bloqueoReenvio(r);
  if (bloqueo) throw conflict(bloqueo);
  const para = prueba ? soloA : correos;
  if (!para.length) throw badRequest('Agrega y guarda al menos un correo del proveedor antes de enviar.');
  if (excede) throw badRequest(`Los archivos del reporte superan el máximo de ${env.correo.maxAdjuntosMb} MB para un correo.`);

  const { asunto, html, texto } = plantillaReporteProveedor(r, {
    remitente,
    conFoto: Boolean(foto),
    adjuntos: archivos.map((a) => a.filename),
  });
  const adjuntos = [
    ...(foto ? [{ filename: `evidencia-${r.ReporteId}.${foto.ext}`, content: foto.buffer, contentType: foto.tipo, cid: 'evidencia' }] : []),
    ...archivos,
  ];
  const cc = !prueba && remitente.correo && !para.includes(remitente.correo) ? [remitente.correo] : [];

  // Reserva atómica del envío (mismas reglas que arriba, en un UPDATE
  // condicional): si dos peticiones llegan a la vez, solo una manda el correo.
  let reserva = null;
  if (!prueba) {
    reserva = await repo.reservarEnvioProveedor(reporteId, autor(usuario), {
      estado: ESTADO_ENVIO_PROVEEDOR,
      maxEnvios: MAX_ENVIOS_PROVEEDOR,
      esperaMin: ESPERA_REENVIO_MIN,
    });
    if (!reserva) {
      const actual = await existeOFallar(reporteId);
      throw conflict(motivoNoEnviarProveedor(actual.Estado) || bloqueoReenvio(actual) || 'Otro usuario está enviando este reporte en este momento.');
    }
  }

  let envio;
  try {
    envio = await enviarCorreo({
      para,
      cc,
      responderA: remitente.correo,
      asunto: prueba ? `[PRUEBA] ${asunto}` : asunto,
      html,
      texto,
      adjuntos,
    });
  } catch (err) {
    // No salió: se devuelve el contador y la fecha de antes, para poder reintentar.
    if (reserva) {
      await repo.revertirReservaEnvioProveedor(reporteId, reserva).catch((e) => {
        logger.error({ err: e, reporteId }, 'No se pudo revertir la reserva del envío al proveedor tras fallar el correo');
      });
    }
    throw err;
  }

  if (!prueba) {
    // El correo ya salió (y el envío quedó contado en la reserva): si falla el
    // historial NO se responde error (el usuario lo reenviaría). Queda en el log.
    const detalleEnvio = `Para: ${para.join(', ')}${cc.length ? ` · Copia: ${cc.join(', ')}` : ''}`.slice(0, 1000);
    try {
      await repo.registrarEventoEnvioProveedor(reporteId, eventoDe(usuario, 'EnviadoProveedor', detalleEnvio));
    } catch (err) {
      logger.error({ err, reporteId, destinatarios: para.length + cc.length }, 'Correo al proveedor enviado, pero no se pudo registrar el evento en el historial');
    }
  }
  return { ...(await obtenerDetalle(reporteId)), envio: { para, cc, aceptados: envio.aceptados, rechazados: envio.rechazados } };
}

// ------------------------------------------------------------------
// Eliminar reporte completo
// ------------------------------------------------------------------

export async function eliminarReporte(reporteId, usuario) {
  // La regla se revisa dentro de la transacción del DELETE, con la fila bloqueada.
  const res = await repo.eliminar(reporteId, motivoNoEliminar);
  if (!res) throw notFound('Reporte no encontrado.');
  if (res.bloqueado) throw conflict(res.bloqueado);
  const { fila } = res;
  // Solo después del commit: si la BD falla, los archivos siguen referenciados.
  const archivos = parseJsonArray(fila.Adjuntos).map((a) => reporteAdjuntoPath(a.filename));
  if (fila.EvidenciaKey && fila.EvidenciaProveedor === 'local') archivos.push(evidenciaAbsolutePath(fila.EvidenciaKey));
  await Promise.all(
    archivos.map((ruta) =>
      fs.unlink(ruta).catch((err) => {
        if (err.code !== 'ENOENT') logger.error({ err, ruta }, 'No se pudo borrar un archivo de un reporte eliminado');
      })
    )
  );
  logger.info({ reporteId, usuario: autor(usuario) }, 'Reporte de producto dañado eliminado');
}
