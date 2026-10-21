// Avisos internos de Productos Dañados: cuando un reporte cambia de etapa se
// avisa por correo a quien le toca actuar (el área) y a quien lo creó.
//
// Quién recibe cada aviso se define SOLO en la tabla EVENTOS de abajo (está
// sujeta a cambio). Cada evento tiene hasta dos avisos:
//   area     -> usuarios activos cuyos roles tienen, en Configuración, ese
//               permiso (sin el super administrador, que tiene todos), más
//               los correos fijos de `correos` si se definen.
//   creador  -> quien creó el reporte (EmpleadoReportaUsuario).
// Si alguien está en los dos grupos recibe solo el aviso del área.
//
// Nunca bloquea ni hace fallar la acción: si el correo no está configurado,
// MAIL_AVISOS=false, no hay destinatarios o el envío falla, solo se registra
// en el log. El diseño es el común de los correos del portal (diseno.js).
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { enviarCorreo, correoConfigurado, resumenDestinatarios } from './mailer.js';
import { numeroReporte } from './plantillaReporteProveedor.js';
import { destinatarios, filtrarDominios, deUsuario } from './destinatarios.js';
import { documento, parrafo, recuadro, pasos, boton, datos, saludo, esc, datosTexto, pasosTexto } from './diseno.js';

// Se mantiene para quien la importaba desde aquí.
export { destinatarios };

/** Nombre visible de cada etapa (como en el portal). */
const ESTADO = {
  Pendiente: 'Pendiente',
  Devuelto: 'Devuelto a la tienda',
  Aprobado: 'Devolución aprobada',
  Rechazado: 'NF',
  NFValidacion: 'NF por validar',
  EnContabilidad: 'En contabilidad',
  Cerrado: 'Cerrado',
};

/**
 * A quién se avisa en cada evento. Para cambiar destinatarios:
 *   - otro permiso/área: cambia `permiso` (o pon `area: null` para no avisar)
 *   - correos fijos:     agrega `correos: ['alguien@maduro.com.pa']` al área
 *   - no avisar al creador: pon `creador: null`
 * `pasos`: lo que tiene que hacer quien recibe el aviso del área.
 * `detalle`: cómo se llama el dato extra del evento (motivo del NF, referencia…).
 */
export const EVENTOS = {
  // Se crea el reporte -> compradora (lo envía al proveedor) + creador.
  nuevo: {
    area: {
      permiso: 'productos_danados.enviar',
      titulo: 'Nuevo reporte pendiente',
      frase: 'Se registró un reporte de producto dañado que espera tu gestión.',
      pasos: ['Abre el reporte y revisa la foto y los datos.', 'Envíalo al proveedor desde el portal.', 'Cuando responda, registra si es Devolución aprobada o NF.'],
    },
    creador: {
      titulo: 'Recibimos tu reporte',
      frase: 'Tu reporte quedó registrado y pasó a la compradora para enviarlo al proveedor.',
    },
  },
  // La compradora lo devuelve para corregir -> quien lo creó.
  devuelto: {
    detalle: 'Qué hay que corregir',
    area: null,
    creador: {
      titulo: 'Tu reporte necesita una corrección',
      frase: 'La compradora te devolvió el reporte antes de enviarlo al proveedor. Corrige lo que indica y reenvíalo.',
      pasos: ['Abre el reporte y lee el comentario de la compradora.', 'Pulsa «Corregir y reenviar», cambia lo que haga falta y guarda.'],
    },
  },
  // La tienda lo corrigió -> compradora (vuelve a su bandeja de pendientes).
  reenviado: {
    detalle: 'Lo que corrigió la tienda',
    area: {
      permiso: 'productos_danados.enviar',
      titulo: 'Reporte corregido por la tienda',
      frase: 'La tienda corrigió el reporte que devolviste y volvió a quedar pendiente.',
      pasos: ['Abre el reporte y revisa los cambios.', 'Envíalo al proveedor o devuélvelo otra vez si falta algo.'],
    },
    creador: null,
  },
  // El proveedor aprueba la devolución -> Gof (documento) + creador.
  aprobado: {
    area: {
      permiso: 'productos_danados.documentar',
      titulo: 'Devolución aprobada',
      frase: 'El proveedor aprobó la devolución de este reporte.',
      pasos: ['Sube el documento (PDF o Excel) en el reporte.', 'Pulsa «Enviar a contabilidad».'],
    },
    creador: {
      titulo: 'El proveedor aprobó la devolución',
      frase: 'El proveedor aprobó la devolución de tu reporte. Ahora Gof prepara el documento para contabilidad.',
    },
  },
  // El proveedor no aprueba (NF) -> Gof (documento 1700) + creador.
  nf: {
    detalle: 'Motivo del NF',
    area: {
      permiso: 'productos_danados.nf_documento',
      titulo: 'Reporte NF: falta el documento 1700',
      frase: 'El proveedor no aprobó la devolución de este reporte (NF).',
      pasos: ['Haz el documento 1700 en SAP.', 'En el reporte, marca el check «Documento 1700».', 'Así pasa al supervisor GOF para validarlo.'],
    },
    creador: {
      titulo: 'El proveedor no aprobó la devolución (NF)',
      frase: 'El proveedor no aprobó la devolución de tu reporte. Gof hará el documento 1700 y el supervisor GOF lo validará.',
    },
  },
  // Gof marcó el documento 1700 -> supervisor GOF.
  nfValidar: {
    area: {
      permiso: 'productos_danados.nf',
      titulo: 'NF por validar',
      frase: 'Gof marcó el documento 1700 de este reporte NF.',
      pasos: ['Escribe el número del «Documento salida de NF».', 'Valida el reporte para cerrarlo.'],
    },
    creador: null,
  },
  // Gof lo envió a contabilidad -> contabilidad (pago) + creador.
  contabilidad: {
    detalle: 'Documentos',
    area: {
      permiso: 'productos_danados.pago',
      titulo: 'Reporte en contabilidad',
      frase: 'Gof envió a contabilidad esta devolución aprobada, con su documento.',
      pasos: ['Cuando el proveedor pague, abre el reporte.', 'Marca «Pago recibido» con la referencia.'],
      // Contabilidad trabaja los pagos desde su apartado, no desde Productos Dañados.
      enlace: '/contabilidad?seccion=productos',
    },
    creador: {
      titulo: 'Tu reporte pasó a contabilidad',
      frase: 'Tu reporte ya tiene su documento y está en contabilidad esperando el pago del proveedor.',
    },
  },
  // El supervisor GOF cerró el NF -> creador.
  nfCerrado: {
    detalle: 'Detalle del cierre',
    area: null,
    creador: {
      titulo: 'Tu reporte se cerró (NF)',
      frase: 'El supervisor GOF validó tu reporte NF y lo cerró sin devolución del proveedor.',
    },
  },
  // Contabilidad registró el pago -> creador.
  pagado: {
    detalle: 'Pago',
    area: null,
    creador: {
      titulo: 'Pago recibido: tu reporte se cerró',
      frase: 'Contabilidad registró el pago del proveedor y tu reporte quedó cerrado.',
    },
  },
};

const PIE_AREA = 'Lo recibes porque tu rol tiene este paso asignado en Configuración.';
const PIE_CREADOR = 'Lo recibes porque creaste este reporte.';

async function correosDelArea(area) {
  const porPermiso = area.permiso ? await destinatarios(area.permiso) : [];
  return [...new Set([...porPermiso, ...filtrarDominios(area.correos || [])].map((c) => c.toLowerCase()))];
}

/**
 * HTML y texto de un aviso.
 * @param aviso  { titulo, frase, pasos?, enlace? } (área o creador)
 * @param r      reporte (detalle)
 * @param opts   { detalle, etiquetaDetalle, pie, nombre }
 */
export function plantillaAviso(aviso, r, { detalle, etiquetaDetalle = 'Detalle', pie = PIE_AREA, nombre } = {}) {
  const numero = numeroReporte(r.ReporteId);
  const asunto = `${aviso.titulo}: ${numero} — ${r.NombreProducto}`;
  const base = env.correo.portalUrl;
  const enlace = base ? `${base}${aviso.enlace || `/productos-danados?estado=${encodeURIComponent(r.Estado || '')}&reporte=${r.ReporteId}`}` : '';
  const estado = ESTADO[r.Estado] || r.Estado;
  const filas = [
    ['Tienda', r.TiendaNombre],
    ['Producto', r.NombreProducto],
    ['Código de barras', r.CodigoBarras || r.Sku],
    ['Marca', r.Marca],
    ['División', r.Division],
    ['Motivo', r.Motivo],
    ['Cantidad', r.Cantidad],
    ['Reportado por', r.EmpleadoReportaNombre],
  ];

  const html = documento({
    asunto,
    modulo: 'PRODUCTOS DAÑADOS',
    titulo: aviso.titulo,
    subtitulo: [numero, r.NombreProducto, estado].filter(Boolean).join(' · '),
    vistaPrevia: aviso.frase,
    bloques: [
      parrafo(`${esc(saludo(nombre))}<br />${esc(aviso.frase)}`, { arriba: 22 }),
      recuadro({ etiqueta: etiquetaDetalle, texto: detalle }),
      pasos(aviso.pasos),
      boton({ texto: aviso.pasos ? `Abrir ${numero}` : `Ver ${numero}`, enlace }),
      datos('Datos del reporte', filas),
    ],
    pie: [`Aviso automático del portal Felix Fix. ${pie}`, 'No respondas a este correo: escribe tus comentarios en el reporte.'],
  });

  const texto = [
    `${aviso.titulo} — ${numero} · ${r.NombreProducto}`,
    ...(estado ? [`Estado: ${estado}`] : []),
    '',
    saludo(nombre),
    aviso.frase,
    ...(detalle ? ['', `${etiquetaDetalle}: ${detalle}`] : []),
    ...pasosTexto(aviso.pasos),
    ...(enlace ? ['', `Abrir el reporte: ${enlace}`] : []),
    ...datosTexto('Datos del reporte', filas),
    '',
    `Aviso automático del portal Felix Fix. ${pie}`,
    'No respondas a este correo: escribe tus comentarios en el reporte.',
  ].join('\n');

  return { asunto, html, texto };
}

/**
 * Manda los avisos del evento (área y creador). No espera ni lanza: se llama
 * después de guardar.
 * @param evento  clave de EVENTOS
 * @param r       reporte (detalle)
 * @param opts    { detalle } dato extra del evento (motivo del NF, referencia…)
 */
export function avisarEtapa(evento, r, opts = {}) {
  const ev = EVENTOS[evento];
  if (!env.correo.avisos || !correoConfigurado() || !ev || !r) return;
  (async () => {
    const area = ev.area ? await correosDelArea(ev.area) : [];
    const creador = ev.creador ? await deUsuario(r.EmpleadoReportaUsuario) : { correos: [], nombre: '' };
    const paraCreador = creador.correos.filter((c) => !area.includes(c));
    // El dato extra solo sale si el evento lo nombra (p. ej. el motivo del NF); si no, repetiría la frase.
    const comunes = { detalle: ev.detalle ? opts.detalle : null, etiquetaDetalle: ev.detalle };

    const envios = [];
    // Al área va a varias personas a la vez: saludo sin nombre.
    if (area.length) envios.push({ quien: 'area', para: area, ...plantillaAviso(ev.area, r, comunes) });
    if (paraCreador.length) envios.push({ quien: 'creador', para: paraCreador, ...plantillaAviso(ev.creador, r, { ...comunes, pie: PIE_CREADOR, nombre: creador.nombre }) });
    if (ev.area && !area.length) {
      logger.info({ evento, reporteId: r.ReporteId }, 'Aviso al área sin destinatarios (ningún rol con ese permiso tiene usuarios con correo)');
    }

    for (const { quien, para, asunto, html, texto } of envios) {
      await enviarCorreo({ para, asunto, html, texto })
        .then(() => logger.info({ evento, quien, reporteId: r.ReporteId, ...resumenDestinatarios(para) }, 'Aviso enviado'))
        .catch((err) => logger.warn({ err: err.message, evento, quien, reporteId: r.ReporteId }, 'No se pudo enviar el aviso'));
    }
  })().catch((err) => logger.warn({ err: err.message, evento, reporteId: r.ReporteId }, 'No se pudo enviar el aviso'));
}
