// A quién se avisa: los usuarios cuyos roles tienen un permiso (lo que se
// configura en Configuración → Roles y permisos) o un usuario puntual.
// Respeta MAIL_SOLO_DOMINIOS. El super administrador no recibe avisos de área.
import { env } from '../../config/env.js';
import { permisosGuardados } from '../acceso/acceso.js';
import { correosDeRoles, datosDeUsuario } from '../acceso/keycloakAdmin.js';

export const filtrarDominios = (correos) => {
  const permitidos = env.correo.soloDominios;
  return permitidos.length ? correos.filter((c) => permitidos.includes(c.split('@').pop())) : correos;
};

/** Correos de los usuarios cuyos roles tienen el permiso (sin el super administrador). */
export async function destinatarios(permiso) {
  const guardados = await permisosGuardados();
  const roles = [...guardados.entries()].filter(([, ps]) => ps.has(permiso)).map(([rol]) => rol);
  return [...new Set(filtrarDominios(await correosDeRoles(roles)).map((c) => c.toLowerCase()))];
}

/** { correos: [correo] o [], nombre } de un usuario por su username. */
export async function deUsuario(username) {
  if (!username) return { correos: [], nombre: '' };
  const { correo, nombre } = await datosDeUsuario(username);
  return { correos: correo ? filtrarDominios([correo.toLowerCase()]) : [], nombre: nombre && nombre !== username ? nombre : '' };
}
