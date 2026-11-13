import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describirPeticion, clasificarPeticion, rolesVisibles, numeroCaso } from '../../src/domain/bitacora.js';

const T = '3f2c1d4e-0000-4000-8000-000000000044';

test('describe las acciones en palabras, con su caso', () => {
  assert.deepEqual(describirPeticion('POST', '/reclamos'), { modulo: 'reclamos', accion: 'Creó un reclamo', recursoTipo: null, recursoId: null });
  assert.deepEqual(describirPeticion('PUT', `/reclamos/${T}/excel`), {
    modulo: 'reclamos',
    accion: 'Reemplazó el Excel del reclamo',
    recursoTipo: 'reclamo',
    recursoId: T,
  });
  assert.equal(describirPeticion('POST', `/reclamos/${T}/lineas/3/decision`).accion, 'Decidió un producto');
  assert.equal(describirPeticion('POST', `/reclamos/${T}/lineas/decision`).accion, 'Decidió varios productos');
  assert.equal(describirPeticion('DELETE', `/reclamos/${T}`).accion, 'Eliminó el reclamo');
  assert.deepEqual(describirPeticion('PATCH', '/productos-danados/52/aprobar'), {
    modulo: 'productos_danados',
    accion: 'Aprobó el reporte',
    recursoTipo: 'reporte',
    recursoId: '52',
  });
  assert.equal(describirPeticion('POST', '/configuracion/correos/bienvenida/enviar').accion, 'Envió el correo de bienvenida');
  assert.equal(describirPeticion('POST', '/auth/keycloak-code').modulo, 'sesion');
});

test('lo que no está en la tabla igual se describe por su ruta y módulo', () => {
  assert.deepEqual(describirPeticion('GET', '/reclamos/abc?x=1'), { modulo: 'reclamos', accion: 'Consultó /reclamos/abc', recursoTipo: null, recursoId: null });
  assert.equal(describirPeticion('GET', '/otra/cosa').modulo, 'sistema');
});

test('actividad, aviso (4xx) o falla (5xx); las lecturas que salen bien no se anotan', () => {
  assert.deepEqual(clasificarPeticion('POST', '/reclamos', 201), { clase: 'actividad', nivel: 'info' });
  assert.equal(clasificarPeticion('GET', '/reclamos', 200), null);
  assert.deepEqual(clasificarPeticion('POST', '/reclamos', 400), { clase: 'error', nivel: 'aviso' });
  assert.deepEqual(clasificarPeticion('GET', '/reclamos/x', 404), { clase: 'error', nivel: 'aviso' });
  assert.deepEqual(clasificarPeticion('GET', '/tablero', 500), { clase: 'error', nivel: 'falla' });
  assert.equal(clasificarPeticion('GET', '/auth/me', 401), null);
  assert.equal(clasificarPeticion('GET', '/health', 500), null);
});

test('roles sin los internos de Keycloak; número del caso', () => {
  assert.deepEqual(rolesVisibles(new Set(['Compradora', 'default-roles-felix', 'offline_access', 'uma_authorization', 'Gof'])), ['Compradora', 'Gof']);
  assert.equal(numeroCaso('reclamo', 44, T), 'REC-000044');
  assert.equal(numeroCaso('reporte', null, '52'), 'PD-52');
  assert.equal(numeroCaso(null, null, null), null);
});
