// Avisos internos de Reclamos. Cada evento avisa a un área (los usuarios
// cuyos roles tienen un permiso, configurado en Configuración) y/o a una
// persona:
//   nuevo     -> compradoras (reclamos.decidir): hay un reclamo por revisar.
//   devuelto  -> quien lo creó: la compradora lo devolvió con un comentario.
//   reenviado -> la compradora que lo devolvió: ya está corregido.
//   cerrado   -> quien lo envía a contabilidad (reclamos.enviar_contabilidad)
//                y quien lo creó: la compradora lo confirmó o rechazó.
// Si alguien está en el área y además es la persona, recibe solo el del área.
//
// Nunca bloquea ni hace fallar la acción (igual que los avisos de Productos
// Dañados): sin correo configurado, con MAIL_AVISOS=false, sin destinatario o
// si el envío falla, solo se registra en el log. Diseño común: diseno.js.
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { enviarCorreo, correoConfigurado, resumenDestinatarios } from './mailer.js';
import { destinatarios, deUsuario } from './destinatarios.js';
import { quitarCompradorasAjenas } from '../acceso/alcanceCompradora.js';
import { TIPO_LABEL } from './plantillaReclamoContabilidad.js';
import { documento, parrafo, recuadro, pasos, boton, datos, saludo, esc, fechaHora, datosTexto, pasosTexto } from './diseno.js';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const cerradoTexto = (r) => (r.Status === 'rechazado' ? 'rechazó' : 'confirmó');

/**
 * Cada aviso: { titulo, estado, frase(de, r), etiquetaComentario?, pasos?, boton, pie }.
 * `area`: { permiso, ...aviso } · `persona`: aviso para una sola persona (`para` o quien lo creó).
 */
const EVENTOS = {
  nuevo: {
    area: {
      permiso: 'reclamos.decidir',
      titulo: 'Nuevo reclamo por revisar',
      estado: 'Pendiente',
      frase: (de) => `${de} creó un reclamo que espera tu revisión.`,
      etiquetaComentario: 'Comentario de quien lo creó',
      pasos: [
        'Revisa los datos, los documentos SAP y sus PDF.',
        'Aprueba o rechaza cada producto.',
        'Cierra el reclamo. Si algo está mal, devuélvelo con un comentario para que lo corrijan.',
      ],
      boton: 'Abrir y revisar',
      pie: 'Lo recibes porque tu rol aprueba o rechaza reclamos.',
    },
  },
  devuelto: {
    persona: {
      titulo: 'Reclamo devuelto para corregir',
      estado: 'Con comentario de compradora',
      frase: (de) => `${de} revisó este reclamo y te lo devolvió para que corrijas algo.`,
      etiquetaComentario: 'Lo que hay que corregir',
      pasos: [
        'Abre el reclamo y lee el comentario.',
        'Corrige los datos o los documentos SAP con «Corregir datos». Si cambias un documento, sube su PDF en Adjuntos y quita el anterior.',
        'Pulsa «Reenviar a la compradora».',
      ],
      boton: 'Abrir y corregir',
      pie: 'Lo recibes porque creaste este reclamo.',
    },
  },
  reenviado: {
    persona: {
      titulo: 'Reclamo corregido y reenviado',
      estado: 'Pendiente de tu revisión',
      frase: (de) => `${de} corrigió el reclamo que devolviste y te lo reenvió.`,
      etiquetaComentario: 'Su respuesta',
      pasos: ['Revisa lo que cambió.', 'Decide los productos que faltan y cierra el reclamo (o devuélvelo otra vez si algo sigue mal).'],
      boton: 'Abrir y revisar',
      pie: 'Lo recibes porque devolviste este reclamo.',
    },
  },
  cerrado: {
    area: {
      permiso: 'reclamos.enviar_contabilidad',
      titulo: 'Reclamo listo para contabilidad',
      estado: 'Por enviar a contabilidad',
      frase: (de, r) => `${de} ${cerradoTexto(r)} este reclamo. Ya se puede enviar a contabilidad.`,
      etiquetaComentario: 'Comentario de la compradora',
      pasos: [
        'Si la compradora aprobó productos, sube en Adjuntos la nota de débito (PDF de SAP) con esos productos.',
        'Pulsa «Enviar a contabilidad».',
      ],
      boton: 'Abrir y enviar',
      pie: 'Lo recibes porque tu rol envía los reclamos a contabilidad.',
    },
    persona: {
      titulo: 'Tu reclamo se cerró',
      estado: 'Cerrado por la compradora',
      frase: (de, r) => `${de} ${cerradoTexto(r)} tu reclamo. Ahora se envía a contabilidad.`,
      etiquetaComentario: 'Comentario de la compradora',
      boton: 'Ver el reclamo',
      pie: 'Lo recibes porque creaste este reclamo.',
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
  const filas = [
    ['Proveedor', r.Proveedor],
    ['Tipo', TIPO_LABEL[r.Tipo] || r.Tipo],
    ['Origen', r.Origen === 'cedi' ? 'CEDI' : r.Sucursal ? `Tienda · ${r.Sucursal}` : 'Tienda'],
    ['Factura / embarque', r.NumeroEmbarqueFactura],
    ['Documento(s) SAP', (r.SapDocs || []).join(', ')],
    ['Productos', resumenProductos(r)],
    ['Creado por', evento === 'nuevo' ? r.CreatedByNombre || r.CreatedBy : null],
  ];
  const pieComentario = `— ${quien} · ${fechaHora(fecha)}`;
  const pie = [`Aviso automático del portal Felix Fix. ${aviso.pie}`, 'No respondas a este correo: escribe tus comentarios en el reclamo.'];

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
      pasos(aviso.pasos),
      boton({ texto: `${aviso.boton} ${r.Numero}`, enlace }),
      datos('Datos del reclamo', filas),
    ],
    pie,
  });

  const plano = [
    `${aviso.titulo} — ${r.Numero}${r.Proveedor ? ` · ${r.Proveedor}` : ''}`,
    `Estado: ${aviso.estado}`,
    '',
    saludo(nombre),
    frase,
    ...(texto ? ['', `${aviso.etiquetaComentario}:`, `«${texto}»`, pieComentario] : []),
    ...pasosTexto(aviso.pasos),
    ...(enlace ? ['', `${aviso.boton}: ${enlace}`] : []),
    ...datosTexto('Datos del reclamo', filas),
    '',
    ...pie,
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
    // A cada compradora solo le llegan los reclamos de sus mundos y marcas.
    const area = ev.area ? await quitarCompradorasAjenas(await destinatarios(ev.area.permiso), { reclamoToken: r.Token }) : [];
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
