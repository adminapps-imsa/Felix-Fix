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

test('clave: código alfanumérico (OPWB1205, TE2032) con color y talla', () => {
  assert.equal(claveProducto('OPWB1205 "CAMISA OXFORD, AMPARO BLUE, S'), 'OPWB1205|AMPARO BLUE|S');
  assert.equal(claveProducto('opwb1205 "CAMISA OXFOR, AMPARO BLUE, xl'), 'OPWB1205|AMPARO BLUE|XL');
  assert.equal(claveProducto('TE2032 "BLUSA, ROSA, M'), 'TE2032|ROSA|M');
  assert.notEqual(claveProducto('OPWB1205 "CAMISA OXFORD, BRIGHT WHITE, S'), claveProducto('OPWB1205 "CAMISA OXFORD, AMPARO BLUE, S'));
});

test('REC-000030: el 912 con los sobrantes AMPARO BLUE cruza solo con ellos', () => {
  const desc = (c, t) => `OPWB1205 "CAMISA OXFORD, ${c}, ${t}`;
  const lineas = [
    ...['S', 'M', 'L', 'XL'].map((t, i) => ({ LineaId: i + 1, Posicion: i + 1, Cantidad: [1, 2, 2, 1][i], Tipo: 'faltante_real', DescripcionExcel: desc('BRIGHT WHITE', t), DecStatus: 'aprobado' })),
    ...['S', 'M', 'L', 'XL'].map((t, i) => ({ LineaId: i + 5, Posicion: i + 5, Cantidad: [1, 2, 2, 1][i], Tipo: 'sobrante_real', DescripcionExcel: desc('AMPARO BLUE', t), DecStatus: 'aprobado' })),
  ];
  const filas = ['S', 'M', 'L', 'XL'].map((t, i) => ({ material: '300-000123', descripcion: desc('AMPARO BLUE', t), cantidad: [1, 2, 2, 1][i], valor: 10 }));
  const { lineas: r, validacion } = cruzar(filas, lineas);
  assert.equal(validacion.estado, 'ok');
  assert.deepEqual(r.map((l) => l.posicion), [5, 6, 7, 8]);
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

import { faltantesContra911 } from '../../src/services/contabilidad/validarDocumento.js';
import { motivoFaltantesNoEn911 } from '../../src/domain/reclamo.js';

const fila911 = (material, descripcion, cantidad) => ({ material, descripcion, cantidad, valor: 1 });
const falt = (posicion, codigoBarra, descripcion, cantidad) => ({ posicion, codigoBarra, descripcion, cantidad });

test('911: los faltantes cuadran por producto (referencia, color y talla) aunque la descripción venga recortada', () => {
  const filas = [
    fila911('345-300114525004', 'OPKB2011 "T-SHIRT P/H, BRIGHT WHITE, XL', 4),
    fila911('345-300124308021', 'OCKSB010 "T-SHIRT P/H M/, ULTRAMARINE, S', 1),
  ];
  const r = faltantesContra911(
    [falt(1, '799016645984', 'OPKB2011 "T-SHIRT P/H, BRIGHT WHITE, XL', 4), falt(17, '9246752766', 'OCKSB010 "T-SHIRT P/H M, ULTRAMARINE, S', 1)],
    filas
  );
  assert.deepEqual(r, { noEstan: [], cantidadDistinta: [], sinVerificar: [] });
  assert.equal(motivoFaltantesNoEn911(r), null);
});

test('911: faltante que no está, o con otra cantidad, bloquea con la lista', () => {
  const filas = [fila911('345-1', 'OPKB2011 "T-SHIRT P/H, BRIGHT WHITE, XL', 3)];
  const r = faltantesContra911([falt(1, '799016645984', 'OPKB2011 "T-SHIRT P/H, BRIGHT WHITE, XL', 4), falt(2, '9246505010', 'OPWB0400 "CAMISA P/H M/, DARK SAPPHIR, S', 1)], filas);
  assert.deepEqual(r.noEstan.map((l) => l.posicion), [2]);
  assert.equal(r.cantidadDistinta[0].cantidad911, 3);
  const m = motivoFaltantesNoEn911(r);
  assert.equal(m.code, 'FALTANTE_NO_EN_911');
  assert.deepEqual(m.productos, [2, 1]);
  assert.match(m.mensaje, /Excel 4, 911 3/);
});

test('911: líneas repetidas del mismo producto se suman; sin descripción se busca por material SAP', () => {
  const filas = [fila911('345-300130192003', 'OPWS2619 "CAMISA P/H M/C, BIRCH, M', 2), fila911('345-9', 'X', 1)];
  const r = faltantesContra911(
    [falt(1, 'A', 'OPWS2619 "CAMISA P/H M/C, BIRCH, M', 1), falt(2, 'A', 'OPWS2619 "CAMISA P/H M/C, BIRCH, M', 1), falt(3, 'B', 'sin formato', 1), falt(4, 'C', 'sin formato', 1)],
    filas,
    new Map([['B', '345-9']])
  );
  assert.deepEqual(r.cantidadDistinta, []);
  assert.deepEqual(r.noEstan, []);
  assert.deepEqual(r.sinVerificar.map((l) => l.posicion), [4]);
});

test('23294 - NOIR: referencias con guion («A67-28888», «A67-X29121») cruzan con el 911', async () => {
  const { claveProducto, faltantesContra911 } = await import('../../src/services/contabilidad/validarDocumento.js');
  assert.equal(claveProducto('A67-28888 "LADIES 2PCS SET PIJ, BLACK, M'), 'A67-28888|BLACK|M');
  assert.equal(claveProducto('A67-X29121 "LADIES 2PCS SE, OFF WHITE, S'), 'A67-X29121|OFF WHITE|S');
  // Las de antes no cambian.
  assert.equal(claveProducto('030766-1 "VERSALLES, PEACH, M'), '030766-1|PEACH|M');
  assert.equal(claveProducto('OPWB1205 "CAMISA OXFORD, AMPARO BLUE, S'), 'OPWB1205|AMPARO BLUE|S');
  assert.equal(claveProducto('T-SHIRT P/H, BLUE, S'), null);
  const faltantes = [
    { posicion: 3, codigoBarra: '2050039057528', descripcion: 'A67-28888 "LADIES 2PCS SET PIJ, BLACK, M', cantidad: 1 },
    { posicion: 4, codigoBarra: '2050039057634', descripcion: 'A67-X29121 "LADIES 2PCS SE, OFF WHITE, S', cantidad: 1 },
  ];
  const filas = [
    { material: '345-200032507002', descripcion: 'A67-28888 "LADIES 2PCS SET PIJ, BLACK, M', cantidad: 1 },
    { material: '345-200032508005', descripcion: 'A67-X29121 "LADIES 2PCS SE, OFF WHITE, S', cantidad: 1 },
  ];
  const r = faltantesContra911(faltantes, filas);
  assert.deepEqual([r.noEstan.length, r.cantidadDistinta.length, r.sinVerificar.length], [0, 0, 0]);
});

test('cruce por material: el prefijo del PDF («345-») y los ceros de SAP no impiden que coincida', async () => {
  const { faltantesContra911 } = await import('../../src/services/contabilidad/validarDocumento.js');
  const r = faltantesContra911(
    [{ posicion: 1, codigoBarra: '9246752773', descripcion: 'descripción distinta', cantidad: 1 }],
    [{ material: '345-300124308021', descripcion: 'OCKSB010 "T-SHIRT P/H M/, ULTRAMARINE, S', cantidad: 1 }],
    new Map([['9246752773', '000000300124308021']])
  );
  assert.deepEqual([r.noEstan.length, r.cantidadDistinta.length], [0, 0]);
});
