import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearReclamoSchema,
  corregirDatosSchema,
  documentosSapQuerySchema,
  adjuntoQuerySchema,
  decisionLineasSchema,
} from '../../src/validators/reclamos.schema.js';

const base = {
  tipo: 'faltante_real',
  origen: 'tienda',
  sucursal: 'Albrook',
  fechaRegistro: '2026-10-15',
  fechaLlegadaMercancia: '2026-10-14',
  mundo: 'Moda',
  departamento: 'Damas',
  marca: 'Zara',
  proveedor: 'ACME',
  compradora: 'kmojica',
};
const mensajes = (r) => r.error.issues.map((i) => i.message);

test('crear: el alta mínima de tienda pasa y aplica los valores por defecto', () => {
  const r = crearReclamoSchema.safeParse(base);
  assert.equal(r.success, true);
  assert.deepEqual(r.data.sapDocsExtra, []);
  assert.equal(r.data.lineas, null);
  assert.equal(r.data.comentario, '');
});

test('crear: campos obligatorios con su mensaje', () => {
  for (const [campo, mensaje] of [
    ['mundo', 'Mundo es obligatorio.'],
    ['proveedor', 'Proveedor es obligatorio.'],
    ['compradora', 'Compradora es obligatorio.'],
    ['fechaLlegadaMercancia', 'Indica la fecha de llegada de la mercancía.'],
  ]) {
    const r = crearReclamoSchema.safeParse({ ...base, [campo]: '   ' });
    assert.equal(r.success, false, campo);
    assert.ok(mensajes(r).includes(mensaje), `${campo}: ${mensajes(r)}`);
  }
});

test('crear: tienda exige sucursal y CEDI exige división', () => {
  assert.ok(mensajes(crearReclamoSchema.safeParse({ ...base, sucursal: '' })).includes('La sucursal es obligatoria para reclamos de tienda.'));
  const cedi = { ...base, origen: 'cedi', sucursal: '' };
  assert.ok(mensajes(crearReclamoSchema.safeParse(cedi)).includes('La división es obligatoria para reclamos de CEDI.'));
  assert.equal(crearReclamoSchema.safeParse({ ...cedi, division: 'Perfumería' }).success, true);
});

test('crear: tipo, origen y fecha inválidos', () => {
  assert.equal(crearReclamoSchema.safeParse({ ...base, tipo: 'otro' }).success, false);
  assert.equal(crearReclamoSchema.safeParse({ ...base, origen: 'bodega' }).success, false);
  assert.equal(crearReclamoSchema.safeParse({ ...base, fechaRegistro: '15/10/2026' }).success, false);
  assert.equal(crearReclamoSchema.safeParse({ ...base, tipo: 'devolucion' }).success, true);
});

test('crear: sapDocsExtra es un JSON array de textos cortos', () => {
  assert.deepEqual(crearReclamoSchema.parse({ ...base, sapDocsExtra: '[" 4904151684 ", ""]' }).sapDocsExtra, ['4904151684']);
  for (const malo of ['no es json', '{"a":1}', '[1]', JSON.stringify(['x'.repeat(51)])]) {
    assert.equal(crearReclamoSchema.safeParse({ ...base, sapDocsExtra: malo }).success, false, malo);
  }
});

test('crear: productos del formulario', () => {
  const producto = { codigoBarra: ' 7701234567890 ', fecha: '', esperada: 10, motivo: 'FALTANTE' };
  const r = crearReclamoSchema.parse({ ...base, lineas: JSON.stringify([producto]) });
  assert.equal(r.lineas[0].codigoBarra, '7701234567890');
  assert.equal(r.lineas[0].fecha, null);
  assert.equal(r.lineas[0].recibida, null);
  assert.equal(r.lineas[0].descripcion, null);

  const casos = [
    ['{}', 'lineas debe ser un JSON array.'],
    ['[]', 'Agrega al menos un producto.'],
    [JSON.stringify([{ codigoBarra: '' }]), 'Hay productos sin código de barra.'],
    [JSON.stringify([{ codigoBarra: 'ABC' }]), 'Hay productos con un código de barra inválido.'],
    [JSON.stringify([{ codigoBarra: '1', fecha: '15/10/2026' }]), 'Fecha de producto inválida.'],
    [JSON.stringify(Array.from({ length: 2001 }, () => ({ codigoBarra: '1' }))), 'Máximo 2000 productos.'],
  ];
  for (const [lineas, mensaje] of casos) {
    assert.deepEqual(mensajes(crearReclamoSchema.safeParse({ ...base, lineas })), [mensaje], mensaje);
  }
});

test('corregir datos: lista de documentos SAP con tope', () => {
  const { tipo, origen, ...datos } = base;
  assert.equal(corregirDatosSchema.safeParse({ ...datos, sapDocs: ['1', '2'] }).success, true);
  assert.equal(corregirDatosSchema.safeParse({ ...datos, sapDocs: Array(51).fill('1') }).success, false);
});

test('consulta de documentos SAP: separa por coma, quita vacíos y largos, máximo 50', () => {
  assert.deepEqual(documentosSapQuerySchema.parse({ docs: ' 1, ,2,' + 'x'.repeat(51) }).docs, ['1', '2']);
  const muchos = Array.from({ length: 60 }, (_, i) => String(i)).join(',');
  assert.equal(documentosSapQuerySchema.parse({ docs: muchos }).docs.length, 50);
});

test('adjunto: el nombre no puede traer rutas', () => {
  assert.equal(adjuntoQuerySchema.parse({ f: 'a1b2.pdf' }).f, 'a1b2.pdf');
  assert.equal(adjuntoQuerySchema.parse({ f: '' }).f, undefined);
  for (const f of ['../.env', 'x/y.pdf', '..\\x.pdf']) assert.equal(adjuntoQuerySchema.safeParse({ f }).success, false, f);
});

test('decisión en bloque: posiciones enteras positivas', () => {
  assert.equal(decisionLineasSchema.safeParse({ posiciones: [1, 2], decision: 'aprobado' }).success, true);
  for (const posiciones of [[], [0], [1.5]]) assert.equal(decisionLineasSchema.safeParse({ posiciones, decision: 'aprobado' }).success, false);
  assert.equal(decisionLineasSchema.safeParse({ posiciones: [1], decision: 'quizá' }).success, false);
});
