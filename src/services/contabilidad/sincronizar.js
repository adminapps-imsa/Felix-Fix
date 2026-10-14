// Documentos de contabilidad de un reclamo: por cada PDF adjunto (nota de
// débito de SAP) se lee el PDF y se cruza con los productos del reclamo.
//   calcularDocumentos   -> solo calcula (para el correo, antes de enviarlo)
//   sincronizarDocumentos -> calcula (o usa lo ya calculado) y lo guarda
//                            en la bandeja de contabilidad.
// También sirve para un backfill manual de reclamos ya enviados:
//   await sincronizarDocumentos(token, 'usuario')
import * as reclamosRepo from '../../repositories/reclamosRepository.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import * as repo from '../../repositories/contabilidadRepository.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { logger } from '../../utils/logger.js';
import { leerNotaPdf } from './leerNotaPdf.js';
import { cruzar } from './validarDocumento.js';

/**
 * @param reclamo  fila del reclamo (con AdjuntosExtra)
 * @param lineas   productos del reclamo (repo.listarLineas)
 * @returns [{ adjuntoFilename, adjuntoNombre, numeroDocumento, tipoDocumento, movimiento,
 *            fechaDocumento, proveedor, total, legible, error, lineas, validacion }]
 */
export async function calcularDocumentos(reclamo, lineas) {
  const pdfs = parseJsonArray(reclamo.AdjuntosExtra).filter((a) => a?.tipo === 'pdf' && a.filename);
  const documentos = [];
  for (const adj of pdfs) {
    let ruta = null;
    try {
      ruta = reclamoArchivoPath(adj.filename);
    } catch {
      /* nombre inválido en la BD: queda como no legible */
    }
    const nota = ruta ? await leerNotaPdf(ruta) : { filas: [], legible: false, error: 'Nombre de archivo inválido.' };
    if (nota.legible && nota.totalCuadra === false) {
      logger.warn({ adjunto: adj.filename, documento: nota.numeroDocumento, total: nota.total }, 'El total impreso de la nota de débito no es la suma de las filas leídas');
    }
    const { lineas: lineasDoc, validacion } = cruzar(nota.legible ? nota.filas : [], lineas);
    documentos.push({
      adjuntoFilename: adj.filename,
      adjuntoNombre: adj.originalname || adj.filename,
      numeroDocumento: nota.numeroDocumento ?? null,
      tipoDocumento: nota.tipoDocumento ?? null,
      movimiento: nota.movimiento ?? null,
      fechaDocumento: nota.fechaDocumento ?? null,
      proveedor: nota.proveedor ?? null,
      total: nota.total ?? null,
      legible: Boolean(nota.legible),
      error: nota.error || null,
      lineas: lineasDoc,
      validacion,
    });
  }
  return documentos;
}

const nombreUsuario = (usuario) => (typeof usuario === 'string' ? usuario : usuario?.username || usuario?.sub || null);

/**
 * Guarda (upsert por reclamo + adjunto) los documentos del reclamo en la
 * bandeja de contabilidad. `documentos` opcional: lo ya calculado para el
 * correo, así no se leen los PDF dos veces.
 */
export async function sincronizarDocumentos(token, usuario, { documentos } = {}) {
  const reclamo = await reclamosRepo.obtenerPorToken(token);
  if (!reclamo) return { guardados: 0, resultado: [] };
  const docs = documentos ?? (await calcularDocumentos(reclamo, await reclamosRepo.listarLineas(token)));
  const resultado = [];
  for (const d of docs) {
    const accion = await repo.guardarDocumento({ ...d, reclamoId: reclamo.ReclamoId, enviadoPor: nombreUsuario(usuario) });
    resultado.push({ adjunto: d.adjuntoFilename, numero: d.numeroDocumento, accion, validacion: d.validacion.estado });
  }
  logger.info({ reclamoId: reclamo.ReclamoId, documentos: resultado }, 'Documentos del reclamo sincronizados con la bandeja de contabilidad');
  return { guardados: resultado.filter((r) => r.accion !== 'sin_cambios').length, resultado };
}
