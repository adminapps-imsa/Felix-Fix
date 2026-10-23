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
// Solo se avisa a quien tiene que hacer algo: los avisos que solo informaban
// al creador («Recibimos tu reporte», «pasó a contabilidad», «se cerró»…) se
// quitaron el 2026-10-21 para no llenar de correos a las tiendas.
//
// Nunca bloquea ni hace fallar la acción: si el correo no está configurado,
// MAIL_AVISOS=false, no hay destinatarios o el envío falla, solo se registra
// en el log. El diseño es el común de los correos del portal (diseno.js).
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { enviarCorreo, correoConfigurado, resumenDestinatarios } from './mailer.js';
import { numeroReporte } from './plantillaReporteProveedor.js';
import { destinatarios, filtrarDominios, deUsuario, PERMISOS_COMPRADORA, correosDeAsignadas } from './destinatarios.js';
import { documento, parrafo, recuadro, boton, datos, saludo, esc, datosTexto } from './diseno.js';

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
 * `frase`: qué pasó y qué tiene que hacer quien lo recibe, en una o dos frases cortas.
 * `detalle`: cómo se llama el dato extra del evento (motivo del NF, referencia…).
 */
export const EVENTOS = {
  // Se crea el reporte -> compradora (lo envía al proveedor).
  nuevo: {
    area: {
      permiso: 'productos_danados.enviar',
      titulo: 'Nuevo reporte pendiente',
      frase: 'Hay un reporte de producto dañado que espera tu gestión. Revísalo y envíalo al proveedor.',
    },
    creador: null,
  },
  // La compradora lo devuelve para corregir -> quien lo creó.
  devuelto: {
    detalle: 'Qué hay que corregir',
    area: null,
    creador: {
      titulo: 'Tu reporte necesita una corrección',
      frase: 'La compradora te devolvió el reporte. Corrige lo que indica y reenvíalo.',
    },
  },
  // La tienda lo corrigió -> compradora (vuelve a su bandeja de pendientes).
  reenviado: {
    detalle: 'Lo que corrigió la tienda',
    area: {
      permiso: 'productos_danados.enviar',
      titulo: 'Reporte corregido por la tienda',
      frase: 'La tienda corrigió el reporte que devolviste. Revísalo y envíalo al proveedor.',
    },
    creador: null,
  },
  // El proveedor aprueba la devolución -> Gof (documento).
  aprobado: {
    area: {
      permiso: 'productos_danados.documentar',
      titulo: 'Devolución aprobada',
      frase: 'El proveedor aprobó la devolución. Sube el documento en el reporte y envíalo a contabilidad.',
    },
    creador: null,
  },
  // El proveedor no aprueba (NF) -> Gof (documento 1700).
  nf: {
    detalle: 'Motivo del NF',
    area: {
      permiso: 'productos_danados.nf_documento',
      titulo: 'Reporte NF: falta el documento 1700',
      frase: 'El proveedor no aprobó la devolución (NF). Haz el documento 1700 en SAP y márcalo en el reporte.',
    },
    creador: null,
  },
  // Gof marcó el documento 1700 -> supervisor GOF.
  nfValidar: {
    area: {
      permiso: 'productos_danados.nf',
      titulo: 'NF por validar',
      frase: 'Gof marcó el documento 1700. Escribe el número del «Documento salida de NF» y valida el reporte.',
    },
    creador: null,
  },
  // Gof lo envió a contabilidad -> contabilidad (pago).
  contabilidad: {
    detalle: 'Documentos',
    area: {
      permiso: 'productos_danados.pago',
      titulo: 'Reporte en contabilidad',
      frase: 'Gof envió a contabilidad esta devolución aprobada. Cuando el proveedor pague, marca «Pago recibido».',
      // Contabilidad trabaja los pagos desde su apartado, no desde Productos Dañados.
      enlace: '/contabilidad?seccion=productos',
    },
    creador: null,
  },
  // El supervisor GOF cerró el NF -> sin aviso.
  nfCerrado: {
    detalle: 'Detalle del cierre',
    area: null,
    creador: null,
  },
  // Contabilidad registró el pago -> sin aviso.
  pagado: {
    detalle: 'Pago',
    area: null,
    creador: null,
  },
};

const PIE = 'Aviso automático de Felix Fix. No respondas este correo.';

async function correosDelArea(area) {
  const porPermiso = area.permiso ? await destinatarios(area.permiso) : [];
  return [...new Set([...porPermiso, ...filtrarDominios(area.correos || [])].map((c) => c.toLowerCase()))];
}

/**
 * HTML y texto de un aviso.
 * @param aviso  { titulo, frase, enlace? } (área o creador)
 * @param r      reporte (detalle)
 * @param opts   { detalle, etiquetaDetalle, nombre }
 */
export function plantillaAviso(aviso, r, { detalle, etiquetaDetalle = 'Detalle', nombre } = {}) {
  const numero = numeroReporte(r.ReporteId);
  const asunto = `${aviso.titulo}: ${numero} — ${r.NombreProducto}`;
  const base = env.correo.portalUrl;
  const enlace = base ? `${base}${aviso.enlace || `/productos-danados?estado=${encodeURIComponent(r.Estado || '')}&reporte=${r.ReporteId}`}` : '';
  const estado = ESTADO[r.Estado] || r.Estado;
  // Solo lo necesario para ubicar el caso; el resto está en el portal.
  const filas = [
    ['Producto', r.NombreProducto],
    ['Tienda', r.TiendaNombre],
    ['Motivo', [r.Motivo, r.Cantidad != null && r.Cantidad !== '' ? `Cant. ${r.Cantidad}` : null].filter(Boolean).join(' · ')],
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
      boton({ texto: `Abrir ${numero}`, enlace }),
      datos('Datos del reporte', filas),
    ],
    pie: [PIE],
  });

  const texto = [
    `${aviso.titulo} — ${numero} · ${r.NombreProducto}`,
    '',
    saludo(nombre),
    aviso.frase,
    ...(detalle ? ['', `${etiquetaDetalle}: ${detalle}`] : []),
    ...(enlace ? ['', `Abrir el reporte: ${enlace}`] : []),
    ...datosTexto('Datos del reporte', filas),
    '',
    PIE,
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
  if (!env.correo.avisos || env.correo.desactivado || !correoConfigurado() || !ev || !r) return;
  (async () => {
    // Avisos de compradoras: solo a la asignada (dueña de la marca), no a todas.
    const area = !ev.area ? [] : PERMISOS_COMPRADORA.has(ev.area.permiso) ? await correosDeAsignadas({ reporteId: r.ReporteId }) : await correosDelArea(ev.area);
    const creador = ev.creador ? await deUsuario(r.EmpleadoReportaUsuario) : { correos: [], nombre: '' };
    const paraCreador = creador.correos.filter((c) => !area.includes(c));
    // El dato extra solo sale si el evento lo nombra (p. ej. el motivo del NF); si no, repetiría la frase.
    const comunes = { detalle: ev.detalle ? opts.detalle : null, etiquetaDetalle: ev.detalle };

    const envios = [];
    // Al área va a varias personas a la vez: saludo sin nombre.
    if (area.length) envios.push({ quien: 'area', para: area, ...plantillaAviso(ev.area, r, comunes) });
    if (paraCreador.length) envios.push({ quien: 'creador', para: paraCreador, ...plantillaAviso(ev.creador, r, { ...comunes, nombre: creador.nombre }) });
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
