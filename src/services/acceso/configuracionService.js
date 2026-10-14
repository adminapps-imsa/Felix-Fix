import * as kc from './keycloakAdmin.js';
import * as repo from '../../repositories/accesoRepository.js';
import { PERMISOS, ASIGNABLES, CODIGOS, PERMISO_CONFIGURACION } from './permisos.js';
import { esSuperAdminRol, invalidarPermisos, permisosGuardados } from './acceso.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';

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
