// Correo que recibe contabilidad cuando la compradora envía un reclamo
// cerrado: datos del reclamo, decisión, productos y la lista de archivos
// adjuntos (Excel del reclamo y PDF/Excel adjuntos, todos con el número del
// reclamo en el nombre). Mismo estilo que los demás correos del portal:
// tablas y estilos en línea, ancho máximo 640 px, más versión en texto.
import { env } from '../../config/env.js';
import { COMENTARIO_AUTO_APROBADO } from '../reclamos/tipos.js';

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
  d ? new Intl.DateTimeFormat('es-PA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Panama' }).format(new Date(d)) : '';
const fechaCorta = (d) => (d ? new Intl.DateTimeFormat('es-PA', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(d)) : '');
const cantidad = (n) => new Intl.NumberFormat('es-PA', { maximumFractionDigits: 3 }).format(Number(n));
const monto = (n) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));

/**
 * Validación de una nota de débito en palabras: "Cuadra con el reclamo",
 * "N diferencia(s)", "No se pudo leer", más la advertencia "Mezcla aprobados
 * y rechazados". `color` resume la gravedad.
 */
export function validacionTexto(doc) {
  const v = doc.validacion || {};
  if (!doc.legible || v.estado === 'sin_leer') return { texto: 'No se pudo leer', color: '#b91c1c' };
  const partes = [];
  let color = '#15803d';
  if (v.estado === 'ok') {
    partes.push('Cuadra con el reclamo');
  } else {
    const n = (v.noEnReclamo || 0) + (v.cantidadDistinta || 0);
    partes.push(`${n} ${n === 1 ? 'diferencia' : 'diferencias'}`);
    color = '#b45309';
  }
  if (v.mezclaDecisiones) {
    partes.push('Mezcla aprobados y rechazados');
    color = '#b45309';
  }
  return { texto: partes.join(' · '), color };
}

export const TIPO_LABEL = {
  faltante_real: 'Faltante Real',
  sobrante_real: 'Sobrante Real',
  diferencias: 'Diferencias',
  danos_textil: 'Daños y Averías — Textil',
  danos_perfumeria_cliente: 'Daños y Averías — Perfumería (cliente devuelve)',
  danos_perfumeria_gof: 'Daños y Averías — Perfumería (detectado en GOF)',
};
const STATUS_LABEL = { resuelto: 'Confirmado por compradora', rechazado: 'Rechazado', pendiente: 'Pendiente', notificado: 'Notificado' };
const DEC_LABEL = { aprobado: 'Aprobado', rechazado: 'Rechazado', pendiente: 'Sin decidir' };
const DEC_COLOR = { aprobado: '#15803d', rechazado: '#b91c1c', pendiente: SUAVE };

/** "Aprobado automáticamente…" se repetiría en cada fila: se muestra corto. */
const decisionTexto = (l) => {
  const auto = l.DecComentario === COMENTARIO_AUTO_APROBADO;
  return { etiqueta: `${DEC_LABEL[l.DecStatus] || l.DecStatus}${auto ? ' (automático)' : ''}`, comentario: auto ? '' : l.DecComentario || '' };
};

const conDato = (filas) => filas.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

function tablaDatos(filas) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDE};border-radius:10px;border-collapse:separate;">${filas
    .map(
      ([k, v], i) => `
          <tr>
            <td style="padding:8px 12px;border-top:${i ? `1px solid ${BORDE}` : '0'};color:${SUAVE};font-size:13px;width:38%;vertical-align:top;">${esc(k)}</td>
            <td style="padding:8px 12px;border-top:${i ? `1px solid ${BORDE}` : '0'};color:${TEXTO};font-size:14px;font-weight:600;vertical-align:top;">${esc(v)}</td>
          </tr>`
    )
    .join('')}
          </table>`;
}

const titulo = (t) =>
  `<tr><td style="padding:22px 24px 8px;font-size:12px;font-weight:700;letter-spacing:.05em;color:${MARCA};text-transform:uppercase;">${esc(t)}</td></tr>`;

/**
 * @param r         reclamo (detalle, con Numero, SapDocs y nombres)
 * @param lineas    productos del reclamo
 * @param opts.remitente  { nombre, correo } de la compradora que envía
 * @param opts.archivos   [{ filename, descripcion }] adjuntos del correo
 * @param opts.documentos notas de débito leídas de los PDF (contabilidad/sincronizar.js
 *                        calcularDocumentos): [{ adjuntoNombre, numeroDocumento, movimiento,
 *                        total, lineas, legible, validacion }]
 */
export function plantillaReclamoContabilidad(r, lineas, { remitente, archivos = [], documentos = [] }) {
  const asunto = `Reclamo ${r.Numero} para contabilidad — ${r.Proveedor || TIPO_LABEL[r.Tipo] || r.Tipo}`;
  const enlace = env.correo.portalUrl ? `${env.correo.portalUrl}/reclamos/${r.Token}` : '';
  const de = remitente?.nombre || remitente?.correo || 'La compradora';

  const datos = conDato([
    ['Número de reclamo', r.Numero],
    ['Tipo', TIPO_LABEL[r.Tipo] || r.Tipo],
    ['Origen', r.Origen === 'cedi' ? 'CEDI' : 'Tienda'],
    ['Sucursal', r.Origen === 'tienda' ? r.Sucursal : null],
    ['División', r.Division],
    ['Motivo', r.Motivo],
    ['Fecha de registro', fechaCorta(r.FechaRegistro)],
    ['Proveedor', r.Proveedor],
    ['Marca', r.Marca],
    ['Mundo', r.Mundo],
    ['Departamento', r.Departamento],
    ['Compradora', r.Compradora],
    ['N° embarque / factura', r.NumeroEmbarqueFactura],
    ['Documento(s) SAP', (r.SapDocs || []).join(', ')],
    ['Creado por', `${r.CreatedByNombre || r.CreatedBy} · ${fecha(r.CreatedAt)}`],
  ]);
  const aprobados = lineas.filter((l) => l.DecStatus === 'aprobado').length;
  const rechazados = lineas.filter((l) => l.DecStatus === 'rechazado').length;
  const decision = conDato([
    ['Resultado', STATUS_LABEL[r.Status] || r.Status],
    ['Decidido por', r.DecisionBy ? `${r.DecisionByNombre || r.DecisionBy} · ${fecha(r.DecisionAt)}` : null],
    ['Productos', `${lineas.length} en total · ${aprobados} aprobado(s) · ${rechazados} rechazado(s)`],
    ['Comentario', r.Comentario],
  ]);

  const celda = 'padding:7px 8px;border-top:1px solid ' + BORDE + ';font-size:12px;vertical-align:top;color:' + TEXTO + ';';
  const cab = `padding:7px 8px;font-size:11px;font-weight:700;color:${SUAVE};text-align:left;background:${FONDO};`;
  const filasProductos = lineas
    .map(
      (l) => `
            <tr>
              <td style="${celda}color:${SUAVE};">${esc(l.Posicion)}</td>
              <td style="${celda}font-family:Consolas,monospace;">${esc(l.CodigoBarra)}</td>
              <td style="${celda}">${esc(l.DescripcionExcel || '')}</td>
              <td style="${celda}text-align:right;">${esc(cantidad(l.Cantidad))}</td>
              <td style="${celda}">${esc(TIPO_LABEL[l.Tipo] || l.Tipo || '')}</td>
              <td style="${celda}font-weight:700;color:${DEC_COLOR[l.DecStatus] || TEXTO};">${esc(decisionTexto(l).etiqueta)}${
                decisionTexto(l).comentario ? `<div style="font-weight:400;color:${SUAVE};">${esc(decisionTexto(l).comentario)}</div>` : ''
              }</td>
            </tr>`
    )
    .join('');

  const listaArchivos = archivos.length
    ? `<ul style="margin:0;padding:0 0 0 18px;font-size:14px;color:${TEXTO};line-height:1.7;">${archivos
        .map((a) => `<li><strong>${esc(a.filename)}</strong>${a.descripcion ? ` <span style="color:${SUAVE};">— ${esc(a.descripcion)}</span>` : ''}</li>`)
        .join('')}</ul>`
    : `<p style="margin:0;font-size:14px;color:${SUAVE};">Este reclamo no tiene archivos adjuntos.</p>`;

  // Documentos (notas de débito): una fila por PDF adjunto.
  const filasDocumentos = documentos
    .map((d) => {
      const val = validacionTexto(d);
      return `
            <tr>
              <td style="${celda}font-family:Consolas,monospace;">${esc(d.numeroDocumento || '—')}<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${SUAVE};">${esc(d.adjuntoNombre || '')}</div></td>
              <td style="${celda}">${esc(d.movimiento || '—')}</td>
              <td style="${celda}text-align:right;">${esc(monto(d.total))}</td>
              <td style="${celda}text-align:right;">${esc(d.lineas?.length ?? 0)}</td>
              <td style="${celda}font-weight:700;color:${val.color};">${esc(val.texto)}</td>
            </tr>`;
    })
    .join('');
  const seccionDocumentos = documentos.length
    ? `${titulo(`Documentos (notas de débito) (${documentos.length})`)}
        <tr><td style="padding:0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDE};border-radius:10px;border-collapse:separate;">
            <tr>
              <th style="${cab}">Documento</th><th style="${cab}">Movimiento</th><th style="${cab}text-align:right;">Total</th>
              <th style="${cab}text-align:right;">Productos</th><th style="${cab}">Validación</th>
            </tr>${filasDocumentos}
          </table>
        </td></tr>`
    : '';

  const boton = enlace
    ? `<tr><td style="padding:22px 24px 0;"><a href="${esc(enlace)}" style="display:inline-block;background:${MARCA};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;padding:10px 18px;">Abrir el reclamo en el portal</a></td></tr>`
    : '';

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${FONDO};font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FONDO};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDE};">
        <tr><td style="background:${MARCA};padding:18px 24px;">
          <div style="font-size:12px;color:#c7d2fe;font-weight:600;letter-spacing:.04em;">FELIX FIX · RECLAMOS · CONTABILIDAD</div>
          <div style="font-size:20px;color:#ffffff;font-weight:800;margin-top:4px;">Reclamo ${esc(r.Numero)} · ${esc(STATUS_LABEL[r.Status] || r.Status)}</div>
        </td></tr>
        <tr><td style="padding:20px 24px 0;font-size:15px;line-height:1.6;color:${TEXTO};">
          ${esc(de)} te envía este reclamo ya revisado, con sus productos y los archivos del reclamo adjuntos.
        </td></tr>
        ${titulo('Datos del reclamo')}
        <tr><td style="padding:0 24px;">${tablaDatos(datos)}</td></tr>
        ${titulo('Decisión de la compradora')}
        <tr><td style="padding:0 24px;">${tablaDatos(decision)}</td></tr>
        ${titulo(`Productos (${lineas.length})`)}
        <tr><td style="padding:0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDE};border-radius:10px;border-collapse:separate;">
            <tr>
              <th style="${cab}">#</th><th style="${cab}">Código de barras</th><th style="${cab}">Descripción</th>
              <th style="${cab}text-align:right;">Cant.</th><th style="${cab}">Tipo</th><th style="${cab}">Decisión</th>
            </tr>${filasProductos}
          </table>
        </td></tr>
        ${seccionDocumentos}
        ${titulo('Archivos adjuntos del reclamo')}
        <tr><td style="padding:0 24px;">${listaArchivos}</td></tr>
        ${boton}
        <tr><td style="padding:22px 24px 22px;font-size:12px;color:${SUAVE};">Enviado desde el portal Felix Fix. Para responder, contesta este correo: le llega a ${esc(de)}.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = [
    `Reclamo ${r.Numero} para contabilidad · ${STATUS_LABEL[r.Status] || r.Status}`,
    '',
    `${de} te envía este reclamo ya revisado, con sus productos y los archivos del reclamo adjuntos.`,
    '',
    'DATOS DEL RECLAMO',
    ...datos.map(([k, v]) => `${k}: ${v}`),
    '',
    'DECISIÓN DE LA COMPRADORA',
    ...decision.map(([k, v]) => `${k}: ${v}`),
    '',
    `PRODUCTOS (${lineas.length})`,
    ...lineas.map(
      (l) =>
        `${l.Posicion}. ${l.CodigoBarra} · ${l.DescripcionExcel || ''} · Cant. ${cantidad(l.Cantidad)} · ${decisionTexto(l).etiqueta}${
          decisionTexto(l).comentario ? ` (${decisionTexto(l).comentario})` : ''
        }`
    ),
    ...(documentos.length
      ? [
          '',
          `DOCUMENTOS (NOTAS DE DÉBITO) (${documentos.length})`,
          ...documentos.map(
            (d) =>
              `- ${d.numeroDocumento || '(sin número)'} · ${d.movimiento || '—'} · Total ${monto(d.total)} · ${d.lineas?.length ?? 0} producto(s) · ${
                validacionTexto(d).texto
              } (${d.adjuntoNombre || ''})`
          ),
        ]
      : []),
    '',
    'ARCHIVOS ADJUNTOS DEL RECLAMO',
    ...(archivos.length ? archivos.map((a) => `- ${a.filename}${a.descripcion ? ` — ${a.descripcion}` : ''}`) : ['(sin archivos)']),
    ...(enlace ? ['', `Abrir el reclamo en el portal: ${enlace}`] : []),
  ].join('\n');

  return { asunto, html, texto };
}
