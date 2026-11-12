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
import { destinatarios, deUsuario } from './destinatarios.js';

// Solo QA (rama qa, nunca a main): el aviso a Data va únicamente a este usuario
// y sale aunque MAIL_DESACTIVADO=true, para probar sin escribirle a nadie más.
const PRUEBA_QA_DATA = 'maltamiranda';
import { documento, parrafo, tituloSeccion, bloque, boton, datos, saludo, esc, datosTexto, tablaDatosHtml } from './diseno.js';

export const PERMISO_DATA = 'reclamos.articulos_sap';
const PIE = 'Aviso automático de Felix Fix. No respondas este correo.';
const cantidad = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('es-PA', { maximumFractionDigits: 3 }).format(Number(n)));
const dinero = (n) => (n === null || n === undefined ? null : new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(Number(n)));

/** Filas de un artículo: lo de la hoja del Excel y lo que llenó la compradora al aprobarlo. */
const filasArticulo = (l) => [
  ['Código de barras', l.codigoBarra || 'Sin código'],
  ['Referencia', l.referencia],
  ['Color', l.color],
  ['Talla', l.talla],
  ['Cantidad', cantidad(l.cantidad)],
  ['Descripción', l.articulo?.descripcion],
  ['Marca', l.articulo?.marca],
  ['Categoría', l.articulo?.categoria],
  ['Tipo de producto', l.articulo?.tipoProducto],
  ['Ciclo de vida', l.articulo?.cicloVida],
  ['Costo', dinero(l.articulo?.costo)],
  ['Precio de venta', dinero(l.articulo?.precioVenta)],
];
const tituloArticulo = (l, i, n) => `Artículo ${i + 1} de ${n} · ${[l.referencia, l.color, l.talla].filter(Boolean).join(' · ') || l.codigoBarra || `#${l.posicion}`}`;

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

  const articulos = lineas.flatMap((l, i) => [tituloSeccion(tituloArticulo(l, i, n)), bloque(tablaDatosHtml(filasArticulo(l)), { arriba: 10 })]);

  const html = documento({
    asunto,
    modulo: 'RECLAMOS · DATA',
    titulo,
    subtitulo: [r.Numero, r.Proveedor, 'Sobrante no esperado'].filter(Boolean).join(' · '),
    vistaPrevia: frase,
    bloques: [
      parrafo(`${esc(saludo(nombre))}<br />${esc(frase)}`, { arriba: 22 }),
      ...articulos,
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
    ...lineas.flatMap((l, i) => datosTexto(tituloArticulo(l, i, n), filasArticulo(l))),
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
  if (!correoConfigurado()) {
    logger.info({ reclamo: r.Numero, articulos: lineas.length }, 'Aviso a Data no enviado (correo apagado o sin configurar)');
    return;
  }
  (async () => {
    void destinatarios;
    const para = (await deUsuario(PRUEBA_QA_DATA)).correos;
    if (!para.length) {
      logger.warn({ reclamo: r.Numero, articulos: lineas.length }, 'Aviso a Data sin destinatarios: ningún rol tiene «Crear artículos en SAP (Data)»');
      return;
    }
    const { asunto, html, texto } = plantillaDataArticulos(r, lineas, { de });
    await enviarCorreo({ para, asunto: `[PRUEBA QA] ${asunto}`, html, texto, pruebaQa: true });
    logger.info({ reclamo: r.Numero, articulos: lineas.length, ...resumenDestinatarios(para) }, 'Aviso a Data enviado');
  })().catch((err) => logger.warn({ err: err.message, reclamo: r?.Numero }, 'No se pudo enviar el aviso a Data'));
}
