import pino from 'pino';
import { env } from '../config/env.js';

// Bitácora (Configuración → Bitácora): los avisos y errores del log que no
// vienen de una petición (SAP, correo, Keycloak…) también se anotan ahí. El
// registro se engancha al arrancar (services/bitacora/registro.js) para no
// crear un ciclo de imports con la BD. Se saltan: los logs de pino-http
// (traen req/res; las peticiones ya las anota el middleware) y los marcados
// con `bitacora: false` (los de la propia bitácora y los errores HTTP).
let alProblema = null;
export const alRegistrarProblema = (fn) => {
  alProblema = fn;
};

export const logger = pino({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.SAP_ORACLE_PASSWORD'],
  hooks: {
    logMethod(args, method, level) {
      if (level >= 40 && alProblema) {
        const [a, b] = args;
        const datos = a && typeof a === 'object' ? a : null;
        const mensaje = typeof a === 'string' ? a : typeof b === 'string' ? b : null;
        if (mensaje && !(datos && (datos.bitacora === false || datos.req || datos.res))) {
          try {
            alProblema(level, mensaje, datos);
          } catch {
            // la bitácora nunca rompe el log
          }
        }
      }
      return method.apply(this, args);
    },
  },
});
