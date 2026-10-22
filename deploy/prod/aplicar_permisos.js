// Corre deploy/prod/permisos_roles_prod.sql contra la base del .env (en el
// servidor no hay sqlcmd). El script ya apunta a [Prod], así que da igual el
// DB_SCHEMA del .env. Se corre una vez, después de `node sql/migrate.js Prod`:
//   node deploy/prod/aplicar_permisos.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../../src/config/db.js';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'permisos_roles_prod.sql');
const pool = await getPool();
try {
  const req = pool.request();
  req.on('info', (m) => console.log(m.message));
  const { recordset } = await req.batch(fs.readFileSync(file, 'utf8'));
  console.table(recordset);
} finally {
  await pool.close();
}
