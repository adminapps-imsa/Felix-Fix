import { env } from '../config/env.js';
import { iniciarSesionConCodigo } from '../services/keycloakAuthService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden } from '../utils/httpError.js';
import { vistasDisponibles } from '../services/acceso/configuracionService.js';
import { tiendaDe } from '../services/acceso/alcanceTienda.js';
import { logger } from '../utils/logger.js';

export const keycloakCode = asyncHandler(async (req, res) => {
  const { code, redirectUri, codeVerifier } = req.body;
  const { token, user, idToken } = await iniciarSesionConCodigo(code, redirectUri, codeVerifier);
  // Bitácora: el inicio de sesión todavía no tiene req.user.
  res.locals.bitacoraUsuario = { username: user.username, name: user.name, roles: user.roles };
  res.json({
    token,
    idToken,
    user: { username: user.username, name: user.name, roles: user.roles },
  });
});

export const me = asyncHandler(async (req, res) => {
  // Tienda del usuario (Configuración → Tiendas): el portal la muestra y fija el filtro.
  // Si no se puede leer, el portal sigue (el backend filtra igual en cada consulta).
  const tienda = await tiendaDe(req.user).catch((err) => {
    logger.warn({ err: err.message }, 'No se pudo leer la tienda del usuario para /me');
    return null;
  });
  res.json({
    tienda: tienda ? { tiendaId: tienda.tiendaId, codigo: tienda.codigo, nombre: tienda.nombre, soloPropios: tienda.soloPropios } : null,
    username: req.user.username,
    name: req.user.name,
    roles: [...req.user.roles],
    permisos: [...req.user.permisos],
    // "Vista por": rol con el que se está viendo el portal (null = vista propia).
    vista: req.user.vista || null,
    puedeVistaPor: Boolean(req.user.esSuperAdmin),
    // Límites de archivos (MB) para que el portal valide antes de subir.
    limites: {
      evidenciaMb: env.evidence.maxSizeMb,
      adjuntoMb: env.reclamos.maxSizeMb,
      correoMb: env.correo.maxAdjuntosMb,
    },
  });
});

/** Roles para "Vista por" (solo el super administrador real, aunque esté en otra vista). */
export const vistas = asyncHandler(async (req, res) => {
  if (!req.user.esSuperAdmin) throw forbidden('Solo el Administrador puede usar "Vista por".');
  res.json(await vistasDisponibles());
});
