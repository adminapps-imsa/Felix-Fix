import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esSucursalDe, veReporte, veReclamo, motivoTiendaReporte, motivoTiendaReclamo } from '../../src/domain/tienda.js';

const VE = { tiendaId: 1, codigo: 'TD04', nombre: 'Vía España', soloPropios: false, username: 'gperez' };
const MP = { tiendaId: 2, codigo: 'TD15', nombre: 'Multiplaza', soloPropios: false, username: 'mp1' };

test('sin alcance ve todo', () => {
  assert.equal(veReporte(null, { TiendaId: 9 }), true);
  assert.equal(veReclamo(null, { Origen: 'cedi' }), true);
  assert.equal(motivoTiendaReporte(null, 9), null);
  assert.equal(motivoTiendaReclamo(null, { origen: 'cedi' }), null);
});

test('la sucursal se reconoce por nombre o código, sin acentos ni mayúsculas', () => {
  assert.equal(esSucursalDe('via españa ', VE), true);
  assert.equal(esSucursalDe('td04', VE), true);
  assert.equal(esSucursalDe('Multiplaza', VE), false);
  assert.equal(esSucursalDe('', VE), false);
});

test('Productos Dañados: los de MP no ven los de VE', () => {
  assert.equal(veReporte(MP, { TiendaId: 1, EmpleadoReportaUsuario: 'x' }), false);
  assert.equal(veReporte(MP, { TiendaId: 2, EmpleadoReportaUsuario: 'x' }), true);
});

test('Reclamos: solo los de Tienda con su sucursal; CEDI no', () => {
  assert.equal(veReclamo(VE, { Origen: 'tienda', Sucursal: 'Vía España' }), true);
  assert.equal(veReclamo(VE, { Origen: 'tienda', Sucursal: 'Multiplaza' }), false);
  assert.equal(veReclamo(VE, { Origen: 'cedi', Sucursal: null }), false);
});

test('Solo lo que crea: además, solo lo suyo (con o sin tienda)', () => {
  const giovanni = { ...VE, soloPropios: true };
  assert.equal(veReporte(giovanni, { TiendaId: 1, EmpleadoReportaUsuario: 'GPerez' }), true);
  assert.equal(veReporte(giovanni, { TiendaId: 1, EmpleadoReportaUsuario: 'otro' }), false);
  const sinTienda = { tiendaId: null, soloPropios: true, username: 'gperez' };
  assert.equal(veReporte(sinTienda, { TiendaId: 2, EmpleadoReportaUsuario: 'gperez' }), true);
  assert.equal(veReclamo(sinTienda, { Origen: 'cedi', CreatedBy: 'gperez' }), true);
  assert.equal(veReclamo(sinTienda, { Origen: 'cedi', CreatedBy: 'otra' }), false);
  // Sin username no ve nada.
  assert.equal(veReporte({ tiendaId: null, soloPropios: true, username: '' }, { EmpleadoReportaUsuario: '' }), false);
});

test('al crear: solo su tienda', () => {
  assert.equal(motivoTiendaReporte(VE, 1), null);
  assert.match(motivoTiendaReporte(VE, 2), /Vía España/);
  assert.equal(motivoTiendaReclamo(VE, { origen: 'tienda', sucursal: 'Vía España' }), null);
  assert.match(motivoTiendaReclamo(VE, { origen: 'tienda', sucursal: 'Albrook' }), /tu tienda/);
  assert.match(motivoTiendaReclamo(VE, { origen: 'cedi', sucursal: '' }), /CEDI/);
  // «Solo lo que crea» sin tienda no limita la tienda al crear.
  assert.equal(motivoTiendaReporte({ tiendaId: null, soloPropios: true }, 5), null);
});

test('quien creó el caso siempre lo ve, aunque la sucursal no sea su tienda (Dixa, 13-nov)', () => {
  const dixa = { ...MP, username: 'dixa' };
  assert.equal(veReclamo(dixa, { Origen: 'tienda', Sucursal: 'MULTIPLAZA PACIFIC', CreatedBy: 'Dixa' }), true);
  assert.equal(veReclamo(dixa, { Origen: 'cedi', Sucursal: null, CreatedBy: 'dixa' }), true);
  assert.equal(veReclamo(dixa, { Origen: 'tienda', Sucursal: 'Vía España', CreatedBy: 'otra' }), false);
  assert.equal(veReporte(dixa, { TiendaId: 1, EmpleadoReportaUsuario: 'dixa' }), true);
  assert.equal(veReporte(dixa, { TiendaId: 1, EmpleadoReportaUsuario: 'otra' }), false);
});
