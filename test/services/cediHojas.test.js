// Plantilla CEDI por hojas (Averia / Diferencia / Sobrante NO esperado) y el
// flujo del sobrante no esperado (Data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parsearPlantilla, detectarTipoPorMotivo, motivoFaltantesSinDocumento } from '../../src/services/reclamos/excelParser.js';
import { TIPOS, esAutoAprobado, TIPOS_SOBRANTE } from '../../src/services/reclamos/tipos.js';
import { motivoNoDecidir, motivoNoEnviarContabilidad } from '../../src/domain/reclamo.js';
import { codigoDataSchema, corregirLineasSchema } from '../../src/validators/reclamos.schema.js';
import { plantillaDataArticulos } from '../../src/services/correo/avisoDataArticulos.js';

function libro(...hojas) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// La primera hoja (resumen) no se lee: aunque traiga un BARCODE + MOTIVO.
const RESUMEN = ['Sheet', [['BARCODE', 'MOTIVO'], ['9999999999999', 'FALTANTE']]];
const AVERIA = [
  'Averia ',
  [
    ['Producto', 'Barcode', 'Descripción', 'Bodega', 'OC', 'UOM', 'Averia', 'Manchado ', 'Foto'],
    [150222430002, 2050039062096, 'TE2114 "Eyelet, IVORY, M', 'Domestic', 180131238, 'UN', 'Manchado', 1, ''],
  ],
];
const DIFERENCIA = [
  'Diferencia',
  [
    ['Producto', 'Barcode', 'Descripción', 'Bodega', 'OC', 'UOM', 'Esperada', 'Recibida', ' Diferencia', 'DOCUMENTO', 'COMENTARIO'],
    [150222429001, 2050039062027, 'TE2032, BLACK, S', 'Domestic', 180131238, 'UN', 6, 5, -1, 4904530773, 'DIFERENCIAS POR TALLA (FALTANTE)'],
    [150222429002, 2050039062034, 'TE2032, BLACK, M', 'Domestic', 180131238, 'UN', 6, 7, 1, '', ''],
    [150222429003, 2050039062041, 'TE2032, BLACK, L', 'Domestic', 180131238, 'UN', 6, 6, 0, '', ''],
  ],
];
const SOBRANTE = [
  'Sobrante NO esperado ',
  [
    ['CODIGO', 'REFERENCIA ', 'COLOR', 'TALLA ', 'CANTIDAD'],
    ['', 'TY1374', 'OFF WHITE MIX', 'S', 2],
    [7701234500042, 'TY1374', 'OFF WHITE MIX', 'M', 3],
    ['', '', '', '', ''],
  ],
];

test('motivo «sobrante no esperado» antes que sobrante; es un tipo que decide la compradora', () => {
  assert.equal(detectarTipoPorMotivo('SOBRANTE NO ESPERADO'), 'sobrante_no_esperado');
  assert.equal(detectarTipoPorMotivo('Sobrante'), 'sobrante_real');
  assert.ok(TIPOS.includes('sobrante_no_esperado'));
  assert.equal(esAutoAprobado('sobrante_no_esperado'), false);
  assert.deepEqual(TIPOS_SOBRANTE, ['sobrante_real', 'sobrante_no_esperado']);
});

test('CEDI por hojas: avería = daño, diferencia por signo, sobrante no esperado sin código obligatorio', () => {
  const r = parsearPlantilla(libro(RESUMEN, AVERIA, DIFERENCIA, SOBRANTE));
  assert.equal(r.formato, 'cedi');
  assert.equal(r.plantilla, 'cedi_hojas');
  assert.equal(r.hoja, 'Averia, Diferencia, Sobrante NO esperado');
  const resumen = r.lineas.map((l) => [l.posicion, l.codigoBarra, l.tipo, l.cantidad]);
  assert.deepEqual(resumen, [
    [1, '2050039062096', 'danos_textil', 1],
    [2, '2050039062027', 'faltante_real', 1],
    [3, '2050039062034', 'sobrante_real', 1],
    // diferencia 0: se omite; fila vacía de sobrante: se omite
    [4, null, 'sobrante_no_esperado', 2],
    [5, '7701234500042', 'sobrante_no_esperado', 3],
  ]);
  assert.equal(r.lineas[0].motivoTexto, 'DEFECTUOSO / AVERÍA (Manchado)');
  assert.equal(r.lineas[0].cedi.averiadas, 1);
  assert.equal(r.lineas[1].cedi.documento, '4904530773');
  assert.deepEqual(
    [r.lineas[3].referencia, r.lineas[3].color, r.lineas[3].talla, r.lineas[3].descripcion],
    ['TY1374', 'OFF WHITE MIX', 'S', 'TY1374, OFF WHITE MIX, S']
  );
  assert.deepEqual(r.documentosSap, ['4904530773']);
  assert.deepEqual(r.faltantesSinDocumento, []);
  assert.deepEqual(r.desglose, { danos_textil: 1, faltante_real: 1, sobrante_real: 1, sobrante_no_esperado: 2 });
});

test('CEDI por hojas: el faltante sin DOCUMENTO no deja crear el reclamo', () => {
  const [nombre, filas] = DIFERENCIA;
  const sinDoc = filas.map((f, i) => (i === 1 ? f.map((c, j) => (j === 9 ? '' : c)) : f));
  const r = parsearPlantilla(libro([nombre, sinDoc]));
  assert.deepEqual(r.faltantesSinDocumento, [{ hoja: 'Diferencia', fila: 2, codigoBarra: '2050039062027' }]);
  const m = motivoFaltantesSinDocumento(r.faltantesSinDocumento);
  assert.equal(m.code, 'FALTANTE_SIN_DOCUMENTO');
  assert.match(m.mensaje, /fila 2 \(2050039062027\)/);
  assert.equal(motivoFaltantesSinDocumento([]), null);
});

test('CEDI por hojas: basta con una de las hojas', () => {
  const r = parsearPlantilla(libro(SOBRANTE));
  assert.equal(r.lineas.length, 2);
  assert.ok(r.lineas.every((l) => l.tipo === 'sobrante_no_esperado'));
});

test('Tienda: «sobrante no esperado» cuenta como sobrante (el motivo nuevo es solo de CEDI)', () => {
  const r = parsearPlantilla(
    libro(['Hoja1', [['FECHA', 'CÓDIGO DE BARRA', 'DESCRIPCIÓN', 'CANTIDAD RECLAMADA', 'DOCUMENTO SAP', 'MOTIVO'], ['01/11/2026', '7701234500011', 'Perfume', 1, '4900000001', 'SOBRANTE NO ESPERADO']]])
  );
  assert.equal(r.formato, 'tienda');
  assert.equal(r.lineas[0].tipo, 'sobrante_real');
});

test('enviar a contabilidad: no mientras haya sobrantes no esperados aprobados esperando a Data', () => {
  const m = motivoNoEnviarContabilidad({ Status: 'resuelto', LineasEsperaData: 2, LineasSobranteAprobadas: 2 }, []);
  assert.equal(m.code, 'ESPERA_DATA');
  assert.match(m.mensaje, /2 sobrantes no esperados aprobados/);
  // La compradora sí puede cerrar aunque haya sobrantes no esperados sin SAP.
  assert.equal(motivoNoDecidir({ Status: 'pendiente', LineasPendientes: 0, LineasEsperaData: 2 }), null);
});

test('código de Data: obligatorio y solo números', () => {
  assert.equal(codigoDataSchema.safeParse({ codigoBarra: ' 7701234500042 ' }).data.codigoBarra, '7701234500042');
  assert.equal(codigoDataSchema.safeParse({ codigoBarra: '' }).success, false);
  assert.equal(codigoDataSchema.safeParse({ codigoBarra: 'ABC123' }).success, false);
});

test('corregir productos: sin código solo en sobrante no esperado', () => {
  const ok = corregirLineasSchema.safeParse({ lineas: [{ lineaId: 1, codigoBarra: null, cantidad: 2, tipo: 'sobrante_no_esperado' }] });
  assert.equal(ok.success, true);
  assert.equal(ok.data.lineas[0].codigoBarra, '');
  const mal = corregirLineasSchema.safeParse({ lineas: [{ lineaId: 1, codigoBarra: '', cantidad: 2, tipo: 'sobrante_real' }] });
  assert.equal(mal.success, false);
});

test('aviso a Data: tabla con código, referencia, color, talla y cantidad', () => {
  const { asunto, html, texto } = plantillaDataArticulos(
    { Numero: 'REC-000099', Token: 't', Proveedor: 'GIGIO', SapDocs: ['4904530773'] },
    [{ posicion: 4, codigoBarra: null, referencia: 'TY1374', color: 'OFF WHITE MIX', talla: 'S', cantidad: 2 }],
    { de: 'Ana' }
  );
  assert.equal(asunto, 'Artículos por crear en SAP: REC-000099 — GIGIO');
  assert.match(texto, /Sin código \| TY1374 \| OFF WHITE MIX \| S \| 2/);
  assert.match(texto, /Ana aprobó en un reclamo de CEDI un sobrante no esperado que no está creado en SAP/);
  assert.match(html, /OFF WHITE MIX/);
});
