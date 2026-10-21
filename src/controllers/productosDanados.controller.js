import * as service from '../services/productosDanadosService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { abrirParaEnviar, enviarStream } from '../utils/enviarArchivo.js';

/** :id del reporte: entero positivo (BIGINT); si no, 404 sin llegar a SQL (como el token de Reclamos). */
function idReporte(req) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('Reporte no encontrado.');
  return id;
}

export const listar = asyncHandler(async (req, res) => {
  res.json(await service.listarReportes(req.query, req.user));
});

export const kpis = asyncHandler(async (req, res) => {
  res.json(await service.obtenerKpis(req.query, req.user));
});

export const detalle = asyncHandler(async (req, res) => {
  res.json(await service.obtenerDetalle(idReporte(req), req.user));
});

export const evidencia = asyncHandler(async (req, res, next) => {
  const { stream, contentType } = await service.obtenerEvidencia(idReporte(req), req.user);
  const abierto = await abrirParaEnviar(stream);
  if (!res.get('Content-Type')) res.type(contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  enviarStream(abierto, res, next);
});

export const crear = asyncHandler(async (req, res) => {
  const reporte = await service.crearReporte(req.body, req.file, req.user);
  res.status(201).json(reporte);
});

export const aprobar = asyncHandler(async (req, res) => {
  res.json(await service.aprobarReporte(idReporte(req), req.user));
});

export const rechazar = asyncHandler(async (req, res) => {
  const { motivoRechazo } = req.body;
  if (!motivoRechazo) throw badRequest('motivoRechazo es obligatorio para rechazar un reporte.');
  res.json(await service.rechazarReporte(idReporte(req), motivoRechazo, req.user));
});

export const devolverATienda = asyncHandler(async (req, res) => {
  res.json(await service.devolverATienda(idReporte(req), req.body, req.user));
});

export const corregir = asyncHandler(async (req, res) => {
  res.json(await service.corregirReporte(idReporte(req), req.body, req.file, req.user));
});

export const procesar = asyncHandler(async (req, res) => {
  res.json(await service.procesarReporte(idReporte(req), req.user));
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await service.catalogos());
});

export const guardarCorreos = asyncHandler(async (req, res) => {
  res.json(await service.guardarCorreos(idReporte(req), req.body.correos, req.user));
});

export const agregarAdjunto = asyncHandler(async (req, res) => {
  res.status(201).json(await service.agregarAdjunto(idReporte(req), req.file, req.user));
});

// `?f=<filename>` (opcional): el adjunto por su nombre en disco si la posición cambió.
export const adjunto = asyncHandler(async (req, res, next) => {
  const { ruta, nombre, contentType } = await service.obtenerAdjunto(idReporte(req), req.params.idx, req.user, req.query.f);
  const stream = await abrirParaEnviar(ruta);
  res.type(contentType);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  enviarStream(stream, res, next);
});

export const eliminarAdjunto = asyncHandler(async (req, res) => {
  res.json(await service.eliminarAdjunto(idReporte(req), req.params.idx, req.user, req.query.f));
});

export const vistaPreviaCorreo = asyncHandler(async (req, res) => {
  res.json(await service.vistaPreviaCorreo(idReporte(req), req.user));
});

export const enviarAlProveedor = asyncHandler(async (req, res) => {
  res.json(await service.enviarAlProveedor(idReporte(req), req.user));
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminarReporte(idReporte(req), req.user);
  res.status(204).end();
});

export const agregarDocumentoGof = asyncHandler(async (req, res) => {
  res.status(201).json(await service.agregarAdjunto(idReporte(req), req.file, req.user, { etapa: 'gof' }));
});

export const enviarAContabilidad = asyncHandler(async (req, res) => {
  res.json(await service.enviarAContabilidad(idReporte(req), req.user));
});

export const registrarDocumento1700 = asyncHandler(async (req, res) => {
  res.json(await service.registrarDocumento1700(idReporte(req), req.body, req.user));
});

export const cerrarNf = asyncHandler(async (req, res) => {
  res.json(await service.cerrarNf(idReporte(req), req.body, req.user));
});

export const registrarPago = asyncHandler(async (req, res) => {
  res.json(await service.registrarPago(idReporte(req), req.body, req.user));
});
