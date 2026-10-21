import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, saludo, conDato } from '../../src/services/correo/diseno.js';
import { plantillaAvisoReclamo } from '../../src/services/correo/avisosReclamos.js';
import { plantillaReporteProveedor, numeroReporte } from '../../src/services/correo/plantillaReporteProveedor.js';

// Lo que escribe un usuario (comentario, proveedor, nombre…) nunca debe llegar
// como HTML al correo.
const MALICIOSO = '<img src=x onerror="alert(1)">';

test('esc escapa los caracteres de HTML', () => {
  assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
});

test('saludo con el primer nombre y datos sin filas vacías', () => {
  assert.equal(saludo('  Ana María López '), 'Hola, Ana:');
  assert.equal(saludo(''), 'Hola:');
  assert.deepEqual(conDato([['a', 'x'], ['b', ''], ['c', null], ['d', 0]]), [['a', 'x'], ['d', 0]]);
});

const reclamo = {
  Numero: 'RC-000123',
  Token: 'abc',
  Proveedor: MALICIOSO,
  Tipo: 'faltante_real',
  Origen: 'tienda',
  Sucursal: MALICIOSO,
  NumeroEmbarqueFactura: MALICIOSO,
  SapDocs: [MALICIOSO],
  LineasTotal: 3,
  LineasAprobadas: 1,
  LineasPendientes: 1,
  CreatedBy: 'kmojica',
  CreatedByNombre: MALICIOSO,
  Status: 'pendiente',
};

for (const evento of ['nuevo', 'devuelto', 'reenviado', 'cerrado']) {
  test(`aviso de reclamo «${evento}»: lo que escribe el usuario va escapado`, () => {
    for (const para of ['area', 'persona']) {
      const { asunto, html, texto } = plantillaAvisoReclamo(evento, reclamo, {
        comentario: MALICIOSO,
        de: MALICIOSO,
        nombre: MALICIOSO,
        fecha: new Date('2026-10-21T15:00:00Z'),
        para,
      });
      assert.ok(!html.includes('<img'), `${evento}/${para}: HTML sin escapar`);
      assert.ok(html.includes('&lt;img'), `${evento}/${para}: no aparece el texto escapado`);
      assert.ok(asunto.includes('RC-000123'));
      // El texto plano lleva el contenido tal cual (no es HTML).
      assert.ok(texto.includes(MALICIOSO));
    }
  });
}

test('aviso de reclamo: resumen de productos en el texto', () => {
  const { texto } = plantillaAvisoReclamo('nuevo', { ...reclamo, Proveedor: 'ACME' }, { para: 'area' });
  assert.match(texto, /3 productos · 1 aprobado · 1 rechazado · 1 por decidir/);
});

test('correo al proveedor: datos del reporte escapados y número con ceros', () => {
  assert.equal(numeroReporte(42), 'PD-000042');
  const r = {
    ReporteId: 42,
    TiendaNombre: MALICIOSO,
    NombreProducto: MALICIOSO,
    CodigoBarras: '7701',
    Marca: MALICIOSO,
    Motivo: MALICIOSO,
    Cantidad: 2,
    FechaCreacion: '2026-10-21T15:00:00Z',
    EmpleadoReportaNombre: MALICIOSO,
    Comentario: MALICIOSO,
  };
  const { asunto, html } = plantillaReporteProveedor(r, { remitente: { nombre: MALICIOSO, correo: 'x@y.com' }, conFoto: false, adjuntos: [MALICIOSO] });
  assert.ok(asunto.startsWith('Reporte de producto dañado PD-000042'));
  assert.ok(!html.includes('<img'), 'HTML sin escapar');
});
