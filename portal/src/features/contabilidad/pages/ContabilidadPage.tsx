import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, FileText, Inbox, Landmark, Search } from 'lucide-react';
import { BandaPagina, TituloPagina } from '../../../components/ui/TituloPagina';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { cn } from '../../../lib/cn';
import { formatFecha } from '../../../lib/formatters';
import * as apiContabilidad from '../../../api/contabilidad';
import type { PaginationMeta } from '../../../types/productoDanado';
import type { DocumentoContabilidad, FiltroEstadoContabilidad } from '../../../types/contabilidad';
import { formatFechaCorta, formatPrecio } from '../../reclamos/lib/tipos';
import { ValidacionBadges } from '../components/BadgesContabilidad';
import { PagosProductosDanados } from '../components/PagosProductosDanados';
import { useAuth } from '../../../auth/useAuth';
import { P } from '../../../auth/permisos';

const PESTANAS: Array<{ id: FiltroEstadoContabilidad; label: string }> = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'todos', label: 'Todos' },
];

/** "Nota de Debito · Anulación: …" -> "Nota de Debito": el detalle ya va en Movimiento. */
const tipoCorto = (tipo: string | null) => (tipo ? tipo.split(' · ')[0] : 'Documento');

/** Documentos (PDF) de reclamos: una fila por documento enviado desde un reclamo. */
function DocumentosReclamos() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<FiltroEstadoContabilidad>('pendiente');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DocumentoContabilidad[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    apiContabilidad
      .listarDocumentos({ estado, q: qDebounced, page, pageSize: 20 })
      .then((res) => {
        if (cancelado) return;
        setData(res.data);
        setPagination(res.pagination);
      })
      .catch((err) => !cancelado && setError(err instanceof Error ? err.message : 'Error al cargar los documentos.'))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [estado, qDebounced, page]);

  const abrir = (d: DocumentoContabilidad) => navigate(`/contabilidad/${d.DocumentoId}`);

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-fit gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]" role="tablist" aria-label="Estado de los documentos">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={estado === p.id}
              onClick={() => {
                setEstado(p.id);
                setPage(1);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold transition',
                estado === p.id ? 'bg-white shadow-sm dark:bg-slate-700' : 'opacity-70 hover:opacity-100'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <Input
            type="search"
            aria-label="Buscar documentos"
            placeholder="Buscar por documento, reclamo, proveedor, factura, compradora…"
            className="pl-9"
            maxLength={200}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </GlassCard>

      {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {/* Celular: una tarjeta por documento (la tabla de 10 columnas no cabe). */}
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Documentos">
        {loading && data.length === 0 && <li className="glass-card px-4 py-8 text-center text-sm opacity-60">Cargando…</li>}
        {!loading && !error && data.length === 0 && (
          <li className="glass-card px-4 py-8 text-center text-sm opacity-70">
            {qDebounced ? `No hay documentos que coincidan con «${qDebounced}».` : estado === 'pendiente' ? '¡Todo al día! No hay documentos pendientes.' : 'Todavía no se ha enviado ningún documento a contabilidad.'}
          </li>
        )}
        {data.map((d) => (
          <li key={d.DocumentoId}>
            <button
              type="button"
              onClick={() => abrir(d)}
              className="glass-card flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-brand-500/5 active:scale-[0.99]"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="numero-caso block truncate text-lg leading-tight">{d.NumeroDocumento || d.AdjuntoNombre}</span>
                  <span className="block text-xs opacity-60">
                    {tipoCorto(d.TipoDocumento)} · <span className="font-mono">{d.ReclamoNumero}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold tabular-nums">{formatPrecio(d.Total)}</span>
                  <span className="block text-xs opacity-60 tabular-nums">{d.Productos} productos</span>
                </span>
              </span>
              <span className="text-sm font-medium">{d.Proveedor}</span>
              <span className="text-xs opacity-70">
                {d.Movimiento || '—'} · {formatFechaCorta(d.FechaDocumento)}
              </span>
              <ValidacionBadges validacion={d.Validacion} />
            </button>
          </li>
        ))}
      </ul>

      <div className="glass-card hidden overflow-hidden md:block">
        <div className="max-h-[60vh] overflow-auto">
          <table className="tabla-lista w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--glass-bg)] backdrop-blur-md">
              <tr className="border-b border-black/10 text-left text-xs opacity-70 dark:border-white/10">
                <th className="px-3 py-3">Documento</th>
                <th className="px-3 py-3">Reclamo</th>
                <th className="px-3 py-3">Proveedor</th>
                <th className="hidden xl:table-cell px-3 py-3">Fecha doc.</th>
                <th className="hidden xl:table-cell px-3 py-3 text-right">Productos</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3">Validación</th>
                <th className="px-3 py-3">Enviado</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && data.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center opacity-60">
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && !error && data.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="anim-celebrar grid size-12 place-items-center rounded-2xl bg-success/15 text-success">
                        <Inbox size={24} />
                      </span>
                      {qDebounced ? (
                        <p>No hay documentos que coincidan con «{qDebounced}».</p>
                      ) : estado === 'pendiente' ? (
                        <>
                          <p className="font-semibold">¡Todo al día!</p>
                          <p className="text-xs">No hay documentos pendientes. Cuando se envíe un reclamo a contabilidad, sus PDF aparecerán aquí.</p>
                        </>
                      ) : (
                        <p>Todavía no se ha enviado ningún documento a contabilidad.</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {data.map((d, i) => {
                const titulo = d.NumeroDocumento || d.AdjuntoNombre;
                return (
                  <tr
                    key={d.DocumentoId}
                    role="link"
                    tabIndex={0}
                    aria-label={`Abrir documento ${titulo} del reclamo ${d.ReclamoNumero}`}
                    onClick={() => abrir(d)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                      e.preventDefault();
                      abrir(d);
                    }}
                    className={`cursor-pointer border-b outline-none focus-visible:bg-brand-500/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 border-black/5 last:border-0 hover:bg-brand-500/5 dark:border-white/5 ${
                      i % 2 === 1 ? 'bg-black/[0.02] dark:bg-white/[0.02]' : ''
                    }`}
                  >
                    <td className="max-w-[14rem] px-3 py-3">
                      {d.NumeroDocumento ? (
                        <span className="numero-caso block text-base leading-tight">{d.NumeroDocumento}</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs" title={d.AdjuntoNombre}>
                          <FileText size={14} className="shrink-0 text-danger" />
                          <span className="truncate">{d.AdjuntoNombre}</span>
                        </span>
                      )}
                      <span className="sub celda-larga" title={d.TipoDocumento ?? undefined}>
                        {tipoCorto(d.TipoDocumento)}
                      </span>
                    </td>
                    <td className="numero-caso px-3 py-3 text-base">{d.ReclamoNumero}</td>
                    <td className="max-w-[13rem] px-3 py-3 xl:max-w-[18rem]">
                      <span className="celda-larga font-medium" title={d.Proveedor ?? undefined}>
                        {d.Proveedor || <span className="opacity-40">—</span>}
                      </span>
                      {d.Movimiento && (
                        <span className="sub celda-larga" title={d.Movimiento}>
                          {d.Movimiento}
                        </span>
                      )}
                    </td>
                    <td className="hidden xl:table-cell px-3 py-3">{formatFechaCorta(d.FechaDocumento)}</td>
                    <td className="hidden xl:table-cell px-3 py-3 text-right font-semibold tabular-nums">{d.Productos}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatPrecio(d.Total)}</td>
                    <td className="px-3 py-3">
                      <ValidacionBadges validacion={d.Validacion} compacto className="flex-nowrap" />
                    </td>
                    <td className="max-w-[14rem] px-3 py-3">
                      <span className="block">{formatFecha(d.EnviadoAt)}</span>
                      {(d.EnviadoPorNombre || d.EnviadoPor) && <span className="sub celda-larga">{d.EnviadoPorNombre || d.EnviadoPor}</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ChevronRight size={16} className="opacity-50" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && pagination.total > 0 && <Pagination meta={pagination} onPageChange={setPage} />}
    </div>
  );
}

type Seccion = 'reclamos' | 'productos';

const SECCIONES: Array<{ id: Seccion; label: string; descripcion: string }> = [
  { id: 'reclamos', label: 'Reclamos', descripcion: 'Documentos (PDF) de los reclamos enviados a contabilidad, cruzados con los productos del reclamo.' },
  { id: 'productos', label: 'Productos dañados · pagos', descripcion: 'Devoluciones aprobadas esperando el pago del proveedor. Abre el reporte y marca "Pago recibido".' },
];

/** Apartado de Contabilidad: cada sección aparece según el permiso del usuario. */
export function ContabilidadPage() {
  const { puede } = useAuth();
  const visibles = SECCIONES.filter((s) => (s.id === 'reclamos' ? puede(P.recContabilidad) : puede(P.pdPago)));
  // Desde Inicio se puede llegar directo a una sección (?seccion=productos).
  const [params] = useSearchParams();
  const [seccion, setSeccion] = useState<Seccion>(() => (params.get('seccion') === 'productos' ? 'productos' : visibles[0]?.id ?? 'reclamos'));
  const actual = visibles.find((s) => s.id === seccion) ?? visibles[0];

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina>
        <TituloPagina icono={Landmark} titulo="Contabilidad">
          {actual && <p className="bajada-pagina">{actual.descripcion}</p>}
        </TituloPagina>
      </BandaPagina>

      {visibles.length > 1 && (
        <div className="flex w-fit flex-wrap gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]" role="tablist" aria-label="Sección de contabilidad">
          {visibles.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={actual?.id === s.id}
              onClick={() => setSeccion(s.id)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                actual?.id === s.id ? 'bg-white shadow-sm dark:bg-white/15' : 'opacity-60 hover:opacity-100'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {actual?.id === 'productos' ? <PagosProductosDanados /> : <DocumentosReclamos />}
    </div>
  );
}
