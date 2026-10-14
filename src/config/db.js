import sql from 'mssql';
import { env, isDbConfigured } from './env.js';
import { logger } from '../utils/logger.js';

let poolPromise = null;

// Prefijo de esquema para las consultas, p. ej. `SELECT * FROM ${S}.Tiendas`.
export const S = `[${env.db.schema}]`;

export function getPool() {
  if (!isDbConfigured()) {
    throw new Error('MSSQL no está configurado: faltan DB_SERVER/DB_NAME/DB_USER/DB_PASSWORD en el entorno.');
  }
  if (!poolPromise) {
    const pool = new sql.ConnectionPool({
      server: env.db.server,
      port: env.db.port,
      database: env.db.database,
      user: env.db.user,
      password: env.db.password,
      options: {
        encrypt: env.db.encrypt,
        trustServerCertificate: env.db.trustServerCertificate,
      },
      pool: { min: 1, max: 10, idleTimeoutMillis: 30000 },
    });
    // Sin este listener, un error de una conexión ociosa (red, reinicio del
    // SQL Server) se emite sin manejar y tumba el proceso.
    pool.on('error', (err) => logger.error({ err }, 'Error en el pool de MSSQL'));
    poolPromise = pool
      .connect()
      .catch((err) => {
        poolPromise = null;
        logger.error({ err }, 'Fallo al conectar el pool de MSSQL');
        throw err;
      });
  }
  return poolPromise;
}

export { sql };

/** Cierra el pool al apagar el servicio (reinicio/deploy), sin cortar consultas a medias. */
export async function closePool() {
  if (!poolPromise) return;
  try {
    await (await poolPromise).close();
  } catch {
    /* ya estaba caído: nada que cerrar */
  }
  poolPromise = null;
}
