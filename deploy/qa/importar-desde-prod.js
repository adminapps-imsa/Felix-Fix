// Carga en QA los datos exportados de Prod (`felix-desplegar exportar`), para
// probar con lo real (pedido del 2026-11-13). REEMPLAZA en QA:
//   Reclamos (con productos, comentarios y documentos a contabilidad),
//   Productos Dañados (con su historial), tiendas por usuario y los catálogos
//   de reclamos. Los números quedan iguales a Prod (REC-000044 = REC-000044).
// Copia los archivos (Excel, PDF, fotos, adjuntos) a uploads/QA.
// No toca roles, permisos, compradoras ni la bitácora.
//
// Protecciones: solo corre con DB_SCHEMA=QA. Los datos de Prod tienen
// personas reales: fuera de Prod todo correo va solo a CORREOS_PRUEBA
// (services/correo/mailer.js), así que ninguna prueba les escribe.
//
// Uso (como felixops, que lee el .env de QA):
//   ssh -i ~/.ssh/felix-desplegar root@172.16.99.160 exportar > /tmp/felix-prod.tgz
//   sudo -u felixops /opt/node-22/bin/node deploy/qa/importar-desde-prod.js /tmp/felix-prod.tgz
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { env } from '../../src/config/env.js';
import { getPool, closePool, sql, S } from '../../src/config/db.js';
import { redirigirFueraDeProd, CORREOS_PRUEBA } from '../../src/services/correo/mailer.js';

const TABLAS = [
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
// Se borran de hijos a padres. Tiendas no se borra: se empareja por código.
const BORRAR = [
  'ReportesProductoDanadoHistorial',
  'ReportesProductoDanado',
  'ReclamoDocumentosContabilidad',
  'ReclamoComentarios',
  'ReclamoLineas',
  'Reclamos',
  'ReclamoCatalogos',
  'UsuarioTiendas',
];

function salir(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

const archivo = process.argv[2];
if (!archivo || !fs.existsSync(archivo)) salir('Indica el archivo exportado de Prod (.tgz). Ver el comentario de este script.');
if (env.db.schema !== 'QA') salir(`Este script solo carga en QA (el .env dice DB_SCHEMA=${env.db.schema}).`);
if (!redirigirFueraDeProd({ para: ['x@x.com'], asunto: '' }, env.db.schema)) salir('El correo de este ambiente no está redirigido a los de prueba.');
console.log(`Correo de QA: ${env.correo.desactivado ? 'apagado' : `solo a ${CORREOS_PRUEBA.join(' y ')}`}.`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'felix-prod-'));
try {
  execFileSync('tar', ['xzf', path.resolve(archivo), '-C', tmp]);
  const datos = JSON.parse(fs.readFileSync(path.join(tmp, 'datos.json'), 'utf8'));
  if (datos.esquema !== 'Prod') salir(`El archivo no viene de Prod (esquema ${datos.esquema}).`);
  console.log(`Datos de Prod exportados el ${datos.exportado}`);

  const pool = await getPool();
  // Columnas y tipos de QA (manda QA: si Prod tiene una columna que QA no, se ignora).
  const { recordset: cols } = await pool
    .request()
    .input('esquema', sql.NVarChar(128), 'QA')
    .query(`SELECT c.TABLE_NAME AS tabla, c.COLUMN_NAME AS columna, c.DATA_TYPE AS tipo,
                   COLUMNPROPERTY(OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)), c.COLUMN_NAME, 'IsIdentity') AS identidad
            FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = @esquema`);
  const columnas = new Map();
  for (const c of cols) {
    if (!columnas.has(c.tabla)) columnas.set(c.tabla, []);
    columnas.get(c.tabla).push(c);
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const r = () => new sql.Request(tx);
  const resumen = {};
  try {
    // Tiendas: se emparejan por código; las que QA no tiene se agregan.
    const { recordset: tiendasQa } = await r().query(`SELECT TiendaId, Codigo FROM ${S}.Tiendas`);
    const porCodigo = new Map(tiendasQa.map((t) => [t.Codigo.trim().toUpperCase(), t.TiendaId]));
    const tiendaQa = new Map();
    for (const t of datos.tablas.Tiendas ?? []) {
      const k = t.Codigo.trim().toUpperCase();
      if (!porCodigo.has(k)) {
        const { recordset } = await r()
          .input('codigo', sql.VarChar(20), t.Codigo)
          .input('nombre', sql.NVarChar(150), t.Nombre)
          .query(`INSERT INTO ${S}.Tiendas (Codigo, Nombre) OUTPUT INSERTED.TiendaId VALUES (@codigo, @nombre)`);
        porCodigo.set(k, recordset[0].TiendaId);
      } else {
        // Mismo nombre que en Prod (p. ej. «Costa del Este»).
        await r().input('id', sql.Int, porCodigo.get(k)).input('nombre', sql.NVarChar(150), t.Nombre).query(`UPDATE ${S}.Tiendas SET Nombre = @nombre WHERE TiendaId = @id`);
      }
      tiendaQa.set(t.TiendaId, porCodigo.get(k));
    }

    for (const t of BORRAR) {
      const res = await r().query(`DELETE FROM ${S}.${t}`);
      resumen[t] = { borradas: res.rowsAffected[0], cargadas: 0 };
    }

    for (const t of TABLAS.filter((x) => x !== 'Tiendas')) {
      const filas = datos.tablas[t] ?? [];
      const defs = (columnas.get(t) ?? []).filter((c) => filas.length && c.columna in filas[0]);
      if (!defs.length) continue;
      const identidad = defs.some((c) => c.identidad === 1);
      const lista = defs.map((c) => `[${c.columna}]`).join(', ');
      for (const f of filas) {
        const req = r();
        defs.forEach((c, i) => {
          let v = f[c.columna];
          if (v !== null && v !== undefined) {
            if (c.columna === 'TiendaId') v = tiendaQa.get(v) ?? null;
            else if (['datetime2', 'datetime', 'date', 'smalldatetime', 'datetimeoffset'].includes(c.tipo)) v = new Date(v);
          }
          const tipo =
            c.tipo === 'uniqueidentifier'
              ? sql.UniqueIdentifier
              : c.tipo === 'bit'
                ? sql.Bit
                : ['int', 'bigint', 'smallint', 'tinyint'].includes(c.tipo)
                  ? sql.BigInt
                  : ['decimal', 'numeric', 'float', 'real', 'money'].includes(c.tipo)
                    ? sql.Decimal(18, 4)
                    : c.tipo.includes('date')
                      ? sql.DateTime2
                      : sql.NVarChar(sql.MAX);
          req.input(`p${i}`, tipo, v ?? null);
        });
        const valores = defs.map((_, i) => `@p${i}`).join(', ');
        await req.query(
          identidad
            ? `SET IDENTITY_INSERT ${S}.${t} ON; INSERT INTO ${S}.${t} (${lista}) VALUES (${valores}); SET IDENTITY_INSERT ${S}.${t} OFF;`
            : `INSERT INTO ${S}.${t} (${lista}) VALUES (${valores});`
        );
        resumen[t].cargadas += 1;
      }
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }

  // Que los números nuevos de QA sigan después de los de Prod (si el usuario de QA puede).
  for (const t of ['Reclamos', 'ReportesProductoDanado']) {
    try {
      await pool.request().query(`DECLARE @m BIGINT = (SELECT ISNULL(MAX(${t === 'Reclamos' ? 'ReclamoId' : 'ReporteId'}), 0) FROM ${S}.${t}); DBCC CHECKIDENT ('${S}.${t}', RESEED, @m) WITH NO_INFOMSGS;`);
    } catch (err) {
      console.log(`  (no se pudo reajustar la numeración de ${t}: ${err.message}; los nuevos de QA seguirán con su número anterior)`);
    }
  }

  // Archivos: los de Prod se copian a las carpetas de QA (nombres únicos; no se pisa nada).
  const copiar = (origen, destino) => {
    if (!fs.existsSync(origen)) return 0;
    fs.mkdirSync(destino, { recursive: true });
    let n = 0;
    for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
      const o = path.join(origen, e.name);
      const d = path.join(destino, e.name);
      if (e.isDirectory()) n += copiar(o, d);
      else if (!fs.existsSync(d)) {
        fs.copyFileSync(o, d);
        n += 1;
      }
    }
    return n;
  };
  const nReclamos = copiar(path.join(tmp, 'reclamos'), env.reclamos.localDir);
  const nPd = copiar(path.join(tmp, 'productos-danados'), env.evidence.localDir);

  console.log('\nTabla                              borradas  cargadas');
  for (const [t, v] of Object.entries(resumen)) console.log(`${t.padEnd(34)} ${String(v.borradas).padStart(8)}  ${String(v.cargadas).padStart(8)}`);
  console.log(`\nArchivos copiados: ${nReclamos} de reclamos, ${nPd} de productos dañados.`);
  console.log('✓ QA quedó con los datos de Prod.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  await closePool();
}
