import * as service from '../services/contabilidad/contabilidadService.js';
import * as envioProveedor from '../services/contabilidad/envioProveedor.js';
import { z } from 'zod';
import { badRequest } from '../utils/httpError.js';
import { borrarArchivos } from '../services/reclamos/excelImages.js';
import * as respuestaProveedor from '../services/contabilidad/respuestaProveedor.js';
import { abrirParaEnviar, enviarStream } from '../utils/enviarArchivo.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listar = asyncHandler(async (req, res) => {
  res.json(await service.listar(req.query));
});

export const detalle = asyncHandler(async (req, res) => {
  res.json(await service.detalle(req.params.id));
});

export const vistaPreviaProveedor = asyncHandler(async (req, res) => {
  res.json(await envioProveedor.vistaPrevia(req.params.id, req.body, req.user));
});

// Llega como multipart: «correos» es un JSON con la lista. Si los datos no
// sirven se responde 400 y se borran los archivos que ya subió multer.
const envioSchema = z.object({
  correos: z
    .array(z.string().trim().toLowerCase().email('Correo inválido.').max(254))
    .max(20, 'Máximo 20 correos.')
    .transform((c) => [...new Set(c)]),
  comentario: z.string().max(2000, 'El comentario puede tener hasta 2000 caracteres.').optional().default(''),
});

export const enviarProveedor = asyncHandler(async (req, res) => {
  const archivos = req.files ?? [];
  let correos;
  try {
    correos = typeof req.body?.correos === 'string' ? JSON.parse(req.body.correos) : req.body?.correos;
  } catch {
    correos = null;
  }
  const datos = envioSchema.safeParse({ correos, comentario: req.body?.comentario ?? '' });
  if (!datos.success) {
    await borrarArchivos(archivos.map((f) => f.filename));
    throw badRequest(datos.error.issues[0]?.message || 'Datos inválidos.');
  }
  res.json(await envioProveedor.enviar(req.params.id, datos.data, req.user, archivos));
});

export const registrarRespuesta = asyncHandler(async (req, res) => {
  res.json(await respuestaProveedor.registrar(req.params.id, req.body ?? {}, req.file, req.user));
});

export const quitarRespuesta = asyncHandler(async (req, res) => {
  res.json(await respuestaProveedor.quitar(req.params.id, req.user));
});

export const archivoRespuesta = asyncHandler(async (req, res, next) => {
  const { ruta, contentType, nombre } = await respuestaProveedor.archivo(req.params.id);
  const stream = await abrirParaEnviar(ruta);
  res.type(contentType);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  enviarStream(stream, res, next);
});

export const decidir = asyncHandler(async (req, res) => {
  res.json(await respuestaProveedor.decidir(req.params.id, req.body, req.user));
});

export const quitarDecision = asyncHandler(async (req, res) => {
  res.json(await respuestaProveedor.quitarDecision(req.params.id, req.user));
});
