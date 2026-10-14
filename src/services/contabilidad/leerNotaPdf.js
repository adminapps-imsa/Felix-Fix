// Lectura de las notas de débito de SAP que se adjuntan a los reclamos (PDF).
//
// El PDF trae una cabecera ("Nota de Debito", "Doc Num / Doc Item: …",
// "Fecha de Documento dd.mm.aaaa", "Nro. de Proveedor …", "Clase de
// Movimiento …") y una tabla de productos:
//   Material | Descripción | Cantidad | FOB | Duties | Neto | Valor
//   400-400081012004  15803206513 "TROUSERS BOY, RED, 7  1 UN  3.94  0.00  5.38  5.38
// La descripción a veces se parte en 2 líneas y el total va en "105.49 TOTAL ==>"
// (en un PDF de 2 páginas, la segunda solo repite la cabecera y trae el total).
//
// El texto se arma con pdfjs agrupando los fragmentos por coordenada Y (una
// línea visual) y ordenándolos por X; las columnas se ubican con las X de los
// títulos de la tabla. Nunca lanza: si no se puede leer, legible = false.
import fs from 'node:fs/promises';

/** Más de esto no es una nota de débito: no se lee entero. */
const MAX_PAGINAS = 50;
/** Fragmentos con |ΔY| ≤ 2 pt están en la misma línea visual. */
const TOLERANCIA_Y = 2;

const RE_MATERIAL = /^\d{3}-\d{6,}$/;
const RE_CANTIDAD_INICIO = /^(\d+(?:[.,]\d+)?)\s*([A-Za-z]{1,4})(?:\s+(.*))?$/;
const RE_NUMERO = /^-?[\d,]*\.?\d+$/;
// A veces pdfjs une la cantidad al final de la descripción: "…KHAKI, 7 1 UN".
// Solo con unidades de medida conocidas, para no confundir una talla ("2 XL").
const RE_CANTIDAD_PEGADA = /^(.*\S)\s+(\d+(?:[.,]\d+)?)\s+(UN|PZA?|PAR|CJ|KG|DOC|ST|EA)$/;

let pdfjsPromise = null;
/** Import diferido: pdfjs es pesado y solo hace falta al enviar a contabilidad. */
function cargarPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs').catch((err) => {
    pdfjsPromise = null;
    throw err;
  });
  return pdfjsPromise;
}

/** "1,234.56" -> 1234.56 (formato de SAP: punto decimal, coma de miles). */
function aNumero(texto) {
  const n = Number(String(texto).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const redondear2 = (n) => Math.round(n * 100) / 100;

/** "09.10.2026" -> "2026-10-09" (null si no es una fecha válida). */
function aFechaIso(texto) {
  const m = String(texto || '').match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  if (!m) return null;
  const [, d, mes, a] = m;
  const fecha = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d)));
  if (fecha.getUTCDate() !== Number(d) || fecha.getUTCMonth() !== Number(mes) - 1) return null;
  return `${a}-${mes}-${d}`;
}

const limpiar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Líneas visuales de una página: [{ y, items: [{ x, str }] }], de arriba a
 * abajo. Los fragmentos repetidos en la misma posición (texto sobreimpreso)
 * se cuentan una sola vez.
 */
function lineasDePagina(contenido) {
  const vistos = new Set();
  const items = [];
  for (const it of contenido.items) {
    const str = it.str ?? '';
    if (!str.trim()) continue;
    const x = Math.round(it.transform[4]);
    const y = Math.round(it.transform[5]);
    const clave = `${x}|${y}|${str}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    items.push({ x, y, str });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas = [];
  for (const it of items) {
    const ultima = lineas[lineas.length - 1];
    if (ultima && Math.abs(ultima.y - it.y) <= TOLERANCIA_Y) ultima.items.push(it);
    else lineas.push({ y: it.y, items: [it] });
  }
  for (const l of lineas) {
    l.items.sort((a, b) => a.x - b.x);
    l.texto = limpiar(l.items.map((i) => i.str).join(' '));
  }
  return lineas;
}

/**
 * Columnas de la tabla según los títulos ("Material", "Descripci…",
 * "Cantidad"). Si no están, se usan las posiciones habituales del formato.
 */
function columnas(lineas) {
  const cab = lineas.find((l) => /^Material\b/i.test(l.texto) && /Cantidad/i.test(l.texto));
  const x = (re) => cab?.items.find((i) => re.test(i.str))?.x;
  const desc = x(/^Descripci/i) ?? 145;
  const cant = x(/^Cantidad/i) ?? 304;
  return { yCabecera: cab?.y ?? null, desde: desc - 15, hasta: cant - 5 };
}

/** Filas de productos de una página. */
function filasDePagina(lineas, pagina) {
  const col = columnas(lineas);
  const filas = [];
  let actual = null;

  const cerrar = () => {
    if (actual && actual.cantidad !== null && actual.valor !== null) {
      filas.push({ ...actual, descripcion: limpiar(actual.descripcion) });
    }
    actual = null;
  };

  for (const l of lineas) {
    if (col.yCabecera !== null && l.y >= col.yCabecera) continue;
    if (/TOTAL\s*==>|Entregado por/i.test(l.texto)) {
      cerrar();
      continue;
    }
    // Una fila empieza con el material; las líneas siguientes sin material
    // son la continuación de la descripción (o de las cifras).
    const esInicio = RE_MATERIAL.test(l.items[0].str.trim());
    if (esInicio) {
      cerrar();
      actual = { material: l.items[0].str.trim(), descripcion: '', cantidad: null, valor: null, pagina };
    } else if (!actual) {
      continue;
    }
    for (const [k, it] of l.items.entries()) {
      if (esInicio && k === 0) continue;
      const s = it.str.trim();
      if (it.x >= col.desde && it.x < col.hasta) {
        const pegada = actual.cantidad === null && s.match(RE_CANTIDAD_PEGADA);
        if (pegada) {
          actual.descripcion += ` ${pegada[1]}`;
          actual.cantidad = aNumero(pegada[2]);
          actual.numeros = [];
        } else {
          actual.descripcion += ` ${s}`;
        }
      } else if (it.x >= col.hasta) {
        // Un fragmento puede traer varias cifras juntas ("1 UN 6.25"): se
        // separa por espacios; la cantidad son los dos primeros ("1", "UN").
        let resto = s;
        if (actual.cantidad === null) {
          const mc = s.match(RE_CANTIDAD_INICIO);
          if (!mc) continue;
          actual.cantidad = aNumero(mc[1]);
          actual.numeros = [];
          resto = mc[3] || '';
        }
        for (const t of resto.split(/\s+/).filter(Boolean)) {
          if (!RE_NUMERO.test(t)) continue;
          actual.numeros.push(aNumero(t));
          // FOB, Duties, Neto, Valor: el valor es el último.
          actual.valor = actual.numeros[actual.numeros.length - 1];
        }
      }
    }
  }
  cerrar();
  return filas.map(({ numeros, ...f }) => f);
}

/** Primer valor de la cabecera que coincide con `re` (grupo 1), en todo el texto. */
function campo(textoLineas, re) {
  for (const t of textoLineas) {
    const m = t.match(re);
    if (m) return limpiar(m[1]) || null;
  }
  return null;
}

/**
 * Lee una nota de débito de SAP en PDF (ruta en disco o el contenido en un Buffer).
 * @returns {Promise<{ numeroDocumento, tipoDocumento, movimiento, fechaDocumento, proveedor,
 *   filas: Array<{ material, descripcion, cantidad, valor, pagina }>, total, legible: boolean, error?: string }>}
 */
export async function leerNotaPdf(rutaPdf) {
  const vacio = {
    numeroDocumento: null,
    tipoDocumento: null,
    movimiento: null,
    fechaDocumento: null,
    proveedor: null,
    filas: [],
    total: null,
    legible: false,
  };
  let doc = null;
  try {
    const { getDocument } = await cargarPdfjs();
    const data = new Uint8Array(Buffer.isBuffer(rutaPdf) ? rutaPdf : await fs.readFile(rutaPdf));
    doc = await getDocument({
      data,
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
    }).promise;
    if (doc.numPages > MAX_PAGINAS) return { ...vacio, error: `El PDF tiene ${doc.numPages} páginas; no parece una nota de débito.` };

    const textos = [];
    const filas = [];
    const paginasVistas = new Set();
    let totalImpreso = null;
    for (let i = 1; i <= doc.numPages; i++) {
      const pagina = await doc.getPage(i);
      const lineas = lineasDePagina(await pagina.getTextContent());
      pagina.cleanup();
      textos.push(...lineas.map((l) => l.texto));

      // Una página que repite exactamente las filas de otra (copia de la
      // misma hoja) no se suma dos veces. Filas iguales DENTRO de una página
      // son productos distintos y se conservan.
      const deLaPagina = filasDePagina(lineas, i);
      const firma = JSON.stringify(deLaPagina.map(({ pagina: _p, ...f }) => f));
      if (deLaPagina.length && paginasVistas.has(firma)) continue;
      paginasVistas.add(firma);
      filas.push(...deLaPagina);

      for (const l of lineas) {
        const m = l.texto.match(/([\d,]+\.\d{2})\s*TOTAL\s*==>/i) || l.texto.match(/TOTAL\s*==>\s*([\d,]+\.\d{2})/i);
        if (m) totalImpreso = aNumero(m[1]);
      }
    }

    const tipo = campo(textos, /^(Nota de \S+(?: \S+)?)$/i);
    const subtipo = campo(textos, /^((?:Anulaci[oó]n:\s*)?Devoluci[oó]n\b.*)$/i);
    const sumaFilas = redondear2(filas.reduce((a, f) => a + (f.valor || 0), 0));
    const resultado = {
      numeroDocumento: campo(textos, /Doc Num(?:\s*\/\s*Doc Item)?:\s*(\d+)/i),
      tipoDocumento: [tipo, subtipo].filter(Boolean).join(' · ') || null,
      movimiento: campo(textos, /Clase de Movimiento\s+(.+)$/i),
      fechaDocumento: aFechaIso(campo(textos, /Fecha de Documento\s+(\S+)/i)),
      proveedor: campo(textos, /Nro\. de Proveedor\s+(.+)$/i),
      filas,
      // El total impreso manda; si no viene, la suma de las filas.
      total: totalImpreso ?? (filas.length ? sumaFilas : null),
      // false si el total impreso no es la suma de las filas leídas (falta o sobra una fila).
      totalCuadra: totalImpreso === null || Math.abs(totalImpreso - sumaFilas) < 0.005,
      legible: filas.length > 0,
    };
    if (!filas.length) resultado.error = 'No se encontraron productos en el PDF (¿no es una nota de débito de SAP?).';
    return resultado;
  } catch (err) {
    return { ...vacio, error: `No se pudo leer el PDF: ${err?.message || err}` };
  } finally {
    await doc?.destroy().catch(() => {});
  }
}
