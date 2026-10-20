// Descargas: manda un archivo (stream) a la respuesta sin dejar errores sin
// capturar. src/index.js termina el proceso ante un uncaughtException, así que
// un `stream.pipe(res)` sin manejo de error podía tumbar la API por un archivo
// borrado o ilegible.
import fs from 'node:fs';
import { once } from 'node:events';
import { pipeline } from 'node:stream';
import { notFound } from './httpError.js';
import { logger } from './logger.js';

/**
 * Espera a que un archivo de disco quede abierto ANTES de mandar cabeceras:
 * si no existe, 404 limpio (vía el errorHandler) en vez de cortar la conexión.
 * Acepta una ruta o un fs.ReadStream ya creado; otros streams pasan tal cual.
 */
export async function abrirParaEnviar(rutaOStream) {
  const stream = typeof rutaOStream === 'string' ? fs.createReadStream(rutaOStream) : rutaOStream;
  if (stream instanceof fs.ReadStream && stream.pending) {
    try {
      await once(stream, 'ready');
    } catch (err) {
      stream.destroy();
      if (err.code === 'ENOENT') throw notFound('El archivo ya no está disponible.');
      throw err;
    }
  }
  return stream;
}

/**
 * origen → res con `pipeline`. Si falla a mitad: sin cabeceras enviadas (y la
 * respuesta todavía viva), el error va a `next` (errorHandler → 500); si ya se
 * enviaron, solo se corta la respuesta (el cliente ve la descarga incompleta).
 */
export function enviarStream(origen, res, next) {
  pipeline(origen, res, (err) => {
    if (!err) return;
    if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return; // el cliente cerró la conexión
    if (!res.headersSent && !res.destroyed) return next(err);
    logger.warn({ err: err.message, code: err.code }, 'Falló el envío de un archivo a mitad de la descarga');
    res.destroy();
  });
}
