// Aplica las migraciones de sql/migrations/ sobre un esquema de SQL Server.
//
//   node sql/migrate.js QA      -> crea el esquema QA si no existe y corre 000..NNN
//   node sql/migrate.js Prod
//   node sql/migrate.js         -> usa DB_SCHEMA del .env
//
// Los scripts usan $(SCHEMA) como marcador (formato de variables de sqlcmd),
// así también se pueden correr a mano: sqlcmd -v SCHEMA=QA -i archivo.sql
// Cada script es idempotente, así que volver a correrlo no duplica nada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../src/config/db.js';
import { env, SCHEMA_PATTERN } from '../src/config/env.js';

const schema = process.argv[2] || env.db.schema;
if (!SCHEMA_PATTERN.test(schema)) {
  console.error(`Nombre de esquema inválido: "${schema}"`);
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

const pool = await getPool();
try {
  await pool.request().batch(`IF SCHEMA_ID('${schema}') IS NULL EXEC('CREATE SCHEMA [${schema}]')`);
  console.log(`Esquema ${schema} listo en ${env.db.database}`);

  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8').replaceAll('$(SCHEMA)', `[${schema}]`);
    // SCHEMA_ID('[QA]') no existe: dentro de comillas va el nombre sin corchetes.
    const sqlText = text.replace(/'\[([^\]]+)\]/g, "'$1");
    const batches = sqlText.split(/^\s*GO\s*$/m).map((b) => b.trim()).filter(Boolean);
    for (const b of batches) await pool.request().batch(b);
    console.log(`  ${file} ok`);
  }
} finally {
  await pool.close();
}
