// Dónde se guardan en disco los archivos de cada módulo. Lo usan tanto los
// middlewares de subida (multer) como los servicios que leen o borran
// archivos, así que vive en config/ y no en middleware/.
import path from 'node:path';
import fs from 'node:fs';
import { env } from './env.js';
import { badRequest } from '../utils/httpError.js';

/** Fotos de evidencia de Productos Dañados. */
export const evidenciaDir = env.evidence.localDir;
/** Excel, PDF y fotos extraídas de los reclamos. */
export const reclamosDir = env.reclamos.localDir;
/** Adjuntos de Productos Dañados (para el proveedor y documentos de Gof). */
export const adjuntosReporteDir = path.join(env.evidence.localDir, 'adjuntos');

for (const dir of [evidenciaDir, reclamosDir, adjuntosReporteDir]) fs.mkdirSync(dir, { recursive: true });

/**
 * Resuelve un nombre guardado en BD a su ruta en disco, rechazando cualquier
 * cosa que no sea un nombre plano (defensa ante datos corruptos en la BD).
 */
function rutaSegura(dir, filename) {
  if (!filename || path.basename(filename) !== filename) {
    throw badRequest('Nombre de archivo inválido.');
  }
  return path.join(dir, filename);
}

export const reclamoArchivoPath = (filename) => rutaSegura(reclamosDir, filename);

export const reporteAdjuntoPath = (filename) => rutaSegura(adjuntosReporteDir, filename);

export const evidenciaAbsolutePath = (filename) => rutaSegura(evidenciaDir, filename);
