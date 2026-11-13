import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planNotificados } from '../../sql/migrations/039_reclamos_notificados_con_faltantes.js';
import { esSoloNotificacion, estadoAlCrear } from '../../src/domain/reclamo.js';
import { TIPOS_SOLO_NOTIFICACION } from '../../src/services/reclamos/tipos.js';

const auto = (Tipo) => ({ Tipo, DecStatus: 'aprobado', DecBy: 'sistema' });

test('REC-000044 (NOIR): averías + faltantes ya no es solo notificación; nace cerrado automáticamente', () => {
  const lineas = [{ tipo: 'danos_textil' }, { tipo: 'danos_textil' }, { tipo: 'faltante_real' }, { tipo: 'faltante_real' }];
  assert.equal(esSoloNotificacion({ tipo: 'danos_textil', lineas }, TIPOS_SOLO_NOTIFICACION), false);
  assert.equal(esSoloNotificacion({ tipo: 'danos_textil', lineas: lineas.slice(0, 2) }, TIPOS_SOLO_NOTIFICACION), true);
  assert.equal(esSoloNotificacion({ tipo: 'faltante_real', lineas: lineas.slice(0, 2) }, TIPOS_SOLO_NOTIFICACION), false);
  assert.equal(estadoAlCrear({ soloNotificacion: false, lineas: lineas.map((l) => ({ ...l, decStatus: 'aprobado' })) }), 'resuelto');
});

test('migración 039: solo los notificados que mezclan otros productos', () => {
  const reclamos = [
    { ReclamoId: 44, Token: 'a', Tipo: 'danos_textil' },
    { ReclamoId: 50, Token: 'b', Tipo: 'danos_textil' },
    { ReclamoId: 51, Token: 'c', Tipo: 'danos_textil' },
  ];
  const lineas = new Map([
    ['a', [auto('danos_textil'), auto('danos_textil'), auto('faltante_real'), auto('faltante_real')]],
    ['b', [auto('danos_textil')]],
    ['c', [auto('danos_textil'), { Tipo: 'sobrante_real', DecStatus: 'pendiente', DecBy: null }]],
  ]);
  assert.deepEqual(planNotificados(reclamos, lineas), [
    { reclamoId: 44, status: 'resuelto' },
    { reclamoId: 51, status: 'pendiente' },
  ]);
});
