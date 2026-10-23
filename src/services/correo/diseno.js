// Diseño común de todos los correos del portal (avisos internos, correo al
// proveedor y envío a contabilidad): fondo blanco, encabezado azul marino de la
// marca con el logo, tarjeta blanca, botón «a prueba de balas» y pie. Solo
// colores del portal: azul marino, blanco y grises.
//
// Pensado para clientes de correo (Outlook incluido): tablas, estilos en
// línea, ancho máximo 600 px, y «solo modo claro» para que los clientes que lo
// respetan no lo pasen a fondo negro.
//
// Cada plantilla arma su contenido con los bloques de abajo (cada bloque es
// una fila <tr> de la tarjeta) y lo envuelve con documento().
import { readFileSync } from 'node:fs';

export const COLOR = {
  marca: '#030C44',
  // Final del degradado del encabezado (Outlook de escritorio solo pinta `marca`).
  marcaDegradado: '#0B1D6E',
  marcaSuave: '#e8eaf4',
  marcaClara: '#b6bcdd',
  texto: '#111634',
  suave: '#64748b',
  borde: '#e2e8f0',
  celda: '#f8fafc',
};

// Logo del portal (el mismo del navegador, en PNG: Outlook no muestra SVG). Va
// incrustado en el correo con este cid; mailer.js lo adjunta solo si el html lo usa.
export const LOGO_CID = 'felix-logo';
const LOGO_PNG = readFileSync(new URL('./felix-fix-logo.png', import.meta.url));
export const logoAdjunto = () => ({ filename: 'felix-fix.png', content: LOGO_PNG, contentType: 'image/png', cid: LOGO_CID });

/** Para mostrar el correo en el portal: el logo como data: en vez de cid: (la CSP lo permite). */
export const conLogoEnLinea = (html) => html.replaceAll(`cid:${LOGO_CID}`, `data:image/png;base64,${LOGO_PNG.toString('base64')}`);
export const FUENTE = "'Segoe UI', Helvetica, Arial, sans-serif";

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const fechaHora = (d) =>
  new Intl.DateTimeFormat('es-PA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Panama' }).format(new Date(d));

/** Quita las filas sin valor de una lista [etiqueta, valor]. */
export const conDato = (filas) => filas.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');

/** «Hola, Miguel:» con el primer nombre, o «Hola:» si no se sabe a quién va. */
export const saludo = (nombre) => (nombre ? `Hola, ${String(nombre).trim().split(/\s+/)[0]}:` : 'Hola:');

const fila = (contenido, { arriba = 20, abajo = 0, estilo = '' } = {}) =>
  `
            <tr><td class="pad" style="padding:${arriba}px 32px ${abajo}px;${estilo}">${contenido}</td></tr>`;

/** Párrafo de texto. `html` ya viene escapado (se puede usar <strong>). */
export const parrafo = (html, opciones) =>
  fila(`<div style="font-family:${FUENTE};font-size:15px;line-height:1.6;color:${COLOR.texto};">${html}</div>`, opciones);

/** Título pequeño de una sección («Qué tienes que hacer», «Datos del reclamo»). */
export const tituloSeccion = (texto) =>
  fila(`<div style="font-family:${FUENTE};font-size:13px;font-weight:700;color:${COLOR.texto};">${esc(texto)}</div>`, { arriba: 26 });

/** Recuadro azul claro con línea a la izquierda: un comentario o un dato a destacar. */
export function recuadro({ etiqueta, texto, pie, comillas = false }) {
  if (!String(texto ?? '').trim()) return '';
  const cuerpo = comillas ? `«${esc(String(texto).trim())}»` : esc(String(texto).trim());
  return fila(`
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${COLOR.marcaSuave}" style="background:${COLOR.marcaSuave};border-left:4px solid ${COLOR.marca};border-radius:8px;">
                <tr><td style="padding:14px 16px;">
                  ${etiqueta ? `<div style="font-family:${FUENTE};font-size:12px;font-weight:700;color:${COLOR.marca};">${esc(etiqueta)}</div>` : ''}
                  <div style="font-family:${FUENTE};font-size:16px;line-height:1.55;color:${COLOR.texto};${etiqueta ? 'margin-top:6px;' : ''}white-space:pre-wrap;">${cuerpo}</div>
                  ${pie ? `<div style="font-family:${FUENTE};font-size:12px;color:${COLOR.suave};margin-top:8px;">${esc(pie)}</div>` : ''}
                </td></tr>
              </table>`);
}

/** Botón «a prueba de balas» (el fondo va en la celda: Outlook también lo pinta) y el enlace por si no funciona. */
export function boton({ texto, enlace }) {
  if (!enlace) return '';
  return fila(
    `
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td bgcolor="${COLOR.marca}" style="border-radius:10px;background:${COLOR.marca};">
                  <a href="${esc(enlace)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(texto)} &rarr;</a>
                </td>
              </tr></table>
              <div style="font-family:${FUENTE};font-size:12px;color:${COLOR.suave};margin-top:10px;">Si el botón no funciona, copia este enlace: <a href="${esc(enlace)}" style="color:${COLOR.marca};word-break:break-all;">${esc(enlace)}</a></div>`,
    { arriba: 22 }
  );
}

/** Tabla de datos [etiqueta, valor] (sin las filas vacías). Devuelve solo la tabla, para usarla dentro de un bloque. */
export function tablaDatosHtml(filas) {
  const lista = conDato(filas);
  if (!lista.length) return '';
  const html = lista
    .map(
      ([k, v], i) => `
                <tr>
                  <td style="padding:10px 14px;${i ? `border-top:1px solid ${COLOR.borde};` : ''}font-family:${FUENTE};font-size:13px;color:${COLOR.suave};width:40%;vertical-align:top;">${esc(k)}</td>
                  <td style="padding:10px 14px;${i ? `border-top:1px solid ${COLOR.borde};` : ''}font-family:${FUENTE};font-size:14px;color:${COLOR.texto};font-weight:600;vertical-align:top;">${esc(v)}</td>
                </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLOR.borde};border-radius:12px;border-collapse:separate;">${html}
              </table>`;
}

/** Sección con título y tabla de datos. */
export const datos = (titulo, filas) => {
  const tabla = tablaDatosHtml(filas);
  return tabla ? tituloSeccion(titulo) + fila(tabla, { arriba: 10 }) : '';
};

/** Bloque libre (una tabla de productos, una foto, una lista…). `html` ya viene armado y escapado. */
export const bloque = (html, opciones) => fila(html, opciones);

/**
 * El correo completo.
 * @param modulo     «PRODUCTOS DAÑADOS», «RECLAMOS», «RECLAMOS · CONTABILIDAD»
 * @param titulo     título grande de la franja
 * @param subtitulo  número del caso · producto/proveedor · estado
 * @param vistaPrevia texto que muestra la bandeja junto al asunto
 * @param bloques    filas de la tarjeta (de los helpers de arriba)
 * @param pie        líneas del pie (texto)
 */
export function documento({ asunto, modulo, titulo, subtitulo, vistaPrevia, bloques, pie = [] }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- Solo modo claro: así los correos que lo respetan (Apple Mail, Outlook nuevo) no lo pasan a fondo negro. -->
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${esc(asunto)}</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  body, .fondo { background: #ffffff !important; }
  @media (max-width: 620px) {
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
    .titulo { font-size: 20px !important; }
  }
</style>
</head>
<body bgcolor="#ffffff" style="margin:0;padding:0;background:#ffffff;">
  ${vistaPrevia ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(vistaPrevia)}</div>` : ''}
  <table role="presentation" class="fondo" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${COLOR.borde};border-radius:16px;overflow:hidden;">
            <!-- Encabezado de la marca: logo, nombre, título y subtítulo. -->
            <tr><td class="pad" bgcolor="${COLOR.marca}" style="background-color:${COLOR.marca};background:linear-gradient(135deg,${COLOR.marcaDegradado} 0%,${COLOR.marca} 100%);padding:32px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px auto;">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <img src="cid:${LOGO_CID}" width="44" height="44" alt="" style="display:block;border:0;border-radius:10px;" />
                  </td>
                  <td style="vertical-align:middle;text-align:left;">
                    <p style="margin:0;font-family:${FUENTE};font-size:20px;font-weight:700;color:#ffffff;line-height:1.2;">Felix Fix</p>
                    <p style="margin:2px 0 0 0;font-family:${FUENTE};font-size:11px;color:${COLOR.marcaClara};letter-spacing:2px;text-transform:uppercase;">Importadora Maduro</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px 0;font-family:${FUENTE};font-size:11px;font-weight:600;color:${COLOR.marcaClara};letter-spacing:1.5px;">${esc(modulo)}</p>
              <h1 class="titulo" style="margin:0;font-family:${FUENTE};font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">${esc(titulo)}</h1>
              ${subtitulo ? `<p style="margin:8px 0 0 0;font-family:${FUENTE};font-size:13px;color:${COLOR.marcaClara};">${esc(subtitulo)}</p>` : ''}
            </td></tr>${bloques.filter(Boolean).join('')}
            <tr><td style="padding:0 0 28px;"></td></tr>
          </table>
        </td></tr>
        ${
          pie.length
            ? `<tr><td style="padding:16px 8px 0;font-family:${FUENTE};font-size:12px;line-height:1.5;color:${COLOR.suave};text-align:center;">${pie.map(esc).join('<br />')}</td></tr>`
            : ''
        }
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Versión en texto plano de una tabla de datos. */
export const datosTexto = (titulo, filas) => {
  const lista = conDato(filas);
  return lista.length ? ['', `${titulo}:`, ...lista.map(([k, v]) => `  ${k}: ${v}`)] : [];
};
