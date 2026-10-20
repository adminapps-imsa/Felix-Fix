import * as service from '../services/reclamosService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { abrirParaEnviar, enviarStream } from '../utils/enviarArchivo.js';

/** Envía un archivo de disco; 404 si ya no existe (en vez de un 500 de stream). */
async function enviarArchivo(res, next, { ruta, contentType, nombre, inline = true }) {
  const stream = await abrirParaEnviar(ruta);
  if (contentType) res.type(contentType);
  if (nombre) {
    const encoded = encodeURIComponent(nombre);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`);
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  enviarStream(stream, res, next);
}

export const permisos = asyncHandler(async (req, res) => {
  res.json(service.permisos(req.user));
});

export const listar = asyncHandler(async (req, res) => {
  res.json(await service.listar(req.query, req.user));
});

export const detalle = asyncHandler(async (req, res) => {
  res.json(await service.detalle(req.params.token));
});

export const excel = asyncHandler(async (req, res, next) => {
  const { ruta, nombre } = await service.archivoExcel(req.params.token);
  await enviarArchivo(res, next, { ruta, nombre, inline: false });
});

export const catalogos = asyncHandler(async (req, res) => {
  res.json(await service.catalogosFormulario());
});

export const proveedor = asyncHandler(async (req, res) => {
  res.json(await service.relacionProveedor(req.query.nombre));
});

export const documentosSap = asyncHandler(async (req, res) => {
  res.json(await service.documentosSapUsados(req.query.docs));
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
  res.json(await service.deshacerLinea(req.params.token, req.params.pos, req.user));
});

export const imagen = asyncHandler(async (req, res, next) => {
  await enviarArchivo(res, next, await service.imagen(req.params.token, req.params.idx));
});

/** Middleware: permiso para adjuntar, ANTES de que multer guarde el archivo en disco. */
export const permisoAdjuntar = asyncHandler(async (req, res, next) => {
  await service.verificarPuedeAdjuntar(req.params.token, req.user);
  next();
});

export const agregarAdjunto = asyncHandler(async (req, res) => {
  res.status(201).json(await service.agregarAdjunto(req.params.token, req.file, req.user));
});

// `?f=<filename>` (opcional): el adjunto por su nombre en disco si la posición cambió.
export const adjunto = asyncHandler(async (req, res, next) => {
  await enviarArchivo(res, next, await service.adjunto(req.params.token, req.params.idx, req.query.f));
});

export const eliminarAdjunto = asyncHandler(async (req, res) => {
  res.json(await service.eliminarAdjunto(req.params.token, req.params.idx, req.user, req.query.f));
});

export const eliminar = asyncHandler(async (req, res) => {
  await service.eliminar(req.params.token, req.user);
  res.status(204).end();
});

export const devolver = asyncHandler(async (req, res) => {
  res.json(await service.devolver(req.params.token, req.body, req.user));
});

export const corregirDatos = asyncHandler(async (req, res) => {
  res.json(await service.corregirDatos(req.params.token, req.body, req.user));
});

export const reenviar = asyncHandler(async (req, res) => {
  res.json(await service.reenviar(req.params.token, req.body, req.user));
});

export const registrarRetiro = asyncHandler(async (req, res) => {
  res.json(await service.registrarRetiro(req.params.token, req.body, req.file, req.user));
});

export const quitarRetiro = asyncHandler(async (req, res) => {
  res.json(await service.quitarRetiro(req.params.token, req.user));
});

export const fotoRetiro = asyncHandler(async (req, res, next) => {
  await enviarArchivo(res, next, await service.fotoRetiro(req.params.token));
});
