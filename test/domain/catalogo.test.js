import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valorDelCatalogo, motivoDivisionInvalida } from '../../src/domain/catalogo.js';

const divisiones = ['Cosméticos', 'Perfumería'];

test('división: se acepta sin importar mayúsculas, tildes ni espacios, y se devuelve como está en el catálogo', () => {
  assert.equal(valorDelCatalogo('perfumeria', divisiones), 'Perfumería');
  assert.equal(valorDelCatalogo('  COSMÉTICOS ', divisiones), 'Cosméticos');
  assert.equal(motivoDivisionInvalida('Perfumería', divisiones), null);
});

test('división: otra (o vacía) se rechaza y dice cuáles valen', () => {
  assert.equal(valorDelCatalogo('Maquillaje', divisiones), null);
  assert.equal(valorDelCatalogo('', divisiones), null);
  assert.equal(motivoDivisionInvalida('Maquillaje', divisiones), 'La división debe ser Cosméticos o Perfumería.');
  assert.match(motivoDivisionInvalida('X', []), /No hay divisiones/);
});
