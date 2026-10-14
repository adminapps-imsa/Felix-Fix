// Correo que recibe el proveedor con un reporte de producto dañado.
//
// HTML para clientes de correo (Outlook, Gmail, celular): tablas, estilos en
// línea y ancho máximo de 640 px; nada de CSS externo ni scripts. La foto de
// evidencia va incrustada (cid) y los adjuntos del reporte van como archivos.
// Se acompaña de una versión en texto plano.

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

const fecha = (d) =>
  new Intl.DateTimeFormat('es-PA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Panama' }).format(new Date(d));

const cantidad = (n) => new Intl.NumberFormat('es-PA', { maximumFractionDigits: 3 }).format(Number(n));

export const numeroReporte = (id) => `PD-${String(id).padStart(6, '0')}`;

/** Filas "etiqueta → valor" del reporte (solo las que tienen dato). */
function datos(r) {
  return [
    ['Tienda', r.TiendaNombre],
    ['Producto', r.NombreProducto],
    ['Código de barras', r.CodigoBarras || r.Sku],
    ['Marca', r.Marca],
    ['División', r.Division],
    ['Motivo', r.Motivo],
    ['Cantidad', cantidad(r.Cantidad)],
    ['Fecha del reporte', fecha(r.FechaCreacion)],
    ['Reportado por', r.EmpleadoReportaNombre],
  ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
}

/**
 * @param r       reporte (fila de ReportesProductoDanado + tienda)
 * @param opts.remitente  { nombre, correo } de quien envía (compradora); el proveedor le responde a ella
 * @param opts.conFoto    true si se adjunta la foto con cid "evidencia"
 * @param opts.adjuntos   nombres de los archivos adjuntos
 * @param opts.srcFoto    src de la foto; por defecto "cid:evidencia" (en la vista previa, un data: URI)
 */
export function plantillaReporteProveedor(r, { remitente, conFoto, adjuntos = [], srcFoto = 'cid:evidencia' }) {
  const numero = numeroReporte(r.ReporteId);
  const asunto = `Reporte de producto dañado ${numero} — ${r.NombreProducto}`;
  const filas = datos(r);
  const contacto = remitente?.correo ? `${remitente.nombre || remitente.correo} (${remitente.correo})` : remitente?.nombre || 'la compradora';

  const filasHtml = filas
    .map(
      ([k, v], i) => `
          <tr>
            <td style="padding:10px 14px;border-top:${i ? `1px solid ${BORDE}` : '0'};color:${SUAVE};font-size:13px;width:38%;vertical-align:top;">${esc(k)}</td>
            <td style="padding:10px 14px;border-top:${i ? `1px solid ${BORDE}` : '0'};color:${TEXTO};font-size:14px;font-weight:600;vertical-align:top;">${esc(v)}</td>
          </tr>`
    )
    .join('');

  const descripcion = r.Descripcion
    ? `
      <tr><td style="padding:20px 28px 0;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MARCA};margin-bottom:6px;">Descripción</div>
        <div style="font-size:14px;line-height:1.55;color:${TEXTO};background:${FONDO};border-radius:10px;padding:12px 14px;white-space:pre-line;">${esc(r.Descripcion)}</div>
      </td></tr>`
    : '';

  const foto = conFoto
    ? `
      <tr><td style="padding:20px 28px 0;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MARCA};margin-bottom:8px;">Foto de evidencia</div>
        <img src="${esc(srcFoto)}" alt="Foto de evidencia del producto" width="584" style="display:block;width:100%;max-width:584px;height:auto;border-radius:10px;border:1px solid ${BORDE};" />
      </td></tr>`
    : '';

  const listaAdjuntos = adjuntos.length
    ? `
      <tr><td style="padding:20px 28px 0;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MARCA};margin-bottom:6px;">Documentos adjuntos (${adjuntos.length})</div>
        ${adjuntos.map((a) => `<div style="font-size:14px;color:${TEXTO};padding:4px 0;">&bull;&nbsp; ${esc(a)}</div>`).join('')}
      </td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:${FONDO};font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">Producto dañado ${esc(r.NombreProducto)} (${esc(r.TiendaNombre)}). Le pedimos indicar si aprueba la devolución.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDE};">
        <tr><td style="background:${MARCA};padding:22px 28px;">
          <div style="font-size:13px;color:#c7d2fe;font-weight:600;letter-spacing:.04em;">FELIX FIX · PRODUCTOS DAÑADOS</div>
          <div style="font-size:22px;color:#ffffff;font-weight:800;margin-top:4px;">Reporte ${esc(numero)}</div>
        </td></tr>

        <tr><td style="padding:24px 28px 0;font-size:15px;line-height:1.6;color:${TEXTO};">
          Estimado proveedor:<br />
          Le compartimos el reporte de un producto que llegó dañado o con problemas a nuestra tienda <strong>${esc(r.TiendaNombre)}</strong>.
          Le pedimos revisarlo y respondernos si aprueba la devolución.
        </td></tr>

        <tr><td style="padding:20px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MARCA};margin-bottom:6px;">Detalle del producto</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDE};border-radius:10px;border-collapse:separate;">
            ${filasHtml}
          </table>
        </td></tr>
        ${descripcion}
        ${foto}
        ${listaAdjuntos}

        <tr><td style="padding:24px 28px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:12px;">
            <tr><td style="padding:16px 18px;font-size:14px;line-height:1.6;color:${TEXTO};">
              <strong>¿Qué necesitamos de usted?</strong> Responda a este correo indicando una de estas opciones:
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;">
                <tr><td style="padding:4px 0;font-size:14px;color:${TEXTO};"><span style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;border-radius:999px;padding:2px 10px;font-size:12px;">DEVOLUCIÓN APROBADA</span>&nbsp; el proveedor se hace responsable del producto.</td></tr>
                <tr><td style="padding:4px 0;font-size:14px;color:${TEXTO};"><span style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;border-radius:999px;padding:2px 10px;font-size:12px;">NF</span>&nbsp; no aprueba la devolución.</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 28px 26px;font-size:14px;line-height:1.6;color:${TEXTO};">
          Al responder, su mensaje le llega a ${esc(contacto)}.<br />
          Gracias por su atención.
        </td></tr>

        <tr><td style="background:${FONDO};padding:14px 28px;font-size:12px;color:${SUAVE};border-top:1px solid ${BORDE};">
          Correo generado por Felix Fix para el reporte ${esc(numero)}. Por favor no cambie el asunto al responder.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = [
    `Reporte ${numero} — Felix Fix · Productos Dañados`,
    '',
    'Estimado proveedor:',
    `Le compartimos el reporte de un producto que llegó dañado o con problemas a nuestra tienda ${r.TiendaNombre}.`,
    'Le pedimos revisarlo y respondernos si aprueba la devolución.',
    '',
    ...filas.map(([k, v]) => `${k}: ${v}`),
    ...(r.Descripcion ? ['', `Descripción: ${r.Descripcion}`] : []),
    ...(adjuntos.length ? ['', `Documentos adjuntos: ${adjuntos.join(', ')}`] : []),
    ...(conFoto ? ['Se adjunta la foto de evidencia.'] : []),
    '',
    'Responda a este correo indicando:',
    '  - DEVOLUCIÓN APROBADA: el proveedor se hace responsable del producto.',
    '  - NF: no aprueba la devolución.',
    '',
    `Al responder, su mensaje le llega a ${contacto}.`,
    'Gracias por su atención.',
  ].join('\n');

  return { asunto, html, texto };
}
