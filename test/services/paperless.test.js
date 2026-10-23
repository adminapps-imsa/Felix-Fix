import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Antes de cargar la configuración: Paperless activo, pero falso (fetch simulado) y fotos en una carpeta temporal.
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'evidencia-'));
process.env.EVIDENCE_STORAGE_PROVIDER = 'paperless';
process.env.EVIDENCE_LOCAL_DIR = dir;
process.env.RECLAMOS_LOCAL_DIR = path.join(dir, 'reclamos');
process.env.PAPERLESS_URL = 'http://127.0.0.1:9/paperless-falso/';
process.env.PAPERLESS_TOKEN = 'token-falso';
process.env.PAPERLESS_ETIQUETAS = 'Felix Fix,QA';
process.env.PAPERLESS_TIPO_DOCUMENTO = 'Evidencia Producto Dañado';
process.env.PAPERLESS_ESPERA_SEG = '2';
const { saveEvidence, getEvidenceStream, deleteEvidence, moverAPaperless } = await import('../../src/services/evidenceStorage/index.js');

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

/** Paperless falso: responde según la ruta y guarda las llamadas. */
async function conPaperless(responder, fn) {
  const original = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, opts = {}) => {
    const ruta = String(url).replace('http://127.0.0.1:9/paperless-falso/api', '');
    llamadas.push({ ruta, opts });
    return responder(ruta, opts);
  };
  try {
    return { resultado: await fn(), llamadas };
  } finally {
    globalThis.fetch = original;
  }
}

const normal = (tarea = { status: 'SUCCESS', related_document: '55' }) => (ruta, opts) => {
  if (ruta.startsWith('/document_types/')) return json({ results: [{ id: 7 }] });
  if (ruta === '/tags/?name__iexact=Felix%20Fix') return json({ results: [{ id: 1 }] });
  if (ruta === '/tags/?name__iexact=QA') return json({ results: [{ id: 2 }] });
  if (ruta === '/documents/post_document/' && opts.method === 'POST') return json('tarea-1');
  if (ruta.startsWith('/tasks/')) return json([tarea]);
  return json({}, 404);
};

async function foto(nombre) {
  const ruta = path.join(dir, nombre);
  await fs.writeFile(ruta, 'jpg');
  return { path: ruta, filename: nombre, mimetype: 'image/jpeg' };
}
const existe = (ruta) => fs.access(ruta).then(() => true, () => false);

test('la foto se guarda en disco al instante, aunque el proveedor sea Paperless', async () => {
  const f = await foto('a.jpg');
  const { resultado, llamadas } = await conPaperless(normal(), () => saveEvidence(f));
  assert.deepEqual(resultado, { provider: 'local', key: 'a.jpg' });
  assert.equal(llamadas.length, 0);
});

test('en segundo plano: sube a Paperless con título, tipo y etiquetas, guarda y borra la copia en disco', async () => {
  const f = await foto('b.JPG');
  let guardada;
  const { llamadas } = await conPaperless(normal(), () =>
    moverAPaperless('b.JPG', 'PD-000053 — Crema', async (nueva) => {
      guardada = nueva;
      return true;
    })
  );
  assert.deepEqual(guardada, { provider: 'paperless', key: '55.jpg' });
  assert.equal(await existe(f.path), false);
  const subida = llamadas.find((l) => l.ruta === '/documents/post_document/');
  assert.equal(subida.opts.headers.Authorization, 'Token token-falso');
  assert.equal(subida.opts.body.get('title'), 'PD-000053 — Crema');
  assert.equal(subida.opts.body.get('document_type'), '7');
  assert.deepEqual(subida.opts.body.getAll('tags'), ['1', '2']);
});

test('si mientras subía cambiaron la foto o borraron el reporte, se borra en Paperless y no en disco', async () => {
  const f = await foto('c.jpg');
  const { llamadas } = await conPaperless(normal(), () => moverAPaperless('c.jpg', 'PD-1', async () => false));
  assert.ok(llamadas.some((l) => l.ruta === '/documents/55/' && l.opts.method === 'DELETE'));
  assert.equal(await existe(f.path), true);
});

test('Paperless caído, rechaza la foto (duplicada) o no termina a tiempo: queda en disco y no se guarda nada', async () => {
  for (const [nombre, responder] of [
    ['d.jpg', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['e.jpg', normal({ status: 'FAILURE', result: 'It is a duplicate' })],
    ['f.jpg', normal({ status: 'STARTED' })],
  ]) {
    const f = await foto(nombre);
    let guardo = false;
    await conPaperless(responder, () =>
      moverAPaperless(nombre, 'PD-1', async () => {
        guardo = true;
        return true;
      })
    );
    assert.equal(guardo, false, nombre);
    assert.equal(await existe(f.path), true, nombre);
  }
});

test('Paperless: lee la foto por su id y da null si ya no existe', async () => {
  const { resultado } = await conPaperless(
    (ruta) => (ruta === '/documents/55/download/?original=true' ? new Response('foto') : json({}, 404)),
    async () => {
      const partes = [];
      for await (const p of await getEvidenceStream('paperless', '55.jpg')) partes.push(p);
      return { contenido: Buffer.concat(partes).toString(), noEsta: await getEvidenceStream('paperless', '56.jpg') };
    }
  );
  assert.deepEqual(resultado, { contenido: 'foto', noEsta: null });
});

test('borrar una foto nunca hace fallar la acción', async () => {
  const { llamadas } = await conPaperless(() => json({}, 500), () => deleteEvidence('paperless', '55.jpg'));
  assert.equal(llamadas[0].ruta, '/documents/55/');
  assert.equal(llamadas[0].opts.method, 'DELETE');
  await deleteEvidence('local', 'no-existe.jpg');
});

test('Paperless: al arrancar crea la etiqueta que falta, sin asignación automática', async () => {
  const { prepararEvidencia } = await import('../../src/services/evidenceStorage/index.js');
  const { llamadas } = await conPaperless((ruta, opts) => {
    if (ruta === '/tags/?name__iexact=Prod') return json({ results: [] });
    if (ruta === '/tags/' && opts.method === 'POST') return json({ id: 9 }, 201);
    return json({ results: [] });
  }, async () => {
    const { env } = await import('../../src/config/env.js');
    env.evidence.paperless.etiquetas = ['Prod'];
    await prepararEvidencia();
  });
  const creada = llamadas.find((l) => l.ruta === '/tags/' && l.opts.method === 'POST');
  assert.deepEqual(JSON.parse(creada.opts.body), { name: 'Prod', matching_algorithm: 0 });
});

test('PDF: se copia a Paperless con su tipo de documento y el original se queda en disco', async () => {
  const { copiarPdf, TIPO_RECLAMO } = await import('../../src/services/evidenceStorage/copiasPdf.js');
  const ruta = path.join(dir, 'nota.pdf');
  await fs.writeFile(ruta, '%PDF');
  const tiposPedidos = [];
  const { llamadas } = await conPaperless((r, o) => {
    if (r.startsWith('/document_types/')) tiposPedidos.push(decodeURIComponent(r.split('=')[1]));
    return normal()(r, o);
  }, () => copiarPdf(ruta, { filename: 'nota.pdf', titulo: 'REC-000024 — nota.pdf', tipoDocumento: TIPO_RECLAMO }));
  assert.deepEqual(tiposPedidos, ['Documento Reclamo']);
  const subida = llamadas.find((l) => l.ruta === '/documents/post_document/');
  assert.equal(subida.opts.body.get('title'), 'REC-000024 — nota.pdf');
  assert.equal(subida.opts.body.get('document').type, 'application/pdf');
  assert.equal(await existe(ruta), true);
});

test('PDF: al quitarlo del portal se borra en Paperless solo el documento de ese archivo', async () => {
  const { borrarCopiasPdf } = await import('../../src/services/evidenceStorage/copiasPdf.js');
  const { llamadas } = await conPaperless((ruta) =>
    ruta.startsWith('/documents/?original_filename__iexact=abc.pdf')
      ? // Aunque Paperless devolviera otros documentos, solo se borra el que es de ese archivo.
        json({ results: [{ id: 70, original_filename: 'abc.pdf' }, { id: 71, original_filename: 'otro.pdf' }] })
      : new Response(null, { status: 204 })
  , () => borrarCopiasPdf(['abc.pdf']));
  const borrados = llamadas.filter((l) => l.opts.method === 'DELETE').map((l) => l.ruta);
  assert.deepEqual(borrados, ['/documents/70/']);
});
