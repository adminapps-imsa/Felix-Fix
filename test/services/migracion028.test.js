import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVOS, diferenciasProductos } from '../../sql/migrations/028_prod_reclamos_5_6_7_excel.js';
import { parsearPlantilla } from '../../src/services/reclamos/excelParser.js';

const ORIGEN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql', 'migrations', 'archivos', '028');

test('028: los tres Excel se leen y todos sus productos son devolución', () => {
  for (const { archivo } of ARCHIVOS) {
    const r = parsearPlantilla(fs.readFileSync(path.join(ORIGEN, archivo)));
    assert.ok(r.lineas.length > 0, archivo);
    assert.equal(r.lineasSinMotivo, 0, archivo);
    assert.ok(r.lineas.every((l) => l.tipo === 'devolucion'), archivo);
  }
});

test('028: diferenciasProductos compara código, cantidad y motivo sin importar el orden', () => {
  const reclamo = [
    { codigo: '0123', cantidad: 1, tipo: 'devolucion' },
    { codigo: '456', cantidad: '2.000', tipo: 'devolucion' },
  ];
  assert.deepEqual(
    diferenciasProductos(reclamo, [
      { codigo: '456', cantidad: 2, tipo: 'devolucion' },
      { codigo: '123', cantidad: 1, tipo: 'devolucion' },
    ]),
    []
  );
  assert.equal(diferenciasProductos(reclamo, [{ codigo: '123', cantidad: 1, tipo: 'devolucion' }]).length, 1);
  assert.equal(
    diferenciasProductos(reclamo, [
      { codigo: '123', cantidad: 1, tipo: 'danio' },
      { codigo: '456', cantidad: 2, tipo: 'devolucion' },
    ]).length,
    2
  );
});
