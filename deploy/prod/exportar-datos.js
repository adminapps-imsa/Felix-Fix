// Exporta los datos de Prod que se copian a QA para probar con lo real
// (pedido del 2026-11-13): Reclamos, Productos Dañados, tiendas por usuario y
// catálogos. Solo lectura: escribe un JSON en stdout. Lo dispara
// `felix-desplegar exportar`, que lo empaqueta con los archivos (uploads) y
// lo manda por la llave SSH de QA; las credenciales no salen de Prod.
// En QA se carga con deploy/qa/importar-desde-prod.js.
//
//   node deploy/prod/exportar-datos.js > datos.json
import { getPool, closePool, S } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';

// Orden de carga (padres antes que hijos).
export const TABLAS = [
  'Tiendas',
  'UsuarioTiendas',
  'ReclamoCatalogos',
  'Reclamos',
  'ReclamoLineas',
  'ReclamoComentarios',
  'ReclamoDocumentosContabilidad',
  'ReportesProductoDanado',
  'ReportesProductoDanadoHistorial',
];

try {
  const pool = await getPool();
  const datos = { esquema: env.db.schema, exportado: new Date().toISOString(), tablas: {} };
  for (const t of TABLAS) datos.tablas[t] = (await pool.request().query(`SELECT * FROM ${S}.${t}`)).recordset;
  process.stdout.write(JSON.stringify(datos));
} catch (err) {
  console.error(`No se pudo exportar: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
