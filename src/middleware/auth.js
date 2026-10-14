import { jwtVerify } from 'jose';
import { env, isSessionConfigured } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { unauthorized, forbidden, serviceUnavailable } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { CODIGOS } from '../services/acceso/permisos.js';
import { permisosDeRoles, rolesActuales, vistaValida, esSuperAdminRol } from '../services/acceso/acceso.js';
import { usuarioDeshabilitado } from '../services/acceso/keycloakAdmin.js';

/**
 * Verifica el JWT de sesión propio (emitido en POST /api/auth/keycloak-code
 * tras validar el código con Keycloak) — nunca el token de Keycloak
 * directamente. Fail-closed: sin SESSION_JWT_SECRET responde 503 en vez de
 * dejar pasar la petición sin autenticar.
 *
 * Los roles NO se toman del token: se consultan los actuales en Keycloak
 * (cache de 1 min), y de ellos salen los permisos configurados en el portal.
 * Así quitar un rol tiene efecto sin esperar a que venza la sesión.
 *
 * AUTH_DISABLED=true es una puerta de escape SOLO para desarrollo local sin
 * Keycloak levantado: nunca debe usarse en producción.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  if (env.keycloak.authDisabled) {
    req.user = {
      sub: 'dev-local',
      username: 'dev-local',
      name: 'Usuario de desarrollo',
      roles: new Set([env.keycloak.roleSuperAdmin]),
      permisos: new Set(CODIGOS),
    };
    logger.warn('AUTH_DISABLED=true: petición aceptada sin verificar token. No usar en producción.');
    return next();
  }

  if (!isSessionConfigured()) {
    throw serviceUnavailable('Autenticación no configurada (falta SESSION_JWT_SECRET).');
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw unauthorized('Falta el encabezado Authorization: Bearer <token>.');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(env.session.jwtSecret)));
  } catch (err) {
    logger.warn({ err: err.message }, 'Token de sesión inválido');
    throw unauthorized('Token inválido o expirado.');
  }

  // Deshabilitado en Keycloak: sin acceso aunque su sesión siga vigente. Si
  // Keycloak no responde se sigue con los roles de la sesión (como rolesActuales).
  if (await usuarioDeshabilitado(payload.sub).catch(() => false)) {
    throw forbidden('Tu usuario está deshabilitado.');
  }

  const roles = await rolesActuales(payload.sub, payload.roles ?? []);
  const esSuperAdmin = [...roles].some(esSuperAdminRol);

  // "Vista por": el super administrador puede usar el portal con los permisos
  // de UN rol (encabezado X-Vista-Rol), para ver y probar el flujo real de ese
  // rol. Las acciones siguen quedando a su nombre. A cualquier otro usuario
  // el encabezado se le ignora.
  const vista = esSuperAdmin ? await vistaValida(req.get('x-vista-rol')) : null;

  req.user = {
    sub: payload.sub,
    username: payload.username,
    name: payload.name,
    roles,
    esSuperAdmin,
    vista,
    permisos: await permisosDeRoles(vista ? new Set([vista]) : roles),
  };
  if (vista) req.log?.info({ vista, usuario: payload.username }, 'Petición con "Vista por"');
  next();
});

/** Exige al menos uno de los permisos indicados. */
export function requirePermiso(...permisos) {
  return (req, res, next) => {
    if (!permisos.some((p) => req.user?.permisos?.has(p))) {
      return next(forbidden('No tienes permiso para esta acción. Pídele a un administrador que te asigne el rol correspondiente.'));
    }
    next();
  };
}
