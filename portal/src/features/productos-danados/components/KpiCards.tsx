import type { ReactNode } from 'react';
import { Clock, XCircle, FileUp, Landmark, Lock, FileCheck2, Undo2, Send } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Cifra } from '../../../components/ui/Cifra';
import { Esqueleto } from '../../../components/ui/Esqueleto';
import { cn } from '../../../lib/cn';
import type { Estado, FiltroEstado, Kpis } from '../../../types/productoDanado';

type Indicador = { key: keyof Kpis; estado: FiltroEstado; label: string; quien: string; icon: ReactNode; color: string };

/**
 * Los indicadores, agrupados por etapa del flujo en un solo panel (antes eran
 * siete tarjetas sueltas). Cada uno filtra la lista al tocarlo.
 */
const ETAPAS: Array<{ titulo: string; indicadores: Indicador[] }> = [
  {
    titulo: 'Revisión',
    indicadores: [
      { key: 'pendientes', estado: 'Pendiente', label: 'Pendientes', quien: 'Compradora', icon: <Clock size={16} />, color: 'text-warning' },
      { key: 'enviadosProveedor', estado: 'EnviadoProveedor', label: 'Enviados a proveedor', quien: 'Esperando respuesta', icon: <Send size={16} />, color: 'text-brand-500 dark:text-brand-400' },
      { key: 'devueltos', estado: 'Devuelto', label: 'Devueltos a tienda', quien: 'Tienda · corregir', icon: <Undo2 size={16} />, color: 'text-brand-500 dark:text-brand-400' },
    ],
  },
  {
    titulo: 'NF',
    indicadores: [
      { key: 'rechazados', estado: 'Rechazado', label: 'NF', quien: 'Gof · documento 1700', icon: <XCircle size={16} />, color: 'text-danger' },
      { key: 'nfValidacion', estado: 'NFValidacion', label: 'NF por validar', quien: 'Supervisor GOF', icon: <FileCheck2 size={16} />, color: 'text-danger' },
    ],
  },
  {
    titulo: 'Devolución',
    indicadores: [
      { key: 'aprobados', estado: 'Aprobado', label: 'Aprobada', quien: 'Gof', icon: <FileUp size={16} />, color: 'text-brand-500 dark:text-brand-400' },
      { key: 'enContabilidad', estado: 'EnContabilidad', label: 'En contabilidad', quien: 'Contabilidad', icon: <Landmark size={16} />, color: 'text-warning' },
    ],
  },
  {
    titulo: 'Fin',
    indicadores: [{ key: 'cerrados', estado: 'Cerrado', label: 'Cerrados', quien: 'Terminados', icon: <Lock size={16} />, color: 'text-success' }],
  },
];

// Columnas por etapa en escritorio: 3 + 2 + 2 + 1 = 8, cada indicador del mismo ancho.
const SPAN: Record<number, string> = { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3' };
const COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };
// Clases completas (Tailwind no ve las armadas con plantillas).
const GRID: Record<number, string> = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6', 7: 'lg:grid-cols-7', 8: 'lg:grid-cols-8' };

export function KpiCards({
  kpis,
  estado,
  onEstado,
  estadosVisibles,
}: {
  /** `undefined`: todavía cargando (esqueleto en la cifra); `null`: no se pudo cargar. */
  kpis: Kpis | null | undefined;
  estado?: FiltroEstado | '';
  onEstado: (estado: FiltroEstado | '') => void;
  /** Quien ve solo una parte (Gof) ve solo los indicadores de sus etapas. */
  estadosVisibles?: Estado[];
}) {
  const etapas = ETAPAS.map((e) => ({
    ...e,
    indicadores: estadosVisibles ? e.indicadores.filter((i) => (estadosVisibles as FiltroEstado[]).includes(i.estado)) : e.indicadores,
  })).filter((e) => e.indicadores.length > 0);
  const total = etapas.reduce((n, e) => n + e.indicadores.length, 0);

  return (
    <GlassCard className="elevada !p-2 sm:!p-3">
      <div className={cn('grid gap-x-2 gap-y-3 lg:divide-x lg:divide-black/[0.07] lg:dark:divide-white/[0.08]', GRID[total] ?? 'lg:grid-cols-8')}>
        {etapas.map((etapa) => (
          <section key={etapa.titulo} aria-label={etapa.titulo} className={cn('min-w-0 lg:px-1.5 lg:first:pl-0 lg:last:pr-0', SPAN[etapa.indicadores.length])}>
            <h3 className="px-2.5 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider opacity-50">{etapa.titulo}</h3>
            <div className={cn('grid gap-1', COLS[etapa.indicadores.length])}>
              {etapa.indicadores.map((ind) => {
                const activa = estado === ind.estado;
                return (
                  <button
                    key={ind.key}
                    type="button"
                    aria-pressed={activa}
                    title={activa ? 'Quitar filtro' : `Ver solo: ${ind.label}`}
                    onClick={() => onEstado(activa ? '' : ind.estado)}
                    className={cn(
                      'flex min-w-0 flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]',
                      activa ? 'bg-brand-500/10 ring-2 ring-inset ring-brand-500' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className={cn('shrink-0', ind.color)} aria-hidden>
                        {ind.icon}
                      </span>
                      {kpis === undefined ? (
                        <Esqueleto className="h-7 w-10" />
                      ) : (
                        <span className="font-display text-[1.75rem] font-bold leading-none tabular-nums [font-stretch:78%]">
                          {kpis ? <Cifra valor={kpis[ind.key]} /> : '—'}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-[0.8125rem] font-semibold leading-tight', activa && 'text-brand-700 dark:text-brand-300')}>{ind.label}</span>
                      <span className="block truncate text-[0.6875rem] opacity-55">{ind.quien}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </GlassCard>
  );
}
