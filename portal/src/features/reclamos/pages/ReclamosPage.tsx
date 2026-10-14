import { useEffect, useState } from 'react';
import { RequirePermiso } from '../../../auth/RequirePermiso';
import { P } from '../../../auth/permisos';
import type React from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Bell, CheckCircle2, ChevronRight, ClipboardList, Clock, Plus, Search, X, XCircle } from 'lucide-react';
import { BandaPagina, TituloPagina } from '../../../components/ui/TituloPagina';
import { Button } from '../../../components/ui/Button';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { cn } from '../../../lib/cn';
import { formatFecha } from '../../../lib/formatters';
import * as apiReclamos from '../../../api/reclamos';
import type { PaginationMeta } from '../../../types/productoDanado';
import type { KpisReclamos, Reclamo, StatusReclamo } from '../../../types/reclamo';
import { useTiendas } from '../../productos-danados/hooks/useTiendas';
import { StatusReclamoBadge } from '../components/Badges';
import { NuevoReclamoForm } from '../components/NuevoReclamoForm';
import { STATUS_LABEL, TIPO_LABEL_CORTO, formatFechaCorta } from '../lib/tipos';
import { useAuth } from '../../../auth/useAuth';

const KPI_CARDS: Array<{ key: keyof KpisReclamos; status: StatusReclamo | ''; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'total', status: '', label: 'Total', icon: <ClipboardList size={18} />, color: '' },
  { key: 'pendientes', status: 'pendiente', label: 'Pendientes', icon: <Clock size={18} />, color: 'text-warning' },
  { key: 'notificados', status: 'notificado', label: 'Notificados', icon: <Bell size={18} />, color: 'text-brand-500 dark:text-brand-400' },
  { key: 'resueltos', status: 'resuelto', label: 'Confirmados', icon: <CheckCircle2 size={18} />, color: 'text-success' },
  { key: 'rechazados', status: 'rechazado', label: 'Rechazados', icon: <XCircle size={18} />, color: 'text-danger' },
];

export function ReclamosPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const tiendas = useTiendas();
  const { puede } = useAuth();
  // Desde Inicio se llega con el filtro en el enlace (?estado=pendiente, ?porEnviar=1, ?nuevo=1).
  const [params] = useSearchParams();
  const estadoInicial = params.get('estado');
  const [status, setStatus] = useState<StatusReclamo | ''>(estadoInicial && estadoInicial in STATUS_LABEL ? (estadoInicial as StatusReclamo) : '');
  const [porEnviar, setPorEnviar] = useState(params.get('porEnviar') === '1');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Reclamo[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [kpis, setKpis] = useState<KpisReclamos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(() => params.get('nuevo') === '1' && puede(P.recCrear));
  const aviso = (location.state as { aviso?: string } | null)?.aviso;

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    apiReclamos
      .listarReclamos({ status, porEnviar, q: qDebounced, page, pageSize: 20 })
      .then((res) => {
        if (cancelado) return;
        setData(res.data);
        setPagination(res.pagination);
        setKpis(res.kpis);
      })
      .catch((err) => !cancelado && setError(err instanceof Error ? err.message : 'Error al cargar los reclamos.'))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [status, porEnviar, qDebounced, page]);

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina solape className="flex flex-wrap items-center justify-between gap-3">
        <TituloPagina icono={ClipboardList} titulo="Reclamos">
          <p className="bajada-pagina">Faltantes, sobrantes, diferencias y daños de mercadería.</p>
        </TituloPagina>
        <RequirePermiso permiso={P.recCrear}>
          <Button onClick={() => setShowNuevo(true)}>
            <Plus size={16} /> Nuevo reclamo
          </Button>
        </RequirePermiso>
      </BandaPagina>

      {aviso && <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">{aviso}</div>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {KPI_CARDS.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setStatus(c.status);
              setPorEnviar(false);
              setPage(1);
            }}
            className={cn(
              'glass-card elevada flex min-w-0 flex-col gap-2 p-5 text-left transition-[box-shadow,transform] duration-200 ease-[var(--ease-out)] hover:shadow-[var(--glass-shadow-hover)] active:scale-[0.98]',
              !porEnviar && status === c.status && 'ring-2 ring-brand-500/60'
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={cn('chip-icono', c.color)}>{c.icon}</span>
              <span className="truncate text-sm font-semibold opacity-80">{c.label}</span>
            </span>
            <span className="cifra-kpi">{kpis ? kpis[c.key] : '—'}</span>
          </button>
        ))}
      </div>

      <GlassCard className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <Input
            placeholder="Buscar por número, proveedor, sucursal, marca, documento SAP…"
            className="pl-9"
            maxLength={200}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {porEnviar && (
          <button
            type="button"
            onClick={() => {
              setPorEnviar(false);
              setPage(1);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-brand-500/10 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-500/15 sm:self-auto dark:text-brand-300"
            title="Quitar filtro"
          >
            Cerrados sin enviar a contabilidad <X size={14} aria-hidden />
          </button>
        )}
        {kpis && kpis.productosPorDecidir > 0 && (
          <span className="text-sm opacity-70">
            <strong className="text-warning">{kpis.productosPorDecidir}</strong> producto(s) esperando decisión
          </span>
        )}
      </GlassCard>

      {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {/* Celular: una tarjeta por reclamo (la tabla de 10 columnas no cabe). */}
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Reclamos">
        {!loading && data.length === 0 && <li className="glass-card px-4 py-8 text-center text-sm opacity-60">No hay reclamos que coincidan.</li>}
        {data.map((r) => (
          <li key={r.Token}>
            <button
              type="button"
              onClick={() => navigate(`/reclamos/${r.Token}`)}
              className="glass-card flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-brand-500/5 active:scale-[0.99]"
            >
              {/* Número y estado en una línea; el proveedor debajo, con todo el ancho (al lado del estado se apretaba). */}
              <span className="flex items-center justify-between gap-3">
                <span className="numero-caso whitespace-nowrap text-lg leading-tight">{r.Numero}</span>
                <StatusReclamoBadge status={r.Status} />
              </span>
              <span className="line-clamp-2 font-semibold leading-snug">{r.Proveedor || '—'}</span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-75">
                <span>{TIPO_LABEL_CORTO[r.Tipo]}</span>
                <span>{r.Origen === 'cedi' ? 'CEDI' : r.Sucursal || 'Tienda'}</span>
                {r.Marca && <span>{r.Marca}</span>}
              </span>
              <span className="text-sm tabular-nums">
                <strong className="font-semibold">{r.LineasTotal}</strong> productos
                {r.LineasPendientes > 0 && <strong className="font-semibold text-warning"> · {r.LineasPendientes} por decidir</strong>}
              </span>
              <span className="text-xs opacity-60">
                {formatFecha(r.CreatedAt)} · {r.CreatedByNombre || r.CreatedBy}
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
                <th className="px-3 py-3">Reclamo</th>
                <th className="px-3 py-3">Proveedor</th>
                <th className="hidden xl:table-cell px-3 py-3">Origen</th>
                <th className="hidden xl:table-cell px-3 py-3">Fecha</th>
                <th className="px-3 py-3 text-right">Productos</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Creado</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {!loading && data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center opacity-60">
                    No hay reclamos que coincidan.
                  </td>
                </tr>
              )}
              {data.map((r, i) => (
                <tr
                  key={r.Token}
                  role="link"
                  tabIndex={0}
                  aria-label={`Abrir reclamo ${r.Numero}`}
                  onClick={() => navigate(`/reclamos/${r.Token}`)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                    e.preventDefault();
                    navigate(`/reclamos/${r.Token}`);
                  }}
                  className={`cursor-pointer border-b outline-none focus-visible:bg-brand-500/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 border-black/5 last:border-0 hover:bg-brand-500/5 dark:border-white/5 ${
                    i % 2 === 1 ? 'bg-black/[0.02] dark:bg-white/[0.02]' : ''
                  }`}
                >
                  <td className="px-3 py-3">
                    <span className="numero-caso block text-base leading-tight">{r.Numero}</span>
                    <span className="sub">{TIPO_LABEL_CORTO[r.Tipo]}</span>
                  </td>
                  <td className="max-w-[13rem] px-3 py-3 xl:max-w-[17rem]">
                    <span className="celda-larga font-medium" title={r.Proveedor ?? undefined}>
                      {r.Proveedor || <span className="opacity-40">—</span>}
                    </span>
                    {r.Marca && (
                      <span className="sub celda-larga" title={r.Marca}>
                        {r.Marca}
                      </span>
                    )}
                  </td>
                  <td className="hidden xl:table-cell max-w-[10rem] px-3 py-3">
                    <span className="celda-larga">{r.Origen === 'cedi' ? 'CEDI' : r.Sucursal || 'Tienda'}</span>
                  </td>
                  <td className="hidden xl:table-cell px-3 py-3">{formatFechaCorta(r.FechaRegistro)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className="block font-semibold">{r.LineasTotal}</span>
                    {r.LineasPendientes > 0 && <span className="sub text-warning !opacity-100">{r.LineasPendientes} por decidir</span>}
                  </td>
                  <td className="px-3 py-3">
                    <StatusReclamoBadge status={r.Status} />
                  </td>
                  <td className="max-w-[14rem] px-3 py-3">
                    <span className="block">{formatFecha(r.CreatedAt)}</span>
                    <span className="sub celda-larga">{r.CreatedByNombre || r.CreatedBy}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ChevronRight size={16} className="opacity-50" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && <Pagination meta={pagination} onPageChange={setPage} />}

      {showNuevo && (
        <NuevoReclamoForm
          tiendas={tiendas}
          onClose={() => setShowNuevo(false)}
          onCreated={(reclamo, fallidos) =>
            navigate(`/reclamos/${reclamo.Token}`, {
              state: fallidos.length
                ? { aviso: `El reclamo se creó, pero no se pudieron subir: ${fallidos.join(', ')}. Puedes reintentarlo en "Adjuntos".` }
                : null,
            })
          }
        />
      )}
    </div>
  );
}
