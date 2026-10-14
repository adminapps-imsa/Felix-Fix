import fs from 'node:fs/promises';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Ruta no encontrada.' });
}

/**
 * Borra los archivos que multer subió en esta petición y que siguen marcados
 * como temporales (ver borrarSiFalla en middleware/upload.js). Los que ya
 * quedaron referenciados en la BD tienen borrarSiFalla = false y no se tocan.
 */
function borrarTemporales(req) {
  const archivos = [req.file, ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat())];
  for (const f of archivos) {
    if (f?.path && f.borrarSiFalla === true) fs.unlink(f.path).catch(() => {});
  }
}

// Límite en MB según el campo: 'evidencia' es la foto (upload.js); el resto
// son los Excel/PDF de uploadReclamos.js (mismo límite para todos).
function limiteMb(campo) {
  return campo === 'evidencia' ? env.evidence.maxSizeMb : env.reclamos.maxSizeMb;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  borrarTemporales(req);

  if (err instanceof HttpError) {
    if (err.status >= 500) logger.error({ err }, err.message);
    return res.status(err.status).json({
      error: err.extra?.code || err.name,
      message: err.message,
      ...err.extra,
    });
  }

  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = limiteMb(err.field);
      const message = mb ? `El archivo supera el tamaño máximo de ${mb} MB.` : 'El archivo supera el tamaño máximo permitido.';
      return res.status(400).json({ error: 'UPLOAD_ERROR', message });
    }
    return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
  }

  logger.error({ err }, 'Error no controlado');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: env.nodeEnv === 'production' ? 'Error interno del servidor.' : err.message,
  });
}
