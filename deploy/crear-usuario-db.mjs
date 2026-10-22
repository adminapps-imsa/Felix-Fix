// Crea el usuario de base de datos propio de este ambiente y deja el .env usándolo.
//
//   node deploy/crear-usuario-db.mjs
//
// Usa el usuario actual del .env (administrador) solo para crear el nuevo:
//   login  felixfix_<esquema>  (felixfix_qa en QA, felixfix_prod en Prod)
//   en la base DB_NAME, con permisos SOLO sobre su esquema (DB_SCHEMA):
//   leer, escribir y crear/cambiar tablas (para las migraciones).
//   Además, solo lectura de la tabla externa RECLAMOS_COMPRADORAS_TABLA
//   (FelixApproval.dbo.compradoras_proveedores) y de ninguna otra tabla de esa base.
//   Nada en otras bases ni en el otro esquema.
// La contraseña se genera aquí y no se muestra: va directo al .env (con respaldo en .env.antes-usuario-db).
// Antes de tocar el .env se conecta con el usuario nuevo y comprueba lo que puede y no puede ver.
// Si el .env ya usa el usuario nuevo, vuelve a aplicar los permisos con el administrador
// del respaldo y los prueba, sin cambiar la contraseña ni el .env.
// Después hay que reiniciar el servicio: systemctl restart api-factura
import crypto from 'node:crypto';
import fs from 'node:fs';
import sql from 'mssql';
import { parse } from 'dotenv';
import { env } from '../src/config/env.js';

const ENV_PATH = new URL('../.env', import.meta.url);
const RESPALDO = new URL('../.env.antes-usuario-db', import.meta.url);
const { server, port, database, schema, encrypt, trustServerCertificate } = env.db;
const login = `felixfix_${schema.toLowerCase()}`;
const otroEsquema = schema.toLowerCase() === 'prod' ? 'QA' : 'Prod';
// «[FelixApproval].[dbo].[compradoras_proveedores]» -> base, esquema y tabla.
const [extDb, extEsquema, extTabla] = env.reclamos.compradorasTabla.replace(/[[\]]/g, '').split('.');
const corchetes = (s) => `[${s.replace(/]/g, ']]')}]`;

if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(schema)) throw new Error(`DB_SCHEMA inválido: ${schema}`);

const conectar = (user, password, db = database) =>
  new sql.ConnectionPool({ server, port, database: db, user, password, options: { encrypt, trustServerCertificate } }).connect();

// Ya migrado: el administrador está en el respaldo y la contraseña del usuario nuevo en el .env.
const yaMigrado = env.db.user.toLowerCase() === login;
let adminUser = env.db.user;
let adminPassword = env.db.password;
let password;
if (yaMigrado) {
  if (!fs.existsSync(RESPALDO)) throw new Error('El .env ya usa el usuario nuevo y no está el respaldo .env.antes-usuario-db con el administrador.');
  const anterior = parse(fs.readFileSync(RESPALDO, 'utf8'));
  adminUser = anterior.DB_USER;
  adminPassword = anterior.DB_PASSWORD;
  password = env.db.password;
  console.log(`El .env ya usa ${login}: se vuelven a aplicar los permisos (sin cambiar la contraseña ni el .env).`);
} else {
  // Cumple la política de contraseñas de Windows (mayúscula, minúscula, número y símbolo).
  password = `${crypto.randomBytes(24).toString('base64url')}aA1!`;
}

console.log(`== 1. Permisos de ${login} en ${database} (esquema ${schema}) y en ${extDb} (solo ${extEsquema}.${extTabla}), con ${adminUser}`);
const admin = await conectar(adminUser, adminPassword, 'master');
try {
  if (!yaMigrado) {
    await admin
      .request()
      .input('login', sql.NVarChar, login)
      .input('pwd', sql.NVarChar, password)
      .input('db', sql.NVarChar, database)
      .query(`
        DECLARE @s NVARCHAR(MAX);
        IF SUSER_ID(@login) IS NULL
          SET @s = N'CREATE LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + QUOTENAME(@pwd, '''') +
                   N', DEFAULT_DATABASE = ' + QUOTENAME(@db) + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF';
        ELSE
          SET @s = N'ALTER LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + QUOTENAME(@pwd, '''');
        EXEC (@s);`);
  }
  await admin
    .request()
    .input('login', sql.NVarChar, login)
    .input('schema', sql.NVarChar, schema)
    .query(`
      USE ${corchetes(database)};
      DECLARE @s NVARCHAR(MAX);
      IF USER_ID(@login) IS NULL
      BEGIN
        SET @s = N'CREATE USER ' + QUOTENAME(@login) + N' FOR LOGIN ' + QUOTENAME(@login) + N' WITH DEFAULT_SCHEMA = ' + QUOTENAME(@schema);
        EXEC (@s);
      END
      SET @s = N'GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, REFERENCES, ALTER, VIEW DEFINITION ON SCHEMA::' + QUOTENAME(@schema) + N' TO ' + QUOTENAME(@login);
      EXEC (@s);
      SET @s = N'GRANT CREATE TABLE TO ' + QUOTENAME(@login);
      EXEC (@s);`);
  if (extDb !== database) {
    await admin
      .request()
      .input('login', sql.NVarChar, login)
      .input('esquema', sql.NVarChar, extEsquema)
      .input('tabla', sql.NVarChar, extTabla)
      .query(`
        USE ${corchetes(extDb)};
        DECLARE @s NVARCHAR(MAX);
        IF USER_ID(@login) IS NULL
        BEGIN
          SET @s = N'CREATE USER ' + QUOTENAME(@login) + N' FOR LOGIN ' + QUOTENAME(@login);
          EXEC (@s);
        END
        SET @s = N'GRANT SELECT ON ' + QUOTENAME(@esquema) + N'.' + QUOTENAME(@tabla) + N' TO ' + QUOTENAME(@login);
        EXEC (@s);`);
  }
} finally {
  await admin.close();
}

console.log(`== 2. Probando con ${login}`);
const nuevo = await conectar(login, password);
const fallos = [];
try {
  const q = async (s) => (await nuevo.request().query(s)).recordset;
  const [yo] = await q(`SELECT SUSER_SNAME() AS login, IS_SRVROLEMEMBER('sysadmin') AS sysadmin`);
  if (yo.sysadmin) fallos.push('es sysadmin');
  const bases = (await q(`SELECT name FROM sys.databases WHERE HAS_DBACCESS(name) = 1`)).map((r) => r.name);
  const ajenas = bases.filter((b) => ![database, extDb, 'master', 'tempdb', 'msdb'].includes(b));
  if (ajenas.length) fallos.push(`ve otras bases: ${ajenas.join(', ')}`);
  console.log(`   bases que ve: ${bases.join(', ')} (master, tempdb y msdb las ve cualquier usuario)`);
  const [n] = await q(`SELECT COUNT(*) AS n FROM [${schema}].SchemaMigrations`);
  console.log(`   lee su esquema ${schema}: sí (${n.n} migraciones)`);
  await q(`CREATE TABLE [${schema}].[__prueba_permisos] (Id INT); DROP TABLE [${schema}].[__prueba_permisos];`);
  console.log(`   crea y borra tablas en ${schema} (migraciones): sí`);
  try {
    await q(`SELECT TOP 1 1 FROM [${otroEsquema}].SchemaMigrations`);
    fallos.push(`puede leer el esquema ${otroEsquema}`);
  } catch {
    console.log(`   lee el esquema ${otroEsquema}: no`);
  }
  if (extDb !== database) {
    const [c] = await q(`SELECT COUNT(*) AS n FROM ${env.reclamos.compradorasTabla}`);
    console.log(`   lee ${extDb}.${extEsquema}.${extTabla}: sí (${c.n} filas)`);
    // Solo se ven los objetos con algún permiso: debe ser únicamente esa tabla.
    const visibles = (await q(`SELECT s.name + '.' + o.name AS n FROM ${corchetes(extDb)}.sys.objects o JOIN ${corchetes(extDb)}.sys.schemas s ON s.schema_id = o.schema_id WHERE o.is_ms_shipped = 0 AND o.type IN ('U','V','P','FN','IF','TF')`)).map((r) => r.n);
    const otras = visibles.filter((v) => v.toLowerCase() !== `${extEsquema}.${extTabla}`.toLowerCase());
    if (otras.length) fallos.push(`ve otras tablas de ${extDb}: ${otras.join(', ')}`);
    else console.log(`   otras tablas de ${extDb}: ninguna`);
  }
} catch (err) {
  fallos.push(err.message);
} finally {
  await nuevo.close();
}
if (fallos.length) {
  console.error(`NO se cambió el .env. Problemas: ${fallos.join('; ')}`);
  process.exit(1);
}

if (yaMigrado) {
  console.log('Listo. El .env no cambió. Falta reiniciar: systemctl restart api-factura');
  process.exit(0);
}

console.log('== 3. Actualizando el .env');
const original = fs.readFileSync(ENV_PATH, 'utf8');
fs.writeFileSync(RESPALDO, original, { mode: 0o600 });
const cambiado = original
  .replace(/^DB_USER=.*$/m, `DB_USER=${login}`)
  .replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${password}`);
// writeFile sobre el archivo existente conserva su dueño y permisos (root:www-data 640).
fs.writeFileSync(ENV_PATH, cambiado);
console.log(`   DB_USER=${login} (la contraseña quedó en el .env; el anterior está en .env.antes-usuario-db)`);
console.log('Listo. Falta reiniciar: systemctl restart api-factura');
