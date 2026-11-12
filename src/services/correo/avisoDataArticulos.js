// Aviso a Data: un reclamo de CEDI trae sobrantes no esperados que no están
// creados en SAP (o vinieron sin código). Lleva las columnas de la hoja
// «Sobrante NO esperado» (CÓDIGO, REFERENCIA, COLOR, TALLA, CANTIDAD) para
// que Data cree los artículos; ya creados, Data carga el código en el portal.
//
// Va a los usuarios cuyos roles tienen «Crear artículos en SAP (Data)»
// (reclamos.articulos_sap). Igual que los demás avisos: nunca bloquea ni hace
// fallar la creación; sin correo, con MAIL_AVISOS=false, MAIL_DESACTIVADO o
// sin destinatarios, solo queda en el log.
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { enviarCorreo, correoConfigurado, resumenDestinatarios } from './mailer.js';
import { destinatarios } from './destinatarios.js';
import { documento, parrafo, tituloSeccion, bloque, boton, datos, saludo, esc, datosTexto, COLOR, FUENTE } from './diseno.js';

export const PERMISO_DATA = 'reclamos.articulos_sap';
const PIE = 'Aviso automático de Felix Fix. No respondas este correo.';
const cantidad = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('es-PA', { maximumFractionDigits: 3 }).format(Number(n)));

/**
 * @param r       detalle del reclamo (Numero, Token, Proveedor, Marca, Division…)
 * @param lineas  [{ posicion, codigoBarra, referencia, color, talla, cantidad, descripcion }]
 * @param opts    { de: quien creó el reclamo, nombre: quien recibe }
 */
export function plantillaDataArticulos(r, lineas, { de, nombre } = {}) {
  const n = lineas.length;
  const titulo = 'Artículos por crear en SAP';
  const asunto = `${titulo}: ${r.Numero} — ${r.Proveedor || 'Sobrante no esperado'}`;
  const enlace = env.correo.portalUrl ? `${env.correo.portalUrl}/reclamos/${r.Token}` : '';
  const quien = de || 'CEDI';
  const frase = `${quien} creó un reclamo de CEDI con ${n === 1 ? 'un sobrante no esperado que no está creado' : `${n} sobrantes no esperados que no están creados`} en SAP. Crea ${n === 1 ? 'el artículo' : 'los artículos'} y, cuando ${n === 1 ? 'esté listo' : 'estén listos'}, carga su código de barras en el reclamo para que la compradora lo${n === 1 ? '' : 's'} revise.`;
  const filas = [
    ['Proveedor', [r.Proveedor, r.Marca].filter(Boolean).join(' · ')],
    ['Mundo / Departamento', [r.Mundo, r.Departamento, r.Division].filter(Boolean).join(' · ')],
    ['Compradora', r.Compradora],
    ['Documento(s) SAP', (r.SapDocs || []).join(', ')],
  ];

  const celda = `padding:7px 8px;border-top:1px solid ${COLOR.borde};font-family:${FUENTE};font-size:12px;vertical-align:top;color:${COLOR.texto};`;
  const cab = `padding:7px 8px;font-family:${FUENTE};font-size:11px;font-weight:700;color:${COLOR.suave};text-align:left;background:${COLOR.celda};`;
  const filasHtml = lineas
    .map(
      (l) => `
            <tr>
              <td style="${celda}font-family:Consolas,monospace;">${l.codigoBarra ? esc(l.codigoBarra) : `<span style="color:${COLOR.suave};font-family:${FUENTE};">Sin código</span>`}</td>
              <td style="${celda}">${esc(l.referencia || '—')}</td>
              <td style="${celda}">${esc(l.color || '—')}</td>
              <td style="${celda}">${esc(l.talla || '—')}</td>
              <td style="${celda}text-align:right;white-space:nowrap;">${esc(cantidad(l.cantidad))}</td>
            </tr>`
    )
    .join('');
  const tabla = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLOR.borde};border-radius:12px;border-collapse:separate;overflow:hidden;">
            <tr><th style="${cab}">Código</th><th style="${cab}">Referencia</th><th style="${cab}">Color</th><th style="${cab}">Talla</th><th style="${cab}text-align:right;">Cantidad</th></tr>${filasHtml}
          </table>`;

  const html = documento({
    asunto,
    modulo: 'RECLAMOS · DATA',
    titulo,
    subtitulo: [r.Numero, r.Proveedor, 'Sobrante no esperado'].filter(Boolean).join(' · '),
    vistaPrevia: frase,
    bloques: [
      parrafo(`${esc(saludo(nombre))}<br />${esc(frase)}`, { arriba: 22 }),
      tituloSeccion(`Sobrante no esperado · ${n} ${n === 1 ? 'artículo' : 'artículos'}`),
      bloque(tabla, { arriba: 10 }),
      boton({ texto: `Abrir ${r.Numero}`, enlace }),
      datos('Datos del reclamo', filas),
    ],
    pie: [PIE],
  });

  const plano = [
    `${titulo} — ${r.Numero}${r.Proveedor ? ` · ${r.Proveedor}` : ''}`,
    '',
    saludo(nombre),
    frase,
    '',
    'CÓDIGO | REFERENCIA | COLOR | TALLA | CANTIDAD',
    ...lineas.map((l) => [l.codigoBarra || 'Sin código', l.referencia || '—', l.color || '—', l.talla || '—', cantidad(l.cantidad)].join(' | ')),
    ...(enlace ? ['', `Abrir ${r.Numero}: ${enlace}`] : []),
    ...datosTexto('Datos del reclamo', filas),
    '',
    PIE,
  ].join('\n');

  return { asunto, html, texto: plano };
}

/** Manda el aviso a Data. No espera ni lanza: se llama después de crear el reclamo. */
export function avisarDataArticulos(r, lineas, { de } = {}) {
  if (!lineas?.length || !r) return;
  if (!env.correo.avisos || env.correo.desactivado || !correoConfigurado()) {
    logger.info({ reclamo: r.Numero, articulos: lineas.length }, 'Aviso a Data no enviado (correo apagado o sin configurar)');
    return;
  }
  (async () => {
    const para = await destinatarios(PERMISO_DATA);
    if (!para.length) {
      logger.warn({ reclamo: r.Numero, articulos: lineas.length }, 'Aviso a Data sin destinatarios: ningún rol tiene «Crear artículos en SAP (Data)»');
      return;
    }
    const { asunto, html, texto } = plantillaDataArticulos(r, lineas, { de });
    await enviarCorreo({ para, asunto, html, texto });
    logger.info({ reclamo: r.Numero, articulos: lineas.length, ...resumenDestinatarios(para) }, 'Aviso a Data enviado');
  })().catch((err) => logger.warn({ err: err.message, reclamo: r?.Numero }, 'No se pudo enviar el aviso a Data'));
}
