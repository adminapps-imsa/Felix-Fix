// Muestra un reclamo de la base de este ambiente, solo lectura.
// Lo dispara la llave SSH de QA en Prod (felix-desplegar reclamo REC-000006)
// para revisar un reclamo de Prod sin que las credenciales salgan de Prod.
//
//   node deploy/prod/ver-reclamo.js REC-000006
//   node deploy/prod/ver-reclamo.js 6
//
// No muestra el Token (va en las URLs del portal) ni rutas de archivos.
import { getPool, closePool, sql, S } from '../../src/config/db.js';

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
} finally {
  await closePool();
}
