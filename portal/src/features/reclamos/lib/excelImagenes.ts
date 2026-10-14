import JSZip from 'jszip';

/**
 * Fotos de un .xlsx con la posición donde están dibujadas, para que la vista
 * previa las ponga dentro de su celda como en Excel. Se leen del archivo mismo
 * (no de la API), así funciona igual para un Excel recién elegido en el
 * formulario que para uno ya guardado.
 *
 * Dos tipos:
 *  - Dibujos (Insertar → Imagen): flotan sobre la hoja, anclados a una celda
 *    con desplazamiento en px. `xl/drawings/drawingN.xml`.
 *  - "Colocar en celda" (Excel 365): son el valor de la celda (rich data) y
 *    ocupan la celda completa. `xl/richData/*` + `xl/metadata.xml`.
 *
 * Filas y columnas en base 0. Si algo del archivo no se entiende, esa foto se
 * omite: la vista previa nunca debe fallar por una imagen.
 */
export interface FotoExcel {
  url: string;
  hoja: string;
  fila: number;
  col: number;
  /** Desplazamiento desde la esquina de la celda, en px. */
  dx: number;
  dy: number;
  /** Esquina inferior derecha (anclaje a dos celdas). */
  fin?: { fila: number; col: number; dx: number; dy: number };
  /** Tamaño fijo en px (anclaje a una celda). */
  ancho?: number;
  alto?: number;
  /** Foto "Colocar en celda": llena la celda. */
  enCelda?: boolean;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const MAX_FOTOS = 300;
const EMU_POR_PX = 9525;
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const px = (emu: string | null | undefined) => Math.round((Number(emu) || 0) / EMU_POR_PX);

function xml(texto: string) {
  return new DOMParser().parseFromString(texto, 'application/xml');
}

/** Hijos/descendientes por nombre local, sin importar el prefijo (xdr:, a:, …). */
const todos = (raiz: Document | Element, nombre: string) => Array.from(raiz.getElementsByTagNameNS('*', nombre));
const hijo = (el: Element, nombre: string) => Array.from(el.children).find((c) => c.localName === nombre) || null;
const texto = (el: Element | null, nombre: string) => (el ? hijo(el, nombre)?.textContent ?? null : null);

function resolver(base: string, destino: string) {
  if (destino.startsWith('/')) return destino.slice(1);
  const partes = base.split('/').slice(0, -1);
  for (const p of destino.split('/')) {
    if (p === '..') partes.pop();
    else if (p !== '.') partes.push(p);
  }
  return partes.join('/');
}

async function leer(zip: JSZip, ruta: string) {
  return zip.file(ruta)?.async('string') ?? null;
}

/** Id de relación → ruta dentro del zip, para la parte `ruta`. */
async function relaciones(zip: JSZip, ruta: string) {
  const i = ruta.lastIndexOf('/');
  const rels = await leer(zip, `${ruta.slice(0, i)}/_rels/${ruta.slice(i + 1)}.rels`);
  const map = new Map<string, string>();
  if (rels) for (const r of todos(xml(rels), 'Relationship')) map.set(r.getAttribute('Id') || '', resolver(ruta, r.getAttribute('Target') || ''));
  return map;
}

function columnaYFila(ref: string | null) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || '');
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, fila: Number(m[2]) - 1 };
}

export async function leerFotosExcel(buffer: ArrayBuffer): Promise<FotoExcel[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return []; // .xls binario u otro formato: no hay fotos que leer
  }
  const urls = new Map<string, string>(); // una URL por archivo de imagen, aunque se use varias veces
  const urlDe = async (ruta: string) => {
    if (urls.has(ruta)) return urls.get(ruta)!;
    const ext = ruta.split('.').pop()!.toLowerCase();
    const datos = MIME[ext] ? await zip.file(ruta)?.async('blob') : null;
    if (!datos) return null;
    const url = URL.createObjectURL(new Blob([datos], { type: MIME[ext] }));
    urls.set(ruta, url);
    return url;
  };

  const fotos: FotoExcel[] = [];
  try {
    const libro = await leer(zip, 'xl/workbook.xml');
    if (!libro) return [];
    const relsLibro = await relaciones(zip, 'xl/workbook.xml');
    const enCelda = await mapaFotosEnCelda(zip);

    for (const hojaEl of todos(xml(libro), 'sheet')) {
      const hoja = hojaEl.getAttribute('name') || '';
      const rutaHoja = relsLibro.get(hojaEl.getAttributeNS(NS_REL, 'id') || hojaEl.getAttribute('r:id') || '');
      const hojaXml = rutaHoja && (await leer(zip, rutaHoja));
      if (!hojaXml) continue;
      const docHoja = xml(hojaXml);
      const relsHoja = await relaciones(zip, rutaHoja);

      // Dibujos flotantes.
      for (const d of todos(docHoja, 'drawing')) {
        const rutaDibujo = relsHoja.get(d.getAttributeNS(NS_REL, 'id') || '');
        const dibujo = rutaDibujo && (await leer(zip, rutaDibujo));
        if (!dibujo) continue;
        const relsDibujo = await relaciones(zip, rutaDibujo);
        const doc = xml(dibujo);
        for (const ancla of [...todos(doc, 'twoCellAnchor'), ...todos(doc, 'oneCellAnchor')]) {
          if (fotos.length >= MAX_FOTOS) break;
          const blip = todos(ancla, 'blip')[0];
          const ruta = blip && relsDibujo.get(blip.getAttributeNS(NS_REL, 'embed') || '');
          const url = ruta && (await urlDe(ruta));
          const from = hijo(ancla, 'from');
          if (!url || !from) continue;
          const foto: FotoExcel = {
            url,
            hoja,
            fila: Number(texto(from, 'row')),
            col: Number(texto(from, 'col')),
            dx: px(texto(from, 'colOff')),
            dy: px(texto(from, 'rowOff')),
          };
          const to = hijo(ancla, 'to');
          const ext = hijo(ancla, 'ext');
          if (ancla.localName === 'twoCellAnchor' && to) {
            foto.fin = { fila: Number(texto(to, 'row')), col: Number(texto(to, 'col')), dx: px(texto(to, 'colOff')), dy: px(texto(to, 'rowOff')) };
          } else if (ext) {
            foto.ancho = px(ext.getAttribute('cx'));
            foto.alto = px(ext.getAttribute('cy'));
          }
          fotos.push(foto);
        }
      }

      // Fotos "Colocar en celda".
      if (enCelda.size) {
        for (const c of todos(docHoja, 'c')) {
          const vm = c.getAttribute('vm');
          const ruta = vm && enCelda.get(Number(vm));
          const pos = ruta && columnaYFila(c.getAttribute('r'));
          const url = pos && (await urlDe(ruta));
          if (pos && url && fotos.length < MAX_FOTOS) fotos.push({ url, hoja, ...pos, dx: 0, dy: 0, enCelda: true });
        }
      }
    }
  } catch {
    // Se devuelve lo que se alcanzó a leer.
  }
  return fotos;
}

/**
 * vm de la celda (base 1) → ruta de la imagen. La cadena:
 * metadata.xml valueMetadata[vm-1] → rc v → futureMetadata XLRICHVALUE bk → rvb i
 * → rdrichvalue.xml rv → valor _rvRel:LocalImageIdentifier → richValueRel.xml rel → .rels.
 */
async function mapaFotosEnCelda(zip: JSZip) {
  const mapa = new Map<number, string>();
  const [metadata, valores, estructuras, rels] = await Promise.all(
    ['xl/metadata.xml', 'xl/richData/rdrichvalue.xml', 'xl/richData/rdrichvaluestructure.xml', 'xl/richData/richValueRel.xml'].map((r) => leer(zip, r))
  );
  if (!metadata || !valores || !estructuras || !rels) return mapa;

  const posImagen = todos(xml(estructuras), 's').map((s) => todos(s, 'k').findIndex((k) => k.getAttribute('n') === '_rvRel:LocalImageIdentifier'));
  const imagenDeRv = todos(xml(valores), 'rv').map((rv) => {
    const pos = posImagen[Number(rv.getAttribute('s'))] ?? -1;
    const v = pos >= 0 ? todos(rv, 'v')[pos]?.textContent : undefined;
    return v === undefined || v === null ? null : Number(v);
  });
  const relIds = todos(xml(rels), 'rel').map((r) => r.getAttributeNS(NS_REL, 'id') || '');
  const destinos = await relaciones(zip, 'xl/richData/richValueRel.xml');

  const meta = xml(metadata);
  const futura = todos(meta, 'futureMetadata').find((f) => f.getAttribute('name') === 'XLRICHVALUE');
  const rvDeBloque = futura ? todos(futura, 'bk').map((bk) => Number(todos(bk, 'rvb')[0]?.getAttribute('i'))) : [];
  const valueMeta = todos(meta, 'valueMetadata')[0];
  todos(valueMeta || meta.createElement('x'), 'bk').forEach((bk, i) => {
    const rc = todos(bk, 'rc')[0];
    const img = imagenDeRv[rvDeBloque[Number(rc?.getAttribute('v'))]];
    const ruta = img === null || img === undefined ? undefined : destinos.get(relIds[img]);
    if (ruta) mapa.set(i + 1, ruta);
  });
  return mapa;
}

export function liberarFotos(fotos: FotoExcel[]) {
  for (const u of new Set(fotos.map((f) => f.url))) URL.revokeObjectURL(u);
}
