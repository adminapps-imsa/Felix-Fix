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
  motivoNotaNoCuadra,
  esNotaAprobada,
  motivoNotasYaNoCuadran,
  estadoAlCrear,
} from '../../src/domain/reclamo.js';

const pdfValidado = { tipo: 'pdf', notaAprobada: true };
const pdfSinValidar = { tipo: 'pdf' };
const enviado = '2026-10-14T12:00:00Z';

test('nota aprobada (912): se requiere solo si hay sobrantes aprobados', () => {
  assert.deepEqual(estadoNotaAprobada({ LineasSobranteAprobadas: 0 }, []), { RequiereNotaAprobada: false, TieneNotaAprobada: false });
  assert.deepEqual(estadoNotaAprobada({ LineasSobranteAprobadas: 3 }, [pdfSinValidar]), { RequiereNotaAprobada: true, TieneNotaAprobada: false });
  assert.deepEqual(estadoNotaAprobada({ LineasSobranteAprobadas: '3' }, [pdfSinValidar, pdfValidado]), { RequiereNotaAprobada: true, TieneNotaAprobada: true });
  // Faltante, devolución o daños aprobados solos (sin sobrante aprobado): basta el 911.
  assert.equal(estadoNotaAprobada({ LineasAprobadas: 5, LineasSobranteAprobadas: 0 }, [pdfSinValidar]).RequiereNotaAprobada, false);
  // Un Excel marcado no cuenta como nota de débito.
  assert.equal(estadoNotaAprobada({ LineasSobranteAprobadas: 1 }, [{ tipo: 'xlsx', notaAprobada: true }]).TieneNotaAprobada, false);
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

test('enviar a contabilidad: solo cerrado y, si hay sobrantes aprobados, con la nota 912 validada', () => {
  assert.match(motivoNoEnviarContabilidad({ Status: 'pendiente' }, []).mensaje, /Primero la compradora debe cerrar/);
  assert.match(motivoNoEnviarContabilidad({ Status: 'notificado' }, []).mensaje, /Primero la compradora debe cerrar/);
  assert.equal(motivoNoEnviarContabilidad({ Status: 'resuelto', LineasAprobadas: 2, LineasSobranteAprobadas: 1 }, [pdfSinValidar]).code, 'FALTA_NOTA_APROBADA');
  assert.equal(motivoNoEnviarContabilidad({ Status: 'resuelto', LineasAprobadas: 2, LineasSobranteAprobadas: 1 }, [pdfValidado]), null);
  // Solo faltante / devolución / daños (aprobados solos): sale con el 911, sin 912.
  assert.equal(motivoNoEnviarContabilidad({ Status: 'resuelto', LineasAprobadas: 4, LineasSobranteAprobadas: 0 }, [pdfSinValidar]), null);
  // Sobrante rechazado combinado con faltante: solo el 911.
  assert.equal(motivoNoEnviarContabilidad({ Status: 'rechazado', LineasAprobadas: 2, LineasSobranteAprobadas: 0 }, []), null);
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

// Filas de una nota ya cruzadas con el reclamo (forma de `cruzar(...).lineas`).
const fila = (posicion, decision, extra = {}) => ({ lineaId: posicion, posicion, codigoBarra: `750${posicion}`, descripcion: `PROD ${posicion}`, decision, ...extra });
const fuera = { lineaId: null, posicion: null, decision: null, descripcion: 'OTRO, M', material: '400-1' };

test('nota de débito: solo productos aprobados del reclamo', () => {
  assert.equal(motivoNotaNoCuadra([fila(1, 'aprobado'), fila(2, 'aprobado')], '4904'), null);
  assert.equal(esNotaAprobada([fila(1, 'aprobado')]), true);
  // Sin productos del reclamo no es una nota de débito: no se rechaza, pero tampoco cuenta como aprobada.
  assert.equal(motivoNotaNoCuadra([]), null);
  assert.equal(esNotaAprobada([]), false);

  const rech = motivoNotaNoCuadra([fila(1, 'aprobado'), fila(3, 'rechazado')], '4904');
  assert.equal(rech.code, 'PDF_PRODUCTO_RECHAZADO');
  assert.deepEqual(rech.productos, [3]);
  assert.match(rech.mensaje, /\(documento 4904\)\. Trae 1 producto\(s\) rechazado\(s\).*#3 7503 PROD 3/);

  assert.equal(motivoNotaNoCuadra([fila(2, null)]).code, 'PDF_PRODUCTO_SIN_APROBAR');
  assert.equal(motivoNotaNoCuadra([fila(1, 'aprobado'), fuera]).code, 'PDF_PRODUCTO_NO_EN_RECLAMO');
  assert.equal(esNotaAprobada([fila(1, 'aprobado'), fuera]), false);
});

test('envío a contabilidad: las notas validadas se recomprueban con las decisiones actuales', () => {
  const nota = (lineas, extra = {}) => ({ nombre: 'nota.pdf', numeroDocumento: '4904', legible: true, lineas, ...extra });
  assert.equal(motivoNotasYaNoCuadran([]), null);
  assert.equal(motivoNotasYaNoCuadran([nota([fila(1, 'aprobado')])]), null);

  // Se validó con el #2 aprobado; después se deshizo y se rechazó.
  const m = motivoNotasYaNoCuadran([nota([fila(1, 'aprobado')]), nota([fila(2, 'rechazado')], { nombre: 'otra.pdf' })]);
  assert.equal(m.code, 'NOTA_NO_CUADRA');
  assert.deepEqual(m.productos, [2]);
  assert.match(m.mensaje, /«otra\.pdf» ya no cuadra/);

  assert.equal(motivoNotasYaNoCuadran([nota([fila(2, null)])]).code, 'NOTA_NO_CUADRA');
  assert.match(motivoNotasYaNoCuadran([nota([], { legible: false })]).mensaje, /Ya no se puede leer el PDF/);
  assert.match(motivoNotasYaNoCuadran([nota([fuera])]).mensaje, /no están en este reclamo/);
});

test('fecha de llegada de la mercancía: obligatoria, real y no futura', async () => {
  const { motivoFechaLlegadaInvalida } = await import('../../src/domain/reclamo.js');
  const hoy = '2026-10-20';
  assert.equal(motivoFechaLlegadaInvalida('2026-10-20', hoy), null);
  assert.equal(motivoFechaLlegadaInvalida('2026-09-30', hoy), null);
  assert.match(motivoFechaLlegadaInvalida('', hoy).mensaje, /Indica la fecha/);
  assert.match(motivoFechaLlegadaInvalida(undefined, hoy).mensaje, /Indica la fecha/);
  assert.match(motivoFechaLlegadaInvalida('2026-02-30', hoy).mensaje, /no es válida/);
  assert.match(motivoFechaLlegadaInvalida('20/10/2026', hoy).mensaje, /no es válida/);
  assert.match(motivoFechaLlegadaInvalida('2026-10-21', hoy).mensaje, /posterior a hoy/);
  assert.equal(motivoFechaLlegadaInvalida('2026-10-21', hoy).code, 'FECHA_LLEGADA');
});

test('devolver: solo un reclamo pendiente, con quien lo creó y con comentario', async () => {
  const { motivoNoDevolver } = await import('../../src/domain/reclamo.js');
  const r = { Status: 'pendiente', CreatedBy: 'kmojica' };
  assert.equal(motivoNoDevolver(r, 'El documento SAP no es el de esta factura'), null);
  assert.equal(motivoNoDevolver(r, '  ok ').code, 'FALTA_COMENTARIO');
  assert.equal(motivoNoDevolver({ ...r, Status: 'devuelto' }, 'texto largo').code, 'RECLAMO_DEVUELTO');
  assert.equal(motivoNoDevolver({ ...r, Status: 'resuelto' }, 'texto largo').code, 'NO_DEVOLVIBLE');
  assert.equal(motivoNoDevolver({ ...r, Status: 'notificado' }, 'texto largo').code, 'NO_DEVOLVIBLE');
  assert.equal(motivoNoDevolver({ ...r, CreatedBy: null }, 'texto largo').code, 'NO_DEVOLVIBLE');
});

test('devuelto: la compradora no decide ni cambia productos hasta que se reenvíe', async () => {
  const { motivoNoDecidir, motivoNoCambiarLineas } = await import('../../src/domain/reclamo.js');
  assert.equal(motivoNoDecidir({ Status: 'devuelto', LineasPendientes: 0 }).code, 'RECLAMO_DEVUELTO');
  assert.equal(motivoNoCambiarLineas({ Status: 'devuelto' }).code, 'RECLAMO_DEVUELTO');
  assert.equal(motivoNoCambiarLineas({ Status: 'pendiente' }), null);
});

test('corregir: solo quien lo creó (o el administrador) y solo devuelto', async () => {
  const { motivoNoCorregir } = await import('../../src/domain/reclamo.js');
  const r = { Status: 'devuelto', CreatedBy: 'kmojica' };
  assert.equal(motivoNoCorregir(r, { username: 'kmojica' }), null);
  assert.equal(motivoNoCorregir(r, { username: 'otra', esAdmin: true }), null);
  assert.equal(motivoNoCorregir(r, { username: 'otra' }).code, 'NO_ES_CREADOR');
  assert.equal(motivoNoCorregir({ ...r, Status: 'pendiente' }, { username: 'kmojica' }).code, 'NO_DEVUELTO');
});

test('reenviar: cada documento SAP con su PDF y sin PDF de un documento quitado', async () => {
  const { motivoNoReenviar } = await import('../../src/domain/reclamo.js');
  const r = { Status: 'devuelto', CreatedBy: 'kmojica' };
  const u = { username: 'kmojica' };
  const pdf = (documento, nombre = `${documento}.pdf`) => ({ nombre, documento });
  assert.equal(motivoNoReenviar(r, u, { docs: ['4904151684'], pdfs: [pdf('0004904151684')] }), null);
  assert.equal(motivoNoReenviar(r, u, { docs: ['4904151684', '4904151698'], pdfs: [pdf('4904151684')] }).code, 'FALTAN_PDF_SAP');
  assert.deepEqual(motivoNoReenviar(r, u, { docs: ['4904151698'], pdfs: [pdf('4904151698'), pdf('4904151684', 'viejo.pdf')] }).code, 'PDF_DE_DOC_QUITADO');
  // Una foto o un PDF sin documento conocido no estorban.
  assert.equal(motivoNoReenviar(r, u, { docs: ['4904151698'], pdfs: [pdf('4904151698'), { nombre: 'foto.pdf', documento: null }] }), null);
  assert.equal(motivoNoReenviar(r, u, { docs: [], pdfs: [] }).code, 'FALTA_DOC_SAP');
  assert.equal(motivoNoReenviar(r, u, { docs: [], pdfs: [], documentoOpcional: true }), null);
  assert.equal(motivoNoReenviar({ ...r, Status: 'pendiente' }, u, { docs: ['1'], pdfs: [pdf('1')] }).code, 'NO_DEVUELTO');
});

test('retiro del proveedor: solo en devoluciones, con foto y un día real no futuro', async () => {
  const { esDevolucion, motivoNoRegistrarRetiro } = await import('../../src/domain/reclamo.js');
  const hoy = '2026-10-20';
  assert.equal(esDevolucion({ Tipo: 'devolucion', LineasDevolucion: 0 }), true);
  assert.equal(esDevolucion({ Tipo: 'sobrante_real', LineasDevolucion: 2 }), true);
  assert.equal(esDevolucion({ Tipo: 'sobrante_real', LineasDevolucion: 0 }), false);
  const dev = { Tipo: 'devolucion' };
  assert.equal(motivoNoRegistrarRetiro(dev, { fecha: '2026-10-20', tieneFoto: true, hoy }), null);
  assert.equal(motivoNoRegistrarRetiro({ Tipo: 'faltante_real' }, { fecha: '2026-10-20', tieneFoto: true, hoy }).code, 'SIN_RETIRO');
  // Otro tipo al que se le contestó «sí, lo retira el proveedor».
  assert.equal(motivoNoRegistrarRetiro({ Tipo: 'danos_perfumeria_gof', RetiroProveedor: true }, { fecha: '2026-10-20', tieneFoto: true, hoy }), null);
  assert.equal(motivoNoRegistrarRetiro(dev, { fecha: '2026-10-20', tieneFoto: false, hoy }).code, 'FALTA_FOTO_RETIRO');
  assert.equal(motivoNoRegistrarRetiro(dev, { fecha: '', tieneFoto: true, hoy }).code, 'FECHA_RETIRO');
  assert.match(motivoNoRegistrarRetiro(dev, { fecha: '2026-02-30', tieneFoto: true, hoy }).mensaje, /no es una fecha válida/);
  assert.match(motivoNoRegistrarRetiro(dev, { fecha: '2026-10-21', tieneFoto: true, hoy }).mensaje, /posterior a hoy/);
});

test('lleva retiro: devoluciones siempre; los demás si se contestó que sí; termina con la entrega', async () => {
  const { llevaRetiro, esperaRetiro } = await import('../../src/domain/reclamo.js');
  assert.equal(llevaRetiro({ Tipo: 'devolucion', RetiroProveedor: false }), true);
  assert.equal(llevaRetiro({ Tipo: 'faltante_real', LineasDevolucion: 1, RetiroProveedor: null }), true);
  assert.equal(llevaRetiro({ Tipo: 'danos_perfumeria_gof', RetiroProveedor: true }), true);
  assert.equal(llevaRetiro({ Tipo: 'danos_perfumeria_gof', RetiroProveedor: false }), false);
  // Creados antes de la pregunta: solo si son de devolución.
  assert.equal(llevaRetiro({ Tipo: 'sobrante_real', RetiroProveedor: null }), false);
  assert.equal(esperaRetiro({ Tipo: 'diferencias', RetiroProveedor: true, RetiroProveedorFecha: null }), true);
  assert.equal(esperaRetiro({ Tipo: 'diferencias', RetiroProveedor: true, RetiroProveedorFecha: '2026-11-02' }), false);
  assert.equal(esperaRetiro({ Tipo: 'diferencias', RetiroProveedor: false, RetiroProveedorFecha: null }), false);
});

test('cambiar si lo retira el proveedor: quien lo creó o el administrador, no en devolución ni ya entregado', async () => {
  const { motivoNoCambiarRetiro } = await import('../../src/domain/reclamo.js');
  const r = { Tipo: 'danos_textil', CreatedBy: 'tienda1', RetiroProveedor: true, RetiroProveedorFecha: null };
  assert.equal(motivoNoCambiarRetiro(r, { username: 'tienda1' }), null);
  assert.equal(motivoNoCambiarRetiro(r, { username: 'otra', esAdmin: true }), null);
  assert.equal(motivoNoCambiarRetiro(r, { username: 'otra' }).code, 'NO_ES_CREADOR');
  assert.equal(motivoNoCambiarRetiro({ ...r, Tipo: 'devolucion' }, { username: 'tienda1' }).code, 'ES_DEVOLUCION');
  assert.equal(motivoNoCambiarRetiro({ ...r, RetiroProveedorFecha: '2026-11-01' }, { username: 'tienda1' }).code, 'RETIRO_REGISTRADO');
});

test('excel: el motivo «devolución» se reconoce como tipo devolucion', async () => {
  const { detectarTipoPorMotivo } = await import('../../src/services/reclamos/excelParser.js');
  for (const t of ['DEVOLUCIÓN', 'Devolucion al proveedor', 'devoluciones']) assert.equal(detectarTipoPorMotivo(t), 'devolucion');
  assert.equal(detectarTipoPorMotivo('FALTANTE REAL'), 'faltante_real');
  assert.equal(detectarTipoPorMotivo('SOBRANTE'), 'sobrante_real');
  assert.equal(detectarTipoPorMotivo('DIFERENCIAS (SOBRANTE)'), 'diferencias');
});

// ------------------------------------------------------------------
// Devolución del supervisor GOF
// ------------------------------------------------------------------

test('supervisor GOF: devuelve en cualquier estado antes de contabilidad, con motivo', async () => {
  const { motivoNoDevolverSupervisor } = await import('../../src/domain/reclamo.js');
  const motivo = 'El PDF adjunto no es el de esta factura';
  for (const Status of ['pendiente', 'notificado', 'resuelto', 'rechazado']) {
    assert.equal(motivoNoDevolverSupervisor({ Status, CreatedBy: 'ana' }, motivo), null, Status);
  }
  assert.equal(motivoNoDevolverSupervisor({ Status: 'devuelto', CreatedBy: 'ana' }, motivo).code, 'RECLAMO_DEVUELTO');
  assert.equal(motivoNoDevolverSupervisor({ Status: 'resuelto', CreatedBy: 'ana', EnviadoContabilidadAt: new Date() }, motivo).code, 'NO_DEVOLVIBLE');
  assert.equal(motivoNoDevolverSupervisor({ Status: 'pendiente', CreatedBy: null }, motivo).code, 'NO_DEVOLVIBLE');
  assert.equal(motivoNoDevolverSupervisor({ Status: 'pendiente', CreatedBy: 'ana' }, ' mal ').code, 'FALTA_COMENTARIO');
});

test('al reenviar vuelve al estado de antes; cerrado con productos por decidir vuelve a pendiente', async () => {
  const { estadoAlReenviar } = await import('../../src/domain/reclamo.js');
  assert.equal(estadoAlReenviar({ StatusAntesDevolucion: null, LineasPendientes: 0 }), 'pendiente');
  assert.equal(estadoAlReenviar({ StatusAntesDevolucion: 'pendiente', LineasPendientes: 3 }), 'pendiente');
  assert.equal(estadoAlReenviar({ StatusAntesDevolucion: 'notificado', LineasPendientes: 0 }), 'notificado');
  assert.equal(estadoAlReenviar({ StatusAntesDevolucion: 'resuelto', LineasPendientes: 0 }), 'resuelto');
  assert.equal(estadoAlReenviar({ StatusAntesDevolucion: 'rechazado', LineasPendientes: 0 }), 'rechazado');
  assert.equal(estadoAlReenviar({ StatusAntesDevolucion: 'resuelto', LineasPendientes: 2 }), 'pendiente');
  assert.equal(estadoAlReenviar({ StatusAntesDevolucion: 'devuelto', LineasPendientes: 0 }), 'pendiente');
});

test('corregir productos: conserva los iguales, redecide los cambiados, agrega y quita', async () => {
  const { planCorreccionLineas } = await import('../../src/domain/reclamo.js');
  const esAuto = (t) => t === 'faltante_real';
  const actuales = [
    { LineaId: 1, Posicion: 1, CodigoBarra: '111', Cantidad: 2, Tipo: 'diferencias', DescripcionExcel: 'A' },
    { LineaId: 2, Posicion: 2, CodigoBarra: '222', Cantidad: 1, Tipo: 'diferencias', DescripcionExcel: null },
    { LineaId: 3, Posicion: 3, CodigoBarra: '333', Cantidad: 5, Tipo: 'diferencias', DescripcionExcel: 'C' },
  ];
  const plan = planCorreccionLineas(
    actuales,
    [
      { lineaId: 1, codigoBarra: ' 111 ', descripcion: 'A', cantidad: 2, tipo: 'diferencias' },
      { lineaId: 2, codigoBarra: '222', descripcion: '', cantidad: 4, tipo: 'diferencias' },
      { codigoBarra: '444', descripcion: 'Nuevo', cantidad: 1, tipo: 'faltante_real' },
    ],
    esAuto
  );
  assert.deepEqual(plan.quitar, [3]);
  assert.deepEqual(plan.cambiar, [{ lineaId: 2, codigoBarra: '222', descripcion: null, cantidad: 4, tipo: 'diferencias', decStatus: 'pendiente' }]);
  assert.deepEqual(plan.agregar, [{ codigoBarra: '444', descripcion: 'Nuevo', cantidad: 1, tipo: 'faltante_real', decStatus: 'aprobado' }]);

  assert.equal(planCorreccionLineas(actuales, [], esAuto).motivo.code, 'SIN_PRODUCTOS');
  assert.equal(planCorreccionLineas(actuales, [{ lineaId: 99, codigoBarra: 'x', tipo: 'diferencias' }], esAuto).motivo.code, 'PRODUCTOS_CAMBIARON');
  const repetido = [{ lineaId: 1, codigoBarra: '111', tipo: 'diferencias' }, { lineaId: 1, codigoBarra: '111', tipo: 'diferencias' }];
  assert.equal(planCorreccionLineas(actuales, repetido, esAuto).motivo.code, 'PRODUCTOS_CAMBIARON');
});

test('estadoAlCrear: se cierra solo si todos los productos se aprobaron solos', () => {
  const auto = { decStatus: 'aprobado' };
  const pend = { decStatus: 'pendiente' };
  assert.equal(estadoAlCrear({ soloNotificacion: false, lineas: [auto, auto] }), 'resuelto');
  assert.equal(estadoAlCrear({ soloNotificacion: false, lineas: [auto, pend] }), 'pendiente');
  assert.equal(estadoAlCrear({ soloNotificacion: false, lineas: [] }), 'pendiente');
  assert.equal(estadoAlCrear({ soloNotificacion: true, lineas: [auto] }), 'notificado');
});
