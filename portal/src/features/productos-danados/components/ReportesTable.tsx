import type { ReactNode } from 'react';
import { Eye, PackageX } from 'lucide-react';
import { EstadoBadge, MotivoBadge } from '../../../components/ui/Badge';
import { EsqueletoFilas } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { formatFecha, formatCantidad } from '../../../lib/formatters';
import { useTanda } from '../hooks/useTanda';
import type { ReporteProductoDanado } from '../../../types/productoDanado';

export function ReportesTable({
  data,
  loading,
  onSelect,
  error,
  onReintentar,
  vacio,
  clave = '',
}: {
  data: ReporteProductoDanado[];
  loading: boolean;
  onSelect: (reporte: ReporteProductoDanado) => void;
  /** Error al cargar la lista: se muestra en lugar de la tabla, con «Reintentar». */
  error?: string | null;
  onReintentar?: () => void;
  /** Lo que se ve cuando no hay reportes (el que llama sabe si hay filtros y qué acción ofrecer). */
  vacio?: ReactNode;
  /** Identifica la búsqueda (filtros + página): al cambiar, las filas nuevas entran en cascada. */
  clave?: string;
}) {
  const tanda = useTanda(data, clave);

  // Primera carga (o lista vacía mientras busca): la forma de las filas en vez de «Cargando…».
  if (loading && data.length === 0) {
    return (
      <div className="glass-card overflow-hidden">
        <EsqueletoFilas filas={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="glass-card">
        <EstadoVacio icono={PackageX} tono="error" titulo="No se pudieron cargar los reportes" texto={error} accion={onReintentar && <BotonReintentar onClick={onReintentar} />} />
      </div>
    );
  }
  if (data.length === 0) {
    return <div className="glass-card">{vacio ?? <EstadoVacio icono={PackageX} titulo="No hay reportes" />}</div>;
  }

  return (
    <>
      {/* Celular: una tarjeta por reporte (la tabla de 9 columnas no cabe). */}
      <ul key={tanda} className="flex flex-col gap-2 md:hidden" aria-label="Reportes">
        {data.map((r, i) => (
          <li key={r.ReporteId} className="anim-fila" style={{ ['--i' as string]: i }}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="glass-card flex w-full min-w-0 flex-col gap-2 px-4 py-3.5 text-left transition-[background-color,transform] duration-150 hover:bg-brand-500/[0.04] active:scale-[0.99]"
            >
              {/* El estado arriba y el producto debajo con todo el ancho: al lado del estado el nombre se apretaba. */}
              <span className="flex flex-wrap items-center gap-1.5">
                <EstadoBadge estado={r.Estado} />
                <MotivoBadge motivo={r.Motivo} />
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 break-words font-semibold leading-snug">{r.NombreProducto}</span>
                <span className="block truncate font-mono text-xs opacity-60">{r.CodigoBarras || r.Sku || '—'}</span>
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-80">
                <span className="tabular-nums">Cant. {formatCantidad(r.Cantidad)}</span>
                <span className="min-w-0 truncate">{r.TiendaNombre}</span>
              </span>
              <span className="truncate text-xs opacity-60">
                {formatFecha(r.FechaCreacion)} · {r.EmpleadoReportaNombre}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="glass-card hidden overflow-hidden md:block">
        <div className="max-h-[60vh] overflow-auto">
          <table className="tabla-lista w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-md">
              <tr className="border-b border-black/10 text-left text-xs opacity-70 dark:border-white/10">
                <th className="px-4 py-3">Producto</th>
                <th className="px-3 py-3">Tienda</th>
                <th className="px-3 py-3">Motivo</th>
                <th className="px-3 py-3 text-right">Cantidad</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Reportado</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody key={tanda}>
              {data.map((r, i) => (
                <tr
                  key={r.ReporteId}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir reporte #${r.ReporteId}: ${r.NombreProducto}`}
                  onClick={() => onSelect(r)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                    e.preventDefault();
                    onSelect(r);
                  }}
                  style={{ ['--i' as string]: i }}
                  className={`anim-fila group cursor-pointer border-b outline-none transition-colors duration-150 focus-visible:bg-brand-500/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 border-black/5 last:border-0 hover:bg-brand-500/[0.04] dark:border-white/5 ${
                    i % 2 === 1 ? 'bg-black/[0.02] dark:bg-white/[0.02]' : ''
                  }`}
                >
                  <td className="max-w-[17rem] px-4 py-3.5 xl:max-w-[22rem]">
                    <span className="celda-larga font-medium" title={r.NombreProducto}>
                      {r.NombreProducto}
                    </span>
                    <span className="sub celda-larga">
                      <span className="font-mono">{r.CodigoBarras || r.Sku || '—'}</span>
                      {r.Division && <> · {r.Division}</>}
                    </span>
                  </td>
                  <td className="max-w-[12rem] px-3 py-3.5">
                    <span className="celda-larga" title={r.TiendaNombre}>
                      {r.TiendaNombre}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <MotivoBadge motivo={r.Motivo} />
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums">{formatCantidad(r.Cantidad)}</td>
                  <td className="px-3 py-3.5">
                    <EstadoBadge estado={r.Estado} />
                  </td>
                  <td className="max-w-[14rem] px-3 py-3.5">
                    <span className="block">{formatFecha(r.FechaCreacion)}</span>
                    <span className="sub celda-larga" title={r.EmpleadoReportaNombre}>
                      {r.EmpleadoReportaNombre}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    {/* El ojo se aviva al pasar por la fila: indica que se abre el detalle. */}
                    <Eye size={16} className="opacity-40 transition-[opacity,color] duration-150 group-hover:text-brand-500 group-hover:opacity-90" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
