// Avisos internos de Reclamos. Cada evento avisa a un área (los usuarios
// cuyos roles tienen un permiso, configurado en Configuración) y/o a una
// persona:
//   nuevo     -> compradoras (reclamos.decidir): hay un reclamo por revisar.
//   devuelto  -> quien lo creó: la compradora lo devolvió con un comentario.
//   reenviado -> la compradora que lo devolvió: ya está corregido.
//   cerrado   -> quien lo envía a contabilidad (reclamos.enviar_contabilidad):
//                la compradora lo confirmó o rechazó. A quien lo creó ya no
//                se le avisa (solo informaba; quitado el 2026-10-21).
// Si alguien está en el área y además es la persona, recibe solo el del área.
//
// Nunca bloquea ni hace fallar la acción (igual que los avisos de Productos
// Dañados): sin correo configurado, con MAIL_AVISOS=false, sin destinatario o
// si el envío falla, solo se registra en el log. Diseño común: diseno.js.
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { enviarCorreo, correoConfigurado, resumenDestinatarios } from './mailer.js';
import { destinatarios, deUsuario, PERMISOS_COMPRADORA, correosDeAsignadas } from './destinatarios.js';
import { TIPO_LABEL } from './plantillaReclamoContabilidad.js';
import { documento, parrafo, recuadro, boton, datos, saludo, esc, fechaHora, datosTexto } from './diseno.js';

const PIE = 'Aviso automático de Felix Fix. No respondas este correo.';
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const cerradoTexto = (r) => (r.Status === 'rechazado' ? 'rechazó' : 'confirmó');

/**
 * Cada aviso: { titulo, estado, frase(de, r), etiquetaComentario?, boton }. La frase dice
 * qué pasó y qué tiene que hacer quien lo recibe, corta.
 * `area`: { permiso, ...aviso } · `persona`: aviso para una sola persona (`para` o quien lo creó).
 */
const EVENTOS = {
  nuevo: {
    area: {
      permiso: 'reclamos.decidir',
      titulo: 'Nuevo reclamo por revisar',
      estado: 'Pendiente',
      frase: (de) => `${de} creó un reclamo que espera tu revisión. Aprueba o rechaza sus productos y ciérralo.`,
      etiquetaComentario: 'Comentario de quien lo creó',
      boton: 'Abrir y revisar',
    },
  },
  devuelto: {
    persona: {
      titulo: 'Reclamo devuelto para corregir',
      estado: 'Con comentario de compradora',
      frase: (de) => `${de} te devolvió este reclamo. Corrige lo que indica y reenvíalo a la compradora.`,
      etiquetaComentario: 'Lo que hay que corregir',
      boton: 'Abrir y corregir',
    },
  },
  reenviado: {
    persona: {
      titulo: 'Reclamo corregido y reenviado',
      estado: 'Pendiente de tu revisión',
      frase: (de) => `${de} corrigió el reclamo que devolviste. Revísalo y ciérralo.`,
      etiquetaComentario: 'Su respuesta',
      boton: 'Abrir y revisar',
    },
  },
  cerrado: {
    area: {
      permiso: 'reclamos.enviar_contabilidad',
      titulo: 'Reclamo listo para contabilidad',
      estado: 'Por enviar a contabilidad',
      frase: (de, r) => `${de} ${cerradoTexto(r)} este reclamo. Si tiene productos aprobados, sube la nota de débito y envíalo a contabilidad.`,
      etiquetaComentario: 'Comentario de la compradora',
      boton: 'Abrir y enviar',
    },
  },
};

/** «3 productos · 1 aprobado · 1 rechazado · 1 por decidir» (solo lo que se sabe). */
function resumenProductos(r) {
  const total = Number(r.LineasTotal);
  if (!total) return null;
  const aprobados = Number(r.LineasAprobadas) || 0;
  const pendientes = Number(r.LineasPendientes) || 0;
  const rechazados = Math.max(0, total - aprobados - pendientes);
  const partes = [plural(total, 'producto', 'productos')];
  if (aprobados) partes.push(plural(aprobados, 'aprobado', 'aprobados'));
  if (rechazados) partes.push(plural(rechazados, 'rechazado', 'rechazados'));
  if (pendientes) partes.push(`${pendientes} por decidir`);
  return partes.join(' · ');
}

/**
 * Asunto, HTML y texto de un aviso de reclamo.
 * @param evento  clave de EVENTOS
 * @param r       detalle del reclamo
 * @param opts    { comentario, de (quien actuó), nombre (quien recibe), fecha, para: 'area' | 'persona' }
 */
export function plantillaAvisoReclamo(evento, r, { comentario, de, nombre, fecha = new Date(), para } = {}) {
  const ev = EVENTOS[evento];
  const aviso = (para && ev[para]) || ev.persona || ev.area;
  const quien = de || 'Alguien';
  const asunto = `${aviso.titulo}: ${r.Numero} — ${r.Proveedor || 'Reclamo'}`;
  const enlace = env.correo.portalUrl ? `${env.correo.portalUrl}/reclamos/${r.Token}` : '';
  const frase = aviso.frase(quien, r);
  const texto = String(comentario ?? '').trim();
  // Solo lo necesario para ubicar el caso; el resto está en el portal.
  const filas = [
    ['Proveedor', r.Proveedor],
    ['Tipo', TIPO_LABEL[r.Tipo] || r.Tipo],
    ['Origen', r.Origen === 'cedi' ? 'CEDI' : r.Sucursal ? `Tienda · ${r.Sucursal}` : 'Tienda'],
    ['Productos', resumenProductos(r)],
  ];
  const pieComentario = `— ${quien} · ${fechaHora(fecha)}`;

  const html = documento({
    asunto,
    modulo: 'RECLAMOS',
    titulo: aviso.titulo,
    subtitulo: [r.Numero, r.Proveedor, aviso.estado].filter(Boolean).join(' · '),
    // Lo primero que muestra la bandeja junto al asunto.
    vistaPrevia: texto ? `${quien}: «${texto.slice(0, 120)}»` : frase,
    bloques: [
      parrafo(`${esc(saludo(nombre))}<br />${esc(frase)}`, { arriba: 22 }),
      recuadro({ etiqueta: aviso.etiquetaComentario, texto, pie: pieComentario, comillas: true }),
      boton({ texto: `${aviso.boton} ${r.Numero}`, enlace }),
      datos('Datos del reclamo', filas),
    ],
    pie: [PIE],
  });

  const plano = [
    `${aviso.titulo} — ${r.Numero}${r.Proveedor ? ` · ${r.Proveedor}` : ''}`,
    '',
    saludo(nombre),
    frase,
    ...(texto ? ['', `${aviso.etiquetaComentario}:`, `«${texto}»`, pieComentario] : []),
    ...(enlace ? ['', `${aviso.boton}: ${enlace}`] : []),
    ...datosTexto('Datos del reclamo', filas),
    '',
    PIE,
  ].join('\n');

  return { asunto, html, texto: plano };
}

/**
 * Manda los avisos del evento. No espera ni lanza: se llama después de guardar.
 * @param evento 'nuevo' | 'devuelto' | 'reenviado' | 'cerrado'
 * @param r      detalle del reclamo
 * @param opts   { para: username de la persona (por defecto quien lo creó), comentario, de: nombre de quien actuó }
 */
export function avisarReclamo(evento, r, { para, comentario, de } = {}) {
  const ev = EVENTOS[evento];
  if (!env.correo.avisos || env.correo.desactivado || !correoConfigurado() || !ev || !r) return;
  const fecha = new Date();
  (async () => {
    // Avisos de compradoras: solo a la elegida en «Compradora», no a todas.
    const area = !ev.area ? [] : PERMISOS_COMPRADORA.has(ev.area.permiso) ? await correosDeAsignadas({ reclamo: r }) : await destinatarios(ev.area.permiso);
    const persona = ev.persona ? await deUsuario(para || r.CreatedBy) : { correos: [], nombre: '' };
    const paraPersona = persona.correos.filter((c) => !area.includes(c));

    const envios = [];
    // Al área va a varias personas a la vez: saludo sin nombre.
    if (area.length) envios.push({ quien: 'area', para: area, ...plantillaAvisoReclamo(evento, r, { comentario, de, fecha, para: 'area' }) });
    if (paraPersona.length) {
      envios.push({ quien: 'persona', para: paraPersona, ...plantillaAvisoReclamo(evento, r, { comentario, de, fecha, para: 'persona', nombre: persona.nombre }) });
    }
    if (!envios.length) logger.info({ evento, reclamo: r.Numero }, 'Aviso de reclamo sin destinatarios (nadie con correo)');

    for (const { quien, para: destino, asunto, html, texto } of envios) {
      await enviarCorreo({ para: destino, asunto, html, texto })
        .then(() => logger.info({ evento, quien, reclamo: r.Numero, ...resumenDestinatarios(destino) }, 'Aviso de reclamo enviado'))
        .catch((err) => logger.warn({ err: err.message, evento, quien, reclamo: r.Numero }, 'No se pudo enviar el aviso del reclamo'));
    }
  })().catch((err) => logger.warn({ err: err.message, evento, reclamo: r?.Numero }, 'No se pudo enviar el aviso del reclamo'));
}
