import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsearPlantilla } from '../../src/services/reclamos/excelParser.js';
import { planRec28, CAMBIO } from '../../sql/migrations/036_prod_rec28_excel.js';

const excel = parsearPlantilla(fs.readFileSync(new URL('../../sql/migrations/archivos/036/PRESTIGE (2).xlsx', import.meta.url)));
// Las líneas del REC-000028 de Prod: las del Excel nuevo con el código equivocado en el faltante de la S.
const actuales = excel.lineas.map((l, i) => ({
  Posicion: i + 1,
  CodigoBarra: l.codigoBarra === CAMBIO.ahora ? CAMBIO.antes : l.codigoBarra,
  Cantidad: l.cantidad,
  Tipo: l.tipo,
}));

test('el Excel nuevo trae 36 productos (17 faltantes, 19 sobrantes)', () => {
  assert.equal(excel.lineas.length, 36);
  assert.deepEqual(excel.desglose, { faltante_real: 17, sobrante_real: 19 });
});

test('cambia solo el faltante 17', () => {
  const plan = planRec28(actuales, excel);
  assert.equal(plan.error, undefined);
  assert.equal(plan.posicion, 17);
  assert.match(plan.descripcion, /ULTRAMARINE, S/);
});

test('cualquier otra diferencia lo detiene', () => {
  const otra = actuales.map((l) => (l.Posicion === 1 ? { ...l, Cantidad: 5 } : l));
  assert.match(planRec28(otra, excel).error, /no cuadran/);
  const yaCorregido = actuales.map((l) => (l.Posicion === 17 ? { ...l, CodigoBarra: CAMBIO.ahora } : l));
  assert.match(planRec28(yaCorregido, excel).error, /se esperaba 1/);
});

test('ya corregido: decide por el código del faltante, no por el nombre del Excel', async () => {
  const { yaCorregido } = await import('../../sql/migrations/036_prod_rec28_excel.js');
  assert.equal(yaCorregido(actuales), false);
  assert.equal(yaCorregido(actuales.map((l) => (l.Posicion === 17 ? { ...l, CodigoBarra: CAMBIO.ahora } : l))), true);
});
