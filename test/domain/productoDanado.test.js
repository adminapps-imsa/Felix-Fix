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
  alcanceVista,
  puedeVerReporte,
  motivoNoDocumento1700,
  motivoNoValidarNf,
  validarDocumentoSalidaNf,
  mismoCodigo,
  motivoNoDevolverATienda,
  motivoNoCorregir,
  cambiosAlCorregir,
} from '../../src/domain/productoDanado.js';

const docGof = { filename: 'a.pdf', etapa: 'gof' };
const adjProveedor = { filename: 'b.pdf' };

test('ruta de estados: Devolución aprobada → Gof → contabilidad → cerrado', () => {
  assert.deepEqual(TRANSICIONES.aprobar, { desde: 'Pendiente', hacia: 'Aprobado' });
  assert.deepEqual(TRANSICIONES.enviarAContabilidad, { desde: 'Aprobado', hacia: 'EnContabilidad' });
  assert.deepEqual(TRANSICIONES.registrarPago, { desde: 'EnContabilidad', hacia: 'Cerrado' });
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

// ------------------------------------------------------------------
// NF: documento 1700 de Gof y validación del supervisor GOF
// ------------------------------------------------------------------
test('ruta del NF: Gof (documento 1700) → supervisor GOF → cerrado', () => {
  assert.deepEqual(TRANSICIONES.rechazar, { desde: 'Pendiente', hacia: 'Rechazado' });
  assert.deepEqual(TRANSICIONES.registrarDocumento1700, { desde: 'Rechazado', hacia: 'NFValidacion' });
  assert.deepEqual(TRANSICIONES.cerrarNf, { desde: 'NFValidacion', hacia: 'Cerrado' });
});

test('quién ve qué: Gof ve NF y devoluciones aprobadas, no los pendientes', () => {
  const gof = new Set(['productos_danados.ver_nf', 'productos_danados.nf_documento', 'productos_danados.documentar']);
  assert.equal(alcanceVista(new Set(['productos_danados.ver'])), null);
  assert.equal(alcanceVista(new Set(['productos_danados.ver', 'productos_danados.ver_nf'])), null);
  assert.deepEqual(alcanceVista(gof), ['NF', 'Devolucion']);
  assert.deepEqual(alcanceVista(new Set(['productos_danados.ver_nf'])), ['NF']); // sin «documentar»: solo NF
  assert.equal(alcanceVista(new Set(['productos_danados.pago'])), null); // contabilidad: como hasta ahora
  const a = alcanceVista(gof);
  assert.equal(puedeVerReporte(a, { Resolucion: 'NF', Estado: 'Cerrado' }), true);
  assert.equal(puedeVerReporte(a, { Resolucion: 'Devolucion', Estado: 'Aprobado' }), true);
  assert.equal(puedeVerReporte(a, { Resolucion: 'Devolucion', Estado: 'EnContabilidad' }), true);
  assert.equal(puedeVerReporte(a, { Resolucion: null, Estado: 'Pendiente' }), false);
  assert.equal(puedeVerReporte(['NF'], { Resolucion: 'Devolucion', Estado: 'Aprobado' }), false);
  assert.equal(puedeVerReporte(null, { Resolucion: null }), true);
});

test('Gof: el check «Documento 1700» es obligatorio (sin número)', () => {
  assert.match(motivoNoDocumento1700({ confirmado: false }), /Marca el check/);
  assert.match(motivoNoDocumento1700({}), /Marca el check/);
  assert.equal(motivoNoDocumento1700({ confirmado: true }), null);
});

test('supervisor GOF: «Documento salida de NF» obligatorio y de 10 dígitos', () => {
  assert.match(motivoNoValidarNf({ numero: '  ' }), /Escribe el número/);
  assert.match(motivoNoValidarNf({}), /Escribe el número/);
  assert.match(motivoNoValidarNf({ numero: '1700123' }), /10 dígitos/);
  assert.match(motivoNoValidarNf({ numero: '49044422900' }), /10 dígitos/);
  assert.match(motivoNoValidarNf({ numero: '49044A2290' }), /10 dígitos/);
  assert.equal(motivoNoValidarNf({ numero: ' 4904442290 ' }), null);
});

// SAP: documento 4904442290 con dos productos, salida 551 del almacén 1700 de TD15.
const linea = (o) => ({ mjahr: '2026', bwart: '551', lgort: '1700', werks: 'TD15', matnr: 'MAT-A', menge: 2, ...o });
const sapOk = { disponible: true, encontrado: true, matnr: 'MAT-A', lineas: [linea(), linea({ matnr: 'MAT-B', menge: 5 })] };
const base = { numero: '4904442290', sap: sapOk, tiendaCodigo: 'TD15', codigoBarras: '7501234567890', repetidoEn: null };
const codigo = (o) => validarDocumentoSalidaNf({ ...base, ...o }).code;

test('documento salida de NF válido: salida 551 del almacén 1700, mismo producto y tienda', () => {
  const v = validarDocumentoSalidaNf(base);
  assert.equal(v.code, undefined);
  assert.equal(v.lineas.length, 1);
  assert.equal(v.lineas[0].menge, 2);
});

test('documento salida de NF: cada motivo de rechazo', () => {
  assert.equal(codigo({ repetidoEn: 31 }), 'DOC_SALIDA_NF_REPETIDO');
  assert.equal(codigo({ sap: { disponible: false } }), 'SAP_NO_DISPONIBLE');
  assert.equal(codigo({ sap: { disponible: true, encontrado: false, lineas: [] } }), 'DOC_SALIDA_NF_NO_EXISTE');
  // Un traslado 311 hacia el almacén NF no es la salida.
  assert.equal(codigo({ sap: { ...sapOk, lineas: [linea({ bwart: '311' })] } }), 'DOC_SALIDA_NF_NO_ES_SALIDA');
  // Un 551 desde otro almacén tampoco.
  assert.equal(codigo({ sap: { ...sapOk, lineas: [linea({ lgort: '1000' })] } }), 'DOC_SALIDA_NF_NO_ES_SALIDA');
  assert.equal(codigo({ codigoBarras: '' }), 'DOC_SALIDA_NF_SIN_CODIGO');
  assert.equal(codigo({ sap: { ...sapOk, matnr: null } }), 'DOC_SALIDA_NF_PRODUCTO_NO_SAP');
  assert.equal(codigo({ sap: { ...sapOk, matnr: 'MAT-Z' } }), 'DOC_SALIDA_NF_OTRO_PRODUCTO');
  const otraTienda = validarDocumentoSalidaNf({ ...base, tiendaCodigo: 'TD04' });
  assert.equal(otraTienda.code, 'DOC_SALIDA_NF_OTRA_TIENDA');
  assert.match(otraTienda.mensaje, /es de la tienda TD15 y el reporte es de TD04/);
});

test('el mismo documento sirve para otro producto (un documento 551 trae varios)', () => {
  assert.equal(validarDocumentoSalidaNf({ ...base, sap: { ...sapOk, matnr: 'MAT-B' } }).code, undefined);
});

test('mismo código de barras aunque cambien los ceros a la izquierda', () => {
  assert.equal(mismoCodigo('007501234567890', '7501234567890'), true);
  assert.equal(mismoCodigo(' 7501234567890 ', '7501234567890'), true);
  assert.equal(mismoCodigo('7501234567891', '7501234567890'), false);
  assert.equal(mismoCodigo(null, null), false);
});

test('devolver a la tienda: Pendiente → Devuelto → Pendiente al corregir', () => {
  assert.deepEqual(TRANSICIONES.devolverATienda, { desde: 'Pendiente', hacia: 'Devuelto' });
  assert.deepEqual(TRANSICIONES.corregir, { desde: 'Devuelto', hacia: 'Pendiente' });
});

test('devolver a la tienda: solo Pendiente, sin enviar al proveedor y con comentario', () => {
  const pendiente = { Estado: 'Pendiente', EnviadoProveedorAt: null };
  assert.equal(motivoNoDevolverATienda(pendiente, 'La foto no se ve'), null);
  assert.match(motivoNoDevolverATienda(pendiente, '  ab '), /qué tiene que corregir/);
  assert.match(motivoNoDevolverATienda({ ...pendiente, EnviadoProveedorAt: new Date() }, 'La foto no se ve'), /ya se envió al proveedor/);
  for (const Estado of ['Devuelto', 'Aprobado', 'Rechazado', 'Cerrado']) {
    assert.match(motivoNoDevolverATienda({ Estado }, 'La foto no se ve'), /Solo se devuelve/, Estado);
  }
});

test('corregir: solo un reporte devuelto', () => {
  assert.equal(motivoNoCorregir({ Estado: 'Devuelto' }), null);
  for (const Estado of ['Pendiente', 'Aprobado', 'Cerrado']) assert.match(motivoNoCorregir({ Estado }), /ya no está devuelto/, Estado);
});

test('corregir: correos y adjuntos del proveedor se pueden cambiar mientras está devuelto', () => {
  assert.equal(motivoNoEditable('Devuelto'), null);
  assert.equal(motivoNoEnviarProveedor('Devuelto') !== null, true);
});

test('cambios al corregir: solo los campos que cambiaron (números y vacíos equivalentes no cuentan)', () => {
  const antes = {
    TiendaId: 3, EmpleadoReportaNombre: 'Ana', CodigoBarras: '7701', NombreProducto: 'Perfume', Marca: null,
    Division: 'Perfumería', Motivo: 'Daño', Cantidad: 2, Descripcion: null,
  };
  const igual = {
    tiendaId: 3, empleadoReportaNombre: 'Ana ', codigoBarras: '7701', nombreProducto: 'Perfume', marca: '',
    division: 'Perfumería', motivo: 'Daño', cantidad: '2.000', descripcion: '',
  };
  assert.deepEqual(cambiosAlCorregir(antes, igual), []);
  assert.deepEqual(cambiosAlCorregir(antes, { ...igual, cantidad: 3, motivo: 'Vencimiento', tiendaId: 4 }), ['Tienda', 'Motivo', 'Cantidad']);
  assert.deepEqual(cambiosAlCorregir(antes, igual, { fotoNueva: true }), ['Foto']);
});
