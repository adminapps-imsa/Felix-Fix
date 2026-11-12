import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsearPlantilla } from '../../src/services/reclamos/excelParser.js';
import { planRec42 } from '../../sql/migrations/034_prod_rec42_sobrante_no_esperado.js';

// Los 3 faltantes que REC-000042 tiene hoy en Prod.
const ACTUALES = [
  { Posicion: 1, CodigoBarra: '2050039046041', Cantidad: 1, Tipo: 'faltante_real' },
  { Posicion: 2, CodigoBarra: '2050039046409', Cantidad: 1, Tipo: 'faltante_real' },
  { Posicion: 3, CodigoBarra: '2050039046775', Cantidad: 1, Tipo: 'faltante_real' },
];
const ARCHIVO = '/opt/23326 - SUGAR + LIPS.xlsx';

test('034: con el Excel de SUGAR LIPS agrega los 4 sobrantes no esperados detrás de los faltantes', { skip: !fs.existsSync(ARCHIVO) }, () => {
  const excel = parsearPlantilla(fs.readFileSync(ARCHIVO));
  const sap = { disponible: true, productos: new Map([['194763529455', {}]]) };
  const plan = planRec42(ACTUALES, excel, sap);
  assert.deepEqual(
    plan.agregar.map((l) => [l.posicion, l.codigoBarra, l.referencia, l.talla, l.cantidad, l.esperaData]),
    [
      [4, '194763529455', 'STT19391A', 'XL', 1, false],
      [5, '194763440217', 'STD13554S', 'XL', 1, true],
      [6, '194763446479', 'STT18576', 'XL', 1, true],
      [7, null, 'STP7685', 'XL', 1, true],
    ]
  );
  // Ya aplicado, faltantes distintos o SAP caído: no toca nada.
  assert.deepEqual(planRec42([...ACTUALES, { Posicion: 4, Tipo: 'sobrante_no_esperado' }], excel, sap), { yaEstaba: true });
  assert.match(planRec42(ACTUALES.slice(0, 2), excel, sap).error, /no cuadran/);
  assert.match(planRec42(ACTUALES, excel, { disponible: false, productos: new Map() }).error, /SAP no responde/);
});
