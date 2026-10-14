import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import { AuthImage } from './AuthImage';
import { leerFotosExcel, liberarFotos, type FotoExcel } from '../lib/excelImagenes';

const MAX_FILAS = 1000;
const MAX_COLUMNAS = 100;
const ANCHO_COL = 64; // px, ancho por defecto de una columna de Excel
const ALTO_FILA = 20; // px, alto por defecto de una fila de Excel
const ANCHO_NUMEROS = 40;
const ALTO_LETRAS = 22;

export interface FotoDeHoja {
  /** Ruta autenticada de la API para cargar la foto. */
  path: string;
  sheet: number;
  sheetName?: string;
}

interface Celda {
  texto: string;
  filas?: number;
  cols?: number;
}

interface Hoja {
  nombre: string;
  /** null = celda cubierta por una combinada. */
  celdas: (Celda | null)[][];
  anchos: number[];
  altos: number[];
  totalFilas: number;
}

function leerHojas(buffer: ArrayBuffer, fotos: FotoExcel[]): Hoja[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true });
  return wb.SheetNames.map((nombre) => {
    const ws = wb.Sheets[nombre];
    const fotosHoja = fotos.filter((f) => f.hoja === nombre);

    // Rango útil: hasta la última celda con valor o la última foto (el !ref
    // de Excel a veces abarca miles de filas vacías con formato).
    let maxF = -1;
    let maxC = -1;
    for (const k of Object.keys(ws)) {
      if (k[0] === '!') continue;
      const cell = ws[k] as XLSX.CellObject;
      if (cell.v === undefined || cell.v === '') continue;
      const { r, c } = XLSX.utils.decode_cell(k);
      maxF = Math.max(maxF, r);
      maxC = Math.max(maxC, c);
    }
    for (const f of fotosHoja) {
      maxF = Math.max(maxF, f.fin?.fila ?? f.fila);
      maxC = Math.max(maxC, f.fin?.col ?? f.col);
    }
    const merges = ws['!merges'] || [];
    for (const m of merges) {
      if (m.s.r <= maxF && m.s.c <= maxC) {
        maxF = Math.max(maxF, m.e.r);
        maxC = Math.max(maxC, m.e.c);
      }
    }
    const totalFilas = maxF + 1;
    const nF = Math.min(totalFilas, MAX_FILAS);
    const nC = Math.min(maxC + 1, MAX_COLUMNAS);

    const cols = ws['!cols'] || [];
    const rows = ws['!rows'] || [];
    const anchos = Array.from({ length: nC }, (_, c) => {
      const col = cols[c];
      if (col?.hidden) return 0;
      // Como Excel al 100% (Calibri 11: 7 px por carácter). No se usa wpx de
      // SheetJS: lo calcula con 6 px por carácter y las fotos quedarían corridas.
      return Math.round(col?.width ? col.width * 7 : col?.wpx ?? ANCHO_COL);
    });
    const altos = Array.from({ length: nF }, (_, r) => {
      const row = rows[r];
      if (row?.hidden) return 0;
      // Alto en puntos → px (×4/3). hpx de SheetJS viene igual a hpt, sin convertir.
      return Math.round(row?.hpt ? (row.hpt * 4) / 3 : row?.hpx ?? ALTO_FILA);
    });

    const celdas: (Celda | null)[][] = Array.from({ length: nF }, (_, r) =>
      Array.from({ length: nC }, (_, c) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
        return { texto: cell ? String(cell.w ?? cell.v ?? '') : '' };
      })
    );
    for (const m of merges) {
      if (m.s.r >= nF || m.s.c >= nC) continue;
      for (let r = m.s.r; r <= Math.min(m.e.r, nF - 1); r++)
        for (let c = m.s.c; c <= Math.min(m.e.c, nC - 1); c++) celdas[r][c] = null;
      celdas[m.s.r][m.s.c] = {
        texto: String((ws[XLSX.utils.encode_cell(m.s)] as XLSX.CellObject | undefined)?.w ?? ''),
        filas: Math.min(m.e.r, nF - 1) - m.s.r + 1,
        cols: Math.min(m.e.c, nC - 1) - m.s.c + 1,
      };
    }
    return { nombre, celdas, anchos, altos, totalFilas };
  });
}

function letraColumna(c: number) {
  return XLSX.utils.encode_col(c);
}

/** Suma acumulada: posición x/y del borde izquierdo/superior de cada columna/fila. */
function acumulado(medidas: number[]) {
  const out = [0];
  for (const m of medidas) out.push(out[out.length - 1] + m);
  return out;
}

/** Rectángulo (px, relativo a la esquina de A1) de una foto flotante. */
function rectFoto(f: FotoExcel, xs: number[], ys: number[]) {
  const x = (col: number) => xs[Math.min(col, xs.length - 1)];
  const y = (fila: number) => ys[Math.min(fila, ys.length - 1)];
  const left = x(f.col) + f.dx;
  const top = y(f.fila) + f.dy;
  const width = f.fin ? x(f.fin.col) + f.fin.dx - left : f.ancho ?? ANCHO_COL;
  const height = f.fin ? y(f.fin.fila) + f.fin.dy - top : f.alto ?? ALTO_FILA;
  return { left, top, width: Math.max(8, width), height: Math.max(8, height) };
}

/**
 * Vista previa de un Excel como cuadrícula, con una pestaña por hoja: anchos
 * de columna, altos de fila y celdas combinadas del archivo, y las fotos
 * dibujadas encima en su celda, como se ven en Excel. Las fotos se leen del
 * propio archivo (lib/excelImagenes). `fotos` (las que extrajo la API) solo
 * se usa de respaldo, en galería, si del archivo no se pudo leer ninguna.
 *
 * z-index: el modal va en z-[60] (se puede abrir desde el formulario, z-50) y
 * el lightbox en z-[70], para que la foto ampliada no quede tapada.
 */
export function ExcelPreviewModal({
  titulo,
  cargar,
  fotos = [],
  onDescargar,
  onClose,
}: {
  titulo: string;
  cargar: () => Promise<ArrayBuffer>;
  fotos?: FotoDeHoja[];
  onDescargar?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [hojas, setHojas] = useState<Hoja[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activa, setActiva] = useState(0);
  const [ampliada, setAmpliada] = useState<{ url?: string; path?: string } | null>(null);
  const [fotosArchivo, setFotosArchivo] = useState<FotoExcel[]>([]);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const descargar = () => {
    setErrorDescarga(null);
    Promise.resolve()
      .then(() => onDescargar?.())
      .catch((err) => setErrorDescarga(err instanceof Error ? err.message : 'No se pudo descargar el archivo.'));
  };

  useEffect(() => {
    let cancelado = false;
    let leidas: FotoExcel[] = [];
    cargar()
      .then(async (buf) => {
        leidas = await leerFotosExcel(buf);
        if (cancelado) return liberarFotos(leidas);
        setFotosArchivo(leidas);
        setHojas(leerHojas(buf, leidas));
      })
      .catch(() => !cancelado && setError('No se pudo leer el Excel.'));
    return () => {
      cancelado = true;
      liberarFotos(leidas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Respaldo: fotos de la API en galería, solo si del archivo no se leyó ninguna.
  const fotosPorHoja = useMemo(() => {
    const map = new Map<number, FotoDeHoja[]>();
    if (!hojas || fotosArchivo.length) return map;
    for (const f of fotos) {
      // Se prefiere el nombre de la hoja; el índice es el respaldo.
      const byName = f.sheetName ? hojas.findIndex((h) => h.nombre === f.sheetName) : -1;
      const idx = byName >= 0 ? byName : f.sheet;
      map.set(idx, [...(map.get(idx) || []), f]);
    }
    return map;
  }, [fotos, hojas, fotosArchivo]);

  const hoja = hojas?.[activa];
  const fotosHoja = fotosPorHoja.get(activa) || [];
  const fotosEnHoja = useMemo(() => fotosArchivo.filter((f) => f.hoja === hoja?.nombre), [fotosArchivo, hoja]);
  const contarFotos = (i: number) => fotosArchivo.filter((f) => f.hoja === hojas?.[i]?.nombre).length || fotosPorHoja.get(i)?.length || 0;

  return (
    <Modal
      title={titulo}
      onClose={onClose}
      size="xl"
      layer="z-[60]"
      actions={
        onDescargar && (
          <Button variant="secondary" className="px-3 py-1.5" onClick={descargar}>
            <Download size={14} /> Descargar
          </Button>
        )
      }
    >
      {errorDescarga && <p className="mb-3 text-sm text-danger">{errorDescarga}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {!hojas && !error && <p className="text-sm opacity-60">Leyendo Excel…</p>}

      {hojas && (
        <div className="flex flex-col gap-3">
          {hojas.length > 1 && (
            <div className="flex flex-wrap gap-1 border-b border-black/10 pb-2 dark:border-white/10">
              {hojas.map((h, i) => (
                <button
                  key={h.nombre}
                  onClick={() => setActiva(i)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                    i === activa ? 'bg-brand-500 text-white dark:bg-brand-400 dark:text-slate-950' : 'hover:bg-black/5 dark:hover:bg-white/10'
                  )}
                >
                  {h.nombre}
                  {contarFotos(i) > 0 && (
                    <span className="flex items-center gap-0.5 opacity-80">
                      <ImageIcon size={11} />
                      {contarFotos(i)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {hoja && hoja.celdas.length > 0 && (
            <>
              <Cuadricula hoja={hoja} fotos={fotosEnHoja} onAmpliar={(url) => setAmpliada({ url })} />
              {hoja.totalFilas > MAX_FILAS && (
                <p className="text-xs opacity-60">
                  Mostrando {MAX_FILAS} de {hoja.totalFilas} filas. Descarga el archivo para verlo completo.
                </p>
              )}
            </>
          )}

          {hoja && hoja.celdas.length === 0 && fotosHoja.length === 0 && (
            <p className="py-6 text-center text-sm opacity-60">Esta hoja no tiene datos.</p>
          )}

          {fotosHoja.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 etiqueta">
                <ImageIcon size={13} /> Fotos en esta hoja ({fotosHoja.length})
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {fotosHoja.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setAmpliada({ path: f.path })}
                    className="aspect-square overflow-hidden rounded-xl border border-black/10 hover:ring-2 hover:ring-brand-500/50 dark:border-white/10"
                  >
                    <AuthImage path={f.path} alt="Foto de evidencia" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {ampliada &&
        createPortal(
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4" onClick={() => setAmpliada(null)}>
            <button
              aria-label="Cerrar foto"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={() => setAmpliada(null)}
            >
              <X size={20} />
            </button>
            {ampliada.url ? (
              <img
                src={ampliada.url}
                alt="Foto ampliada"
                className="max-h-[90vh] max-w-full rounded-xl object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <AuthImage
                path={ampliada.path!}
                alt="Foto ampliada"
                className="max-h-[90vh] max-w-full rounded-xl object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>,
          document.body
        )}
    </Modal>
  );
}

/**
 * La hoja como en Excel: letras de columna, números de fila, medidas reales y
 * las fotos posicionadas en px sobre la cuadrícula. Las fotos "en celda" se
 * pintan dentro de su celda (en lugar del #VALUE! que ve SheetJS).
 */
function Cuadricula({ hoja, fotos, onAmpliar }: { hoja: Hoja; fotos: FotoExcel[]; onAmpliar: (url: string) => void }) {
  const xs = useMemo(() => acumulado(hoja.anchos), [hoja]);
  const ys = useMemo(() => acumulado(hoja.altos), [hoja]);
  const enCelda = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fotos) if (f.enCelda) m.set(`${f.fila}:${f.col}`, f.url);
    return m;
  }, [fotos]);
  const flotantes = fotos.filter((f) => !f.enCelda && f.fila < hoja.altos.length);

  return (
    <div className="max-h-[60vh] w-fit max-w-full overflow-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-slate-900">
      <div className="relative w-max">
        <table className="table-fixed border-collapse text-xs" style={{ width: ANCHO_NUMEROS + xs[xs.length - 1] }}>
          <colgroup>
            <col style={{ width: ANCHO_NUMEROS }} />
            {hoja.anchos.map((w, c) => (
              <col key={c} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: ALTO_LETRAS }}>
              <th className="sticky left-0 top-0 z-30 border border-black/10 bg-slate-100 dark:border-white/10 dark:bg-slate-800" />
              {hoja.anchos.map((w, c) => (
                <th
                  key={c}
                  className="sticky top-0 z-20 overflow-hidden border border-black/10 bg-slate-100 p-0 text-center text-[11px] font-medium text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400"
                >
                  {w > 0 && letraColumna(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hoja.celdas.map((fila, r) => (
              <tr key={r} style={{ height: hoja.altos[r] }}>
                <th className="sticky left-0 z-20 border border-black/10 bg-slate-100 p-0 text-center text-[11px] font-medium text-slate-500 dark:border-white/10 dark:bg-slate-800 dark:text-slate-400">
                  {hoja.altos[r] > 0 && r + 1}
                </th>
                {fila.map((celda, c) => {
                  if (!celda) return null;
                  const foto = enCelda.get(`${r}:${c}`);
                  return (
                    <td
                      key={c}
                      rowSpan={celda.filas}
                      colSpan={celda.cols}
                      title={!foto && celda.texto.length > 12 ? celda.texto : undefined}
                      className="overflow-hidden whitespace-nowrap border border-black/[0.08] px-1 align-bottom text-slate-800 dark:border-white/[0.08] dark:text-slate-200"
                      style={{ maxWidth: 0 }}
                    >
                      {foto ? (
                        <button type="button" className="block h-full w-full" onClick={() => onAmpliar(foto)}>
                          <img src={foto} alt="Foto en celda" className="mx-auto h-full max-h-full w-full object-contain" style={{ maxHeight: hoja.altos[r] - 2 }} />
                        </button>
                      ) : (
                        <span className="block overflow-hidden text-ellipsis">{celda.texto}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {flotantes.map((f, i) => {
          const rect = rectFoto(f, xs, ys);
          return (
            <button
              key={i}
              type="button"
              title="Ver foto"
              onClick={() => onAmpliar(f.url)}
              className="absolute z-10 overflow-hidden hover:outline hover:outline-2 hover:outline-brand-500"
              style={{ left: ANCHO_NUMEROS + rect.left, top: ALTO_LETRAS + rect.top, width: rect.width, height: rect.height }}
            >
              <img src={f.url} alt="Foto del Excel" className="h-full w-full object-fill" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
