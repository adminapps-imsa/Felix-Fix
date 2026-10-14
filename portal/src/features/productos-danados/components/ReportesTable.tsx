import { Eye } from 'lucide-react';
import { EstadoBadge, MotivoBadge } from '../../../components/ui/Badge';
import { formatFecha, formatCantidad } from '../../../lib/formatters';
import type { ReporteProductoDanado } from '../../../types/productoDanado';

export function ReportesTable({
  data,
  loading,
  onSelect,
}: {
  data: ReporteProductoDanado[];
  loading: boolean;
  onSelect: (reporte: ReporteProductoDanado) => void;
}) {
  return (
    <>
      {/* Celular: una tarjeta por reporte (la tabla de 9 columnas no cabe). */}
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Reportes">
        {!loading && data.length === 0 && <li className="glass-card px-4 py-8 text-center text-sm opacity-60">No hay reportes que coincidan con los filtros.</li>}
        {data.map((r) => (
          <li key={r.ReporteId}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="glass-card flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-brand-500/5 active:scale-[0.99]"
            >
              {/* El estado arriba y el producto debajo con todo el ancho: al lado del estado el nombre se apretaba. */}
              <span className="flex flex-wrap items-center gap-1.5">
                <EstadoBadge estado={r.Estado} />
                <MotivoBadge motivo={r.Motivo} />
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 font-semibold leading-snug">{r.NombreProducto}</span>
                <span className="block font-mono text-xs opacity-60">{r.CodigoBarras || r.Sku || '—'}</span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs opacity-80">
                <span className="tabular-nums">Cant. {formatCantidad(r.Cantidad)}</span>
                <span>{r.TiendaNombre}</span>
              </span>
              <span className="text-xs opacity-60">
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
              <th className="px-3 py-3">Producto</th>
              <th className="px-3 py-3">Tienda</th>
              <th className="px-3 py-3">Motivo</th>
              <th className="px-3 py-3 text-right">Cantidad</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Reportado</th>
              <th className="w-10 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center opacity-60">
                  No hay reportes que coincidan con los filtros.
                </td>
              </tr>
            )}
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
                className={`cursor-pointer border-b outline-none focus-visible:bg-brand-500/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 border-black/5 last:border-0 hover:bg-brand-500/5 dark:border-white/5 ${
                  i % 2 === 1 ? 'bg-black/[0.02] dark:bg-white/[0.02]' : ''
                }`}
              >
                <td className="max-w-[17rem] px-3 py-3 xl:max-w-[22rem]">
                  <span className="celda-larga font-medium" title={r.NombreProducto}>
                    {r.NombreProducto}
                  </span>
                  <span className="sub celda-larga">
                    <span className="font-mono">{r.CodigoBarras || r.Sku || '—'}</span>
                    {r.Division && <> · {r.Division}</>}
                  </span>
                </td>
                <td className="max-w-[12rem] px-3 py-3">
                  <span className="celda-larga" title={r.TiendaNombre}>
                    {r.TiendaNombre}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <MotivoBadge motivo={r.Motivo} />
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatCantidad(r.Cantidad)}</td>
                <td className="px-3 py-3">
                  <EstadoBadge estado={r.Estado} />
                </td>
                <td className="max-w-[14rem] px-3 py-3">
                  <span className="block">{formatFecha(r.FechaCreacion)}</span>
                  <span className="sub celda-larga" title={r.EmpleadoReportaNombre}>
                    {r.EmpleadoReportaNombre}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <Eye size={16} className="opacity-50" />
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
