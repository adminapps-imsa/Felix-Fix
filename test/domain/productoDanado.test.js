import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSICIONES,
  motivoNoEditable,
  motivoNoAgregarAdjunto,
  motivoNoEliminarAdjunto,
  motivoNoEnviarContabilidad,
  motivoNoEliminar,
  motivoNoEnviarProveedor,
  bloqueoReenvio,
  MAX_ENVIOS_PROVEEDOR,
} from '../../src/domain/productoDanado.js';

const docGof = { filename: 'a.pdf', etapa: 'gof' };
const adjProveedor = { filename: 'b.pdf' };

test('ruta de estados: Devolución aprobada → Gof → contabilidad → cerrado', () => {
  assert.deepEqual(TRANSICIONES.aprobar, { desde: 'Pendiente', hacia: 'Aprobado' });
  assert.deepEqual(TRANSICIONES.enviarAContabilidad, { desde: 'Aprobado', hacia: 'EnContabilidad' });
  assert.deepEqual(TRANSICIONES.registrarPago, { desde: 'EnContabilidad', hacia: 'Cerrado' });
  assert.deepEqual(TRANSICIONES.rechazar, { desde: 'Pendiente', hacia: 'Rechazado' });
  assert.deepEqual(TRANSICIONES.cerrarNf, { desde: 'Rechazado', hacia: 'Cerrado' });
});

test('correos y adjuntos del proveedor: solo en Pendiente o Aprobado', () => {
  assert.equal(motivoNoEditable('Pendiente'), null);
  assert.equal(motivoNoEditable('Aprobado'), null);
  for (const e of ['Rechazado', 'EnContabilidad', 'Cerrado']) assert.match(motivoNoEditable(e), /solo se pueden cambiar/);
});

test('Gof sube documentos solo con el reporte en Devolución aprobada', () => {
  assert.equal(motivoNoAgregarAdjunto('Aprobado', { gof: true }), null);
  assert.match(motivoNoAgregarAdjunto('Pendiente', { gof: true }), /mientras el reporte está con Gof/);
  assert.match(motivoNoAgregarAdjunto('EnContabilidad', { gof: true }), /mientras el reporte está con Gof/);
  assert.equal(motivoNoAgregarAdjunto('Pendiente'), null);
});

test('quitar adjunto: el documento de Gof ya enviado queda como registro', () => {
  assert.equal(motivoNoEliminarAdjunto('Aprobado', docGof), null);
  assert.match(motivoNoEliminarAdjunto('EnContabilidad', docGof), /ya se envió a contabilidad/);
  assert.equal(motivoNoEliminarAdjunto('Pendiente', adjProveedor), null);
  assert.match(motivoNoEliminarAdjunto('Cerrado', adjProveedor), /solo se pueden cambiar/);
});

test('enviar a contabilidad: requiere al menos un documento de Gof', () => {
  assert.match(motivoNoEnviarContabilidad([]), /Sube al menos un documento/);
  assert.match(motivoNoEnviarContabilidad([adjProveedor]), /Sube al menos un documento/);
  assert.equal(motivoNoEnviarContabilidad([adjProveedor, docGof]), null);
});

test('eliminar reporte: no en contabilidad, cerrado ni en SAP', () => {
  assert.equal(motivoNoEliminar('Pendiente'), null);
  assert.equal(motivoNoEliminar('Aprobado'), null);
  assert.equal(motivoNoEliminar('Rechazado'), null);
  for (const e of ['EnProceso', 'Procesado', 'EnContabilidad', 'Cerrado']) assert.ok(motivoNoEliminar(e));
});

test('enviar al proveedor: solo Pendiente, con tope y espera entre envíos', () => {
  assert.equal(motivoNoEnviarProveedor('Pendiente'), null);
  assert.ok(motivoNoEnviarProveedor('Aprobado'));

  const ahora = Date.parse('2026-10-14T12:00:00Z');
  assert.equal(bloqueoReenvio({ EnviosProveedor: 0 }, ahora), null);
  assert.match(bloqueoReenvio({ EnviosProveedor: MAX_ENVIOS_PROVEEDOR }, ahora), /máximo permitido/);
  assert.match(bloqueoReenvio({ EnviosProveedor: 1, EnviadoProveedorAt: '2026-10-14T11:57:00Z' }, ahora), /en 7 minutos/);
  assert.match(bloqueoReenvio({ EnviosProveedor: 1, EnviadoProveedorAt: '2026-10-14T11:50:30Z' }, ahora), /en 1 minuto\./);
  assert.equal(bloqueoReenvio({ EnviosProveedor: 1, EnviadoProveedorAt: '2026-10-14T11:49:00Z' }, ahora), null);
});
