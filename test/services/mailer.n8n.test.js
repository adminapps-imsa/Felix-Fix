import { test } from 'node:test';
import assert from 'node:assert/strict';

// Antes de cargar la configuración: correo encendido pero con un n8n falso (fetch simulado).
process.env.MAIL_DESACTIVADO = 'false';
process.env.MAIL_N8N_WEBHOOK_URL = 'http://127.0.0.1:9/n8n-falso';
process.env.MAIL_SOLO_DOMINIOS = '';
const { enviarCorreo } = await import('../../src/services/correo/mailer.js');
const { LOGO_CID } = await import('../../src/services/correo/diseno.js');

async function capturar(datos) {
  const fetchOriginal = globalThis.fetch;
  let llamada;
  globalThis.fetch = async (url, opts) => {
    llamada = { url, opts, cuerpo: JSON.parse(opts.body) };
    return new Response('', { status: 200 });
  };
  try {
    await enviarCorreo(datos);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  return llamada;
}

test('n8n recibe JSON con los campos de «Respuesta Felix Fix» y el logo incrustado', async () => {
  const { opts, cuerpo } = await capturar({
    para: ['a@maduro.com.pa', 'b@maduro.com.pa'],
    cc: ['c@maduro.com.pa'],
    responderA: 'compras@maduro.com.pa',
    asunto: 'Prueba',
    html: `<img src="cid:${LOGO_CID}"><p>x</p>`,
    adjuntos: [{ filename: 'r.pdf', content: Buffer.from('pdf'), contentType: 'application/pdf' }],
  });
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.equal(cuerpo.email_to, 'a@maduro.com.pa,b@maduro.com.pa');
  assert.equal(cuerpo.email_cc, 'c@maduro.com.pa');
  assert.equal(cuerpo.email_reply_to, 'compras@maduro.com.pa');
  assert.equal(cuerpo.email_subject, 'Prueba');
  assert.match(cuerpo.email_html, /cid:/);
  assert.deepEqual(cuerpo.attachments[0], { filename: 'r.pdf', contentType: 'application/pdf', data: Buffer.from('pdf').toString('base64') });
  const logo = cuerpo.attachments[1];
  assert.equal(logo.isInline, true);
  assert.equal(logo.contentId, LOGO_CID);
  assert.ok(logo.data.length > 100);
});

test('sin html el texto va envuelto en html (n8n descarta correos sin email_html)', async () => {
  const { cuerpo } = await capturar({ para: ['a@maduro.com.pa'], asunto: 'P', texto: 'Hola <tú>' });
  assert.match(cuerpo.email_html, /Hola &lt;tú&gt;/);
  assert.deepEqual(cuerpo.attachments, []);
});
