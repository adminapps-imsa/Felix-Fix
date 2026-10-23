import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './config/db.js';
import { logger } from './utils/logger.js';
import { prepararEvidencia } from './services/evidenceStorage/index.js';
import { mapaRoles } from './services/acceso/keycloakAdmin.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`Felix Fix API escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  prepararEvidencia();
  // Los roles de Keycloak listos antes de la primera pantalla (si falla, se arma al primer pedido).
  mapaRoles().catch((err) => logger.warn({ err: err.message }, 'No se pudieron cargar los roles de Keycloak al arrancar'));
});

// Una promesa sin catch no debe pasar en silencio: queda en el log para corregirla.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesa rechazada sin manejar');
});

// Un error no capturado deja el proceso en estado desconocido: se registra y
// se sale, y systemd (Restart=on-failure) lo vuelve a levantar.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Error no capturado: reiniciando el proceso');
  process.exit(1);
});

// systemctl restart/stop: deja terminar las peticiones en curso antes de salir.
function apagar(signal) {
  logger.info(`${signal} recibido: cerrando el servidor`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
