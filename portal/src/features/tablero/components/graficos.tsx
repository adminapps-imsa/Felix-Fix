import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { formatCantidad } from '../../../lib/formatters';
import type { Granularidad, PuntoSerie, FilaDesglose } from '../../../types/tablero';

// Gráficos del Tablero hechos a mano en SVG/HTML (el portal no carga una
// librería de gráficos). Colores: --viz-* en index.css.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Etiqueta del grupo de la serie: «14 oct», «12 oct» (semana) u «oct 26». */
export function etiquetaGrupo(desde: string, gran: Granularidad, larga = false) {
  const [y, m, d] = desde.split('-').map(Number);
  if (gran === 'mes') return larga ? `${MESES[m - 1]} ${y}` : `${MESES[m - 1]} ${String(y).slice(2)}`;
  const dia = `${d} ${MESES[m - 1]}`;
  return gran === 'semana' && larga ? `Semana del ${dia}` : dia;
}

/** Tope del eje: un número redondo (1, 2, 5 × 10ⁿ por paso) con 2–4 marcas. */
function escala(max: number) {
  if (max <= 2) return { tope: Math.max(max, 1), paso: 1 };
  if (max <= 4) return { tope: 4, paso: 2 };
  const bruto = max / 3;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map((f) => f * pot).find((p) => p >= bruto) ?? bruto;
  return { tope: Math.ceil(max / paso) * paso, paso };
}

/**
 * Ancho del contenedor con ResizeObserver. Usa un callback ref: el div solo
 * existe cuando hay datos y se ve el gráfico, así que al aparecer (vacío →
 * con datos, tabla → gráfico) hay que volver a observar el nodo nuevo.
 */
function useAncho<T extends HTMLElement>() {
  const [ancho, setAncho] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    roRef.current = ro;
  }, []);
  // Al desmontar el gráfico entero, soltar el observer.
  useEffect(() => () => roRef.current?.disconnect(), []);
  return [ref, ancho] as const;
}

export interface SerieDef {
  clave: 'entradas' | 'salidas';
  nombre: string;
  color: string;
}

/**
 * Columnas por día / semana / mes (una o dos medidas lado a lado): se leen
 * como «cuántos hubo» sin interpretar líneas. Tooltip al pasar el ratón o el
 * dedo, y la misma información como tabla para quien la prefiera.
 */
export function GraficoColumnas({ serie, granularidad, series, alto = 190 }: { serie: PuntoSerie[]; granularidad: Granularidad; series: SerieDef[]; alto?: number }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const [tabla, setTabla] = useState(false);
  const idTitulo = useId();

  const totales = series.map((s) => serie.reduce((acc, p) => acc + p[s.clave], 0));
  const vacio = totales.every((t) => t === 0);
  const m = { izq: 26, der: 4, arr: 8, aba: 24 };
  const w = Math.max(ancho - m.izq - m.der, 10);
  const h = alto - m.arr - m.aba;
  const max = Math.max(0, ...serie.flatMap((p) => series.map((s) => p[s.clave])));
  const { tope, paso } = escala(max);
  const banda = w / Math.max(serie.length, 1);
  // Columnas de máximo 24px, con 2px de aire entre las dos de un mismo grupo.
  const grosor = Math.max(2, Math.min(24, (banda * 0.7 - (series.length - 1) * 2) / series.length));
  const grupoAncho = grosor * series.length + (series.length - 1) * 2;
  const xGrupo = (i: number) => m.izq + i * banda + (banda - grupoAncho) / 2;
  const y = (v: number) => m.arr + h - (v / tope) * h;
  const marcas = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const indicesX = serie.length <= 3 ? serie.map((_, i) => i) : [0, Math.floor((serie.length - 1) / 2), serie.length - 1];

  const alMover = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setActivo(Math.max(0, Math.min(serie.length - 1, Math.floor(((e.clientX - r.left) / r.width) * serie.length))));
  };
  const punto = activo !== null ? serie[activo] : null;
  const centro = activo !== null ? xGrupo(activo) + grupoAncho / 2 : 0;
  const alIzquierda = centro > ancho * 0.6;

  /** Columna con la punta redondeada (4px) y la base recta sobre el eje. */
  const columna = (x: number, v: number) => {
    const top = y(v);
    const alto0 = m.arr + h - top;
    if (alto0 <= 0) return '';
    const r = Math.min(4, grosor / 2, alto0);
    return `M${x},${m.arr + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + grosor - r} Q${x + grosor},${top} ${x + grosor},${top + r} V${m.arr + h} Z`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Leyenda">
            {series.map((s) => (
              <li key={s.clave} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
                <span className="opacity-75">{s.nombre}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        {!vacio && (
          <button
            type="button"
            onClick={() => setTabla((t) => !t)}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold opacity-60 transition hover:bg-brand-500/10 hover:opacity-100"
            aria-pressed={tabla}
          >
            {tabla ? <BarChart3 size={14} aria-hidden /> : <Table2 size={14} aria-hidden />}
            {tabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        )}
      </div>

      {vacio ? (
        <p className="grid place-items-center rounded-xl border border-dashed border-black/10 text-sm opacity-55 dark:border-white/10" style={{ height: alto }}>
          Sin movimiento en este periodo.
        </p>
      ) : tabla ? (
        <div className="max-h-56 overflow-auto rounded-xl border border-black/5 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--glass-bg)] text-left text-xs opacity-70">
              <tr>
                <th className="px-3 py-2 font-semibold">{granularidad === 'mes' ? 'Mes' : granularidad === 'semana' ? 'Semana' : 'Día'}</th>
                {series.map((s) => (
                  <th key={s.clave} className="px-3 py-2 text-right font-semibold">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {[...serie]
                .reverse()
                .filter((p) => series.some((s) => p[s.clave] > 0))
                .map((p) => (
                  <tr key={p.desde}>
                    <td className="px-3 py-1.5">{etiquetaGrupo(p.desde, granularidad, true)}</td>
                    {series.map((s) => (
                      <td key={s.clave} className={cn('px-3 py-1.5 text-right', !p[s.clave] && 'opacity-40')}>
                        {formatCantidad(p[s.clave])}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" style={{ height: alto }}>
          {ancho > 0 && (
            <svg width={ancho} height={alto} role="img" aria-labelledby={idTitulo} className="block select-none overflow-visible">
              <title id={idTitulo}>{series.map((s, i) => `${s.nombre}: ${formatCantidad(totales[i])}`).join(' · ')}</title>
              {marcas.map((v) => (
                <g key={v}>
                  <line x1={m.izq} x2={m.izq + w} y1={y(v)} y2={y(v)} stroke="var(--viz-reja)" strokeWidth={1} />
                  <text x={m.izq - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-current text-[11px] tabular-nums opacity-45">
                    {formatCantidad(v)}
                  </text>
                </g>
              ))}
              {activo !== null && <rect x={m.izq + activo * banda} y={m.arr} width={banda} height={h} rx={4} fill="currentColor" opacity={0.05} />}
              {/* Las columnas crecen desde el eje al aparecer, en cascada por grupo. Sus claves
                  son estables: el tooltip re-dibuja el SVG pero no las vuelve a montar ni a animar. */}
              {serie.map((p, i) =>
                series.map((s, j) => (
                  <path
                    key={`${p.desde}-${s.clave}`}
                    d={columna(xGrupo(i) + j * (grosor + 2), p[s.clave])}
                    fill={s.color}
                    className="anim-crecer"
                    style={{ ['--i' as string]: i }}
                  />
                ))
              )}
              {indicesX.map((i) => (
                <text key={i} x={xGrupo(i) + grupoAncho / 2} y={alto - 6} textAnchor={i === 0 && serie.length > 3 ? 'start' : i === serie.length - 1 && serie.length > 3 ? 'end' : 'middle'} className="fill-current text-[11px] opacity-50">
                  {etiquetaGrupo(serie[i].desde, granularidad)}
                </text>
              ))}
              <rect
                x={m.izq}
                y={0}
                width={w}
                height={alto}
                fill="transparent"
                onPointerMove={alMover}
                onPointerDown={alMover}
                onPointerLeave={() => setActivo(null)}
                style={{ touchAction: 'pan-y' }}
              />
            </svg>
          )}
          {punto && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-xl border border-black/5 bg-[var(--glass-bg)] px-3 py-2 text-sm shadow-[var(--shadow-elevada)] dark:border-white/10"
              style={alIzquierda ? { right: ancho - centro + 14 } : { left: centro + 14 }}
            >
              <p className="mb-1 text-xs font-semibold opacity-70">{etiquetaGrupo(punto.desde, granularidad, true)}</p>
              {series.map((s) => (
                <p key={s.clave} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
                    <span className="opacity-75">{s.nombre}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{formatCantidad(punto[s.clave])}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Ranking horizontal (por tienda, motivo, proveedor…): nombre, barra y valor
 * en la punta. «Otros» va en gris para no competir con los nombrados.
 */
export function BarrasHorizontales({
  filas,
  valor = (f) => f.n,
  formato = formatCantidad,
  vacio = 'Sin casos en este periodo.',
}: {
  filas: FilaDesglose[];
  valor?: (f: FilaDesglose) => number;
  formato?: (n: number) => string;
  vacio?: string;
}) {
  if (!filas.length) return <p className="py-2 text-sm opacity-55">{vacio}</p>;
  const max = Math.max(...filas.map(valor), 1);
  return (
    <ul className="flex flex-col gap-3">
      {filas.map((f, i) => {
        const v = valor(f);
        return (
          <li key={f.etiqueta} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
            <span className={cn('truncate', f.otros && 'opacity-60')}>{f.etiqueta}</span>
            <span className="text-right font-semibold tabular-nums">{formato(v)}</span>
            <span className="col-span-2 h-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
              <span
                // Se llena de izquierda a derecha al aparecer; si cambia el valor, el ancho se desliza.
                className="anim-ancho block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]"
                style={{ ['--i' as string]: i, width: `${Math.max((v / max) * 100, v > 0 ? 3 : 0)}%`, background: f.otros ? 'color-mix(in oklab, currentColor 30%, transparent)' : 'var(--viz-1)' }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Proporción de dos o tres partes (NF vs devolución…) en una barra con 2px de aire y su leyenda. */
export function BarraProporcion({ partes }: { partes: { etiqueta: string; n: number; color: string }[] }) {
  const total = partes.reduce((s, p) => s + p.n, 0);
  if (!total) return <p className="py-2 text-sm opacity-55">Sin casos en este periodo.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {/* La barra entera se llena de izquierda a derecha (no cada parte por separado). */}
      <div className="anim-ancho flex h-3 gap-0.5" aria-hidden>
        {partes
          .filter((p) => p.n > 0)
          .map((p, i, arr) => (
            <div
              key={p.etiqueta}
              className={cn('h-full', i === 0 && 'rounded-l-full', i === arr.length - 1 && 'rounded-r-full')}
              style={{ flexGrow: p.n, flexBasis: 0, background: p.color }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {partes
          .filter((p) => p.n > 0)
          .map((p) => (
            <li key={p.etiqueta} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />
              <span className="opacity-75">{p.etiqueta}</span>
              <span className="font-semibold tabular-nums">{Math.round((p.n / total) * 100)}%</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
