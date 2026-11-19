import oracledb from 'oracledb';
import { env, isSapConfigured } from './env.js';
import { logger } from '../utils/logger.js';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let poolPromise = null;

/**
 * Pool de OracleDB en modo "thin" (sin cliente Oracle instalado) para SAP:
 * consulta de productos de Reclamos y, cuando exista, la baja de inventario.
 * Carga perezosa: no se conecta hasta la primera consulta.
 */
export function getSapOraclePool() {
  if (!isSapConfigured()) {
    throw new Error(
      'La conexión Oracle/SAP no está configurada (DB_SAP_* o SAP_ORACLE_USER/PASSWORD/CONNECT_STRING).'
    );
  }
  if (!poolPromise) {
    poolPromise = oracledb
      .createPool({
        user: env.sap.user,
        password: env.sap.password,
        connectString: env.sap.connectString,
        poolMin: 0,
        poolMax: 5,
        // Conexiones libres se guardan 10 min: abrir una nueva a SAP tarda.
        poolTimeout: 600,
        // Si SAP no contesta, se rinde a los 8 s (antes 20 s por intento).
        transportConnectTimeout: 8,
        // Revisa cada minuto que la conexión guardada siga viva (un firewall puede cortarla).
        expireTime: 1,
      })
      .catch((err) => {
        poolPromise = null;
        logger.error({ err }, 'Fallo al crear el pool de OracleDB (SAP)');
        throw err;
      });
  }
  return poolPromise;
}
