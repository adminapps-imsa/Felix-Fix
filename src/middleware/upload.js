import multer from 'multer';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { evidenciaDir } from '../config/almacenamiento.js';
import { badRequest } from '../utils/httpError.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, evidenciaDir),
  // Nunca se usa el nombre original del archivo (evita path traversal / colisiones):
  // se genera un nombre opaco a partir de un UUID + extensión validada por mimetype.
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    // Un HttpError normal (no MulterError) para que errorHandler.js devuelva
    // el mensaje tal cual en vez del texto genérico que arma multer por código.
    return cb(badRequest('Solo se permiten imágenes JPG, PNG o WEBP.'));
  }
  cb(null, true);
}

/**
 * Marca los archivos recién subidos por multer como temporales: si la petición
 * termina en error, errorHandler.js los borra (si no, quedan huérfanos en
 * disco). El servicio pone `borrarSiFalla = false` en cuanto el archivo queda
 * referenciado en la BD, para que un error posterior no lo borre.
 * Va justo después del middleware de multer.
 */
export function borrarSiFalla(req, res, next) {
  for (const f of [req.file, ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat())]) {
    if (f?.path) f.borrarSiFalla = true;
  }
  next();
}

const multerEvidencia = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.evidence.maxSizeMb * 1024 * 1024, files: 1 },
}).single('evidencia');

export const uploadEvidencia = (req, res, next) =>
  multerEvidencia(req, res, (err) => (err ? next(err) : borrarSiFalla(req, res, next)));
