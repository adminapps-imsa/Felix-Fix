import * as kc from './keycloakAdmin.js';
import * as repo from '../../repositories/accesoRepository.js';
import { PERMISOS, ASIGNABLES, CODIGOS, PERMISO_CONFIGURACION, ROL_GOF, tienePermiso } from './permisos.js';
import { esSuperAdminRol, invalidarPermisos, permisosGuardados } from './acceso.js';
import { badRequest, conflict, forbidden, notFound, serviceUnavailable } from '../../utils/httpError.js';
import { CORREOS } from '../correo/catalogoCorreos.js';
import { plantillaBienvenida } from '../correo/plantillaBienvenida.js';
import { enviarCorreo, correoConfigurado, resumenDestinatarios } from '../correo/mailer.js';
import { deUsuario } from '../correo/destinatarios.js';
import { conLogoEnLinea } from '../correo/diseno.js';
import { logger } from '../../utils/logger.js';
import * as tiendasRepo from '../../repositories/tiendasRepository.js';
import { invalidarTiendas } from './alcanceTienda.js';

const quien = (usuario) => usuario.username || usuario.sub;

async function auditar(accion, detalle, usuario) {
  try {
    await repo.registrarAuditoria(accion, detalle, quien(usuario));
  } catch (err) {
    // El cambio ya se hizo: que falle el historial no debe deshacerlo.
    logger.error({ err: err.message, accion, detalle }, 'No se pudo registrar la auditoría de configuración');
  }
}

/** Roles del cliente con sus permisos y cuántos usuarios tienen cada uno. */
export async function roles() {
  const [lista, guardados, mapa] = await Promise.all([kc.rolesCliente(), permisosGuardados(), kc.mapaRoles()]);
  const conteo = new Map();
  for (const rs of mapa.porUsuario.values()) for (const r of rs) conteo.set(r, (conteo.get(r) || 0) + 1);
  return {
    permisos: PERMISOS,
    roles: lista.map((r) => ({
      nombre: r.name,
      descripcion: r.description,
      superAdmin: esSuperAdminRol(r.name),
      usuarios: conteo.get(r.name) || 0,
      permisos: esSuperAdminRol(r.name) ? [...CODIGOS] : [...(guardados.get(r.name) || [])].filter((p) => ASIGNABLES.has(p)),
    })),
  };
}

/**
 * Roles para "Vista por": todos menos el de super administrador, con sus
 * permisos actuales (los mismos que aplica el backend en esa vista).
 */
export async function vistasDisponibles() {
  const [{ roles: lista }, guardados] = await Promise.all([kc.mapaRoles(), permisosGuardados()]);
  return lista
    .filter((r) => !esSuperAdminRol(r.name))
    .map((r) => ({
      nombre: r.name,
      descripcion: r.description,
      permisos: [...(guardados.get(r.name) || [])].filter((p) => ASIGNABLES.has(p)),
    }));
}

export async function guardarPermisos(rol, permisos, usuario) {
  const existe = (await kc.rolesCliente()).some((r) => r.name === rol);
  if (!existe) throw notFound(`El rol "${rol}" no existe en Keycloak.`);
  if (esSuperAdminRol(rol)) throw conflict('El super administrador tiene todos los permisos y no se puede modificar.');
  if (permisos.includes(PERMISO_CONFIGURACION)) {
    throw badRequest('Configuración es exclusiva del Administrador y no se puede dar a otro rol.');
  }
  const invalidos = permisos.filter((p) => !ASIGNABLES.has(p));
  if (invalidos.length) throw badRequest(`Permisos desconocidos: ${invalidos.join(', ')}`);

  const unicos = [...new Set(permisos)];
  await repo.guardarPermisosRol(rol, unicos, quien(usuario));
  invalidarPermisos();
  await auditar('permisos_rol', `${rol}: ${unicos.length ? unicos.join(', ') : '(sin permisos)'}`, usuario);
  return roles();
}

export async function usuarios({ q, page, pageSize, conRol }) {
  const args = { q, first: (page - 1) * pageSize, max: pageSize };
  const { total, usuarios } = conRol === '1' ? await kc.usuariosConAlgunRol(args) : await kc.buscarUsuarios(args);
  return { data: usuarios, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

async function validarRol(rol) {
  if (!(await kc.rolesCliente()).some((r) => r.name === rol)) throw notFound(`El rol "${rol}" no existe en Keycloak.`);
}

export async function asignarRol(userId, rol, usuario) {
  await validarRol(rol);
  const u = await kc.obtenerUsuario(userId);
  await kc.asignarRol(userId, rol);
  await auditar('asignar_rol', `${rol} → ${u.username} (${u.nombre})`, usuario);
}

export async function quitarRol(userId, rol, usuario) {
  await validarRol(rol);
  // Nunca dejar el portal sin nadie que pueda administrarlo.
  if (esSuperAdminRol(rol)) {
    const admins = await kc.usuariosConRol(rol);
    if (admins.length <= 1 && admins.includes(userId)) {
      throw conflict('Es el único super administrador: asigna el rol a otra persona antes de quitárselo.');
    }
  }
  const u = await kc.obtenerUsuario(userId);
  await kc.quitarRol(userId, rol);
  await auditar('quitar_rol', `${rol} ✕ ${u.username} (${u.nombre})`, usuario);
}

export const auditoria = () => repo.listarAuditoria(100);

// ------------------------------------------------------------------
// Tiendas: en qué tienda está cada usuario y si ve solo lo que crea.
// ------------------------------------------------------------------

/**
 * Las tiendas con cuántas personas tiene cada una, y los usuarios del portal
 * (los que tienen algún rol) con su tienda y «Solo lo que crea».
 */
/**
 * El administrador ve y cambia a todos; quien solo tiene «usuarios.tiendas»
 * (supervisor GOF), solo a los de rol Gof que no son administradores.
 */
const soloRolGof = (usuario) => !tienePermiso(usuario, PERMISO_CONFIGURACION);
const esDeGof = (roles) => roles.includes(ROL_GOF) && !roles.some(esSuperAdminRol);

/**
 * Cuentas genéricas de GOF (la general y las de cada tienda) que ya no se usan (pedido del
 * 2026-11-13): no salen en Configuración → Tiendas. Siguen en Keycloak.
 * Se comparan usuario y nombre sin espacios, acentos ni mayúsculas.
 */
const OCULTOS_EN_TIENDAS = new Set(['gof', 'gofaltaplaza', 'gofcostaeste', 'gofmetromall', 'gofmultiplaza', 'gofviaespana']);
const compacto = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
export const ocultoEnTiendas = (u) => OCULTOS_EN_TIENDAS.has(compacto(u.username)) || OCULTOS_EN_TIENDAS.has(compacto(u.nombre));

export async function tiendas(usuario) {
  const [lista, asignaciones, { usuarios: todos }] = await Promise.all([
    tiendasRepo.listarTiendasActivas(),
    tiendasRepo.listarUsuarioTiendas(),
    kc.usuariosConAlgunRol({ first: 0, max: 5000 }),
  ]);
  const visibles = todos.filter((u) => !ocultoEnTiendas(u));
  const conRol = soloRolGof(usuario) ? visibles.filter((u) => esDeGof(u.roles)) : visibles;
  const porUsuario = new Map(asignaciones.map((a) => [a.Username.trim().toLowerCase(), a]));
  const usuarios = conRol.map((u) => {
    const a = porUsuario.get(String(u.username).toLowerCase());
    return { ...u, tiendaId: a?.TiendaId ?? null, soloPropios: Boolean(a?.SoloPropios) };
  });
  const conteo = new Map();
  for (const u of usuarios) if (u.tiendaId != null) conteo.set(u.tiendaId, (conteo.get(u.tiendaId) || 0) + 1);
  return {
    tiendas: lista.map((t) => ({ ...t, usuarios: conteo.get(t.TiendaId) || 0 })),
    usuarios,
  };
}

export async function guardarTiendaUsuario(userId, { tiendaId, soloPropios }, usuario) {
  const u = await kc.obtenerUsuario(userId).catch(() => {
    throw notFound('Ese usuario no existe en Keycloak.');
  });
  if (soloRolGof(usuario) && !esDeGof([...((await kc.mapaRoles()).porUsuario.get(u.id) || [])])) {
    throw forbidden('Solo puedes cambiar la tienda de las personas con rol Gof.');
  }
  let tienda = null;
  if (tiendaId != null) {
    tienda = await tiendasRepo.obtenerTiendaPorId(tiendaId);
    if (!tienda) throw notFound('Esa tienda no existe.');
  }
  await tiendasRepo.guardarUsuarioTienda(String(u.username).toLowerCase(), tiendaId ?? null, Boolean(soloPropios), quien(usuario));
  invalidarTiendas();
  const texto = `${u.username} (${u.nombre}) → ${tienda ? tienda.Nombre : 'Todas las tiendas'}${soloPropios ? ' · solo lo que crea' : ''}`;
  await auditar('tienda_usuario', texto, usuario);
  return { id: u.id, username: u.username, tiendaId: tiendaId ?? null, soloPropios: Boolean(soloPropios) };
}

// ------------------------------------------------------------------
// Correos: ver cómo se ven, enviarse una prueba y enviar la bienvenida.
// ------------------------------------------------------------------

/** Lista de los correos del portal (sin el HTML), agrupados como se muestran. */
export function correos() {
  return CORREOS().map(({ generar, ...meta }) => ({ ...meta, asunto: generar().asunto }));
}

function correoPorId(id) {
  const c = CORREOS().find((x) => x.id === id);
  if (!c) throw notFound('Ese correo no existe.');
  return c;
}

/** Vista previa con datos de ejemplo: { asunto, html, texto }. */
export function vistaCorreo(id) {
  const c = correoPorId(id);
  const correo = c.generar();
  return { id: c.id, ...correo, html: conLogoEnLinea(correo.html) };
}

const exigirCorreo = () => {
  if (!correoConfigurado()) throw serviceUnavailable('El correo del portal no está configurado.');
};

/** Manda la vista previa (con datos de ejemplo) al correo de quien la pide, marcada como prueba. */
export async function enviarPruebaCorreo(id, usuario) {
  exigirCorreo();
  const c = correoPorId(id);
  const { correos: para } = await deUsuario(quien(usuario));
  if (!para.length) throw badRequest('Tu usuario no tiene correo en Keycloak: no hay a dónde mandar la prueba.');
  const { asunto, html, texto } = c.generar();
  await enviarCorreo({ para, asunto: `[PRUEBA] ${asunto}`, html, texto });
  logger.info({ correo: id, usuario: quien(usuario), ...resumenDestinatarios(para) }, 'Prueba de correo enviada');
  return { para };
}

/**
 * Correo de bienvenida a cada usuario elegido, con lo que puede hacer según
 * sus roles. Devuelve, por usuario, si se envió o por qué no.
 */
export async function enviarBienvenida(userIds, usuario) {
  exigirCorreo();
  const [mapa, lista] = await Promise.all([kc.mapaRoles(), kc.rolesCliente()]);
  const delPortal = new Set(lista.map((r) => r.name));
  const resultados = [];
  for (const id of [...new Set(userIds)]) {
    let u;
    try {
      u = await kc.obtenerUsuario(id);
    } catch {
      resultados.push({ id, enviado: false, motivo: 'No existe en Keycloak.' });
      continue;
    }
    const base = { id, username: u.username, nombre: u.nombre };
    const roles = [...(mapa.porUsuario.get(id) || [])].filter((r) => delPortal.has(r));
    if (mapa.deshabilitados?.has(id)) {
      resultados.push({ ...base, enviado: false, motivo: 'El usuario está deshabilitado.' });
      continue;
    }
    if (!roles.length) {
      resultados.push({ ...base, enviado: false, motivo: 'No tiene ningún rol del portal: asígnale uno primero.' });
      continue;
    }
    const { correos: para } = await deUsuario(u.username);
    if (!para.length) {
      resultados.push({ ...base, enviado: false, motivo: 'No tiene correo en Keycloak.' });
      continue;
    }
    try {
      const { asunto, html, texto } = plantillaBienvenida({ nombre: u.nombre, username: u.username, roles });
      await enviarCorreo({ para, asunto, html, texto });
      await auditar('bienvenida', `Bienvenida → ${u.username} (${u.nombre})`, usuario);
      resultados.push({ ...base, enviado: true });
    } catch (err) {
      logger.warn({ err: err.message, username: u.username }, 'No se pudo enviar la bienvenida');
      // Con el envío apagado para pruebas se dice eso, no que el servidor lo rechazó.
      const motivo = err.extra?.code === 'CORREO_DESACTIVADO' ? err.message : 'El servidor de correo no lo aceptó. Intenta de nuevo.';
      resultados.push({ ...base, enviado: false, motivo });
    }
  }
  return { resultados };
}
