import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import productosDanadosRoutes from './routes/productosDanados.routes.js';
import tiendasRoutes from './routes/tiendas.routes.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import reclamosRoutes from './routes/reclamos.routes.js';
import configuracionRoutes from './routes/configuracion.routes.js';
import contabilidadRoutes from './routes/contabilidad.routes.js';
import tableroRoutes from './routes/tablero.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portalDistDir = path.join(__dirname, '..', 'portal', 'dist');

export function createApp() {
  const app = express();

  // El proxy de https://fix.felixpa.com llega directo a este puerto: sin esto
  // todas las peticiones parecen venir de la IP del proxy (el límite de
  // intentos de login sería uno solo para todos los usuarios).
  app.set('trust proxy', env.trustProxy);

  app.use(pinoHttp({ logger }));
  app.use(
    helmet({
      // Solo se carga lo propio del portal, más la fuente Sora de Google Fonts.
      // Keycloak no aparece: el login es una redirección de página, no un fetch.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // 'unsafe-inline' solo en estilos (atributos style de React); los scripts no lo tienen.
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          // blob: = fotos del Excel y evidencias que el portal carga con el token.
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          // Vista previa de PDF: iframe con un blob: generado en el navegador.
          frameSrc: ["'self'", 'blob:'],
          workerSrc: ["'self'", 'blob:'],
          // El iframe blob: hereda esta política y Chrome muestra el PDF con su
          // visor integrado, que cuenta como "object": con 'none' quedaría en blanco.
          objectSrc: ["'self'", 'blob:'],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
      // 1 año. Sin includeSubDomains: otros sitios *.felixpa.com podrían no tener HTTPS.
      strictTransportSecurity: { maxAge: 31536000, includeSubDomains: false },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    })
  );
  // Comprime JSON y el JS/CSS del portal (el proxy no pasa por Nginx).
  app.use(compression());
  app.use(cors({ origin: env.corsOrigin || false }));
  app.use(express.json());

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/productos-danados', productosDanadosRoutes);
  app.use('/api/tiendas', tiendasRoutes);
  app.use('/api/reclamos', reclamosRoutes);
  app.use('/api/configuracion', configuracionRoutes);
  app.use('/api/contabilidad', contabilidadRoutes);
  app.use('/api/tablero', tableroRoutes);

  app.use('/api', notFoundHandler);

  // /assets lleva hash en el nombre: se puede cachear un año. index.html no,
  // para que tras cada build se vea la versión nueva.
  app.use('/assets', express.static(path.join(portalDistDir, 'assets'), { immutable: true, maxAge: '1y' }));
  // Un archivo de un build anterior: 404 (el portal lo detecta y se recarga), nunca index.html.
  app.use('/assets', (req, res) => res.status(404).end());
  app.use(
    express.static(portalDistDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(portalDistDir, 'index.html'));
  });

  app.use(errorHandler);

  return app;
}
