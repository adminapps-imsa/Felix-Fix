import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  parsearPlantilla,
  detectarTipoPorMotivo,
  cantidadCedi,
  normalizar,
  FormatoNoReconocidoError,
  FechaInvalidaError,
} from '../../src/services/reclamos/excelParser.js';

/** Libro .xlsx en memoria con una hoja por cada [nombre, filas]. */
function libro(...hojas) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas, { cellDates: true }), nombre);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const ENCABEZADO_TIENDA = ['FECHA', 'CÓDIGO DE BARRA', 'DESCRIPCIÓN', 'CANTIDAD RECLAMADA', 'DOCUMENTO SAP', 'MOTIVO', 'COMENTARIO'];

test('normalizar: mayúsculas, sin acentos y espacios colapsados', () => {
  assert.equal(normalizar('  código   de  barra '), 'CODIGO DE BARRA');
  assert.equal(normalizar(null), '');
});

test('tipo por motivo', () => {
  assert.equal(detectarTipoPorMotivo('Faltante real'), 'faltante_real');
  assert.equal(detectarTipoPorMotivo('SOBRANTE'), 'sobrante_real');
  // «DIFERENCIAS (SOBRANTE)» es diferencia, no sobrante real.
  assert.equal(detectarTipoPorMotivo('Diferencias (sobrante)'), 'diferencias');
  assert.equal(detectarTipoPorMotivo('Cambio de talla - diferencia'), 'diferencias');
  assert.equal(detectarTipoPorMotivo('Devolución al proveedor'), 'devolucion');
  assert.equal(detectarTipoPorMotivo('Producto defectuoso'), 'danos_textil');
  assert.equal(detectarTipoPorMotivo('otro'), null);
  assert.equal(detectarTipoPorMotivo(''), null);
});

test('cantidad CEDI: averiadas para daños, diferencia o esperada-recibida para lo demás', () => {
  assert.equal(cantidadCedi({ tipo: 'danos_textil', averiadas: -3, diferencia: 9 }), 3);
  assert.equal(cantidadCedi({ tipo: 'faltante_real', diferencia: -2, averiadas: 5 }), 2);
  assert.equal(cantidadCedi({ tipo: 'faltante_real', diferencia: null, esperada: 10, recibida: 7 }), 3);
  assert.equal(cantidadCedi({ tipo: null, diferencia: null, esperada: null, recibida: null, averiadas: 4 }), 4);
  assert.equal(cantidadCedi({ tipo: null, diferencia: null, esperada: 5, recibida: null, averiadas: null }), null);
});

test('plantilla Tienda: metadatos de arriba, líneas, documentos y tipo sugerido', () => {
  const buf = libro([
    'Reclamo',
    [
      ['TIENDA:', 'Albrook'],
      ['PROVEEDOR', 'ACME S.A.', '', 'MARCA', 'Zara'],
      ['FECHA', '15/10/2026'],
      ['FACTURA / EMBARQUE: 4168 - 001'],
      ['MUNDO', 'Moda', 'DEPARTAMENTO', 'Damas'],
      [],
      ENCABEZADO_TIENDA,
      ['', 7701234567890, '15803206513 "TROUSERS, RED, 7', 2, '4904151684', 'Faltante real', 'Caja abierta'],
      ['', '0012345678905', 'OTRO', '-1', '4904151684', 'FALTANTE', 'Caja abierta'],
      ['', 7709999999999, 'TERCERO', '1,5', '4904151698', 'Producto defectuoso', ''],
      ['', '', 'fila sin código: se ignora', 9, '', 'FALTANTE', ''],
      ['', 'TOTAL', '', 3, '', '', ''],
    ],
  ]);
  const r = parsearPlantilla(buf);
  assert.equal(r.hoja, 'Reclamo');
  assert.equal(r.formato, 'tienda');
  assert.equal(r.sucursal, 'Albrook');
  assert.equal(r.proveedor, 'ACME S.A.');
  assert.equal(r.marca, 'Zara');
  assert.equal(r.mundo, 'Moda');
  assert.equal(r.departamento, 'Damas');
  assert.equal(r.fechaRegistro, '2026-10-15');
  assert.equal(r.numeroEmbarqueFactura, '4168 - 001');
  assert.deepEqual(r.documentosSap, ['4904151684', '4904151698']);
  assert.equal(r.comentario, 'Caja abierta');

  assert.equal(r.lineas.length, 3);
  assert.deepEqual(r.lineas.map((l) => l.posicion), [1, 2, 3]);
  assert.deepEqual(r.lineas.map((l) => l.codigoBarra), ['7701234567890', '0012345678905', '7709999999999']);
  assert.deepEqual(r.lineas.map((l) => l.cantidad), [2, 1, 1.5]);
  // Un daño va en «averiadas»; lo demás en «diferencia».
  assert.equal(r.lineas[0].cedi.diferencia, 2);
  assert.equal(r.lineas[2].cedi.averiadas, 1.5);
  assert.equal(r.lineas[2].cedi.diferencia, null);

  assert.deepEqual(r.desglose, { faltante_real: 2, danos_textil: 1 });
  assert.equal(r.tipoSugerido, 'faltante_real');
  assert.equal(r.lineasSinMotivo, 0);
});

test('plantilla Tienda: elige la cantidad reclamada y no la esperada ni el precio', () => {
  const buf = libro([
    'Hoja1',
    [
      ['CÓDIGO DE BARRA', 'CANTIDAD ESPERADA', 'PRECIO CANTIDAD', 'CANTIDAD RECLAMADA', 'DOCUMENTO', 'MOTIVO'],
      [7701, 10, 99.9, 3, 'D1', 'SOBRANTE'],
    ],
  ]);
  assert.equal(parsearPlantilla(buf).lineas[0].cantidad, 3);
});

test('plantilla Tienda: una columna de texto con «UNIDADES» no se toma como cantidad', () => {
  const buf = libro([
    'Hoja1',
    [
      ['CÓDIGO DE BARRA', 'UNIDADES (NOTA)', 'DOCUMENTO', 'MOTIVO'],
      [7701, 'ver caja', 'D1', 'SOBRANTE'],
      [7702, 'ver caja', 'D1', 'SOBRANTE'],
    ],
  ]);
  const r = parsearPlantilla(buf);
  assert.deepEqual(r.lineas.map((l) => l.cantidad), [null, null]);
});

test('plantilla Tienda: factura, fecha y departamento desde la tabla si no vienen arriba', () => {
  const buf = libro([
    'Hoja1',
    [
      ['FECHA', 'FACTURA', 'EMBARQUE', 'DEPARTAMENTO', 'CODIGO BARRA', 'CANTIDAD', 'DOCUMENTO', 'MOTIVO'],
      [new Date(2026, 9, 3), '4168', '23069', 'Caballeros', 7701, 1, 'D1', 'FALTANTE'],
      [new Date(2026, 9, 3), '4168', '23069', 'Caballeros', 7702, 1, 'D1', ''],
    ],
  ]);
  const r = parsearPlantilla(buf);
  assert.equal(r.fechaRegistro, '2026-10-03');
  assert.equal(r.numeroEmbarqueFactura, '4168 / 23069');
  assert.equal(r.departamento, 'Caballeros');
  assert.equal(r.lineasSinMotivo, 1);
});

test('plantilla CEDI vieja: títulos en la fila 1, cantidad según el motivo', () => {
  const buf = libro([
    'CEDI',
    [
      ['FECHA', 'PRODUCTO', 'BARCODE', 'DESCRIPCIÓN', 'CANT. ESPERADA', 'CANT. RECIBIDA', 'DIFERENCIA', 'UNIDADES AVERIADAS', 'DOCUMENTO', 'MOTIVO'],
      ['02/10/2026', 123456, 7701, 'ART 1', 10, 8, '', '', '4904151684', 'FALTANTE REAL'],
      ['02/10/2026', 123457, 7702, 'ART 2', 5, 5, 0, 2, '4904151684', 'Defectuoso'],
    ],
  ]);
  const r = parsearPlantilla(buf);
  assert.equal(r.formato, 'cedi');
  assert.equal(r.fechaRegistro, '2026-10-02');
  assert.equal(r.proveedor, null);
  assert.equal(r.sucursal, null);
  assert.deepEqual(r.lineas.map((l) => l.cantidad), [2, 2]);
  assert.equal(r.lineas[0].cedi.producto, '123456');
  assert.deepEqual(r.documentosSap, ['4904151684']);
});

test('plantilla CEDI nueva: encabezado con proveedor, división y factura antes de la tabla', () => {
  const buf = libro([
    'CEDI',
    [
      ['PROVEEDOR', 'ACME'],
      ['DIVISIÓN', 'Perfumería', 'MARCA', 'Dior'],
      ['FACTURA / EMBARQUE', 'F-99'],
      ['BARCODE', 'MOTIVO', 'DIFERENCIA'],
      [7701, 'SOBRANTE', 4],
    ],
  ]);
  const r = parsearPlantilla(buf);
  assert.equal(r.formato, 'cedi');
  assert.equal(r.proveedor, 'ACME');
  assert.equal(r.division, 'Perfumería');
  assert.equal(r.marca, 'Dior');
  assert.equal(r.numeroEmbarqueFactura, 'F-99');
  assert.equal(r.lineas[0].cantidad, 4);
});

test('busca la plantilla en las hojas siguientes si la primera no lo es', () => {
  const buf = libro(['Instrucciones', [['Llena la otra hoja']]], ['Vacía', []], ['Datos', [['BARCODE', 'MOTIVO'], [7701, 'SOBRANTE']]]);
  assert.equal(parsearPlantilla(buf).hoja, 'Datos');
});

test('Excel que no es ninguna plantilla: FormatoNoReconocidoError', () => {
  assert.throws(() => parsearPlantilla(libro(['Hoja1', [['A', 'B'], [1, 2]]])), FormatoNoReconocidoError);
});

test('fecha en texto que no existe: FechaInvalidaError (no se adivina mm/dd)', () => {
  for (const fecha of ['31/02/2026', '13/25/2026', '2026-02-30']) {
    const buf = libro(['Hoja1', [['FECHA', fecha], ['CODIGO DE BARRA', 'DOCUMENTO', 'MOTIVO'], [7701, 'D1', 'SOBRANTE']]]);
    assert.throws(() => parsearPlantilla(buf), FechaInvalidaError, fecha);
  }
});

test('un rango declarado gigante no congela la lectura', () => {
  // SheetJS no puede escribir una hoja así (se congela él mismo): se arma un
  // libro normal y se cambia el <dimension> del XML, como vendría un Excel real.
  const zip = XLSX.CFB.read(libro(['Hoja1', [['BARCODE', 'MOTIVO'], [7701, 'SOBRANTE']]]), { type: 'buffer' });
  const hoja = XLSX.CFB.find(zip, zip.FullPaths.find((p) => p.endsWith('sheet1.xml')));
  hoja.content = Buffer.from(Buffer.from(hoja.content).toString('utf8').replace(/<dimension ref="[^"]*"/, '<dimension ref="A1:XFD1048576"'));
  const inicio = Date.now();
  const r = parsearPlantilla(XLSX.CFB.write(zip, { type: 'buffer', fileType: 'zip' }));
  assert.equal(r.lineas.length, 1);
  assert.ok(Date.now() - inicio < 5000);
});
