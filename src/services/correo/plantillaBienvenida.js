// Correo de bienvenida al portal: qué es Felix Fix, qué puede hacer la
// persona según los permisos de sus roles y cómo entrar, con el botón al
// portal. Lo envía el administrador desde Configuración → Correos.
import { env } from '../../config/env.js';
import { documento, parrafo, lista, pasos, boton, datos, saludo, esc, listaTexto, pasosTexto, datosTexto } from './diseno.js';

/** Lo que puede hacer cada permiso, en una frase (el orden es el del flujo). */
const QUE_HACE = [
  ['productos_danados.crear', 'Reportar productos dañados, vencidos o con deterioro, con su foto.'],
  ['productos_danados.enviar', 'Enviar los reportes al proveedor y registrar su respuesta (Devolución aprobada o NF).'],
  ['productos_danados.nf_documento', 'Hacer el documento 1700 de los reportes NF.'],
  ['productos_danados.nf', 'Validar y cerrar los reportes NF con el documento salida de NF.'],
  ['productos_danados.documentar', 'Enviar las devoluciones aprobadas a contabilidad con su documento.'],
  ['productos_danados.pago', 'Registrar el pago del proveedor y cerrar el reporte.'],
  ['reclamos.crear', 'Crear reclamos de faltantes, sobrantes, diferencias y daños de mercadería.'],
  ['reclamos.decidir', 'Revisar los reclamos, aprobar o rechazar sus productos, y devolverlos con un comentario si algo está mal.'],
  ['reclamos.enviar_contabilidad', 'Enviar a contabilidad los reclamos ya cerrados.'],
  ['reclamos.contabilidad', 'Recibir y revisar en contabilidad los documentos de los reclamos.'],
];

/** Frases de lo que puede hacer con esos permisos (sin repetir); siempre termina con el Tablero. */
export function queHace(permisos) {
  const tiene = (p) => permisos.has(p);
  const frases = QUE_HACE.filter(([p]) => tiene(p)).map(([, f]) => f);
  // Ver sin actuar (p. ej. Tienda ve los reportes): igual vale decirlo.
  if (!frases.length && (tiene('productos_danados.ver') || tiene('reclamos.ver'))) frases.push('Consultar los reportes y reclamos y cómo avanzan.');
  if (frases.length) frases.push('Ver en Inicio lo que te toca hoy y en el Tablero cómo va tu trabajo.');
  return frases;
}

/**
 * @param nombre    nombre completo de quien recibe (para el saludo)
 * @param username  su usuario (con el que inicia sesión)
 * @param roles     nombres de sus roles en el portal
 * @param permisos  Set de permisos efectivos de esos roles
 */
export function plantillaBienvenida({ nombre, username, roles = [], permisos = new Set() }) {
  const enlace = env.correo.portalUrl || '';
  const asunto = 'Te damos la bienvenida al portal Felix Fix';
  const frase =
    'Felix Fix es el portal donde se gestionan los productos dañados y los reclamos de mercadería. Cada caso avanza por sus etapas y a cada persona le llega lo que le toca, también por correo.';
  const puede = queHace(permisos);
  const comoEntrar = [
    'Pulsa «Entrar al portal».',
    `Inicia sesión con tu usuario de Felix${username ? ` (${username})` : ''} y tu contraseña de siempre.`,
    'En Inicio verás lo que te toca hoy.',
  ];
  const filas = [
    ['Usuario', username],
    ['Rol', roles.join(' · ')],
    ['Dirección del portal', enlace],
  ];

  const html = documento({
    asunto,
    modulo: 'PORTAL',
    titulo: 'Te damos la bienvenida a Felix Fix',
    subtitulo: 'Productos Dañados · Reclamos · Contabilidad',
    vistaPrevia: 'Ya tienes acceso al portal Felix Fix. Te contamos qué puedes hacer y cómo entrar.',
    bloques: [
      parrafo(`${esc(saludo(nombre))}<br />Ya tienes acceso al portal. ${esc(frase)}`, { arriba: 22 }),
      lista(puede, 'Lo que puedes hacer'),
      pasos(comoEntrar, 'Cómo entrar'),
      boton({ texto: 'Entrar al portal', enlace }),
      datos('Tus datos de acceso', filas),
      parrafo('Si tienes dudas o no puedes entrar, avísale al administrador del portal.', { arriba: 22 }),
    ],
    pie: ['Correo de bienvenida del portal Felix Fix.', 'No respondas a este correo.'],
  });

  const texto = [
    'Te damos la bienvenida a Felix Fix',
    '',
    saludo(nombre),
    `Ya tienes acceso al portal. ${frase}`,
    ...listaTexto(puede, 'Lo que puedes hacer'),
    ...pasosTexto(comoEntrar, 'Cómo entrar'),
    ...(enlace ? ['', `Entrar al portal: ${enlace}`] : []),
    ...datosTexto('Tus datos de acceso', filas),
    '',
    'Si tienes dudas o no puedes entrar, avísale al administrador del portal.',
  ].join('\n');

  return { asunto, html, texto };
}
