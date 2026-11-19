// Correo que contabilidad le manda al proveedor con la nota de débito de un
// reclamo (2026-11-18): el comentario de contabilidad arriba, los datos del
// reclamo y del documento, y los productos del PDF. El PDF va adjunto.

import { documento, parrafo, recuadro, tituloSeccion, bloque, datos as seccionDatos, esc, conDato, COLOR, FUENTE, datosTexto } from './diseno.js';

const cantidad = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('es-PA', { maximumFractionDigits: 3 }).format(Number(n)));
const monto = (n) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(Number(n));
const fechaCorta = (f) => {
  if (!f) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f instanceof Date ? f.toISOString() : f));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f);
};

/**
 * @param doc   documento de contabilidad (DTO del detalle: NumeroDocumento, TipoDocumento,
 *              FechaDocumento, Total, Proveedor, NumeroEmbarqueFactura, ReclamoNumero, Lineas)
 * @param opts.comentario  lo que escribió contabilidad (puede venir vacío)
 * @param opts.remitente   { nombre, correo } de quien envía; el proveedor le responde a esa persona
 * @param opts.adjunto     nombre del PDF adjunto
 * @param opts.extras      nombres de los demás archivos que adjuntó contabilidad
 */
export function plantillaReclamoProveedor(doc, { comentario, remitente, adjunto, extras = [] }) {
  const archivos = [adjunto, ...extras].filter(Boolean);
  const numeroDoc = doc.NumeroDocumento || doc.AdjuntoNombre;
  const asunto = `${doc.TipoDocumento || 'Nota de débito'} ${numeroDoc} — Reclamo ${doc.ReclamoNumero}${doc.Proveedor ? ` — ${doc.Proveedor}` : ''}`;
  const contacto = remitente?.correo ? `${remitente.nombre || remitente.correo} (${remitente.correo})` : remitente?.nombre || 'contabilidad';
  const lineas = doc.Lineas || [];
  const filas = conDato([
    ['Reclamo', doc.ReclamoNumero],
    ['Proveedor', doc.Proveedor],
    ['N° embarque / factura', doc.NumeroEmbarqueFactura],
    ['Documento', [doc.TipoDocumento, numeroDoc].filter(Boolean).join(' ')],
    ['Fecha del documento', fechaCorta(doc.FechaDocumento)],
    ['Total', doc.Total !== null && doc.Total !== undefined ? monto(doc.Total) : null],
    ['Productos', String(lineas.length)],
  ]);

  const celda = `padding:7px 8px;border-top:1px solid ${COLOR.borde};font-family:${FUENTE};font-size:12px;vertical-align:top;color:${COLOR.texto};`;
  const cab = `padding:7px 8px;font-family:${FUENTE};font-size:11px;font-weight:700;color:${COLOR.suave};text-align:left;background:${COLOR.celda};`;
  const filasProductos = lineas
    .map(
      (l) => `
            <tr>
              <td style="${celda}">${esc(l.descripcion || 'Sin descripción')}<div style="color:${COLOR.suave};font-family:Consolas,monospace;word-break:break-all;">${esc([l.material, l.codigoBarra].filter(Boolean).join(' · '))}</div></td>
              <td style="${celda}text-align:right;white-space:nowrap;">${esc(cantidad(l.cantidadPdf))}</td>
              <td style="${celda}text-align:right;white-space:nowrap;">${esc(monto(l.valor))}</td>
            </tr>`
    )
    .join('');
  const tablaProductos = lineas.length
    ? tituloSeccion(`Productos (${lineas.length})`) +
      bloque(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLOR.borde};border-radius:10px;border-collapse:separate;">
                <tr><th style="${cab}">Producto</th><th style="${cab}text-align:right;">Cant.</th><th style="${cab}text-align:right;">Valor</th></tr>${filasProductos}
              </table>`,
        { arriba: 10 }
      )
    : '';

  const html = documento({
    asunto,
    modulo: 'RECLAMOS · CONTABILIDAD',
    titulo: `${doc.TipoDocumento || 'Nota de débito'} ${numeroDoc}`,
    subtitulo: [doc.Proveedor, `Reclamo ${doc.ReclamoNumero}`].filter(Boolean).join(' · '),
    vistaPrevia: comentario ? comentario.slice(0, 120) : `Le enviamos el documento ${numeroDoc} del reclamo ${doc.ReclamoNumero}.`,
    bloques: [
      parrafo(
        `Estimado proveedor:<br />Le enviamos el documento <strong>${esc(numeroDoc)}</strong> del reclamo <strong>${esc(doc.ReclamoNumero)}</strong>. Se adjunta el PDF.`,
        { arriba: 22 }
      ),
      comentario ? recuadro({ etiqueta: 'Comentario de contabilidad', texto: comentario }) : '',
      seccionDatos('Datos del documento', filas),
      tablaProductos,
      archivos.length
        ? tituloSeccion(archivos.length === 1 ? 'Documento adjunto' : `Documentos adjuntos (${archivos.length})`) +
          bloque(archivos.map((a) => `<div style="font-family:${FUENTE};font-size:14px;color:${COLOR.texto};padding:3px 0;">&bull;&nbsp; ${esc(a)}</div>`).join(''), { arriba: 8 })
        : '',
      parrafo(`Si tiene alguna consulta, responda a este correo: le llega a ${esc(contacto)}.`, { arriba: 22 }),
      parrafo('Gracias por su atención.', { arriba: 12 }),
    ],
    pie: [`Correo enviado desde el portal Felix Fix para el reclamo ${doc.ReclamoNumero}.`, 'Por favor no cambie el asunto al responder.'],
  });

  const texto = [
    asunto,
    '',
    'Estimado proveedor:',
    `Le enviamos el documento ${numeroDoc} del reclamo ${doc.ReclamoNumero}. Se adjunta el PDF.`,
    ...(archivos.length ? [`Adjuntos: ${archivos.join(', ')}`] : []),
    ...(comentario ? ['', 'Comentario de contabilidad:', comentario] : []),
    ...datosTexto('Datos del documento', filas),
    ...(lineas.length
      ? ['', `PRODUCTOS (${lineas.length})`, ...lineas.map((l) => `- ${l.descripcion || 'Sin descripción'} (${l.material || l.codigoBarra || '—'}): ${cantidad(l.cantidadPdf)} · ${monto(l.valor)}`)]
      : []),
    '',
    `Si tiene alguna consulta, responda a este correo: le llega a ${contacto}.`,
    'Gracias por su atención.',
  ].join('\n');

  return { asunto, html, texto };
}
