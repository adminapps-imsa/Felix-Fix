import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diferenciasProductosExcel, motivoNoCambiarExcel } from '../../src/domain/reclamo.js';
import { parsearPlantilla } from '../../src/services/reclamos/excelParser.js';

const delExcel = (archivo) =>
  parsearPlantilla(fs.readFileSync(new URL(archivo, import.meta.url))).lineas.map((l) => ({ codigo: l.codigoBarra, cantidad: l.cantidad, tipo: l.tipo }));

test('reemplazar el Excel: mismos productos en otro orden cuadra', () => {
  const excel = delExcel('../../sql/migrations/archivos/036/PRESTIGE (2).xlsx');
  assert.equal(diferenciasProductosExcel([...excel].reverse(), excel).length, 0);
});

test('reemplazar el Excel: dice qué producto no cuadra (caso REC-28: código de la talla)', () => {
  const excel = delExcel('../../sql/migrations/archivos/036/PRESTIGE (2).xlsx');
  const reclamo = excel.map((l) => (l.codigo === '9246752773' ? { ...l, codigo: '9246752766' } : l));
  assert.deepEqual(diferenciasProductosExcel(reclamo, excel), [
    'está en el reclamo y no en el Excel: 9246752766 × 1 (faltante_real)',
    'está en el Excel y no en el reclamo: 9246752773 × 1 (faltante_real)',
  ]);
  // Una cantidad distinta también.
  const otraCantidad = excel.map((l, i) => (i === 0 ? { ...l, cantidad: 9 } : l));
  assert.equal(diferenciasProductosExcel(otraCantidad, excel).length, 2);
});

test('reemplazar el Excel: ceros a la izquierda y sobrantes no esperados por referencia', () => {
  assert.deepEqual(diferenciasProductosExcel([{ codigo: '007701', cantidad: 1, tipo: 'faltante_real' }], [{ codigo: '7701', cantidad: '1', tipo: 'faltante_real' }]), []);
  // Data ya cargó el código del sobrante no esperado: igual cuadra con el Excel, que no lo trae.
  const reclamo = [{ codigo: '2050000000001', cantidad: 2, tipo: 'sobrante_no_esperado', referencia: 'TY1374', color: 'OFF WHITE MIX', talla: 'S' }];
  const excel = [{ codigo: null, cantidad: 2, tipo: 'sobrante_no_esperado', referencia: 'ty1374', color: 'off white  mix', talla: 's' }];
  assert.deepEqual(diferenciasProductosExcel(reclamo, excel), []);
});

test('cambiar el Excel: no después de enviarlo a contabilidad', () => {
  assert.equal(motivoNoCambiarExcel({ EnviadoContabilidadAt: null }), null);
  assert.match(motivoNoCambiarExcel({ EnviadoContabilidadAt: new Date() }).mensaje, /contabilidad/);
});
