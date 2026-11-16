import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unirPermisos } from '../../src/services/acceso/acceso.js';

const gof = ['reclamos.ver', 'reclamos.crear', 'reclamos.solo_tienda'];
const torre = ['reclamos.ver', 'reclamos.crear', 'reclamos.solo_cedi'];
const compradora = ['reclamos.ver', 'reclamos.decidir'];
const tienda = ['productos_danados.crear', 'productos_danados.ver', 'productos_danados.solo_propios'];

test('Gof + Torre de Control (Ana): crea de Tienda y de CEDI', () => {
  const p = unirPermisos([gof, torre, compradora]);
  assert.equal(p.has('reclamos.solo_tienda'), false);
  assert.equal(p.has('reclamos.solo_cedi'), false);
  assert.equal(p.has('reclamos.crear'), true);
});

test('un solo rol que crea: su limitación sigue', () => {
  assert.equal(unirPermisos([gof]).has('reclamos.solo_tienda'), true);
  assert.equal(unirPermisos([torre]).has('reclamos.solo_cedi'), true);
  // Un rol que no crea reclamos (Compradora) no quita la limitación.
  assert.equal(unirPermisos([gof, compradora]).has('reclamos.solo_tienda'), true);
  // Otro rol que crea sin limitación sí la quita.
  assert.equal(unirPermisos([gof, ['reclamos.crear']]).has('reclamos.solo_tienda'), false);
});

test('«Solo los reportes que creó» se suma como antes', () => {
  assert.equal(unirPermisos([tienda, compradora]).has('productos_danados.solo_propios'), true);
});

test('solo asignables: Configuración no pasa por rol', () => {
  assert.equal(unirPermisos([['configuracion.administrar', 'reclamos.ver']]).has('configuracion.administrar'), false);
});
