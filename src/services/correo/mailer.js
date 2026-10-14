// Envío de correo (SMTP o webhook de n8n). La configuración sale de MAIL_* en
// .env; sin ella el envío responde 503 con un mensaje claro en vez de fallar
// en silencio.
import fs from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { env, isCorreoConfigured } from '../../config/env.js';
import { badGateway, badRequest, serviceUnavailable } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';

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

/**
 * Entrega el correo al webhook de n8n como multipart/form-data:
 *   campos  para, cc (separados por coma), responderA, asunto, html, texto,
 *           deNombre, adjuntos (nombres de los campos de archivo, separados por coma)
 *   archivos adjunto0, adjunto1, … (con su nombre original)
 * n8n debe responder 2xx cuando Outlook ya lo envió (Webhook con
 * "Respond: When last node finishes" o un nodo "Respond to Webhook").
 */
async function enviarPorN8n({ para, cc, responderA, asunto, html, texto, adjuntos }) {
  const c = env.correo;
  const form = new FormData();
  form.append('para', para.join(','));
  form.append('cc', cc.join(','));
  form.append('responderA', responderA || '');
  form.append('asunto', asunto);
  form.append('html', html || '');
  form.append('texto', texto || '');
  form.append('deNombre', c.fromNombre);
  const campos = [];
  for (const [i, a] of adjuntos.entries()) {
    const contenido = a.content ?? (await fs.readFile(a.path));
    const campo = `adjunto${i}`;
    form.append(campo, new Blob([contenido], { type: a.contentType || 'application/octet-stream' }), a.filename);
    campos.push(campo);
  }
  form.append('adjuntos', campos.join(','));

  try {
    const res = await fetch(c.n8nUrl, {
      method: 'POST',
      headers: c.n8nToken ? { [c.n8nHeader]: c.n8nToken } : undefined,
      body: form,
      signal: AbortSignal.timeout(c.n8nTimeoutMs),
    });
    const cuerpo = await res.text();
    if (!res.ok) throw new Error(`n8n respondió ${res.status}${cuerpo ? `: ${cuerpo.slice(0, 300)}` : ''}`);
    const aceptados = [...para, ...cc];
    logger.info({ via: 'n8n', para, cc, adjuntos: adjuntos.map((a) => a.filename) }, 'Correo enviado');
    return { messageId: null, aceptados, rechazados: [] };
  } catch (err) {
    const motivo = err.name === 'TimeoutError' ? 'n8n no respondió a tiempo' : err.message;
    logger.error({ via: 'n8n', err: motivo }, 'No se pudo enviar el correo');
    throw badGateway(MSG_FALLO, { code: 'CORREO_FALLO' });
  }
}

/** Envía y devuelve el messageId. Errores de SMTP o n8n -> 502 con un mensaje genérico (el detalle va al log). */
export async function enviarCorreo({ para, cc = [], responderA, asunto, html, texto, adjuntos = [] }) {
  validarDestinatarios([...para, ...cc]);
  if (env.correo.n8nUrl) return enviarPorN8n({ para, cc, responderA, asunto, html, texto, adjuntos });
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
    logger.info({ messageId: info.messageId, para, cc, aceptados: info.accepted, rechazados: info.rejected }, 'Correo enviado');
    if (!info.accepted?.length) throw new Error(`El servidor de correo rechazó todos los destinatarios: ${info.rejected?.join(', ')}`);
    return { messageId: info.messageId, aceptados: info.accepted, rechazados: info.rejected || [] };
  } catch (err) {
    logger.error({ err: err.message, code: err.code, response: err.response }, 'No se pudo enviar el correo');
    throw badGateway(MSG_FALLO, { code: 'CORREO_FALLO' });
  }
}
