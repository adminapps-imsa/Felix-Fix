// Respuesta del proveedor a la nota de débito (2026-11-18). Contabilidad la
// registra en el detalle del documento: aprobado o no aprobado, con el número
// de registro SAP (obligatorio) y el documento SAP (opcional, 2026-11-19).
// El archivo (PDF o foto) queda en la carpeta de reclamos con nombre opaco.
import path from 'node:path';
import * as repo from '../../repositories/contabilidadRepository.js';
import * as dominio from '../../domain/contabilidad.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { tipoRealDeArchivo, nombreUsuario } from '../reclamos/comun.js';
import { borrarArchivos } from '../reclamos/excelImages.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { detalle } from './contabilidadService.js';

const idValido = (id) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) throw notFound('Documento no encontrado.');
  return n;
};

export async function registrar(id, { respuesta, registroSap }, archivo, usuario) {
  const creados = archivo ? [archivo.filename] : [];
  try {
    const documentoId = idValido(id);
    if (archivo) {
      const tipo = await tipoRealDeArchivo(archivo);
      if (tipo !== 'pdf' && tipo !== 'imagen') throw badRequest('El archivo debe ser un PDF o una foto (JPG, PNG o WebP).');
    }
    const datos = {
      respuesta,
      registroSap: String(registroSap ?? '').trim().toUpperCase(),
    };
    const res = await repo.registrarRespuesta(
      documentoId,
      {
        estado: respuesta,
        registroSap: datos.registroSap,
        archivo: archivo?.filename ?? null,
        archivoNombre: archivo?.originalname ?? null,
        usuario: nombreUsuario(usuario),
      },
      (fila) => dominio.motivoNoResponder(fila, datos)
    );
    if (!res) throw notFound('Documento no encontrado.');
    if (res.bloqueado) throw conflict(res.bloqueado.mensaje, { code: res.bloqueado.code });
    creados.length = 0; // el archivo ya es parte del documento
    return detalle(documentoId);
  } finally {
    if (creados.length) await borrarArchivos(creados);
  }
}

export async function quitar(id, usuario) {
  const documentoId = idValido(id);
  const res = await repo.quitarRespuesta(documentoId, dominio.motivoNoQuitarRespuesta);
  if (!res) throw notFound('Documento no encontrado.');
  if (res.bloqueado) throw conflict(res.bloqueado.mensaje, { code: res.bloqueado.code });
  // Después del commit: si la BD falla, el archivo sigue referenciado.
  if (res.archivoAnterior) await borrarArchivos([res.archivoAnterior]);
  logger.info({ documentoId, usuario: nombreUsuario(usuario) }, 'Contabilidad quitó la respuesta del proveedor');
  return detalle(documentoId);
}

const CONTENT_TYPE = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function archivo(id) {
  const documentoId = idValido(id);
  const fila = await repo.obtenerPorId(documentoId);
  if (!fila) throw notFound('Documento no encontrado.');
  if (!fila.RespuestaArchivo) throw notFound('Este documento no tiene archivo de respuesta.');
  const ext = path.extname(fila.RespuestaArchivo).slice(1).toLowerCase();
  return {
    ruta: reclamoArchivoPath(fila.RespuestaArchivo),
    contentType: CONTENT_TYPE[ext] || 'application/octet-stream',
    nombre: fila.RespuestaArchivoNombre || `Respuesta ${documentoId}.${ext}`,
  };
}

// ------------------------------------------------------------------
// Decisión de contabilidad: reclamar o no al proveedor
// ------------------------------------------------------------------

export async function decidir(id, { decision, comentario }, usuario) {
  const documentoId = idValido(id);
  const texto = String(comentario ?? '').trim();
  const res = await repo.registrarDecision(documentoId, { decision, comentario: texto || null, usuario: nombreUsuario(usuario) }, (fila) =>
    dominio.motivoNoDecidir(fila, { decision, comentario: texto })
  );
  if (!res) throw notFound('Documento no encontrado.');
  if (res.bloqueado) throw conflict(res.bloqueado.mensaje, { code: res.bloqueado.code });
  return detalle(documentoId);
}

export async function quitarDecision(id, usuario) {
  const documentoId = idValido(id);
  const res = await repo.quitarDecision(documentoId, dominio.motivoNoQuitarDecision);
  if (!res) throw notFound('Documento no encontrado.');
  if (res.bloqueado) throw conflict(res.bloqueado.mensaje, { code: res.bloqueado.code });
  logger.info({ documentoId, usuario: nombreUsuario(usuario) }, 'Contabilidad quitó la decisión de reclamar');
  return detalle(documentoId);
}
