import fs from 'node:fs';
import * as service from '../services/reclamosService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { notFound } from '../utils/httpError.js';

/** Envía un archivo de disco; 404 si ya no existe (en vez de un 500 de stream). */
function enviarArchivo(res, { ruta, contentType, nombre, inline = true }) {
  if (!fs.existsSync(ruta)) throw notFound('El archivo ya no está disponible.');
  if (contentType) res.type(contentType);
  if (nombre) {
    const encoded = encodeURIComponent(nombre);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`);
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(ruta).pipe(res);
}

export const permisos = asyncHandler(async (req, res) => {
  res.json(service.permisos(req.user));
});

export const listar = asyncHandler(async (req, res) => {
  res.json(await service.listar(req.query));
});

export const detalle = asyncHandler(async (req, res) => {
  res.json(await service.detalle(req.params.token));
});

export const excel = asyncHandler(async (req, res) => {
  const { ruta, nombre } = await service.archivoExcel(req.params.token);
  enviarArchivo(res, { ruta, nombre, inline: false });
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await service.catalogosFormulario());
});

export const proveedor = asyncHandler(async (req, res) => {
  res.json(await service.relacionProveedor(req.query.nombre));
});

export const parseExcel = asyncHandler(async (req, res) => {
  res.json(await service.previsualizarExcel(req.file));
});

export const parsePdf = asyncHandler(async (req, res) => {
  res.json(await service.previsualizarPdfSap(req.file));
});

export const crear = asyncHandler(async (req, res) => {
  const excel = req.files?.excel?.[0] || null;
  const pdfs = req.files?.pdfs || [];
  res.status(201).json(await service.crear(req.body, excel, req.user, pdfs));
});

export const decidir = asyncHandler(async (req, res) => {
  res.json(await service.decidir(req.params.token, req.body, req.user));
});

export const enviarAContabilidad = asyncHandler(async (req, res) => {
  res.json(await service.enviarAContabilidad(req.params.token, req.user));
});

export const lineas = asyncHandler(async (req, res) => {
  res.json(await service.lineas(req.params.token));
});

export const decidirLinea = asyncHandler(async (req, res) => {
  res.json(await service.decidirLinea(req.params.token, req.params.pos, req.body, req.user));
});

export const decidirLineas = asyncHandler(async (req, res) => {
  res.json(await service.decidirLineas(req.params.token, req.body, req.user));
});

export const deshacerLinea = asyncHandler(async (req, res) => {
  res.json(await service.deshacerLinea(req.params.token, req.params.pos));
});

export const imagen = asyncHandler(async (req, res) => {
  enviarArchivo(res, await service.imagen(req.params.token, req.params.idx));
});

/** Middleware: permiso para adjuntar, ANTES de que multer guarde el archivo en disco. */
export const permisoAdjuntar = asyncHandler(async (req, res, next) => {
  await service.verificarPuedeAdjuntar(req.params.token, req.user);
  next();
});

export const agregarAdjunto = asyncHandler(async (req, res) => {
  res.status(201).json(await service.agregarAdjunto(req.params.token, req.file, req.user));
});

export const adjunto = asyncHandler(async (req, res) => {
  enviarArchivo(res, await service.adjunto(req.params.token, req.params.idx));
});

export const eliminarAdjunto = asyncHandler(async (req, res) => {
  res.json(await service.eliminarAdjunto(req.params.token, req.params.idx));
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.token, req.user);
  res.status(204).end();
});
