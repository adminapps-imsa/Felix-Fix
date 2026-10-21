import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveProducto, cruzar } from '../../src/services/contabilidad/validarDocumento.js';

test('clave: número de modelo + talla, aunque el texto intermedio venga recortado distinto', () => {
  assert.equal(claveProducto('15803206513 "TROUSERS BOY, RED, 7'), '15803206513|7');
  assert.equal(claveProducto('15803206513 "TROUSERS BO, RED, 7'), '15803206513|7');
  assert.equal(claveProducto('  15803206513   "TROUSERS BOY,  RED,  xl '), '15803206513|XL');
});

test('clave: código corto lleva también el color (se repite en varios colores)', () => {
  assert.equal(claveProducto('011756 "MAIA, IVORY NAVY, M'), '011756|IVORY NAVY|M');
  assert.equal(claveProducto('030766-1 "VERSALLES, PEACH, M'), '030766-1|PEACH|M');
  assert.notEqual(claveProducto('011756 "MAIA, IVORY NAVY, M'), claveProducto('011756 "MAIA, BLACK, M'));
});

test('clave: null si la descripción no tiene el formato', () => {
  for (const d of [null, undefined, '', 'SIN COMAS', 'TROUSERS BOY, RED, 7', '15803206513 "TROUSERS,', '123 "X, Y, M']) {
    assert.equal(claveProducto(d), null, String(d));
  }
});

const linea = (LineaId, DescripcionExcel, Cantidad, DecStatus = 'aprobado', extra = {}) => ({
  LineaId,
  Posicion: LineaId,
  CodigoBarra: `77${LineaId}`,
  Cantidad,
  Tipo: 'diferencias',
  DescripcionExcel,
  DecStatus,
  ...extra,
});
const fila = (descripcion, cantidad, extra = {}) => ({ material: 'M', descripcion, cantidad, valor: '10.5', pagina: 1, ...extra });

test('cruzar: fila que coincide en producto y cantidad queda ok con la decisión de la compradora', () => {
  const { lineas, validacion } = cruzar([fila('15803206513 "TROUSERS BO, RED, 7', '2')], [linea(1, '15803206513 "TROUSERS BOY, RED, 7', 2)]);
  assert.equal(lineas[0].resultado, 'ok');
  assert.equal(lineas[0].lineaId, 1);
  assert.equal(lineas[0].decision, 'aprobado');
  assert.equal(lineas[0].valor, 10.5);
  assert.deepEqual(validacion, {
    estado: 'ok',
    coinciden: 1,
    noEnReclamo: 0,
    cantidadDistinta: 0,
    aprobados: 1,
    rechazados: 0,
    sinDecision: 0,
    mezclaDecisiones: false,
  });
});

test('cruzar: producto que no está en el reclamo y cantidad distinta marcan diferencias', () => {
  const { lineas, validacion } = cruzar(
    [fila('15803206513 "TROUSERS, RED, 7', 3), fila('99999999999 "OTRO, BLUE, 8', 1)],
    [linea(1, '15803206513 "TROUSERS, RED, 7', 2)]
  );
  assert.deepEqual(lineas.map((l) => l.resultado), ['cantidad_distinta', 'no_en_reclamo']);
  assert.equal(lineas[1].lineaId, null);
  assert.equal(lineas[1].decision, null);
  assert.equal(validacion.estado, 'diferencias');
  assert.equal(validacion.cantidadDistinta, 1);
  assert.equal(validacion.noEnReclamo, 1);
});

test('cruzar: con la misma clave prefiere la línea de igual cantidad y nunca usa dos veces la misma', () => {
  const lineasReclamo = [linea(1, '15803206513 "T, RED, 7', 5), linea(2, '15803206513 "T, RED, 7', 2)];
  const { lineas } = cruzar([fila('15803206513 "T, RED, 7', 2), fila('15803206513 "T, RED, 7', 2), fila('15803206513 "T, RED, 7', 2)], lineasReclamo);
  assert.deepEqual(lineas.map((l) => l.lineaId), [2, 1, null]);
  assert.deepEqual(lineas.map((l) => l.resultado), ['ok', 'cantidad_distinta', 'no_en_reclamo']);
});

test('cruzar: código corto distingue colores (proveedores tipo 030766-1)', () => {
  const lineasReclamo = [linea(1, '011756 "MAIA, IVORY NAVY, M', 1, 'aprobado'), linea(2, '011756 "MAIA, BLACK, M', 1, 'rechazado')];
  const { lineas, validacion } = cruzar([fila('011756 "MAIA, BLACK, M', 1)], lineasReclamo);
  assert.equal(lineas[0].lineaId, 2);
  assert.equal(lineas[0].decision, 'rechazado');
  assert.equal(validacion.rechazados, 1);
});

test('cruzar: cuenta sin decisión y avisa si la nota mezcla aprobados y rechazados', () => {
  const lineasReclamo = [
    linea(1, '11111111 "A, R, 1', 1, 'aprobado'),
    linea(2, '22222222 "B, R, 1', 1, 'rechazado'),
    linea(3, '33333333 "C, R, 1', 1, null),
  ];
  const { validacion } = cruzar([fila('11111111 "A, R, 1', 1), fila('22222222 "B, R, 1', 1), fila('33333333 "C, R, 1', 1)], lineasReclamo);
  assert.equal(validacion.aprobados, 1);
  assert.equal(validacion.rechazados, 1);
  assert.equal(validacion.sinDecision, 1);
  assert.equal(validacion.mezclaDecisiones, true);
});

test('cruzar: PDF sin filas leídas queda sin_leer; entradas vacías no fallan', () => {
  assert.equal(cruzar([], [linea(1, '11111111 "A, R, 1', 1)]).validacion.estado, 'sin_leer');
  assert.equal(cruzar(null, null).validacion.estado, 'sin_leer');
  assert.equal(cruzar(undefined, undefined).lineas.length, 0);
});

test('cruzar: cantidades con decimales o vacías no se dan por iguales', () => {
  const { lineas } = cruzar(
    [fila('11111111 "A, R, 1', '1.0004'), fila('22222222 "B, R, 1', ''), fila('33333333 "C, R, 1', 'abc')],
    [linea(1, '11111111 "A, R, 1', 1), linea(2, '22222222 "B, R, 1', 1), linea(3, '33333333 "C, R, 1', null)]
  );
  assert.equal(lineas[0].resultado, 'ok');
  assert.equal(lineas[1].cantidadPdf, null);
  assert.equal(lineas[1].resultado, 'cantidad_distinta');
  assert.equal(lineas[2].resultado, 'cantidad_distinta');
});
