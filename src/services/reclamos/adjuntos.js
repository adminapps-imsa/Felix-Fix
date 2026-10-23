// Adjuntos de un reclamo (PDF de SAP y Excel de soporte): quién puede
// adjuntar, validación de la nota de débito contra las decisiones y borrado.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as repo from '../../repositories/reclamosRepository.js';
import { extraerImagenesExcel, borrarArchivos } from './excelImages.js';
import { tienePermiso } from '../acceso/permisos.js';
import * as dominio from '../../domain/reclamo.js';
import { leerNotaPdf } from '../contabilidad/leerNotaPdf.js';
import { cruzar } from '../contabilidad/validarDocumento.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { copiarPdf, borrarCopiasPdf, TIPO_RECLAMO } from '../evidenceStorage/copiasPdf.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import {
  validarToken,
  validarIndice,
  indiceAdjunto,
  obtenerOFallar,
  tipoRealDeArchivo,
  exigir,
  asegurarModificable,
  nombreUsuario,
  detalle,
  conDocumentos,
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

/**
 * Una nota de débito (PDF de SAP) solo puede traer productos que la
 * compradora aprobó. Si trae uno rechazado o todavía sin decidir, no se
 * adjunta (regla: dominio.motivoNotaNoCuadra). Un PDF que no es nota de débito
 * (sin tabla de productos) no se valida aquí.
 */
async function validarPdfContraDecisiones(token, nota) {
  if (!nota.legible) return { notaAprobada: false };
  const { lineas } = cruzar(nota.filas, await repo.listarLineas(token));
  const motivo = dominio.motivoNotaNoCuadra(lineas, nota.numeroDocumento);
  if (motivo) {
    const { mensaje, ...extra } = motivo;
    throw badRequest(mensaje, extra);
  }
  // Nota válida: trae productos del reclamo y todos están aprobados.
  return { notaAprobada: dominio.esNotaAprobada(lineas), documentoSap: nota.numeroDocumento || null };
}

const sha256 = async (ruta) => crypto.createHash('sha256').update(await fs.readFile(ruta)).digest('hex');

/**
 * El mismo archivo (mismo contenido, aunque cambie el nombre) ya está en el
 * reclamo: el Excel principal o un adjunto. Devuelve { nombre, adjunto } o null.
 */
async function archivoIgual(r, rutaNuevo) {
  const hash = await sha256(rutaNuevo);
  const existentes = [
    ...(r.ArchivoExcel ? [{ filename: r.ArchivoExcel, nombre: r.ArchivoExcelNombre || 'Excel del reclamo', adjunto: null }] : []),
    ...parseJsonArray(r.AdjuntosExtra).map((a) => ({ filename: a.filename, nombre: a.originalname || a.filename, adjunto: a })),
  ];
  for (const e of existentes) {
    const igual = await sha256(reclamoArchivoPath(e.filename)).then((h) => h === hash, () => false);
    if (igual) return e;
  }
  return null;
}

/** Un PDF de SAP de otro reclamo no se adjunta aquí (cada documento pertenece a un solo reclamo). */
async function exigirPdfDeEsteReclamo(r, numeroPdf) {
  if (!numeroPdf) return;
  const propios = dominio.documentosDelReclamo(r, parseJsonArray(r.SapDocsExtra), parseJsonArray(r.AdjuntosExtra));
  const otros = conDocumentos(await repo.buscarPorDocumentosSap([dominio.normalizarDocSap(numeroPdf)])).filter((o) => o.Token.toUpperCase() !== r.Token.toUpperCase());
  exigir(dominio.motivoPdfDeOtroReclamo(numeroPdf, propios, otros));
}

const esDocDelReclamo = (r, numero) =>
  [r.SapDoc1, r.SapDoc2, r.SapDoc3, ...parseJsonArray(r.SapDocsExtra)]
    .filter(Boolean)
    .some((d) => dominio.normalizarDocSap(d) === dominio.normalizarDocSap(numero));

export async function agregarAdjunto(token, multerFile, usuario) {
  if (!multerFile) throw badRequest('Selecciona una foto, un Excel o un PDF.');
  const creados = [multerFile.filename];
  try {
    const r = await verificarPuedeAdjuntar(token, usuario);

    const tipo = await tipoRealDeArchivo(multerFile);
    if (!tipo) throw badRequest('El archivo no es una foto (JPG, PNG o WebP), un Excel o un PDF válido.');
    const lectura = tipo === 'pdf' ? await leerNotaPdf(multerFile.path) : null;
    if (lectura) await exigirPdfDeEsteReclamo(r, lectura.numeroDocumento);
    const repetido = await archivoIgual(r, multerFile.path);
    // Una foto, un Excel o un PDF ya validado repetido no aporta nada: se rechaza sin leerlo más.
    if (repetido && (tipo !== 'pdf' || repetido.adjunto?.notaAprobada || !repetido.adjunto)) {
      throw conflict(`Este archivo ya está en el reclamo («${repetido.nombre}»). No se sube dos veces.`, { code: 'ARCHIVO_REPETIDO' });
    }
    const nota = lectura ? await validarPdfContraDecisiones(token, lectura) : null;

    if (repetido) {
      // El mismo PDF ya estaba (p. ej. subido al crear el reclamo, antes de las
      // decisiones). Si ahora se valida, se marca el existente en vez de duplicarlo.
      if (!nota?.notaAprobada) {
        throw conflict(`Este archivo ya está en el reclamo («${repetido.nombre}»). No se sube dos veces.`, { code: 'ARCHIVO_REPETIDO' });
      }
      const agregaTorreControl = tienePermiso(usuario, 'reclamos.adjuntar');
      const res = await repo.modificarArchivos(token, (a, estado) => {
        asegurarModificable(estado, 'adjuntos', { agregaTorreControl });
        if (!a.adjuntos.some((x) => x.filename === repetido.adjunto.filename)) return null;
        return {
          imagenes: a.imagenes,
          adjuntos: a.adjuntos.map((x) =>
            x.filename === repetido.adjunto.filename ? { ...x, notaAprobada: true, documentoSap: nota.documentoSap, validado_at: new Date().toISOString(), validado_by: nombreUsuario(usuario) } : x
          ),
        };
      });
      if (!res) throw notFound('Reclamo no encontrado.');
      await borrarArchivos(creados);
      creados.length = 0;
      return detalle(token);
    }

    if (nota?.notaAprobada && nota.documentoSap) {
      const clave = dominio.normalizarDocSap(nota.documentoSap);
      const ya = parseJsonArray(r.AdjuntosExtra).find((a) => a.notaAprobada && a.documentoSap && dominio.normalizarDocSap(a.documentoSap) === clave);
      if (ya) {
        throw conflict(`El documento SAP ${nota.documentoSap} ya está subido y validado («${ya.originalname}»). No se sube dos veces.`, {
          code: 'DOC_SAP_YA_VALIDADO',
        });
      }
    }

    const adj = {
      filename: multerFile.filename,
      originalname: path.basename(multerFile.originalname || multerFile.filename).slice(0, 255),
      tipo: tipo === 'pdf' || tipo === 'imagen' ? tipo : 'excel',
      ...(nota?.notaAprobada && { notaAprobada: true, documentoSap: nota.documentoSap }),
      // PDF de uno de los documentos SAP del reclamo: queda anotado de qué documento es
      // (al reenviar un reclamo devuelto se revisa que cada documento tenga su PDF).
      ...(!nota?.notaAprobada && lectura?.numeroDocumento && esDocDelReclamo(r, lectura.numeroDocumento) && { documentoSap: String(lectura.numeroDocumento).trim() }),
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
    const dto = await detalle(token);
    if (adj.tipo === 'pdf') {
      copiarPdf(reclamoArchivoPath(adj.filename), { filename: adj.filename, titulo: `${dto.Numero} — ${adj.originalname}`, tipoDocumento: TIPO_RECLAMO });
    }
    return dto;
  } catch (err) {
    await borrarArchivos(creados);
    throw err;
  }
}

/** `f` (opcional): nombre en disco del adjunto, por si la posición cambió (ver indiceAdjunto). */
export async function eliminarAdjunto(token, idx, usuario, f) {
  validarToken(token);
  validarIndice(idx);
  // Quien tiene «Eliminar», o quien creó el reclamo mientras la compradora se lo devolvió para corregir.
  const puedeEliminar = tienePermiso(usuario, 'reclamos.eliminar');
  const corrige = { username: nombreUsuario(usuario), esAdmin: tienePermiso(usuario, 'configuracion.administrar') };
  let borrado = null;
  let aBorrar = [];
  const res = await repo.modificarArchivos(token, (a, estado) => {
    if (!puedeEliminar && dominio.motivoNoCorregir(estado, corrige)) {
      throw forbidden('Solo quien puede eliminar, o quien creó el reclamo mientras está devuelto para corregir, puede quitar adjuntos.');
    }
    exigir(dominio.motivoNoEliminarAdjunto(estado));
    const i = indiceAdjunto(a.adjuntos, idx, f);
    const adj = a.adjuntos[i];
    if (!adj) return null;
    const fotos = a.imagenes.filter((img) => img.origen === adj.filename);
    borrado = { posicion: i, adj };
    aBorrar = [adj.filename, ...fotos.map((foto) => foto.filename)];
    return {
      adjuntos: a.adjuntos.filter((_, j) => j !== i),
      imagenes: a.imagenes.filter((img) => img.origen !== adj.filename),
    };
  });
  if (!res) throw notFound('Reclamo no encontrado.');
  if (!aBorrar.length) throw notFound('Adjunto no encontrado.');
  // Solo después del commit: si la BD falla, los archivos siguen referenciados.
  await borrarArchivos(aBorrar);
  if (borrado.adj.tipo === 'pdf') borrarCopiasPdf([borrado.adj.filename]);
  const dto = await detalle(token);
  logger.info(
    { reclamo: dto.Numero, posicion: borrado.posicion, archivo: borrado.adj.filename, nombre: borrado.adj.originalname, usuario: nombreUsuario(usuario) },
    'Adjunto de reclamo eliminado'
  );
  return dto;
}
