// Correo que recibe el proveedor con un reporte de producto dañado.
//
// Diseño común de los correos del portal (diseno.js). La foto de evidencia va
// incrustada (cid) y los adjuntos del reporte van como archivos. Se acompaña
// de una versión en texto plano.

import { documento, parrafo, recuadro, tituloSeccion, bloque, datos as seccionDatos, esc, fechaHora as fecha, COLOR, FUENTE, datosTexto } from './diseno.js';

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

  // Las dos respuestas posibles, como etiquetas azules (colores del portal).
  const opcion = (etiqueta, texto) =>
    `<tr><td style="padding:5px 0;font-family:${FUENTE};font-size:14px;line-height:1.5;color:${COLOR.texto};"><span style="display:inline-block;background:${COLOR.marca};color:#ffffff;font-weight:700;border-radius:999px;padding:2px 10px;font-size:12px;">${esc(etiqueta)}</span>&nbsp; ${esc(texto)}</td></tr>`;

  const html = documento({
    asunto,
    modulo: 'PRODUCTOS DAÑADOS',
    titulo: `Reporte de producto dañado ${numero}`,
    subtitulo: [r.NombreProducto, r.TiendaNombre].filter(Boolean).join(' · '),
    vistaPrevia: `Producto dañado ${r.NombreProducto} (${r.TiendaNombre}). Le pedimos indicar si aprueba la devolución.`,
    bloques: [
      parrafo(
        `Estimado proveedor:<br />Le compartimos el reporte de un producto que llegó dañado o con problemas a nuestra tienda <strong>${esc(r.TiendaNombre)}</strong>. Le pedimos revisarlo y respondernos si aprueba la devolución.`,
        { arriba: 22 }
      ),
      seccionDatos('Detalle del producto', filas),
      recuadro({ etiqueta: 'Descripción', texto: r.Descripcion }),
      conFoto
        ? tituloSeccion('Foto de evidencia') +
          bloque(
            `<img src="${esc(srcFoto)}" alt="Foto de evidencia del producto" width="536" style="display:block;width:100%;max-width:536px;height:auto;border-radius:10px;border:1px solid ${COLOR.borde};" />`,
            { arriba: 10 }
          )
        : '',
      adjuntos.length
        ? tituloSeccion(`Documentos adjuntos (${adjuntos.length})`) +
          bloque(adjuntos.map((a) => `<div style="font-family:${FUENTE};font-size:14px;color:${COLOR.texto};padding:3px 0;">&bull;&nbsp; ${esc(a)}</div>`).join(''), { arriba: 8 })
        : '',
      tituloSeccion('¿Qué necesitamos de usted?'),
      bloque(
        `<div style="font-family:${FUENTE};font-size:14px;line-height:1.6;color:${COLOR.texto};">Responda a este correo indicando una de estas opciones:</div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                ${opcion('DEVOLUCIÓN APROBADA', 'el proveedor se hace responsable del producto.')}
                ${opcion('NF', 'no aprueba la devolución.')}
              </table>`,
        { arriba: 10 }
      ),
      parrafo(`Al responder, su mensaje le llega a ${esc(contacto)}.<br />Gracias por su atención.`, { arriba: 22 }),
    ],
    pie: [`Correo generado por Felix Fix para el reporte ${numero}.`, 'Por favor no cambie el asunto al responder.'],
  });

  const texto = [
    `Reporte ${numero} — Felix Fix · Productos Dañados`,
    '',
    'Estimado proveedor:',
    `Le compartimos el reporte de un producto que llegó dañado o con problemas a nuestra tienda ${r.TiendaNombre}.`,
    'Le pedimos revisarlo y respondernos si aprueba la devolución.',
    ...datosTexto('Detalle del producto', filas),
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
