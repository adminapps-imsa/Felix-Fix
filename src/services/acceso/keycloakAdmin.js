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

// Keycloak a veces falla por un momento (500, sin respuesta, o rechaza la cuenta
// de servicio y al segundo la acepta). Se reintenta antes de dar el error:
// todo lo que se le pide desde aquí se puede repetir sin efectos dobles (leer
// usuarios/roles, asignar o quitar un rol que ya está o ya no está).
const INTENTOS = 3;
const PAUSA_MS = [300, 900];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const MSG_KEYCLOAK = 'Keycloak (el servidor de usuarios) no respondió bien. Intenta de nuevo en un momento.';

/** Fallo pasajero: error del servidor, demasiadas peticiones o sin respuesta. */
const pasajero = (status) => status === undefined || status === 429 || status >= 500;

async function pedirToken() {
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
    return { error: err.message };
  }
  if (!res.ok) return { status: res.status };
  return { json: await res.json() };
}

async function tokenServicio() {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  if (!env.keycloak.clientId || !env.keycloak.clientSecret) throw serviceUnavailable('Keycloak no está configurado.');
  let ultimo;
  for (let i = 0; i < INTENTOS; i++) {
    if (i) await esperar(PAUSA_MS[i - 1]);
    ultimo = await pedirToken();
    if (ultimo.json) {
      // Se renueva 30 s antes de que venza.
      tokenCache = { token: ultimo.json.access_token, exp: Date.now() + Math.max(0, (ultimo.json.expires_in - 30) * 1000) };
      return tokenCache.token;
    }
    // Credenciales malas (400/401 de verdad) no se arreglan reintentando… salvo que Keycloak
    // esté a medio reiniciar: se reintenta igual, son pocas veces y con pausa corta.
  }
  if (ultimo.error) {
    logger.error({ err: ultimo.error }, 'No se pudo contactar a Keycloak (cuenta de servicio)');
    throw badGateway(MSG_KEYCLOAK);
  }
  logger.error({ status: ultimo.status }, 'Keycloak rechazó la cuenta de servicio');
  throw badGateway('Keycloak rechazó la cuenta de servicio del portal. Si sigue pasando, avísale a TI.');
}

async function kc(path, { method = 'GET', body } = {}) {
  let ultimo = null;
  for (let i = 0; i < INTENTOS; i++) {
    if (i) await esperar(PAUSA_MS[i - 1]);
    let res;
    try {
      res = await fetch(`${adminBase()}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await tokenServicio()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      if (err.status) throw err; // error ya traducido de tokenServicio
      ultimo = { error: err.message };
      continue;
    }
    if (res.ok) {
      if (i) logger.info({ path, method, intentos: i + 1 }, 'Keycloak respondió después de reintentar');
      return res.status === 204 ? null : res.json();
    }
    ultimo = { status: res.status };
    // 401: el token de la cuenta de servicio se invalidó antes de tiempo; se pide otro.
    if (res.status === 401) {
      tokenCache = null;
      continue;
    }
    if (!pasajero(res.status)) break;
  }
  if (ultimo?.error) {
    logger.error({ err: ultimo.error, path }, 'Error de red con la API de Keycloak');
    throw badGateway(MSG_KEYCLOAK);
  }
  logger.error({ status: ultimo?.status, path, method }, 'La API de Keycloak respondió con error');
  throw badGateway(pasajero(ultimo?.status) || ultimo?.status === 401 ? MSG_KEYCLOAK : `Keycloak no aceptó la operación (${ultimo?.status}).`);
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
// sin importar cuántos usuarios haya; todos los roles a la vez). Lo usa cada
// petición autenticada para saber los roles ACTUALES del usuario, así un
// cambio de rol aplica en un par de minutos sin volver a iniciar sesión.
//
// Vencido el minuto, se sigue usando el mapa anterior mientras se arma el
// nuevo en segundo plano: ninguna petición espera a Keycloak salvo la primera
// (o tras invalidarMapa). Armarlo tarda segundos y antes congelaba la pantalla
// que llegaba en ese momento (/api/auth/me en ~5 s cada 1-2 min).
// ------------------------------------------------------------------

const MAPA_TTL_MS = 60 * 1000;
let mapa = null; // { at, porUsuario: Map<userId, Set<rol>>, deshabilitados: Set<userId>, roles }
let armando = null;

/** Usuarios de un rol del cliente (de 500 en 500). */
async function usuariosDelRol(cid, rol) {
  const todos = [];
  for (let first = 0; ; first += 500) {
    const usuarios = await kc(`/clients/${cid}/roles/${encodeURIComponent(rol)}/users?first=${first}&max=500&briefRepresentation=true`);
    todos.push(...usuarios);
    if (usuarios.length < 500) return todos;
  }
}

async function armarMapa() {
  const inicio = Date.now();
  const cid = await uuidCliente();
  const roles = await rolesCliente();
  const porUsuario = new Map();
  // Usuarios con enabled=false en Keycloak: siguen en porUsuario (Configuración
  // muestra sus roles) pero se tratan como sin roles (sin permisos ni avisos).
  const deshabilitados = new Set();
  const usuariosPorRol = await Promise.all(roles.map((r) => usuariosDelRol(cid, r.name)));
  roles.forEach((r, i) => {
    for (const u of usuariosPorRol[i]) {
      if (!porUsuario.has(u.id)) porUsuario.set(u.id, new Set());
      porUsuario.get(u.id).add(r.name);
      if (u.enabled === false) deshabilitados.add(u.id);
    }
  });
  const ms = Date.now() - inicio;
  if (ms > 2000) logger.info({ ms, roles: roles.length }, 'Roles de Keycloak: el mapa tardó en armarse');
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
  // Vencido: el anterior sirve mientras se arma el nuevo (sin esperar a Keycloak).
  if (mapa) {
    armando.catch(() => {});
    return mapa;
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

/**
 * Todos los usuarios del realm en pocas consultas (de 500 en 500), por id.
 * Más rápido y confiable que pedir cada usuario por separado: si una consulta
 * suelta fallaba (o tardaba los 10 s del timeout), esa persona se perdía.
 */
async function usuariosDelRealm() {
  const porId = new Map();
  for (let desde = 0; ; desde += 500) {
    const pagina = await kc(`/users?first=${desde}&max=500&briefRepresentation=true`);
    for (const u of pagina) porId.set(u.id, u);
    if (pagina.length < 500) break;
  }
  return porId;
}

/** Los usuarios de esos ids: de la lista del realm, o pedidos aparte si alguno no vino (raro). */
async function usuariosPorId(ids) {
  const delRealm = await usuariosDelRealm();
  return Promise.all(ids.map((id) => delRealm.get(id) || kc(`/users/${encodeURIComponent(id)}`).catch(() => null)));
}

/** Solo usuarios con algún rol del cliente (salen del mapa, no de la búsqueda del realm). */
export async function usuariosConAlgunRol({ q = '', first = 0, max = 20 }) {
  const m = await mapaRoles();
  const detalles = await usuariosPorId([...m.porUsuario.keys()]);
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
  const usuarios = await usuariosPorId(ids);
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
