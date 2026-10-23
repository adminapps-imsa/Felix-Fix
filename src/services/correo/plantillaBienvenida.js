// Correo de bienvenida al portal: corto y directo, con los datos de acceso y
// el botón al portal. Lo envía el administrador desde Configuración → Correos.
import { env } from '../../config/env.js';
import { documento, parrafo, recuadro, boton, datos, saludo, esc, datosTexto } from './diseno.js';

// Aviso del arranque del portal: solo sale en los correos enviados hasta ese
// día (hora de Panamá). Desde el día siguiente desaparece solo.
const INICIO_PORTAL = '2026-10-26';
const AVISO_INICIO = 'A partir del lunes 26 de octubre, podrá utilizar el portal Felix Fix para registrar reclamos y reportar productos dañados.';
const diaPanama = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(d);
export const conAvisoInicio = (hoy = new Date()) => diaPanama(hoy) <= INICIO_PORTAL;

/**
 * @param nombre    nombre completo de quien recibe (para el saludo)
 * @param username  su usuario (con el que inicia sesión)
 * @param roles     nombres de sus roles en el portal
 * @param hoy       fecha del envío (decide si va el aviso de inicio)
 */
export function plantillaBienvenida({ nombre, username, roles = [], hoy = new Date() }) {
  const enlace = env.correo.portalUrl || '';
  const aviso = conAvisoInicio(hoy) ? AVISO_INICIO : '';
  const asunto = 'Te damos la bienvenida al portal Felix Fix';
  const filas = [
    ['Usuario', username],
    ['Rol', roles.join(' · ')],
    ['Dirección del portal', enlace],
  ];

  const html = documento({
    asunto,
    modulo: 'PORTAL',
    titulo: 'Te damos la bienvenida a Felix Fix',
    subtitulo: 'Productos Dañados · Reclamos',
    vistaPrevia: 'Ya tienes acceso al portal Felix Fix.',
    bloques: [
      parrafo(`${esc(saludo(nombre))}<br />Ya tienes acceso al portal Felix Fix.`, { arriba: 22 }),
      recuadro({ texto: aviso }),
      datos('Tus datos de acceso', filas),
      boton({ texto: 'Entrar al portal', enlace }),
    ],
    pie: ['Correo de bienvenida del portal Felix Fix.', 'No respondas a este correo.'],
  });

  const texto = [
    'Te damos la bienvenida a Felix Fix',
    '',
    saludo(nombre),
    'Ya tienes acceso al portal Felix Fix.',
    ...(aviso ? ['', aviso] : []),
    ...datosTexto('Tus datos de acceso', filas),
    ...(enlace ? ['', `Entrar al portal: ${enlace}`] : []),
  ].join('\n');

  return { asunto, html, texto };
}
