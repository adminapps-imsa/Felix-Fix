import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoNotaAprobada,
  motivoNoModificable,
  motivoNoEliminarAdjunto,
  motivoNoDecidir,
  motivoNoCambiarLineas,
  motivoNoEnviarContabilidad,
  normalizarDocSap,
  documentosDelReclamo,
  motivoDocsRepetidos,
  motivoDocsEnOtrosReclamos,
  motivoPdfDeOtroReclamo,
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

// ------------------------------------------------------------------
// Documentos SAP duplicados
// ------------------------------------------------------------------
const otro = (id, docs, status = 'pendiente') => ({ ReclamoId: id, Token: `T${id}`, Status: status, documentos: new Set(docs.map(normalizarDocSap)) });

test('documento SAP: ceros a la izquierda y espacios no lo hacen distinto', () => {
  assert.equal(normalizarDocSap(' 0004904151684 '), '4904151684');
  assert.equal(normalizarDocSap('4904151684'), '4904151684');
  assert.equal(normalizarDocSap('ab-12'), '12');
  assert.equal(normalizarDocSap('ABC'), 'ABC');
});

test('documentos de un reclamo: formulario, extras y los que traen sus PDF', () => {
  const docs = documentosDelReclamo({ SapDoc1: '0004904151684', SapDoc2: null, SapDoc3: '' }, ['4904151698'], [{ documentoSap: '4904487300' }, { tipo: 'excel' }]);
  assert.deepEqual([...docs].sort(), ['4904151684', '4904151698', '4904487300']);
});

test('el mismo documento dos veces en el formulario → no', () => {
  assert.equal(motivoDocsRepetidos(['4904151684', '4904151698']), null);
  const m = motivoDocsRepetidos(['4904151684', '0004904151684']);
  assert.equal(m.code, 'DOC_SAP_REPETIDO');
  assert.match(m.mensaje, /0004904151684 está escrito más de una vez/);
});

test('crear con un documento que ya está en otro reclamo → no, diciendo en cuál', () => {
  const otros = [otro(5, ['4904151684', '4904151698']), otro(12, ['4904151684'], 'resuelto'), otro(8, ['4904487300'])];
  assert.equal(motivoDocsEnOtrosReclamos(['4904999999'], otros), null);
  const m = motivoDocsEnOtrosReclamos(['004904151684', '4904999999'], otros);
  assert.equal(m.code, 'DOC_SAP_DUPLICADO');
  assert.match(m.mensaje, /004904151684 ya está en REC-000005, REC-000012/);
  assert.deepEqual(m.usados[0].reclamos.map((r) => r.numero), ['REC-000005', 'REC-000012']);
  // Varios documentos repetidos: se nombran todos.
  assert.match(motivoDocsEnOtrosReclamos(['4904151698', '4904487300'], otros).mensaje, /estos documentos SAP: 4904151698 ya está en REC-000005; 4904487300 ya está en REC-000008/);
});

test('adjuntar un PDF de SAP: de este reclamo o nuevo sí; de otro reclamo no', () => {
  const propios = new Set(['4904487300']);
  const otros = [otro(5, ['4904151684'])];
  assert.equal(motivoPdfDeOtroReclamo('4904487300', propios, otros), null); // es de este reclamo
  assert.equal(motivoPdfDeOtroReclamo('4911111111', propios, otros), null); // documento nuevo (p. ej. nota de débito)
  assert.equal(motivoPdfDeOtroReclamo(null, propios, otros), null); // PDF sin número legible
  const m = motivoPdfDeOtroReclamo('0004904151684', propios, otros);
  assert.equal(m.code, 'DOC_SAP_DE_OTRO_RECLAMO');
  assert.match(m.mensaje, /pertenece a REC-000005/);
});
