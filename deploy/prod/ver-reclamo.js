// Muestra un reclamo de la base de este ambiente, solo lectura.
// Lo dispara la llave SSH de QA en Prod (felix-desplegar reclamo REC-000006)
// para revisar un reclamo de Prod sin que las credenciales salgan de Prod.
//
//   node deploy/prod/ver-reclamo.js REC-000006
//   node deploy/prod/ver-reclamo.js 6
//
// No muestra el Token (va en las URLs del portal) ni rutas de archivos.
import { getPool, closePool, sql, S } from '../../src/config/db.js';
import { reclamoArchivoPath } from '../../src/config/almacenamiento.js';
import { leerNotaPdf } from '../../src/services/contabilidad/leerNotaPdf.js';
import { claveProducto } from '../../src/services/contabilidad/validarDocumento.js';
import { materialesDeCodigos } from '../../src/services/sapProductosService.js';

const arg = String(process.argv[2] ?? '').trim();
const m = /^(?:REC-?)?0*(\d{1,9})$/i.exec(arg);
if (!m) {
  console.error(`Número de reclamo inválido: «${arg}». Ejemplo: REC-000006`);
  process.exit(2);
}
const id = Number(m[1]);
const numero = `REC-${String(id).padStart(6, '0')}`;

const hora = (d) => (d ? new Date(d).toLocaleString('es-PA', { timeZone: 'America/Panama', hour12: false }) : '—');
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const txt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

try {
  const pool = await getPool();
  const r = (await pool.request().input('id', sql.BigInt, id).query(`SELECT * FROM ${S}.Reclamos WHERE ReclamoId = @id`)).recordset[0];
  if (!r) {
    console.log(`${numero}: no existe en este ambiente.`);
    process.exit(1);
  }
  const lineas = (
    await pool.request().input('t', sql.UniqueIdentifier, r.Token).query(
      `SELECT Posicion, CodigoBarra, DescripcionExcel, Cantidad, Tipo, DecStatus, DecComentario, DecAt, DecBy
       FROM ${S}.ReclamoLineas WHERE ReclamoToken = @t ORDER BY Posicion`
    )
  ).recordset;
  const docs = (
    await pool.request().input('id', sql.BigInt, id).query(
      `SELECT NumeroDocumento, TipoDocumento, Movimiento, FechaDocumento, Total, Estado, EnviadoAt, EnviadoPor
       FROM ${S}.ReclamoDocumentosContabilidad WHERE ReclamoId = @id ORDER BY EnviadoAt`
    )
  ).recordset;

  console.log(`${numero}  (esquema ${S})`);
  console.log(`  Tipo: ${r.Tipo}   Estado: ${r.Status}   Origen: ${r.Origen}`);
  console.log(`  Creado: ${hora(r.CreatedAt)} por ${txt(r.CreatedBy)}`);
  console.log(`  Proveedor: ${txt(r.Proveedor)}   Compradora: ${txt(r.Compradora)}`);
  console.log(`  Sucursal: ${txt(r.Sucursal)}   División: ${txt(r.Division)}   Mundo: ${txt(r.Mundo)}   Depto: ${txt(r.Departamento)}   Marca: ${txt(r.Marca)}`);
  console.log(`  Embarque/factura: ${txt(r.NumeroEmbarqueFactura)}   Llegada mercancía: ${dia(r.FechaLlegadaMercancia)}`);
  console.log(`  Motivo: ${txt(r.Motivo)}`);
  console.log(`  Comentario: ${txt(r.Comentario)}`);
  console.log(`  Decisión: ${hora(r.DecisionAt)} por ${txt(r.DecisionBy)}`);
  console.log(`  Enviado a contabilidad: ${hora(r.EnviadoContabilidadAt)} por ${txt(r.EnviadoContabilidadBy)}`);
  console.log(
    r.RetiroProveedorFecha
      ? `  Retiro del proveedor: ${dia(r.RetiroProveedorFecha)} (registró ${txt(r.RetiroProveedorPor)} el ${hora(r.RetiroProveedorRegistradoAt)}, foto: ${r.RetiroProveedorFoto ? 'sí' : 'no'})`
      : '  Retiro del proveedor: no registrado'
  );
  console.log(`  Productos (${lineas.length}):`);
  for (const l of lineas) {
    const dec = l.DecStatus === 'pendiente' ? 'pendiente' : `${l.DecStatus} ${hora(l.DecAt)} por ${txt(l.DecBy)}`;
    console.log(`    ${l.Posicion}. ${l.CodigoBarra}  ${txt(l.DescripcionExcel)}  cant ${txt(l.Cantidad)}  motivo ${l.Tipo}  → ${dec}${l.DecComentario ? `  («${l.DecComentario}»)` : ''}`);
  }
  console.log(`  Documentos a contabilidad (${docs.length}):`);
  for (const d of docs) {
    console.log(`    ${txt(d.NumeroDocumento)}  ${txt(d.TipoDocumento)}  ${txt(d.Movimiento)}  ${dia(d.FechaDocumento)}  total ${txt(d.Total)}  ${d.Estado}  enviado ${hora(d.EnviadoAt)} por ${txt(d.EnviadoPor)}`);
  }

  await documentosSap(r, lineas);
} finally {
  await closePool();
  try {
    const { getSapOraclePool } = await import('../../src/config/oracle.js');
    await (await getSapOraclePool()).close(0);
  } catch {
    /* sin SAP */
  }
}

/**
 * Documentos SAP del reclamo y sus PDF (911/912) con los productos que traen,
 * y si cada faltante aparece en algún PDF (por material SAP o por descripción).
 */
async function documentosSap(r, lineas) {
  const lista = (v) => {
    try {
      return Array.isArray(JSON.parse(v || '[]')) ? JSON.parse(v || '[]') : [];
    } catch {
      return [];
    }
  };
  const docs = [r.SapDoc1, r.SapDoc2, r.SapDoc3, ...lista(r.SapDocsExtra)].filter(Boolean);
  console.log(`  Documentos SAP del reclamo: ${docs.length ? docs.join(', ') : '—'}`);
  const pdfs = lista(r.AdjuntosExtra).filter((a) => a.tipo === 'pdf');
  console.log(`  PDF adjuntos (${pdfs.length}):`);
  const filasPdf = [];
  for (const a of pdfs) {
    const nota = await leerNotaPdf(reclamoArchivoPath(a.filename)).catch((e) => ({ legible: false, filas: [], error: e.message }));
    console.log(
      `    «${a.originalname}»  doc ${txt(nota.numeroDocumento)}  ${txt(nota.tipoDocumento)}  mov ${txt(nota.movimiento)}  ${txt(nota.fechaDocumento)}  total ${txt(nota.total)}  ${nota.legible ? `${nota.filas.length} fila(s)` : `ilegible: ${txt(nota.error)}`}${a.notaAprobada ? '  [912 validado]' : ''}`
    );
    for (const f of nota.filas) {
      console.log(`       ${txt(f.material)}  ${txt(f.descripcion)}  cant ${txt(f.cantidad)}  valor ${txt(f.valor)}`);
      filasPdf.push({ ...f, doc: nota.numeroDocumento });
    }
  }
  const faltantes = lineas.filter((l) => l.Tipo === 'faltante_real');
  if (!faltantes.length || !filasPdf.length) return;
  const sap = await materialesDeCodigos(faltantes.map((l) => l.CodigoBarra));
  const norm = (m) => String(m ?? '').trim().toUpperCase().replace(/^0+/, '');
  console.log(`  Faltantes contra los PDF (SAP ${sap.disponible ? 'disponible' : 'NO disponible'}):`);
  for (const l of faltantes) {
    const matnr = sap.materiales.get(String(l.CodigoBarra).trim()) ?? null;
    const porMat = matnr ? filasPdf.filter((f) => norm(f.material) === norm(matnr)) : [];
    const k = claveProducto(l.DescripcionExcel);
    const porDesc = k ? filasPdf.filter((f) => claveProducto(f.descripcion) === k) : [];
    const cant = (fs) => fs.reduce((a, f) => a + Number(f.cantidad || 0), 0);
    console.log(
      `    ${l.Posicion}. ${l.CodigoBarra}  material ${txt(matnr)}  cant ${txt(l.Cantidad)}  → por material: ${porMat.length ? `sí (cant ${cant(porMat)}, doc ${porMat.map((f) => f.doc).join('/')})` : 'no'}  · por descripción: ${porDesc.length ? `sí (cant ${cant(porDesc)})` : 'no'}`
    );
  }
}
