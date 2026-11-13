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

test('ajustar al Excel (REC-000004): se queda el faltante, se agrega el sobrante para la compradora', async () => {
  const { planAjusteExcel, estadoTrasAjuste } = await import('../../src/domain/reclamo.js');
  const { esAutoAprobado, TIPOS_SOLO_NOTIFICACION } = await import('../../src/services/reclamos/tipos.js');
  const actuales = [{ LineaId: 7, Posicion: 1, CodigoBarra: '2050039048687', Cantidad: 2, Tipo: 'faltante_real', DecStatus: 'aprobado' }];
  const excel = [
    { codigo: '2050039048687', cantidad: 2, tipo: 'faltante_real', descripcion: 'FW16BLT07 "CORREAS, BLACK/BROWN, 38' },
    { codigo: '2050039048670', cantidad: 2, tipo: 'sobrante_real', descripcion: 'FW16BLT07 "CORREAS, BLACK/BROWN, 36' },
  ];
  const p = planAjusteExcel(actuales, excel, esAutoAprobado);
  assert.equal(p.iguales, 1);
  assert.deepEqual(p.quitar, []);
  assert.deepEqual(p.agregar.map((l) => [l.codigo, l.decStatus]), [['2050039048670', 'pendiente']]);

  // Devuelto sigue devuelto; si no, queda pendiente para la compradora.
  const lineas = [{ tipo: 'faltante_real', decStatus: 'aprobado' }, { tipo: 'sobrante_real', decStatus: 'pendiente' }];
  assert.deepEqual(estadoTrasAjuste({ Status: 'devuelto' }, lineas, TIPOS_SOLO_NOTIFICACION), { status: 'devuelto', decisionSistema: null });
  assert.deepEqual(estadoTrasAjuste({ Status: 'resuelto', DecisionBy: 'sistema' }, lineas, TIPOS_SOLO_NOTIFICACION), { status: 'pendiente', decisionSistema: false });
  // Todo aprobado: cierre automático; cerrado por una persona se respeta.
  const todo = [{ tipo: 'faltante_real', decStatus: 'aprobado' }];
  assert.deepEqual(estadoTrasAjuste({ Status: 'pendiente', Tipo: 'faltante_real' }, todo, TIPOS_SOLO_NOTIFICACION), { status: 'resuelto', decisionSistema: true });
  assert.deepEqual(estadoTrasAjuste({ Status: 'resuelto', DecisionBy: 'aBatista' }, todo, TIPOS_SOLO_NOTIFICACION), { status: 'resuelto', decisionSistema: null });
});

test('ajustar al Excel: quita lo que ya no viene y empareja repetidos uno a uno', async () => {
  const { planAjusteExcel } = await import('../../src/domain/reclamo.js');
  const actuales = [
    { LineaId: 1, CodigoBarra: '1', Cantidad: 1, Tipo: 'sobrante_real' },
    { LineaId: 2, CodigoBarra: '1', Cantidad: 1, Tipo: 'sobrante_real' },
    { LineaId: 3, CodigoBarra: '9246752766', Cantidad: 1, Tipo: 'faltante_real' },
  ];
  const excel = [
    { codigo: '1', cantidad: 1, tipo: 'sobrante_real' },
    { codigo: '9246752773', cantidad: 1, tipo: 'faltante_real' },
  ];
  const p = planAjusteExcel(actuales, excel, (t) => t === 'faltante_real');
  assert.deepEqual(p.quitar.map((l) => l.LineaId).sort(), [2, 3]);
  assert.deepEqual(p.agregar.map((l) => [l.codigo, l.decStatus]), [['9246752773', 'aprobado']]);
  assert.equal(p.iguales, 1);
});
