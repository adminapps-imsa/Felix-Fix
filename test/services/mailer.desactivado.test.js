import { test } from 'node:test';
import assert from 'node:assert/strict';

// Antes de cargar la configuración: interruptor prendido y un n8n que nunca se debe llamar.
process.env.MAIL_DESACTIVADO = 'true';
process.env.MAIL_N8N_WEBHOOK_URL = 'http://127.0.0.1:9/no-llamar';
process.env.MAIL_SOLO_DOMINIOS = '';
const { enviarCorreo, correoDesactivado } = await import('../../src/services/correo/mailer.js');

test('con MAIL_DESACTIVADO=true no sale ningún correo (ni se llama a n8n)', async () => {
  let llamadas = 0;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => {
    llamadas += 1;
    throw new Error('no debía llamarse');
  };
  try {
    assert.equal(correoDesactivado(), true);
    await assert.rejects(
      enviarCorreo({ para: ['alguien@maduro.com.pa'], asunto: 'Prueba', html: '<p>x</p>', texto: 'x' }),
      (err) => err.status === 503 && err.extra?.code === 'CORREO_DESACTIVADO'
    );
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
