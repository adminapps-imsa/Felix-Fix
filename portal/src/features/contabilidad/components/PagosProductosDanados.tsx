import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
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

      {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {!loading && !error && data.length === 0 ? (
        <GlassCard className="py-10 text-center text-sm opacity-60">
          {qDebounced ? 'No hay reportes que coincidan con la búsqueda.' : '¡Todo al día! No hay reportes esperando el pago del proveedor.'}
        </GlassCard>
      ) : (
        <ReportesTable data={data} loading={loading} onSelect={setSeleccionado} />
      )}
      {pagination && <Pagination meta={pagination} onPageChange={setPage} />}

      {seleccionado && <ReporteDetalleModal reporteId={seleccionado.ReporteId} onClose={() => setSeleccionado(null)} onChanged={reload} />}
    </div>
  );
}
