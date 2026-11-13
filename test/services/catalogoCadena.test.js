import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construir, aEntradaPublica } from '../../src/services/reclamos/catalogos.js';

test('el catálogo del proveedor trae sus combinaciones reales, sin repetir ni filas vacías', () => {
  const filas = [
    { proveedor: 'NINGBO TOPWIN CO LTD', mundo: 'MUJER', division: '150', marca: 'NOIR', compradora: 'ANA' },
    { proveedor: 'ningbo topwin co ltd ', mundo: 'mujer', division: '150', marca: 'noir', compradora: 'ana' },
    { proveedor: 'NINGBO TOPWIN CO LTD', mundo: 'HOMBRE', division: '300', marca: 'PENGUIN', compradora: 'LUIS' },
    { proveedor: 'NINGBO TOPWIN CO LTD', mundo: '-', division: '', marca: '', compradora: null },
  ];
  const e = aEntradaPublica(construir(filas).porProveedor.get('NINGBO TOPWIN CO LTD'));
  assert.deepEqual(e.marcas, ['NOIR', 'PENGUIN']);
  assert.deepEqual(e.combinaciones, [
    { mundo: 'MUJER', departamento: '150', marca: 'NOIR', compradora: 'ANA' },
    { mundo: 'HOMBRE', departamento: '300', marca: 'PENGUIN', compradora: 'LUIS' },
  ]);
});
