// Adjuntos de un reclamo (PDF de SAP y Excel de soporte): quién puede
// adjuntar, validación de la nota de débito contra las decisiones y borrado.
import path from 'node:path';
import * as repo from '../../repositories/reclamosRepository.js';
import { extraerImagenesExcel, borrarArchivos } from './excelImages.js';
import { tienePermiso } from '../acceso/permisos.js';
import * as dominio from '../../domain/reclamo.js';
import { leerNotaPdf } from '../contabilidad/leerNotaPdf.js';
import { cruzar } from '../contabilidad/validarDocumento.js';
import { badRequest, forbidden, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import {
  validarToken,
  validarIndice,
  obtenerOFallar,
  tipoRealDeArchivo,
  exigir,
  asegurarModificable,
  nombreUsuario,
  detalle,
} from './comun.js';
import { permisos } from './consultas.js';

/**
 * Quien decide o tiene "Adjuntar en cualquier reclamo" (Torre de Control), o
 * quien creó el reclamo (sube sus adjuntos justo después de crearlo). Y solo
 * mientras el reclamo siga abierto y sin enviar a contabilidad. Se usa
 * también como middleware ANTES de multer, para no guardar el archivo de
 * quien no puede adjuntar.
 */
export async function verificarPuedeAdjuntar(token, usuario) {
  const r = await obtenerOFallar(token);
  const esCreador = r.CreatedBy === nombreUsuario(usuario) && tienePermiso(usuario, 'reclamos.crear');
  if (!permisos(usuario).puedeAdjuntar && !esCreador) {
    throw forbidden('Solo quien creó el reclamo, quien puede aprobarlo o quien tiene el permiso "Adjuntar en cualquier reclamo" puede adjuntar archivos.');
  }
  asegurarModificable(r, 'adjuntos', { agregaTorreControl: tienePermiso(usuario, 'reclamos.adjuntar') });
  return r;
}

/** "#3 7501234567890 TROUSERS BOY, RED, 7" para los mensajes de error. */
const describirProducto = (l) => [`#${l.posicion}`, l.codigoBarra, l.descripcion].filter(Boolean).join(' ');
/** Hasta 10 productos; del resto solo se dice cuántos son. */
const listaProductos = (ls) => ls.slice(0, 10).map(describirProducto).join(' · ') + (ls.length > 10 ? ` · y ${ls.length - 10} más` : '');

/**
 * Una nota de débito (PDF de SAP) solo puede traer productos que la
 * compradora aprobó. Si trae uno rechazado o todavía sin decidir, no se
 * adjunta. Un PDF que no es nota de débito (sin tabla de productos) no se valida aquí.
 */
async function validarPdfContraDecisiones(token, rutaPdf) {
  const nota = await leerNotaPdf(rutaPdf);
  if (!nota.legible) return { notaAprobada: false };
  const { lineas } = cruzar(nota.filas, await repo.listarLineas(token));
  const enReclamo = lineas.filter((l) => l.lineaId !== null);
  const noEnReclamo = lineas.filter((l) => l.lineaId === null);
  const rechazados = enReclamo.filter((l) => l.decision === 'rechazado');
  const sinAprobar = enReclamo.filter((l) => l.decision === null);
  const doc = nota.numeroDocumento ? ` (documento ${nota.numeroDocumento})` : '';
  if (rechazados.length) {
    throw badRequest(
      `Documento SAP debe coincidir con los productos aprobados${doc}. Trae ${rechazados.length} producto(s) rechazado(s) por la compradora: ${listaProductos(rechazados)}.`,
      { code: 'PDF_PRODUCTO_RECHAZADO', productos: rechazados.map((l) => l.posicion) }
    );
  }
  if (sinAprobar.length) {
    throw badRequest(
      `Documento SAP debe coincidir con los productos aprobados${doc}. Trae ${sinAprobar.length} producto(s) que la compradora aún no aprueba: ${listaProductos(sinAprobar)}.`,
      { code: 'PDF_PRODUCTO_SIN_APROBAR', productos: sinAprobar.map((l) => l.posicion) }
    );
  }
  if (noEnReclamo.length) {
    const lista = noEnReclamo.slice(0, 10).map((l) => l.descripcion || l.material).join(' · ') + (noEnReclamo.length > 10 ? ` · y ${noEnReclamo.length - 10} más` : '');
    throw badRequest(
      `Documento SAP debe coincidir con los productos aprobados${doc}. Trae ${noEnReclamo.length} producto(s) que no están en este reclamo: ${lista}.`,
      { code: 'PDF_PRODUCTO_NO_EN_RECLAMO' }
    );
  }
  // Nota válida: trae productos del reclamo y todos están aprobados.
  return { notaAprobada: enReclamo.length > 0, documentoSap: nota.numeroDocumento || null };
}

export async function agregarAdjunto(token, multerFile, usuario) {
  if (!multerFile) throw badRequest('Selecciona un archivo Excel o PDF.');
  const creados = [multerFile.filename];
  try {
    await verificarPuedeAdjuntar(token, usuario);

    const tipo = await tipoRealDeArchivo(multerFile);
    if (!tipo) throw badRequest('El archivo no es un Excel o PDF válido.');
    const nota = tipo === 'pdf' ? await validarPdfContraDecisiones(token, multerFile.path) : null;

    const adj = {
      filename: multerFile.filename,
      originalname: path.basename(multerFile.originalname || multerFile.filename).slice(0, 255),
      tipo: tipo === 'pdf' ? 'pdf' : 'excel',
      ...(nota?.notaAprobada && { notaAprobada: true, documentoSap: nota.documentoSap }),
      uploaded_at: new Date().toISOString(),
      uploaded_by: nombreUsuario(usuario),
    };

    // Las fotos del adjunto quedan con origen = SU filename, para no mezclarse
    // con las del Excel principal ni con las de otros adjuntos.
    let imagenes = [];
    if (tipo === 'xlsx') {
      try {
        imagenes = await extraerImagenesExcel(multerFile.path, adj.filename);
        creados.push(...imagenes.map((i) => i.filename));
      } catch (err) {
        logger.warn({ err: err.message }, 'No se pudieron extraer las fotos del adjunto');
      }
    }

    // Se vuelve a comprobar bajo el bloqueo de la fila (envío/cierre en paralelo).
    const agregaTorreControl = tienePermiso(usuario, 'reclamos.adjuntar');
    const res = await repo.modificarArchivos(token, (a, estado) => {
      asegurarModificable(estado, 'adjuntos', { agregaTorreControl });
      return { imagenes: [...a.imagenes, ...imagenes], adjuntos: [...a.adjuntos, adj] };
    });
    if (!res) throw notFound('Reclamo no encontrado.');
    creados.length = 0;
    return detalle(token);
  } catch (err) {
    await borrarArchivos(creados);
    throw err;
  }
}

export async function eliminarAdjunto(token, idx) {
  validarToken(token);
  const i = validarIndice(idx);
  let aBorrar = [];
  const res = await repo.modificarArchivos(token, (a, estado) => {
    exigir(dominio.motivoNoEliminarAdjunto(estado));
    const adj = a.adjuntos[i];
    if (!adj) return null;
    const fotos = a.imagenes.filter((img) => img.origen === adj.filename);
    aBorrar = [adj.filename, ...fotos.map((f) => f.filename)];
    return {
      adjuntos: a.adjuntos.filter((_, j) => j !== i),
      imagenes: a.imagenes.filter((img) => img.origen !== adj.filename),
    };
  });
  if (!res) throw notFound('Reclamo no encontrado.');
  if (!aBorrar.length) throw notFound('Adjunto no encontrado.');
  // Solo después del commit: si la BD falla, los archivos siguen referenciados.
  await borrarArchivos(aBorrar);
  return detalle(token);
}
