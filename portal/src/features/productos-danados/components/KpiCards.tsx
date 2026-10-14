import type { ReactNode } from 'react';
import { Clock, XCircle, FileUp, Landmark, Lock, FileCheck2 } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { formatCantidad } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';
import type { Estado, Kpis } from '../../../types/productoDanado';

// Una tarjeta por etapa del flujo, con quién la tiene; al tocarla filtra la lista.
const CARDS: Array<{ key: keyof Kpis; estado: Estado; label: string; quien: string; icon: ReactNode; color: string }> = [
  { key: 'pendientes', estado: 'Pendiente', label: 'Pendientes', quien: 'Compradora', icon: <Clock size={18} />, color: 'text-warning' },
  { key: 'rechazados', estado: 'Rechazado', label: 'NF', quien: 'Gof · documento 1700', icon: <XCircle size={18} />, color: 'text-danger' },
  { key: 'nfValidacion', estado: 'NFValidacion', label: 'NF por validar', quien: 'Supervisor GOF', icon: <FileCheck2 size={18} />, color: 'text-danger' },
  { key: 'aprobados', estado: 'Aprobado', label: 'Devolución aprobada', quien: 'Gof', icon: <FileUp size={18} />, color: 'text-brand-500 dark:text-brand-400' },
  { key: 'enContabilidad', estado: 'EnContabilidad', label: 'En contabilidad', quien: 'Contabilidad', icon: <Landmark size={18} />, color: 'text-warning' },
  { key: 'cerrados', estado: 'Cerrado', label: 'Cerrados', quien: 'Terminados', icon: <Lock size={18} />, color: 'text-success' },
];

// Quien solo ve los NF (Gof) ve solo las tarjetas del camino del NF.
const ESTADOS_NF: Estado[] = ['Rechazado', 'NFValidacion', 'Cerrado'];

export function KpiCards({
  kpis,
  estado,
  onEstado,
  soloNf = false,
}: {
  kpis: Kpis | null;
  estado?: Estado | '';
  onEstado: (estado: Estado | '') => void;
  soloNf?: boolean;
}) {
  const cards = soloNf ? CARDS.filter((c) => ESTADOS_NF.includes(c.estado)) : CARDS;
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', soloNf ? 'lg:grid-cols-3' : 'lg:grid-cols-6')}>
      {cards.map((card) => {
        const activa = estado === card.estado;
        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={activa}
            title={activa ? 'Quitar filtro' : `Ver solo: ${card.label}`}
            onClick={() => onEstado(activa ? '' : card.estado)}
            className="group rounded-[var(--radius-card)] text-left transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98]"
          >
            <GlassCard
              className={cn(
                'elevada flex h-full flex-col gap-1 transition-[box-shadow,border-color] duration-200 group-hover:shadow-[var(--glass-shadow-hover)]',
                activa && 'ring-2 ring-brand-500'
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className={cn('chip-icono', card.color)}>{card.icon}</span>
                <span className="text-sm font-semibold leading-tight opacity-80">{card.label}</span>
              </span>
              <span className="cifra-kpi mt-2">{kpis ? formatCantidad(kpis[card.key]) : '—'}</span>
              <span className="text-xs opacity-55">{card.quien}</span>
            </GlassCard>
          </button>
        );
      })}
    </div>
  );
}
