import test from 'node:test';
import assert from 'node:assert/strict';

test('correo al proveedor: lleva el comentario de contabilidad, el documento y los productos', async () => {
  const { plantillaReclamoProveedor } = await import('../../src/services/correo/plantillaReclamoProveedor.js');
  const doc = {
    ReclamoNumero: 'REC-000058',
    Proveedor: 'VILAGALLO RETAIL SL',
    NumeroDocumento: '4900012345',
    TipoDocumento: 'Nota de débito',
    Total: 70.81,
    Lineas: [{ descripcion: 'Blusa <roja>', material: '123', cantidadPdf: 1, valor: 70.81 }],
  };
  const { asunto, html, texto } = plantillaReclamoProveedor(doc, {
    comentario: 'Favor aplicar en el próximo pago.',
    remitente: { nombre: 'Conta', correo: 'conta@felixpa.com' },
    adjunto: '4900012345.pdf',
  });
  assert.match(asunto, /4900012345.*REC-000058/);
  assert.match(html, /Favor aplicar en el próximo pago\./);
  assert.match(texto, /Favor aplicar en el próximo pago\./);
  assert.match(html, /Blusa &lt;roja&gt;/);
  assert.match(html, /conta@felixpa\.com/);
  // Varios adjuntos: se listan todos.
  const con = plantillaReclamoProveedor(doc, { comentario: '', remitente: null, adjunto: 'nota.pdf', extras: ['foto1.jpg', 'detalle.xlsx'] });
  assert.match(con.html, /Documentos adjuntos \(3\)/);
  assert.match(con.html, /foto1\.jpg/);
  assert.match(con.texto, /Adjuntos: nota\.pdf, foto1\.jpg, detalle\.xlsx/);
  // Sin comentario no queda el recuadro vacío.
  const sin = plantillaReclamoProveedor(doc, { comentario: '', remitente: null, adjunto: null });
  assert.doesNotMatch(sin.html, /Comentario de contabilidad/);
});

test('correo a contabilidad muy pesado: van los PDF primero y lo que no cabe queda en el portal', async () => {
  const { repartirAdjuntos } = await import('../../src/domain/reclamo.js');
  const MB = 1024 * 1024;
  const archivos = [
    { filename: 'foto.jpg', tipo: 'imagen', size: 3 * MB },
    { filename: 'reclamo.xlsx', tipo: 'excel', size: 12 * MB },
    { filename: '911.pdf', tipo: 'pdf', size: 2 * MB },
    { filename: 'escaneo.pdf', tipo: 'pdf', size: 25 * MB },
  ];
  const { adjuntos, enPortal } = repartirAdjuntos(archivos, 20 * MB);
  assert.deepEqual(adjuntos.map((a) => a.filename), ['911.pdf', 'reclamo.xlsx', 'foto.jpg']);
  assert.deepEqual(enPortal.map((a) => a.filename), ['escaneo.pdf']);
  // Si todo cabe, va todo.
  assert.equal(repartirAdjuntos(archivos.slice(0, 3), 20 * MB).enPortal.length, 0);
});
