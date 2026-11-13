import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirigirFueraDeProd, CORREOS_PRUEBA } from '../../src/services/correo/mailer.js';

test('fuera de Prod todo correo va solo a los de prueba, con la nota de a quién iba', () => {
  const r = redirigirFueraDeProd(
    { para: ['compradora@maduro.com.pa'], cc: ['gof@maduro.com.pa'], asunto: 'Reclamo REC-000044', html: '<html><body><p>Hola</p></body></html>', texto: 'Hola' },
    'QA'
  );
  assert.deepEqual(r.para, CORREOS_PRUEBA);
  assert.deepEqual(r.cc, []);
  assert.equal(r.asunto, '[QA] Reclamo REC-000044');
  assert.match(r.html, /<body><div[^>]*>Correo de prueba de QA: .*compradora@maduro\.com\.pa, gof@maduro\.com\.pa\.<\/div><p>Hola/);
  assert.match(r.texto, /^Correo de prueba de QA.*\n\nHola$/s);
});

test('en Prod no cambia nada', () => {
  assert.equal(redirigirFueraDeProd({ para: ['x@maduro.com.pa'], asunto: 'a' }, 'Prod'), null);
  assert.equal(redirigirFueraDeProd({ para: ['x@maduro.com.pa'], asunto: 'a' }, 'prod'), null);
});

test('la nota no deja meter html', () => {
  const r = redirigirFueraDeProd({ para: ['a"<b>@x.com'], asunto: 'a', html: '<p>x</p>' }, 'QA');
  assert.match(r.html, /a&quot;&lt;b&gt;@x\.com/);
});
