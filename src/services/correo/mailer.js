// Envío de correo (SMTP o webhook de n8n). La configuración sale de MAIL_* en
// .env; sin ella el envío responde 503 con un mensaje claro en vez de fallar
// en silencio.
import fs from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { env, isCorreoConfigured } from '../../config/env.js';
import { badGateway, badRequest, serviceUnavailable } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { LOGO_CID, logoAdjunto } from './diseno.js';

let transporte = null;

// Al cliente solo un mensaje genérico; la respuesta de n8n/SMTP queda en el log.
const MSG_FALLO = 'No se pudo enviar el correo. Intenta de nuevo o avisa a sistemas.';

function obtenerTransporte() {
  if (!isCorreoConfigured()) {
    throw serviceUnavailable('El envío de correos todavía no está configurado en el servidor (faltan los datos MAIL_* del buzón).', {
      code: 'CORREO_NO_CONFIGURADO',
    });
  }
  if (!transporte) {
    const c = env.correo;
    transporte = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.password } : undefined,
      connectionTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transporte;
}

/** Rechaza destinatarios fuera de MAIL_SOLO_DOMINIOS (si está configurado). */
export function validarDestinatarios(correos) {
  const permitidos = env.correo.soloDominios;
  if (!permitidos.length) return;
  const fuera = correos.filter((c) => !permitidos.includes(c.split('@').pop().toLowerCase()));
  if (fuera.length) {
    throw badRequest(
      `Por ahora el servidor solo puede enviar a correos de ${permitidos.join(', ')} (configuración de prueba). No se puede enviar a: ${fuera.join(', ')}.`,
      { code: 'DOMINIO_NO_PERMITIDO' }
    );
  }
}

export const correoConfigurado = () => isCorreoConfigured();

export const MSG_DESACTIVADO = 'El envío de correos está apagado en este servidor mientras se hacen pruebas (MAIL_DESACTIVADO). No se envió nada.';

/** true si MAIL_DESACTIVADO=true: ningún correo sale del portal. */
export const correoDesactivado = () => env.correo.desactivado;

/**
 * Entrega el correo al webhook de n8n («Respuesta Felix Fix») como JSON:
 *   email_to, email_cc (separados por coma), email_subject, email_html,
 *   attachments [{ filename, contentType, data (base64), isInline, contentId }]
 * isInline/contentId van en los adjuntos incrustados en el html (el logo, cid:).
 * El workflow manda por Graph sendMail cuando hay adjuntos y por el nodo
 * Outlook cuando no. Sin email_to o email_html no envía nada, así que el html
 * nunca va vacío.
 */
async function enviarPorN8n({ para, cc, asunto, html, texto, adjuntos }) {
  const c = env.correo;
  const attachments = [];
  for (const a of adjuntos) {
    const contenido = a.content ?? (await fs.readFile(a.path));
    attachments.push({
      filename: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      data: Buffer.from(contenido).toString('base64'),
      ...(a.cid ? { isInline: true, contentId: a.cid } : {}),
    });
  }
  const cuerpoJson = {
    email_to: para.join(','),
    email_cc: cc.join(','),
    email_subject: asunto,
    email_html: html || `<pre>${escaparHtml(texto || '')}</pre>`,
    attachments,
  };

  try {
    const res = await fetch(c.n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(c.n8nToken ? { [c.n8nHeader]: c.n8nToken } : {}) },
      body: JSON.stringify(cuerpoJson),
      signal: AbortSignal.timeout(c.n8nTimeoutMs),
    });
    const cuerpo = await res.text();
    if (!res.ok) throw new Error(`n8n respondió ${res.status}${cuerpo ? `: ${cuerpo.slice(0, 300)}` : ''}`);
    const aceptados = [...para, ...cc];
    logger.info({ via: 'n8n', ...resumenDestinatarios(aceptados), adjuntos: adjuntos.length }, 'Correo enviado');
    return { messageId: null, aceptados, rechazados: [] };
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? 'n8n no respondió a tiempo' : err.message;
    logger.error({ via: 'n8n', err: motivo }, 'No se pudo enviar el correo');
    throw badGateway(MSG_FALLO, { code: 'CORREO_FALLO' });
  }
}

const escaparHtml = (t) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** Para el log: cuántos destinatarios y de qué dominios, sin las direcciones (datos personales). */
export function resumenDestinatarios(direcciones) {
  const lista = (direcciones || []).filter(Boolean);
  return { destinatarios: lista.length, dominios: [...new Set(lista.map((d) => String(d).split('@')[1]?.toLowerCase()).filter(Boolean))] };
}

/** Envía y devuelve el messageId. Errores de SMTP o n8n -> 502 con un mensaje genérico (el detalle va al log). */
export async function enviarCorreo({ para, cc = [], responderA, asunto, html, texto, adjuntos = [] }) {
  validarDestinatarios([...para, ...cc]);
  // El logo del encabezado va incrustado (cid) en todos los correos del diseño común.
  if (html?.includes(`cid:${LOGO_CID}`)) adjuntos = [...adjuntos, logoAdjunto()];
  // Antes de tocar n8n o SMTP: con el interruptor de pruebas no sale nada.
  if (correoDesactivado()) {
    logger.warn({ ...resumenDestinatarios([...para, ...cc]), adjuntos: adjuntos.length }, 'Correo NO enviado: MAIL_DESACTIVADO=true');
    throw serviceUnavailable(MSG_DESACTIVADO, { code: 'CORREO_DESACTIVADO' });
  }
  if (env.correo.n8nUrl) return enviarPorN8n({ para, cc, asunto, html, texto, adjuntos });
  const t = obtenerTransporte();
  try {
    const info = await t.sendMail({
      from: { name: env.correo.fromNombre, address: env.correo.from },
      to: para,
      cc: cc.length ? cc : undefined,
      replyTo: responderA || undefined,
      subject: asunto,
      html,
      text: texto,
      attachments: adjuntos,
    });
    logger.info(
      { messageId: info.messageId, ...resumenDestinatarios([...para, ...cc]), aceptados: info.accepted?.length || 0, rechazados: info.rejected?.length || 0 },
      'Correo enviado'
    );
    if (!info.accepted?.length) throw new Error(`El servidor de correo rechazó los ${info.rejected?.length || 0} destinatarios.`);
    return { messageId: info.messageId, aceptados: info.accepted, rechazados: info.rejected || [] };
  } catch (err) {
    logger.error({ err: err.message, code: err.code, response: err.response }, 'No se pudo enviar el correo');
    throw badGateway(MSG_FALLO, { code: 'CORREO_FALLO' });
  }
}
