import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoNotaAprobada,
  motivoNoModificable,
  motivoNoEliminarAdjunto,
  motivoNoDecidir,
  motivoNoCambiarLineas,
  motivoNoEnviarContabilidad,
} from '../../src/domain/reclamo.js';

const pdfValidado = { tipo: 'pdf', notaAprobada: true };
const pdfSinValidar = { tipo: 'pdf' };
const enviado = '2026-10-14T12:00:00Z';

test('nota aprobada: se requiere solo si hay productos aprobados', () => {
  assert.deepEqual(estadoNotaAprobada({ LineasAprobadas: 0 }, []), { RequiereNotaAprobada: false, TieneNotaAprobada: false });
  assert.deepEqual(estadoNotaAprobada({ LineasAprobadas: 3 }, [pdfSinValidar]), { RequiereNotaAprobada: true, TieneNotaAprobada: false });
  assert.deepEqual(estadoNotaAprobada({ LineasAprobadas: '3' }, [pdfSinValidar, pdfValidado]), { RequiereNotaAprobada: true, TieneNotaAprobada: true });
  // Un Excel marcado no cuenta como nota de débito.
  assert.equal(estadoNotaAprobada({ LineasAprobadas: 1 }, [{ tipo: 'xlsx', notaAprobada: true }]).TieneNotaAprobada, false);
});

test('modificable: pendiente sí; cerrado o enviado no', () => {
  assert.equal(motivoNoModificable({ Status: 'pendiente' }, 'adjuntos'), null);
  assert.equal(motivoNoModificable({ Status: 'pendiente' }, 'eliminar'), null);
  for (const Status of ['resuelto', 'rechazado']) {
    const m = motivoNoModificable({ Status }, 'eliminar');
    assert.equal(m.code, 'RECLAMO_BLOQUEADO');
    assert.match(m.mensaje, new RegExp(`ya está cerrado \\(${Status}\\); no se puede eliminar`));
  }
  assert.match(motivoNoModificable({ Status: 'pendiente', EnviadoContabilidadAt: enviado }, 'adjuntos').mensaje, /ya se envió a contabilidad; no se pueden agregar/);
});

test('modificable: Torre de Control / Gof agregan adjuntos aunque esté cerrado o enviado, pero no eliminan', () => {
  const cerradoYEnviado = { Status: 'resuelto', EnviadoContabilidadAt: enviado };
  assert.equal(motivoNoModificable(cerradoYEnviado, 'adjuntos', { agregaTorreControl: true }), null);
  assert.notEqual(motivoNoModificable(cerradoYEnviado, 'eliminar', { agregaTorreControl: true }), null);
});

test('eliminar adjunto: cerrado sí (admin), enviado a contabilidad no', () => {
  assert.equal(motivoNoEliminarAdjunto({ Status: 'resuelto' }), null);
  assert.equal(motivoNoEliminarAdjunto({ Status: 'resuelto', EnviadoContabilidadAt: enviado }).code, 'RECLAMO_BLOQUEADO');
});

test('decidir el reclamo: no si es notificado ni con productos pendientes', () => {
  assert.match(motivoNoDecidir({ Status: 'notificado', LineasPendientes: 0 }).mensaje, /solo de notificación/);
  const m = motivoNoDecidir({ Status: 'pendiente', LineasPendientes: 4 });
  assert.equal(m.code, 'LINEAS_PENDIENTES');
  assert.match(m.mensaje, /\(4 pendientes\)/);
  assert.equal(motivoNoDecidir({ Status: 'pendiente', LineasPendientes: 0 }), null);
});

test('decidir productos: no con el reclamo cerrado', () => {
  assert.equal(motivoNoCambiarLineas({ Status: 'pendiente' }), null);
  assert.notEqual(motivoNoCambiarLineas({ Status: 'resuelto' }), null);
  assert.notEqual(motivoNoCambiarLineas({ Status: 'rechazado' }), null);
});

test('enviar a contabilidad: solo cerrado y, si hay aprobados, con la nota validada', () => {
  assert.match(motivoNoEnviarContabilidad({ Status: 'pendiente' }, []).mensaje, /Primero la compradora debe cerrar/);
  assert.match(motivoNoEnviarContabilidad({ Status: 'notificado' }, []).mensaje, /Primero la compradora debe cerrar/);
  assert.equal(motivoNoEnviarContabilidad({ Status: 'resuelto', LineasAprobadas: 2 }, [pdfSinValidar]).code, 'FALTA_NOTA_APROBADA');
  assert.equal(motivoNoEnviarContabilidad({ Status: 'resuelto', LineasAprobadas: 2 }, [pdfValidado]), null);
  // Todo rechazado: no hay nada aprobado que respaldar con la nota.
  assert.equal(motivoNoEnviarContabilidad({ Status: 'rechazado', LineasAprobadas: 0 }, []), null);
});
