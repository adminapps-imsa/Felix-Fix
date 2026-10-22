// Correo que recibe contabilidad cuando la compradora envía un reclamo
// cerrado: datos del reclamo, decisión, productos y la lista de archivos
// adjuntos (Excel del reclamo y PDF/Excel adjuntos, todos con el número del
// reclamo en el nombre). Diseño común de los correos del portal (diseno.js),
// más versión en texto. Solo colores del portal: las decisiones y la
// validación se distinguen por la palabra, no por verde o rojo.
import { env } from '../../config/env.js';
import { COMENTARIO_AUTO_APROBADO } from '../reclamos/tipos.js';
import { documento, parrafo, tituloSeccion, bloque, boton, tablaDatosHtml, esc, conDato, COLOR, FUENTE } from './diseno.js';

const TEXTO = COLOR.texto;
const SUAVE = COLOR.suave;
const BORDE = COLOR.borde;

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
  if (!doc.legible || v.estado === 'sin_leer') return { texto: 'No se pudo leer', color: TEXTO };
  const partes = [];
  let color = COLOR.marca;
  if (v.estado === 'ok') {
    partes.push('Cuadra con el reclamo');
  } else {
    const n = (v.noEnReclamo || 0) + (v.cantidadDistinta || 0);
    partes.push(`${n} ${n === 1 ? 'diferencia' : 'diferencias'}`);
    color = TEXTO;
  }
  if (v.mezclaDecisiones) {
    partes.push('Mezcla aprobados y rechazados');
    color = TEXTO;
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
  devolucion: 'Devolución al proveedor',
};
const STATUS_LABEL = { resuelto: 'Confirmado por compradora', rechazado: 'Rechazado', pendiente: 'Pendiente', notificado: 'Notificado' };
const DEC_LABEL = { aprobado: 'Aprobado', rechazado: 'Rechazado', pendiente: 'Sin decidir' };
const DEC_COLOR = { aprobado: TEXTO, rechazado: TEXTO, pendiente: SUAVE };

/** "Aprobado automáticamente…" se repetiría en cada fila: se muestra corto. */
const decisionTexto = (l) => {
  const auto = l.DecComentario === COMENTARIO_AUTO_APROBADO;
  return { etiqueta: `${DEC_LABEL[l.DecStatus] || l.DecStatus}${auto ? ' (automático)' : ''}`, comentario: auto ? '' : l.DecComentario || '' };
};

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
    ['Llegada de la mercancía', fechaCorta(r.FechaLlegadaMercancia)],
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

  const celda = `padding:7px 8px;border-top:1px solid ${BORDE};font-family:${FUENTE};font-size:12px;vertical-align:top;color:${TEXTO};`;
  const cab = `padding:7px 8px;font-family:${FUENTE};font-size:11px;font-weight:700;color:${SUAVE};text-align:left;background:${COLOR.celda};`;
  const filasProductos = lineas
    .map(
      (l) => `
            <tr>
              <td style="${celda}">${esc(l.DescripcionExcel || 'Sin descripción')}<div style="color:${SUAVE};word-break:break-all;">#${esc(l.Posicion)} · <span style="font-family:Consolas,monospace;">${esc(l.CodigoBarra)}</span></div></td>
              <td style="${celda}text-align:right;white-space:nowrap;">${esc(cantidad(l.Cantidad))}</td>
              <td style="${celda}"><strong style="color:${DEC_COLOR[l.DecStatus] || TEXTO};">${esc(decisionTexto(l).etiqueta)}</strong>${
                decisionTexto(l).comentario ? `<div style="color:${SUAVE};">${esc(decisionTexto(l).comentario)}</div>` : ''
              }<div style="color:${SUAVE};">${esc(TIPO_LABEL[l.Tipo] || l.Tipo || '')}</div></td>
            </tr>`
    )
    .join('');

  const listaArchivos = archivos.length
    ? `<ul style="margin:0;padding:0 0 0 18px;font-family:${FUENTE};font-size:14px;color:${TEXTO};line-height:1.7;">${archivos
        .map((a) => `<li><strong>${esc(a.filename)}</strong>${a.descripcion ? ` <span style="color:${SUAVE};">— ${esc(a.descripcion)}</span>` : ''}</li>`)
        .join('')}</ul>`
    : `<p style="margin:0;font-family:${FUENTE};font-size:14px;color:${SUAVE};">Este reclamo no tiene archivos adjuntos.</p>`;

  // Documentos (notas de débito): una fila por PDF adjunto.
  const filasDocumentos = documentos
    .map((d) => {
      const val = validacionTexto(d);
      return `
            <tr>
              <td style="${celda}"><span style="font-family:Consolas,monospace;">${esc(d.numeroDocumento || '—')}</span><div style="color:${SUAVE};word-break:break-all;">${esc(d.adjuntoNombre || '')}</div><div style="color:${SUAVE};">${esc(d.movimiento || '—')} · ${esc(d.lineas?.length ?? 0)} producto(s)</div></td>
              <td style="${celda}text-align:right;white-space:nowrap;">${esc(monto(d.total))}</td>
              <td style="${celda}font-weight:700;color:${val.color};">${esc(val.texto)}</td>
            </tr>`;
    })
    .join('');
  const tabla = (encabezados, filas) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDE};border-radius:10px;border-collapse:separate;">
                <tr>${encabezados}</tr>${filas}
              </table>`;
  const seccionDocumentos = documentos.length
    ? tituloSeccion(`Documentos (notas de débito) (${documentos.length})`) +
      bloque(
        tabla(
          `<th style="${cab}">Documento</th><th style="${cab}text-align:right;">Total</th><th style="${cab}">Validación</th>`,
          filasDocumentos
        ),
        { arriba: 10 }
      )
    : '';

  const html = documento({
    asunto,
    modulo: 'RECLAMOS · CONTABILIDAD',
    titulo: `Reclamo ${r.Numero} para contabilidad`,
    subtitulo: [r.Proveedor, STATUS_LABEL[r.Status] || r.Status].filter(Boolean).join(' · '),
    vistaPrevia: `${de} te envía el reclamo ${r.Numero} ya revisado, con sus productos y archivos.`,
    bloques: [
      parrafo(`${esc(de)} te envía este reclamo ya revisado, con sus productos y los archivos del reclamo adjuntos.`, { arriba: 22 }),
      boton({ texto: `Abrir ${r.Numero} en el portal`, enlace }),
      tituloSeccion('Datos del reclamo'),
      bloque(tablaDatosHtml(datos), { arriba: 10 }),
      tituloSeccion('Decisión de la compradora'),
      bloque(tablaDatosHtml(decision), { arriba: 10 }),
      tituloSeccion(`Productos (${lineas.length})`),
      bloque(
        tabla(
          `<th style="${cab}">Producto</th><th style="${cab}text-align:right;">Cant.</th><th style="${cab}">Decisión</th>`,
          filasProductos
        ),
        { arriba: 10 }
      ),
      seccionDocumentos,
      tituloSeccion('Archivos adjuntos del reclamo'),
      bloque(listaArchivos, { arriba: 10 }),
    ],
    pie: ['Enviado desde el portal Felix Fix.', `Para responder, contesta este correo: le llega a ${de}.`],
  });

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
