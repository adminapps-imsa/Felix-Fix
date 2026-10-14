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
// en el log.
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { permisosGuardados } from '../acceso/acceso.js';
import { correosDeRoles, datosDeUsuario } from '../acceso/keycloakAdmin.js';
import { enviarCorreo, correoConfigurado } from './mailer.js';
import { numeroReporte } from './plantillaReporteProveedor.js';

const MARCA = '#4f46e5';
const TEXTO = '#1e1b4b';
const SUAVE = '#64748b';
const BORDE = '#e2e8f0';
const FONDO = '#f4f5fb';

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * A quién se avisa en cada evento. Para cambiar destinatarios:
 *   - otro permiso/área: cambia `permiso` (o pon `area: null` para no avisar)
 *   - correos fijos:     agrega `correos: ['alguien@maduro.com.pa']` al área
 *   - no avisar al creador: pon `creador: null`
 */
export const EVENTOS = {
  // Se crea el reporte -> compradora (lo envía al proveedor) + creador.
  nuevo: {
    area: {
      permiso: 'productos_danados.enviar',
      titulo: 'Nuevo reporte pendiente',
      accion: 'Envíalo al proveedor y registra su respuesta (Devolución aprobada o NF).',
    },
    creador: {
      titulo: 'Recibimos tu reporte',
      mensaje: 'Tu reporte quedó registrado y pasó a la compradora para enviarlo al proveedor.',
    },
  },
  // El proveedor aprueba la devolución -> Gof (documento) + creador.
  aprobado: {
    area: {
      permiso: 'productos_danados.documentar',
      titulo: 'Devolución aprobada',
      accion: 'Sube el documento (PDF o Excel) y envía el reporte a contabilidad.',
    },
    creador: {
      titulo: 'El proveedor aprobó la devolución',
      mensaje: 'El proveedor aprobó la devolución de tu reporte. Sigue con Gof para el documento.',
    },
  },
  // El proveedor no aprueba (NF) -> supervisor GOF + creador.
  nf: {
    area: {
      permiso: 'productos_danados.nf',
      titulo: 'Reporte NF para revisar',
      accion: 'El proveedor no aprobó la devolución. Revisa el reporte y ciérralo.',
    },
    creador: {
      titulo: 'El proveedor no aprobó la devolución (NF)',
      mensaje: 'El proveedor no aprobó la devolución de tu reporte. El supervisor GOF lo revisará.',
    },
  },
  // Gof lo envía a contabilidad -> contabilidad + creador.
  contabilidad: {
    area: {
      permiso: 'productos_danados.pago',
      titulo: 'Reporte en contabilidad',
      accion: 'Cuando el proveedor pague, marca "Pago recibido" con la referencia.',
    },
    creador: {
      titulo: 'Tu reporte pasó a contabilidad',
      mensaje: 'Tu reporte ya tiene su documento y está en contabilidad esperando el pago del proveedor.',
    },
  },
  // El supervisor GOF cierra el NF -> creador.
  nfCerrado: {
    area: null,
    creador: {
      titulo: 'Tu reporte se cerró (NF)',
      mensaje: 'El supervisor GOF revisó y cerró tu reporte sin devolución del proveedor.',
    },
  },
  // Contabilidad registra el pago -> creador.
  pagado: {
    area: null,
    creador: {
      titulo: 'Pago recibido: tu reporte se cerró',
      mensaje: 'Contabilidad registró el pago del proveedor y tu reporte quedó cerrado.',
    },
  },
};

const PIE_AREA = 'Aviso automático del portal. Lo recibes porque tu rol tiene este paso asignado en Configuración.';
const PIE_CREADOR = 'Aviso automático del portal. Lo recibes porque creaste este reporte.';

const filtrarDominios = (correos) => {
  const permitidos = env.correo.soloDominios;
  return permitidos.length ? correos.filter((c) => permitidos.includes(c.split('@').pop())) : correos;
};

/** Correos de los usuarios cuyos roles tienen el permiso (sin el super administrador). */
export async function destinatarios(permiso) {
  const guardados = await permisosGuardados();
  const roles = [...guardados.entries()].filter(([, ps]) => ps.has(permiso)).map(([rol]) => rol);
  return filtrarDominios(await correosDeRoles(roles));
}

async function correosDelArea(area) {
  const porPermiso = area.permiso ? await destinatarios(area.permiso) : [];
  return [...new Set([...porPermiso, ...filtrarDominios(area.correos || [])].map((c) => c.toLowerCase()))];
}

async function correoDelCreador(r) {
  if (!r.EmpleadoReportaUsuario) return [];
  const { correo } = await datosDeUsuario(r.EmpleadoReportaUsuario);
  return correo ? filtrarDominios([correo.toLowerCase()]) : [];
}

/**
 * HTML y texto de un aviso.
 * @param aviso  { titulo, accion } (área) o { titulo, mensaje } (creador)
 */
export function plantillaAviso(aviso, r, { detalle, pie = PIE_AREA } = {}) {
  const numero = numeroReporte(r.ReporteId);
  const asunto = `${aviso.titulo}: ${numero} — ${r.NombreProducto}`;
  const enlace = env.correo.portalUrl ? `${env.correo.portalUrl}/productos-danados` : '';
  const intro = aviso.accion ? `<strong>Te toca:</strong> ${esc(aviso.accion)}` : esc(aviso.mensaje);
  const introTexto = aviso.accion ? `Te toca: ${aviso.accion}` : aviso.mensaje;
  const filas = [
    ['Tienda', r.TiendaNombre],
    ['Producto', r.NombreProducto],
    ['Código de barras', r.CodigoBarras || r.Sku],
    ['Marca', r.Marca],
    ['División', r.Division],
    ['Motivo', r.Motivo],
    ['Cantidad', r.Cantidad],
    ['Detalle', detalle],
  ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

  const filasHtml = filas
    .map(
      ([k, v], i) => `
          <tr>
            <td style="padding:8px 12px;border-top:${i ? `1px solid ${BORDE}` : '0'};color:${SUAVE};font-size:13px;width:38%;vertical-align:top;">${esc(k)}</td>
            <td style="padding:8px 12px;border-top:${i ? `1px solid ${BORDE}` : '0'};color:${TEXTO};font-size:14px;font-weight:600;vertical-align:top;">${esc(v)}</td>
          </tr>`
    )
    .join('');

  const boton = enlace
    ? `<tr><td style="padding:20px 24px 0;"><a href="${esc(enlace)}" style="display:inline-block;background:${MARCA};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;padding:10px 18px;">Abrir en el portal</a></td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${FONDO};font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDE};">
        <tr><td style="background:${MARCA};padding:18px 24px;">
          <div style="font-size:12px;color:#c7d2fe;font-weight:600;letter-spacing:.04em;">FELIX FIX · PRODUCTOS DAÑADOS</div>
          <div style="font-size:20px;color:#ffffff;font-weight:800;margin-top:4px;">${esc(aviso.titulo)} · ${esc(numero)}</div>
        </td></tr>
        <tr><td style="padding:20px 24px 0;font-size:15px;line-height:1.6;color:${TEXTO};">${intro}</td></tr>
        <tr><td style="padding:16px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDE};border-radius:10px;border-collapse:separate;">${filasHtml}
          </table>
        </td></tr>
        ${boton}
        <tr><td style="padding:20px 24px 22px;font-size:12px;color:${SUAVE};">${esc(pie)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = [
    `${aviso.titulo} · ${numero}`,
    '',
    introTexto,
    '',
    ...filas.map(([k, v]) => `${k}: ${v}`),
    ...(enlace ? ['', `Abrir en el portal: ${enlace}`] : []),
  ].join('\n');

  return { asunto, html, texto };
}

/**
 * Manda los avisos del evento (área y creador). No espera ni lanza: se llama
 * después de guardar.
 * @param evento  clave de EVENTOS
 * @param r       reporte (detalle)
 */
export function avisarEtapa(evento, r, opts = {}) {
  const ev = EVENTOS[evento];
  if (!env.correo.avisos || !correoConfigurado() || !ev || !r) return;
  (async () => {
    const area = ev.area ? await correosDelArea(ev.area) : [];
    const creador = ev.creador ? (await correoDelCreador(r)).filter((c) => !area.includes(c)) : [];

    const envios = [];
    if (area.length) envios.push({ quien: 'area', para: area, ...plantillaAviso(ev.area, r, opts) });
    if (creador.length) envios.push({ quien: 'creador', para: creador, ...plantillaAviso(ev.creador, r, { ...opts, pie: PIE_CREADOR }) });
    if (ev.area && !area.length) {
      logger.info({ evento, reporteId: r.ReporteId }, 'Aviso al área sin destinatarios (ningún rol con ese permiso tiene usuarios con correo)');
    }

    for (const { quien, para, asunto, html, texto } of envios) {
      await enviarCorreo({ para, asunto, html, texto }).catch((err) =>
        logger.warn({ err: err.message, evento, quien, reporteId: r.ReporteId }, 'No se pudo enviar el aviso')
      );
    }
  })().catch((err) => logger.warn({ err: err.message, evento, reporteId: r.ReporteId }, 'No se pudo enviar el aviso'));
}
