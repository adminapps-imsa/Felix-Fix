// Envío de un reclamo cerrado a contabilidad por correo.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as repo from '../../repositories/reclamosRepository.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import * as dominio from '../../domain/reclamo.js';
import { datosDeUsuario } from '../acceso/keycloakAdmin.js';
import { enviarCorreo, resumenDestinatarios } from '../correo/mailer.js';
import { destinatarios } from '../correo/destinatarios.js';
import { plantillaReclamoContabilidad } from '../correo/plantillaReclamoContabilidad.js';
import { calcularDocumentos, sincronizarDocumentos } from '../contabilidad/sincronizar.js';
import { badRequest, conflict } from '../../utils/httpError.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { validarToken, obtenerOFallar, exigir, numeroReclamo, aDto, conNombres, nombreUsuario, detalle } from './comun.js';

// ------------------------------------------------------------------
// Envío a contabilidad
//   Cuando la compradora ya cerró el reclamo (resuelto o rechazado), lo
//   envía por correo a los usuarios con "Recibir reclamos en contabilidad":
//   datos, decisión, productos y TODOS los archivos (Excel del reclamo y
//   adjuntos PDF/Excel), cada uno con el número del reclamo en el nombre.
//   Va con copia a la compradora, que queda como "Responder a".
// ------------------------------------------------------------------

const PERMISO_CONTABILIDAD = 'reclamos.contabilidad';

/** "Reclamo REC-000005 - factura.pdf" (sin repetir el prefijo si ya lo trae). */
function nombreDeReclamo(numero, nombre) {
  const limpio = path.basename(nombre || '').trim() || 'archivo';
  return limpio.toLowerCase().startsWith(`reclamo ${numero}`.toLowerCase()) ? limpio : `Reclamo ${numero} - ${limpio}`;
}

async function archivosParaContabilidad(r) {
  const numero = numeroReclamo(r.ReclamoId);
  const candidatos = [];
  if (r.ArchivoExcel) {
    candidatos.push({
      guardado: r.ArchivoExcel,
      nombre: nombreDeReclamo(numero, r.ArchivoExcelNombre || `Excel${path.extname(r.ArchivoExcel)}`),
      descripcion: 'Excel del reclamo',
    });
  }
  for (const a of parseJsonArray(r.AdjuntosExtra)) {
    candidatos.push({
      guardado: a.filename,
      nombre: nombreDeReclamo(numero, a.originalname || a.filename),
      descripcion: a.tipo === 'pdf' ? 'PDF del reclamo' : a.tipo === 'imagen' ? 'Foto del reclamo' : 'Excel adjunto del reclamo',
    });
  }
  const archivos = [];
  const faltantes = [];
  let total = 0;
  for (const c of candidatos) {
    const ruta = reclamoArchivoPath(c.guardado);
    const st = await fs.stat(ruta).catch(() => null);
    if (!st) {
      faltantes.push(c.nombre);
      continue;
    }
    total += st.size;
    archivos.push({ filename: c.nombre, path: ruta, descripcion: c.descripcion });
  }
  return { archivos, faltantes, total };
}

/**
 * Las notas de débito marcadas como validadas (`notaAprobada`) se vuelven a
 * cruzar con las decisiones ACTUALES: la marca se puso al subir el PDF y una
 * decisión pudo deshacerse o cambiar después. Regla: dominio.motivoNotasYaNoCuadran.
 */
function exigirNotasVigentes(adjuntos, documentos) {
  const marcadas = adjuntos.filter((a) => a?.tipo === 'pdf' && a.notaAprobada);
  if (!marcadas.length) return;
  if (!documentos) {
    throw conflict('No se pudieron leer las notas de débito para comprobarlas contra las decisiones de la compradora. Intenta de nuevo en unos minutos.', {
      code: 'NOTA_NO_COMPROBADA',
    });
  }
  const porArchivo = new Map(documentos.map((d) => [d.adjuntoFilename, d]));
  exigir(
    dominio.motivoNotasYaNoCuadran(
      marcadas.map((a) => {
        const d = porArchivo.get(a.filename);
        return { nombre: a.originalname || a.filename, numeroDocumento: d?.numeroDocumento ?? null, legible: Boolean(d?.legible), lineas: d?.lineas ?? [] };
      })
    )
  );
}

/**
 * Dos envíos del mismo reclamo a la vez (doble clic, dos usuarios) mandarían
 * el correo dos veces: verificación + correo + registro corren bajo un
 * candado por reclamo (repo.conCandadoEnvioContabilidad). El segundo no
 * espera: recibe 409. Si ya terminó el primero, la regla de siempre decide.
 */
export async function enviarAContabilidad(token, usuario) {
  validarToken(token);
  const res = await repo.conCandadoEnvioContabilidad(token, () => enviar(token, usuario));
  if (res.ocupado) {
    throw conflict('Este reclamo se está enviando a contabilidad en este momento. Espera a que termine y recarga el detalle.', { code: 'ENVIO_EN_CURSO' });
  }
  return res.resultado;
}

async function enviar(token, usuario) {
  const r = await obtenerOFallar(token);
  const adjuntosReclamo = parseJsonArray(r.AdjuntosExtra);
  exigir(dominio.motivoNoEnviarContabilidad(r, adjuntosReclamo));
  const para = await destinatarios(PERMISO_CONTABILIDAD);
  if (!para.length) {
    throw badRequest(
      'No hay a quién enviarlo: ningún usuario con correo tiene un rol con el permiso "Recibir reclamos en contabilidad". Asígnalo en Configuración.'
    );
  }
  const { archivos, faltantes, total } = await archivosParaContabilidad(r);
  if (faltantes.length) {
    throw conflict(`Faltan archivos del reclamo en el servidor y no se puede enviar completo: ${faltantes.join(', ')}.`);
  }
  if (total > env.correo.maxAdjuntosMb * 1024 * 1024) {
    throw badRequest(
      `Los archivos del reclamo suman ${(total / 1048576).toFixed(1)} MB y el máximo para un correo es ${env.correo.maxAdjuntosMb} MB.`
    );
  }

  const [dto] = await conNombres([aDto(r)]);
  const lineas = await repo.listarLineas(token);
  const remitente = await datosDeUsuario(nombreUsuario(usuario));
  if (!remitente.nombre || remitente.nombre === nombreUsuario(usuario)) remitente.nombre = usuario.name || remitente.nombre;

  // Notas de débito (PDF adjuntos) leídas y cruzadas con los productos: para
  // comprobar las notas validadas y para el correo. Si la lectura falla y no
  // hay notas validadas que comprobar, el correo sale igual sin esa sección.
  let documentos = null;
  try {
    documentos = await calcularDocumentos(r, lineas);
  } catch (err) {
    logger.error({ err, reclamo: dto.Numero }, 'No se pudieron leer los documentos del reclamo para el correo a contabilidad');
  }
  exigirNotasVigentes(adjuntosReclamo, documentos);

  const { asunto, html, texto } = plantillaReclamoContabilidad(dto, lineas, { remitente, archivos, documentos: documentos ?? [] });
  const cc = remitente.correo && !para.includes(remitente.correo) ? [remitente.correo] : [];
  const envio = await enviarCorreo({
    para,
    cc,
    responderA: remitente.correo,
    asunto,
    html,
    texto,
    adjuntos: archivos.map(({ filename, path: ruta }) => ({ filename, path: ruta })),
  });

  // El correo ya salió: si falla el registro no se responde error (el usuario
  // reintentaría y contabilidad recibiría el reclamo dos veces).
  try {
    const registrado = await repo.registrarEnvioContabilidad(token, { usuario: nombreUsuario(usuario), para: para.join(', ') });
    if (!registrado) {
      logger.warn({ reclamo: dto.Numero }, 'Reclamo enviado a contabilidad pero no se registró el envío (cambió de estado o ya no existe)');
    }
  } catch (err) {
    logger.error({ err, reclamo: dto.Numero }, 'Reclamo enviado a contabilidad pero falló el registro del envío');
  }
  // Bandeja de contabilidad: un documento por PDF adjunto. Igual que arriba,
  // si falla no se responde error (el correo ya salió).
  try {
    // Si no se pudieron calcular antes del correo, se reintenta aquí.
    await sincronizarDocumentos(token, nombreUsuario(usuario), { documentos: documentos ?? undefined });
  } catch (err) {
    logger.error({ err, reclamo: dto.Numero }, 'Reclamo enviado a contabilidad pero falló el guardado de sus documentos en la bandeja');
  }
  logger.info({ reclamo: dto.Numero, ...resumenDestinatarios([...para, ...cc]), archivos: archivos.length }, 'Reclamo enviado a contabilidad');
  return { ...(await detalle(token)), envio: { para, cc, aceptados: envio.aceptados, rechazados: envio.rechazados } };
}
