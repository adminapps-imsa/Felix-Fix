import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, listarQuerySchema } from '../../src/validators/productosDanados.schema.js';
import { TRANSICIONES } from '../../src/domain/productoDanado.js';

test('el filtro por estado acepta todos los estados de la ruta del dominio', () => {
  const delDominio = new Set(Object.values(TRANSICIONES).flatMap((t) => [t.desde, t.hacia]));
  for (const estado of delDominio) {
    assert.ok(ESTADOS.includes(estado), `falta ${estado} en ESTADOS`);
    assert.equal(listarQuerySchema.safeParse({ estado }).success, true, estado);
  }
  assert.equal(listarQuerySchema.safeParse({ estado: 'Otro' }).success, false);
});

test('filtro por tienda: entero positivo o vacío; lo demás es inválido', () => {
  for (const tienda of ['1', '42', '', undefined]) assert.equal(listarQuerySchema.safeParse({ tienda }).success, true, String(tienda));
  for (const tienda of ['abc', '0', '-1', '1.5', '99999999999', '1e3']) assert.equal(listarQuerySchema.safeParse({ tienda }).success, false, tienda);
});
