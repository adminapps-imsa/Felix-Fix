import { useCallback, useEffect, useState } from 'react';
import { Landmark, Search, SearchX } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { EstadoVacio } from '../../../components/ui/EstadoVacio';
import { listarReportes } from '../../../api/productosDanados';
import type { PaginationMeta, ReporteProductoDanado } from '../../../types/productoDanado';
import { ReportesTable } from '../../productos-danados/components/ReportesTable';
import { ReporteDetalleModal } from '../../productos-danados/components/ReporteDetalleModal';

/**
 * Productos dañados que esperan el pago del proveedor (estado EnContabilidad).
 * El detalle es el mismo de Productos dañados: ahí está "Pago recibido".
 */
export function PagosProductosDanados() {
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReporteProductoDanado[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<ReporteProductoDanado | null>(null);
  const [recarga, setRecarga] = useState(0);
  const reload = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    listarReportes({ estado: 'EnContabilidad', q: qDebounced, page, pageSize: 20 })
      .then((res) => {
        if (cancelado) return;
        setData(res.data);
        setPagination(res.pagination);
      })
      .catch((err) => !cancelado && setError(err instanceof Error ? err.message : 'Error al cargar los reportes.'))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [qDebounced, page, recarga]);

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex items-center gap-2">
        <Search size={16} className="opacity-50" />
        <Input
          aria-label="Buscar reportes"
          placeholder="Buscar por producto, código, tienda…"
          value={q}
          maxLength={200}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </GlassCard>

      <ReportesTable
        data={data}
        loading={loading}
        error={error}
        onReintentar={reload}
        clave={`${qDebounced}|${page}`}
        onSelect={setSeleccionado}
        vacio={
          qDebounced ? (
            <EstadoVacio
              icono={SearchX}
              titulo="No hay reportes que coincidan con la búsqueda"
              accion={
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    setPage(1);
                  }}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-400"
                >
                  Quitar búsqueda
                </button>
              }
            />
          ) : (
            <EstadoVacio icono={Landmark} titulo="¡Todo al día!" texto="No hay reportes esperando el pago del proveedor." />
          )
        }
      />
      {pagination && <Pagination meta={pagination} onPageChange={setPage} />}

      {seleccionado && <ReporteDetalleModal reporteId={seleccionado.ReporteId} onClose={() => setSeleccionado(null)} onChanged={reload} />}
    </div>
  );
}
