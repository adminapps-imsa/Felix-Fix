// Aviso a Data: la compradora cerró un reclamo de CEDI aprobando sobrantes no
// esperados que no están creados en SAP (o vinieron sin código). Por cada
// artículo lleva las columnas de la hoja «Sobrante NO esperado» (CÓDIGO,
// REFERENCIA, COLOR, TALLA, CANTIDAD) y lo que la compradora llenó al
// aprobarlo (costo, precio de venta, categoría, tipo de producto, ciclo de
// vida, descripción y marca) para que Data cree los artículos; ya creados, Data carga el
// código en el portal y Torre de Control hace el 912.
//
// Va a los usuarios cuyos roles tienen «Crear artículos en SAP (Data)»
// (reclamos.articulos_sap). Igual que los demás avisos: nunca bloquea ni hace
// fallar el cierre; sin correo, con MAIL_AVISOS=false, MAIL_DESACTIVADO o
// sin destinatarios, solo queda en el log.
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { enviarCorreo, correoConfigurado, resumenDestinatarios } from './mailer.js';
import { destinatarios } from './destinatarios.js';
import { documento, parrafo, tituloSeccion, bloque, boton, datos, saludo, esc, datosTexto, COLOR, FUENTE } from './diseno.js';

export const PERMISO_DATA = 'reclamos.articulos_sap';
const PIE = 'Aviso automático de Felix Fix. No respondas este correo.';
const cantidad = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('es-PA', { maximumFractionDigits: 3 }).format(Number(n)));
const dinero = (n) => (n === null || n === undefined ? null : new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(Number(n)));

/**
 * Columnas de la tabla (tipo Excel, una fila por artículo): lo de la hoja
 * «Sobrante NO esperado» y lo que llenó la compradora al aprobarlo.
 */
const COLUMNAS = [
  { titulo: 'Código de barras', valor: (l) => l.codigoBarra || 'Sin código', mono: true },
  { titulo: 'Referencia', valor: (l) => l.referencia },
  { titulo: 'Color', valor: (l) => l.color },
  { titulo: 'Talla', valor: (l) => l.talla },
  { titulo: 'Cantidad', valor: (l) => cantidad(l.cantidad), derecha: true },
  { titulo: 'Descripción', valor: (l) => l.articulo?.descripcion },
  { titulo: 'Marca', valor: (l) => l.articulo?.marca },
  { titulo: 'Categoría', valor: (l) => l.articulo?.categoria },
  { titulo: 'Tipo de producto', valor: (l) => l.articulo?.tipoProducto },
  { titulo: 'Ciclo de vida', valor: (l) => l.articulo?.cicloVida },
  { titulo: 'Costo', valor: (l) => dinero(l.articulo?.costo), derecha: true },
  { titulo: 'Precio de venta', valor: (l) => dinero(l.articulo?.precioVenta), derecha: true },
];
const valorCelda = (c, l) => {
  const v = c.valor(l);
  return v === null || v === undefined || String(v).trim() === '' ? '—' : String(v);
};

/** Tabla con cuadrícula, como una hoja de Excel: encabezado de color y filas alternadas. */
function tablaExcel(lineas) {
  const borde = '1px solid #c7d2e0';
  const base = `border:${borde};padding:6px 8px;font-family:${FUENTE};font-size:12px;line-height:1.35;vertical-align:top;`;
  const cab = `${base}background:${COLOR.marca};color:#ffffff;font-weight:700;text-align:left;white-space:nowrap;`;
  const filas = lineas
    .map(
      (l, i) =>
        `<tr>${COLUMNAS.map(
          (c) =>
            `<td style="${base}color:${COLOR.texto};background:${i % 2 ? COLOR.celda : '#ffffff'};${c.derecha ? 'text-align:right;white-space:nowrap;' : ''}${
              c.mono ? 'font-family:Consolas,monospace;white-space:nowrap;' : ''
            }">${esc(valorCelda(c, l))}</td>`
        ).join('')}</tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:${borde};">
            <tr>${COLUMNAS.map((c) => `<th style="${cab}${c.derecha ? 'text-align:right;' : ''}">${esc(c.titulo)}</th>`).join('')}</tr>${filas}
          </table>`;
}

/**
 * @param r       detalle del reclamo (Numero, Token, Proveedor, Marca, Division…)
 * @param lineas  [{ posicion, codigoBarra, referencia, color, talla, cantidad,
 *                  articulo: { descripcion, marca, categoria, tipoProducto, cicloVida, costo, precioVenta } }]
 * @param opts    { de: la compradora que lo aprobó, nombre: quien recibe }
 */
export function plantillaDataArticulos(r, lineas, { de, nombre } = {}) {
  const n = lineas.length;
  const titulo = 'Artículos por crear en SAP';
  const asunto = `${titulo}: ${r.Numero} — ${r.Proveedor || 'Sobrante no esperado'}`;
  const enlace = env.correo.portalUrl ? `${env.correo.portalUrl}/reclamos/${r.Token}` : '';
  const quien = de || 'La compradora';
  const frase = `${quien} aprobó en un reclamo de CEDI ${n === 1 ? 'un sobrante no esperado que no está creado' : `${n} sobrantes no esperados que no están creados`} en SAP. Crea ${n === 1 ? 'el artículo' : 'los artículos'} y, cuando ${n === 1 ? 'esté listo' : 'estén listos'}, carga su código de barras en el reclamo para que Torre de Control haga el 912.`;
  const filas = [
    ['Proveedor', [r.Proveedor, r.Marca].filter(Boolean).join(' · ')],
    ['Mundo / Departamento', [r.Mundo, r.Departamento, r.Division].filter(Boolean).join(' · ')],
    ['Compradora', r.Compradora],
    ['Documento(s) SAP', (r.SapDocs || []).join(', ')],
  ];


  const html = documento({
    asunto,
    modulo: 'RECLAMOS · DATA',
    titulo,
    subtitulo: [r.Numero, r.Proveedor, 'Sobrante no esperado'].filter(Boolean).join(' · '),
    vistaPrevia: frase,
    bloques: [
      parrafo(`${esc(saludo(nombre))}<br />${esc(frase)}`, { arriba: 22 }),
      tituloSeccion(`Sobrante no esperado · ${n} ${n === 1 ? 'artículo' : 'artículos'}`),
      bloque(tablaExcel(lineas), { arriba: 10 }),
      boton({ texto: `Abrir ${r.Numero}`, enlace }),
      datos('Datos del reclamo', filas),
    ],
    pie: [PIE],
    // Más ancho que los demás correos: la tabla tiene 12 columnas.
    ancho: 1000,
  });

  const plano = [
    `${titulo} — ${r.Numero}${r.Proveedor ? ` · ${r.Proveedor}` : ''}`,
    '',
    saludo(nombre),
    frase,
    '',
    COLUMNAS.map((c) => c.titulo).join(' | '),
    ...lineas.map((l) => COLUMNAS.map((c) => valorCelda(c, l)).join(' | ')),
    ...(enlace ? ['', `Abrir ${r.Numero}: ${enlace}`] : []),
    ...datosTexto('Datos del reclamo', filas),
    '',
    PIE,
  ].join('\n');

  return { asunto, html, texto: plano };
}

/** Manda el aviso a Data. No espera ni lanza: se llama después de que la compradora cierra el reclamo. */
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
