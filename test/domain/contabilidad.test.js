import test from 'node:test';
import assert from 'node:assert/strict';
import { motivoNoResponder, motivoNoQuitarRespuesta } from '../../src/domain/contabilidad.js';

const pendiente = { Estado: 'pendiente' };
const reclamar = { Estado: 'pendiente', DecisionConta: 'reclamar' };

test('respuesta del proveedor: aprobado pide n.º de nota de crédito, no aprobado n.º de registro SAP; el documento es opcional', () => {
  assert.match(motivoNoResponder(reclamar, { respuesta: 'aprobado', registroSap: '' }).mensaje, /nota de crédito/);
  assert.match(motivoNoResponder(reclamar, { respuesta: 'no_aprobado', registroSap: '' }).mensaje, /registro SAP/);
  for (const respuesta of ['aprobado', 'no_aprobado']) {
    assert.equal(motivoNoResponder(reclamar, { respuesta, registroSap: '5100012345' }), null);
    assert.equal(motivoNoResponder(reclamar, { respuesta, registroSap: '' }).code, 'FALTA_REGISTRO_SAP');
    assert.equal(motivoNoResponder(reclamar, { respuesta, registroSap: '12 34' }).code, 'REGISTRO_SAP_INVALIDO');
  }
});

test('respuesta del proveedor: una sola vez; se quita solo si existe', () => {
  assert.equal(motivoNoResponder({ Estado: 'aprobado', DecisionConta: 'reclamar' }, { respuesta: 'no_aprobado', registroSap: '5100012345' }).code, 'YA_RESPONDIDO');
  assert.equal(motivoNoResponder(reclamar, { respuesta: 'quizas', registroSap: '5100012345' }).code, 'RESPUESTA_INVALIDA');
  assert.equal(motivoNoQuitarRespuesta(pendiente).code, 'SIN_RESPUESTA');
  assert.equal(motivoNoQuitarRespuesta({ Estado: 'no_aprobado' }), null);
});

test('reclamar o no: primero se decide; sin «reclamar» no hay envío ni respuesta', async () => {
  const { motivoNoDecidir, motivoNoQuitarDecision, motivoNoEnviarProveedor } = await import('../../src/domain/contabilidad.js');
  assert.equal(motivoNoDecidir(pendiente, { decision: 'reclamar' }), null);
  assert.equal(motivoNoDecidir(pendiente, { decision: 'no_reclamar', comentario: '' }).code, 'FALTA_MOTIVO');
  assert.equal(motivoNoDecidir(pendiente, { decision: 'no_reclamar', comentario: 'Monto menor' }), null);
  assert.equal(motivoNoDecidir({ Estado: 'pendiente', DecisionConta: 'reclamar' }, { decision: 'no_reclamar', comentario: 'x' }).code, 'YA_DECIDIDO');
  // Sin decidir reclamar: ni envío ni respuesta.
  assert.equal(motivoNoEnviarProveedor(pendiente).code, 'SIN_RECLAMAR');
  assert.equal(motivoNoResponder(pendiente, { respuesta: 'aprobado', registroSap: '5100012345' }).code, 'SIN_RECLAMAR');
  const reclamado = { Estado: 'pendiente', DecisionConta: 'reclamar' };
  assert.equal(motivoNoEnviarProveedor(reclamado), null);
  assert.equal(motivoNoResponder(reclamado, { respuesta: 'aprobado', registroSap: '5100012345' }), null);
  // Quitar la decisión: no si ya se envió o tiene respuesta.
  assert.equal(motivoNoQuitarDecision(reclamado), null);
  assert.equal(motivoNoQuitarDecision({ ...reclamado, EnviadoProveedorAt: new Date() }).code, 'YA_ENVIADO');
  assert.equal(motivoNoQuitarDecision({ Estado: 'aprobado', DecisionConta: 'reclamar' }).code, 'CON_RESPUESTA');
  assert.equal(motivoNoQuitarDecision({ Estado: 'no_reclamado', DecisionConta: 'no_reclamar' }), null);
});
