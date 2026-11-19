// Contabilidad le manda al proveedor la nota de débito de un reclamo
// (2026-11-18): escribe los correos y un comentario, ve el correo y lo envía.
// Copia a quien lo envía y «Responder a» esa persona. Los correos quedan en el
// reclamo para proponerlos la próxima vez.
import fs from 'node:fs/promises';
import * as repo from '../../repositories/contabilidadRepository.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { datosDeUsuario } from '../acceso/keycloakAdmin.js';
import { plantillaReclamoProveedor } from '../correo/plantillaReclamoProveedor.js';
import { enviarCorreo, correoConfigurado, correoDesactivado, validarDestinatarios, MSG_DESACTIVADO } from '../correo/mailer.js';
import { conLogoEnLinea } from '../correo/diseno.js';
import { env } from '../../config/env.js';
import { badRequest, conflict } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { nombreUsuario, tipoRealDeArchivo } from '../reclamos/comun.js';
import { borrarArchivos } from '../reclamos/excelImages.js';
import { detalle } from './contabilidadService.js';
import { motivoNoEnviarProveedor } from '../../domain/contabilidad.js';

const MB = 1024 * 1024;

/**
 * `extras`: los demás archivos que adjunta contabilidad. En la vista previa
 * solo llegan sus nombres y tamaños ({ nombre, size }); al enviar, los
 * archivos subidos ({ nombre, path, size }).
 */
async function armar(id, { correos = [], comentario = '' }, usuario, extras = []) {
  const doc = await detalle(id); // valida el id (404 si no existe)
  const fila = await repo.obtenerPorId(doc.DocumentoId);
  const avisos = [];
  const bloqueo = fila ? motivoNoEnviarProveedor(fila) : null;
  if (bloqueo) avisos.push(bloqueo.mensaje);
  // El PDF del documento (adjunto del reclamo).
  let archivo = null;
  if (fila?.AdjuntoFilename) {
    const ruta = reclamoArchivoPath(fila.AdjuntoFilename);
    const st = await fs.stat(ruta).catch(() => null);
    if (st) archivo = { filename: doc.AdjuntoNombre || fila.AdjuntoFilename, path: ruta, size: st.size };
  }
  if (!archivo) avisos.push('El PDF del documento ya no está disponible: no se puede enviar.');
  else if (archivo.size > env.correo.maxAdjuntosMb * 1024 * 1024) avisos.push(`El PDF pesa más de ${env.correo.maxAdjuntosMb} MB, el máximo para un correo.`);
  const total = (archivo?.size || 0) + extras.reduce((s, e) => s + (Number(e.size) || 0), 0);
  if (archivo && total > env.correo.maxAdjuntosMb * MB) avisos.push(`Los archivos suman ${(total / MB).toFixed(1)} MB y el máximo para un correo es ${env.correo.maxAdjuntosMb} MB.`);
  if (!correos.length) avisos.push('Escribe al menos un correo del proveedor.');
  if (correoDesactivado()) avisos.push(MSG_DESACTIVADO);

  const quien = nombreUsuario(usuario);
  const remitente = await datosDeUsuario(quien);
  if (!remitente.nombre || remitente.nombre === quien) remitente.nombre = usuario.name || remitente.nombre;
  const texto = String(comentario ?? '').trim();
  const { asunto, html, texto: plano } = plantillaReclamoProveedor(doc, {
    comentario: texto,
    remitente,
    adjunto: archivo?.filename,
    extras: extras.map((e) => e.nombre),
  });
  const cc = remitente.correo && !correos.includes(remitente.correo.toLowerCase()) ? [remitente.correo] : [];
  return { doc, archivo, avisos, remitente, asunto, html, plano, cc, comentario: texto, quien, bloqueo, total };
}

export async function vistaPrevia(id, datos, usuario) {
  const extras = (datos.adjuntos ?? []).map((a) => ({ nombre: a.nombre, size: a.size }));
  const { archivo, avisos, remitente, asunto, html, cc } = await armar(id, datos, usuario, extras);
  try {
    validarDestinatarios(datos.correos);
  } catch (err) {
    avisos.push(err.message);
  }
  return {
    asunto,
    html: conLogoEnLinea(html),
    para: datos.correos,
    cc,
    responderA: remitente.correo,
    adjuntos: [...(archivo ? [archivo.filename] : []), ...extras.map((e) => e.nombre)],
    configurado: correoConfigurado(),
    avisos,
  };
}

/**
 * `archivos`: los que subió contabilidad (multer, en disco). Se revisa que
 * de verdad sean foto, Excel o PDF, van en el correo y después se borran
 * (no se guardan en el reclamo).
 */
export async function enviar(id, datos, usuario, archivos = []) {
  try {
    for (const f of archivos) {
      if (!(await tipoRealDeArchivo(f))) throw badRequest(`«${f.originalname}» no es una foto (JPG, PNG o WebP), un Excel o un PDF válido.`);
    }
    return await enviarConExtras(id, datos, usuario, archivos.map((f) => ({ nombre: f.originalname || f.filename, path: f.path, size: f.size })));
  } finally {
    await borrarArchivos(archivos.map((f) => f.filename));
  }
}

async function enviarConExtras(id, datos, usuario, extras) {
  const { doc, archivo, remitente, asunto, html, plano, cc, comentario, quien, bloqueo, total } = await armar(id, datos, usuario, extras);
  if (bloqueo) throw conflict(bloqueo.mensaje, { code: bloqueo.code });
  if (!datos.correos.length) throw badRequest('Escribe al menos un correo del proveedor.');
  if (!archivo) throw conflict('El PDF del documento ya no está disponible.');
  if (total > env.correo.maxAdjuntosMb * MB) throw badRequest(`Los archivos superan el máximo de ${env.correo.maxAdjuntosMb} MB para un correo.`);
  if (!(await repo.reservarEnvioProveedor(doc.DocumentoId))) throw conflict('Este documento se está enviando en este momento. Espera un momento y revisa.');
  let envio;
  try {
    envio = await enviarCorreo({
      para: datos.correos,
      cc,
      responderA: remitente.correo,
      asunto,
      html,
      texto: plano,
      adjuntos: [{ filename: archivo.filename, path: archivo.path }, ...extras.map((e) => ({ filename: e.nombre, path: e.path }))],
    });
  } catch (err) {
    await repo.liberarEnvioProveedor(doc.DocumentoId).catch((e) => logger.error({ err: e, documentoId: doc.DocumentoId }, 'No se pudo liberar la reserva del envío al proveedor'));
    throw err;
  }
  // El correo ya salió: si falla el registro no se responde error (lo reenviarían).
  try {
    await repo.registrarEnvioProveedor(doc.DocumentoId, { usuario: quien, para: datos.correos, comentario });
    if (extras.length) logger.info({ documentoId: doc.DocumentoId, adjuntos: extras.map((e) => e.nombre) }, 'Nota de débito enviada al proveedor con adjuntos extra');
  } catch (err) {
    logger.error({ err, documentoId: doc.DocumentoId }, 'Correo al proveedor enviado, pero no se pudo registrar el envío');
  }
  return { ...(await detalle(id)), envio: { para: datos.correos, cc, aceptados: envio.aceptados, rechazados: envio.rechazados } };
}
