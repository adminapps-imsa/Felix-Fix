// A quién se avisa: los usuarios cuyos roles tienen un permiso (lo que se
// configura en Configuración → Roles y permisos) o un usuario puntual.
// Respeta MAIL_SOLO_DOMINIOS. El super administrador no recibe avisos de área.
import { env } from '../../config/env.js';
import { permisosGuardados } from '../acceso/acceso.js';
import { correosDeRoles, datosDeUsuario } from '../acceso/keycloakAdmin.js';
import { usuariosAsignados } from '../acceso/alcanceCompradora.js';
import { mapaTiendasUsuarios } from '../acceso/alcanceTienda.js';
import { veReclamo, veReporte } from '../../domain/tienda.js';
import { logger } from '../../utils/logger.js';

export const filtrarDominios = (correos) => {
  const permitidos = env.correo.soloDominios;
  return permitidos.length ? correos.filter((c) => permitidos.includes(c.split('@').pop())) : correos;
};

/**
 * Correos de los usuarios cuyos roles tienen el permiso (sin el super administrador).
 * `caso` (opcional): { reporte } o { reclamo }: quien está en otra tienda
 * (Configuración → Tiendas) no recibe el aviso de un caso que no puede abrir.
 */
export async function destinatarios(permiso, caso = null) {
  const guardados = await permisosGuardados();
  const roles = [...guardados.entries()].filter(([, ps]) => ps.has(permiso)).map(([rol]) => rol);
  const correos = [...new Set(filtrarDominios(await correosDeRoles(roles)).map((c) => c.toLowerCase()))];
  if (!caso || !correos.length) return correos;
  const fuera = await correosFueraDeTienda(caso);
  return fuera.size ? correos.filter((c) => !fuera.has(c)) : correos;
}

/** Correos de quienes están en una tienda y no ven el caso. Si no se puede saber, nadie queda fuera (como antes). */
async function correosFueraDeTienda(caso) {
  try {
    const ve = caso.reporte ? (a) => veReporte(a, caso.reporte) : (a) => veReclamo(a, caso.reclamo);
    const usernames = [...(await mapaTiendasUsuarios()).entries()].filter(([username, t]) => !ve({ ...t, username })).map(([u]) => u);
    const datos = await Promise.all(usernames.map((u) => datosDeUsuario(u)));
    return new Set(datos.map((d) => d.correo?.toLowerCase()).filter(Boolean));
  } catch (err) {
    logger.warn({ err: err.message }, 'No se pudieron leer las tiendas de los usuarios para el aviso');
    return new Set();
  }
}

/** { correos: [correo] o [], nombre } de un usuario por su username. */
export async function deUsuario(username) {
  if (!username) return { correos: [], nombre: '' };
  const { correo, nombre } = await datosDeUsuario(username);
  return { correos: correo ? filtrarDominios([correo.toLowerCase()]) : [], nombre: nombre && nombre !== username ? nombre : '' };
}

/**
 * Permisos de los avisos que van a las compradoras: esos avisos llegan solo a
 * la compradora asignada al caso, no a todas las que tienen el permiso.
 */
export const PERMISOS_COMPRADORA = new Set(['productos_danados.enviar', 'reclamos.decidir']);

/** Correos de las compradoras asignadas al caso ({ reclamo } o { reporteId }); [] si no hay ninguna en el portal. */
export async function correosDeAsignadas(caso) {
  const usuarios = await usuariosAsignados(caso);
  const correos = (await Promise.all(usuarios.map((u) => deUsuario(u)))).flatMap((d) => d.correos);
  return [...new Set(correos)];
}
