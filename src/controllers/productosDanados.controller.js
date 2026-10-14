import fs from 'node:fs';
import * as service from '../services/productosDanadosService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/httpError.js';

export const listar = asyncHandler(async (req, res) => {
  res.json(await service.listarReportes(req.query));
});

export const kpis = asyncHandler(async (req, res) => {
  res.json(await service.obtenerKpis(req.query));
});

export const detalle = asyncHandler(async (req, res) => {
  res.json(await service.obtenerDetalle(Number(req.params.id)));
});

export const evidencia = asyncHandler(async (req, res) => {
  const stream = await service.obtenerEvidencia(Number(req.params.id));
  stream.pipe(res);
});

export const crear = asyncHandler(async (req, res) => {
  const reporte = await service.crearReporte(req.body, req.file, req.user);
  res.status(201).json(reporte);
});

export const aprobar = asyncHandler(async (req, res) => {
  res.json(await service.aprobarReporte(Number(req.params.id), req.user));
});

export const rechazar = asyncHandler(async (req, res) => {
  const { motivoRechazo } = req.body;
  if (!motivoRechazo) throw badRequest('motivoRechazo es obligatorio para rechazar un reporte.');
  res.json(await service.rechazarReporte(Number(req.params.id), motivoRechazo, req.user));
});

export const procesar = asyncHandler(async (req, res) => {
  res.json(await service.procesarReporte(Number(req.params.id), req.user));
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await service.catalogos());
});

export const guardarCorreos = asyncHandler(async (req, res) => {
  res.json(await service.guardarCorreos(Number(req.params.id), req.body.correos, req.user));
});

export const agregarAdjunto = asyncHandler(async (req, res) => {
  res.status(201).json(await service.agregarAdjunto(Number(req.params.id), req.file, req.user));
});

export const adjunto = asyncHandler(async (req, res) => {
  const { ruta, nombre, contentType } = await service.obtenerAdjunto(Number(req.params.id), req.params.idx);
  if (!fs.existsSync(ruta)) throw notFound('El archivo ya no está disponible.');
  res.type(contentType);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(ruta).pipe(res);
});

export const eliminarAdjunto = asyncHandler(async (req, res) => {
  res.json(await service.eliminarAdjunto(Number(req.params.id), req.params.idx, req.user));
});

export const vistaPreviaCorreo = asyncHandler(async (req, res) => {
  res.json(await service.vistaPreviaCorreo(Number(req.params.id), req.user));
});

export const enviarAlProveedor = asyncHandler(async (req, res) => {
  res.json(await service.enviarAlProveedor(Number(req.params.id), req.user));
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminarReporte(Number(req.params.id), req.user);
  res.status(204).end();
});

export const agregarDocumentoGof = asyncHandler(async (req, res) => {
  res.status(201).json(await service.agregarAdjunto(Number(req.params.id), req.file, req.user, { etapa: 'gof' }));
});

export const enviarAContabilidad = asyncHandler(async (req, res) => {
  res.json(await service.enviarAContabilidad(Number(req.params.id), req.user));
});

export const cerrarNf = asyncHandler(async (req, res) => {
  res.json(await service.cerrarNf(Number(req.params.id), req.body.comentario, req.user));
});

export const registrarPago = asyncHandler(async (req, res) => {
  res.json(await service.registrarPago(Number(req.params.id), req.body, req.user));
});
