// Cliente mínimo de la API de administración de Keycloak, con la cuenta de
// servicio del propio cliente (fix-descarte). Necesita, en realm-management,
// view-users / query-users para leer y manage-users para asignar roles.
//
// Solo se tocan los roles DE ESTE CLIENTE: los roles de otros clientes o del
// realm no se leen ni se modifican desde el portal.
import { env } from '../../config/env.js';
import { badGateway, serviceUnavailable } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';

const adminBase = () => env.keycloak.issuerUrl.replace('/realms/', '/admin/realms/');

let tokenCache = null; // { token, exp }
let clientUuid = null;

async function tokenServicio() {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  if (!env.keycloak.clientId || !env.keycloak.clientSecret) throw serviceUnavailable('Keycloak no está configurado.');
  let res;
  try {
    res = await fetch(`${env.keycloak.issuerUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.keycloak.clientId,
        client_secret: env.keycloak.clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    logger.error({ err: err.message }, 'No se pudo contactar a Keycloak (cuenta de servicio)');
    throw badGateway('No se pudo contactar a Keycloak.');
  }
  if (!res.ok) {
    logger.error({ status: res.status }, 'Keycloak rechazó la cuenta de servicio');
    throw badGateway('Keycloak rechazó la cuenta de servicio del portal.');
  }
  const json = await res.json();
  // Se renueva 30 s antes de que venza.
  tokenCache = { token: json.access_token, exp: Date.now() + Math.max(0, (json.expires_in - 30) * 1000) };
  return tokenCache.token;
}

async function kc(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${adminBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await tokenServicio()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  }).catch((err) => {
    logger.error({ err: err.message, path }, 'Error de red con la API de Keycloak');
    throw badGateway('No se pudo contactar a Keycloak.');
  });
  if (!res.ok) {
    logger.error({ status: res.status, path, method }, 'La API de Keycloak respondió con error');
    throw badGateway(`Keycloak respondió ${res.status}.`);
  }
  return res.status === 204 ? null : res.json();
}

async function uuidCliente() {
  if (clientUuid) return clientUuid;
  const [c] = await kc(`/clients?clientId=${encodeURIComponent(env.keycloak.clientId)}`);
  if (!c) throw badGateway(`El cliente ${env.keycloak.clientId} no existe en Keycloak.`);
  clientUuid = c.id;
  return clientUuid;
}

// Roles que siguen en Keycloak pero ya no se usan: el portal no los muestra
// (Configuración, "Vista por") ni los toma en cuenta para permisos.
// "Trafico" se reemplazó por "Torre de Control".
const ROLES_RETIRADOS = new Set(['Trafico']);

/** Roles del cliente: [{ id, name, description }]. */
export async function rolesCliente() {
  const roles = await kc(`/clients/${await uuidCliente()}/roles?briefRepresentation=true`);
  return roles.filter((r) => !ROLES_RETIRADOS.has(r.name)).map((r) => ({ id: r.id, name: r.name, description: r.description || '' })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// ------------------------------------------------------------------
// Mapa usuario -> roles del cliente, cacheado.
//
// Se arma pidiendo, por cada rol, la lista de sus usuarios (pocos pedidos,
// sin importar cuántos usuarios haya). Lo usa cada petición autenticada para
// saber los roles ACTUALES del usuario, así un cambio de rol aplica en menos
// de un minuto sin volver a iniciar sesión.
// ------------------------------------------------------------------

const MAPA_TTL_MS = 60 * 1000;
let mapa = null; // { at, porUsuario: Map<userId, Set<rol>>, deshabilitados: Set<userId>, roles }
let armando = null;

async function armarMapa() {
  const cid = await uuidCliente();
  const roles = await rolesCliente();
  const porUsuario = new Map();
  // Usuarios con enabled=false en Keycloak: siguen en porUsuario (Configuración
  // muestra sus roles) pero se tratan como sin roles (sin permisos ni avisos).
  const deshabilitados = new Set();
  for (const r of roles) {
    for (let first = 0; ; first += 500) {
      const usuarios = await kc(`/clients/${cid}/roles/${encodeURIComponent(r.name)}/users?first=${first}&max=500&briefRepresentation=true`);
      for (const u of usuarios) {
        if (!porUsuario.has(u.id)) porUsuario.set(u.id, new Set());
        porUsuario.get(u.id).add(r.name);
        if (u.enabled === false) deshabilitados.add(u.id);
      }
      if (usuarios.length < 500) break;
    }
  }
  return { at: Date.now(), porUsuario, deshabilitados, roles };
}

export async function mapaRoles() {
  if (mapa && Date.now() - mapa.at < MAPA_TTL_MS) return mapa;
  if (!armando) {
    armando = armarMapa()
      .then((m) => (mapa = m))
      .catch((err) => {
        if (mapa) {
          logger.warn({ err: err.message }, 'No se pudo refrescar los roles de Keycloak: se usan los anteriores');
          return mapa;
        }
        throw err;
      })
      .finally(() => {
        armando = null;
      });
  }
  return armando;
}

export function invalidarMapa() {
  mapa = null;
}

/** true si el usuario está deshabilitado en Keycloak (según el mapa cacheado 1 min). */
export async function usuarioDeshabilitado(userId) {
  const m = await mapaRoles();
  return m.deshabilitados.has(userId);
}

/** Usuarios del realm (búsqueda por usuario, nombre o correo), con sus roles de este cliente. */
export async function buscarUsuarios({ q = '', first = 0, max = 20 }) {
  const params = new URLSearchParams({ first: String(first), max: String(max), briefRepresentation: 'true' });
  if (q) params.set('search', q);
  const countParams = new URLSearchParams(q ? { search: q } : {});
  const [usuarios, total, m] = await Promise.all([
    kc(`/users?${params}`),
    kc(`/users/count?${countParams}`),
    mapaRoles(),
  ]);
  return {
    total,
    usuarios: usuarios.map((u) => ({
      id: u.id,
      username: u.username,
      nombre: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
      email: u.email || null,
      activo: u.enabled !== false,
      roles: [...(m.porUsuario.get(u.id) || [])].sort(),
    })),
  };
}

/** Solo usuarios con algún rol del cliente (salen del mapa, no de la búsqueda del realm). */
export async function usuariosConAlgunRol({ q = '', first = 0, max = 20 }) {
  const m = await mapaRoles();
  const ids = [...m.porUsuario.keys()];
  const detalles = await Promise.all(ids.map((id) => kc(`/users/${encodeURIComponent(id)}`).catch(() => null)));
  const texto = q.trim().toLowerCase();
  const todos = detalles
    .filter(Boolean)
    .map((u) => ({
      id: u.id,
      username: u.username,
      nombre: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
      email: u.email || null,
      activo: u.enabled !== false,
      roles: [...(m.porUsuario.get(u.id) || [])].sort(),
    }))
    .filter((u) => !texto || [u.username, u.nombre, u.email].some((v) => v && v.toLowerCase().includes(texto)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { total: todos.length, usuarios: todos.slice(first, first + max) };
}

/** Correos de los usuarios activos con alguno de los roles dados (sin repetir; los que no tienen correo se omiten). */
export async function correosDeRoles(roles) {
  const buscados = new Set(roles);
  if (!buscados.size) return [];
  const m = await mapaRoles();
  const ids = [...m.porUsuario.entries()]
    .filter(([id, rs]) => !m.deshabilitados.has(id) && [...rs].some((r) => buscados.has(r)))
    .map(([id]) => id);
  const usuarios = await Promise.all(ids.map((id) => kc(`/users/${encodeURIComponent(id)}`).catch(() => null)));
  return [...new Set(usuarios.filter((u) => u && u.enabled !== false && u.email).map((u) => u.email.toLowerCase()))];
}

/** Usuarios activos que tienen un rol (para la vista de roles). */
export async function usuariosConRol(rol) {
  const m = await mapaRoles();
  return [...m.porUsuario.entries()].filter(([id, roles]) => !m.deshabilitados.has(id) && roles.has(rol)).map(([id]) => id);
}

export async function obtenerUsuario(id) {
  const u = await kc(`/users/${encodeURIComponent(id)}`);
  return { id: u.id, username: u.username, nombre: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username };
}

async function representacionRol(nombre) {
  const r = await kc(`/clients/${await uuidCliente()}/roles/${encodeURIComponent(nombre)}`);
  return { id: r.id, name: r.name };
}

export async function asignarRol(userId, rol) {
  await kc(`/users/${encodeURIComponent(userId)}/role-mappings/clients/${await uuidCliente()}`, {
    method: 'POST',
    body: [await representacionRol(rol)],
  });
  invalidarMapa();
}

export async function quitarRol(userId, rol) {
  await kc(`/users/${encodeURIComponent(userId)}/role-mappings/clients/${await uuidCliente()}`, {
    method: 'DELETE',
    body: [await representacionRol(rol)],
  });
  invalidarMapa();
}

// Nombre visible por username, para mostrar "Miguel Altamiranda" en lugar de
// "maltamiranda". Caché de 10 min; si Keycloak falla se usa el username (y se
// reintenta en 1 min) para que una caída de Keycloak no rompa las pantallas.
const nombresCache = new Map(); // username -> { nombre, exp }
const NOMBRE_TTL = 10 * 60 * 1000;
const NOMBRE_TTL_FALLO = 60 * 1000;

async function nombreDe(username) {
  try {
    const params = new URLSearchParams({ username, exact: 'true', briefRepresentation: 'true' });
    const [u] = await kc(`/users?${params}`);
    const nombre = (u && [u.firstName, u.lastName].filter(Boolean).join(' ')) || username;
    // Deshabilitado en Keycloak: sin correo (no recibe avisos).
    nombresCache.set(username, { nombre, correo: (u?.enabled !== false && u?.email) || null, exp: Date.now() + NOMBRE_TTL });
  } catch {
    nombresCache.set(username, { nombre: username, correo: null, exp: Date.now() + NOMBRE_TTL_FALLO });
  }
}

/** { nombre, correo } de un usuario por su username (correo null si no tiene o Keycloak falla). */
export async function datosDeUsuario(username) {
  if (!username) return { nombre: '', correo: null };
  if (!(nombresCache.get(username)?.exp > Date.now())) await nombreDe(username);
  const d = nombresCache.get(username);
  return { nombre: d?.nombre || username, correo: d?.correo || null };
}

/** Map<username, nombre> para los usernames dados (los que no existen quedan con su username). */
export async function nombresDeUsuarios(usernames) {
  const unicos = [...new Set(usernames.filter(Boolean))];
  const faltan = unicos.filter((u) => !(nombresCache.get(u)?.exp > Date.now()));
  await Promise.all(faltan.map(nombreDe));
  return new Map(unicos.map((u) => [u, nombresCache.get(u)?.nombre || u]));
}
