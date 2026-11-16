// Permisos efectivos de un usuario = unión de los permisos de sus roles.
//
// - Roles: los ACTUALES en Keycloak (mapa cacheado 1 min). Si Keycloak no
//   responde, los que traía la sesión al iniciar.
// - Permisos por rol: tabla RolPermisos (cache 30 s, se invalida al guardar).
// - El rol de super administrador tiene todos los permisos, siempre.
import { env } from '../../config/env.js';
import * as repo from '../../repositories/accesoRepository.js';
import { logger } from '../../utils/logger.js';
import { ASIGNABLES, CODIGOS } from './permisos.js';
import { mapaRoles } from './keycloakAdmin.js';

export const esSuperAdminRol = (rol) => rol === env.keycloak.roleSuperAdmin;

const TTL_MS = 30 * 1000;
let cache = null; // { at, mapa }

async function permisosGuardados() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.mapa;
  try {
    cache = { at: Date.now(), mapa: await repo.permisosPorRol() };
  } catch (err) {
    if (!cache) throw err;
    logger.warn({ err: err.message }, 'No se pudieron leer los permisos por rol: se usan los anteriores');
  }
  return cache.mapa;
}

export function invalidarPermisos() {
  cache = null;
}

/** Roles actuales del usuario en Keycloak (por su id = sub del token). */
export async function rolesActuales(sub, rolesDeSesion) {
  try {
    const m = await mapaRoles();
    return m.porUsuario.get(sub) || new Set();
  } catch (err) {
    logger.warn({ err: err.message }, 'Keycloak no respondió: se usan los roles de la sesión');
    return new Set(rolesDeSesion);
  }
}

/**
 * Rol pedido en "Vista por" si existe en Keycloak (lista cacheada 1 min) y no
 * es el de super administrador; si no, null (se usa la vista propia).
 */
export async function vistaValida(rol) {
  const nombre = String(rol || '').trim();
  if (!nombre || esSuperAdminRol(nombre)) return null;
  try {
    const { roles } = await mapaRoles();
    return roles.some((r) => r.name === nombre) ? nombre : null;
  } catch {
    return null;
  }
}

export async function permisosDeRoles(roles) {
  if ([...roles].some(esSuperAdminRol)) return new Set(CODIGOS);
  const guardados = await permisosGuardados();
  return unirPermisos([...roles].map((rol) => guardados.get(rol) || []));
}

/**
 * Une los permisos de varios roles: se suman. Excepción (pedido del
 * 2026-11-16, Ana: Gof + Torre de Control): «Solo reclamos de Tienda» y
 * «Solo reclamos de CEDI» aplican solo si TODOS los roles del usuario que
 * crean reclamos la tienen; así quien es Gof («Solo Tienda») y Torre de
 * Control («Solo CEDI») crea de los dos. El resto de las limitaciones
 * («Solo los reportes que creó») se suman como antes.
 * Solo los asignables: Configuración queda para el super administrador.
 * @param porRol  [Set|Array de permisos de cada rol]
 */
const LIMITES_AL_CREAR = ['reclamos.solo_tienda', 'reclamos.solo_cedi'];

export function unirPermisos(porRol) {
  const listas = porRol.map((l) => [...(l || [])].filter((p) => ASIGNABLES.has(p)));
  const permisos = new Set();
  for (const l of listas) for (const p of l) if (!LIMITES_AL_CREAR.includes(p)) permisos.add(p);
  const crean = listas.filter((l) => l.includes('reclamos.crear'));
  for (const r of LIMITES_AL_CREAR) if (crean.length && crean.every((l) => l.includes(r))) permisos.add(r);
  return permisos;
}

export { permisosGuardados };
