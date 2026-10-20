import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Input, Select } from '../../../components/ui/Input';
import { CampoFecha } from '../../../components/ui/CampoFecha';
import { ESTADO_LABEL } from '../../../types/productoDanado';
import { useCatalogos } from '../hooks/useCatalogos';
import type { Filtros, Tienda } from '../../../types/productoDanado';

export function FiltersBar({
  filtros,
  onChange,
  tiendas,
}: {
  filtros: Filtros;
  onChange: (filtros: Filtros) => void;
  tiendas: Tienda[];
}) {
  const { motivos } = useCatalogos();
  const set = <K extends keyof Filtros>(key: K, value: Filtros[K]) =>
    onChange({ ...filtros, [key]: value, page: 1 });

  // Búsqueda con debounce de 300 ms (como en Reclamos): no se pide la lista en cada tecla.
  const [q, setQ] = useState(filtros.q || '');
  const ultimos = useRef({ filtros, onChange });
  ultimos.current = { filtros, onChange };
  useEffect(() => {
    const t = setTimeout(() => {
      const { filtros: f, onChange: cambiar } = ultimos.current;
      if (q.trim() !== (f.q || '')) cambiar({ ...f, q: q.trim(), page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  // Si la búsqueda cambia desde fuera (ej. se limpian los filtros), el campo la refleja.
  useEffect(() => {
    setQ((actual) => (actual.trim() === (filtros.q || '') ? actual : filtros.q || ''));
  }, [filtros.q]);

  return (
    <GlassCard className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-7">
      <div className="relative lg:col-span-2">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
        <Input
          placeholder="Buscar por código de barras o nombre…"
          className="pl-9"
          maxLength={200}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Select value={filtros.tienda || ''} onChange={(e) => set('tienda', e.target.value)}>
        <option value="">Todas las tiendas</option>
        {tiendas.map((t) => (
          <option key={t.TiendaId} value={t.TiendaId}>
            {t.Nombre}
          </option>
        ))}
      </Select>

      <Select value={filtros.motivo || ''} onChange={(e) => set('motivo', e.target.value)}>
        <option value="">Todos los motivos</option>
        {motivos.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>

      <Select value={filtros.estado || ''} onChange={(e) => set('estado', e.target.value as Filtros['estado'])}>
        <option value="">Todos los estados</option>
        {Object.entries(ESTADO_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      {/* Dos columnas: cada fecha necesita su ancho para mostrar dd/mm/aaaa completo. */}
      <div className="flex gap-2 lg:col-span-2">
        <label className="flex min-w-[8.75rem] flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium opacity-70">Desde</span>
          <CampoFecha aria-label="Fecha desde" value={filtros.fechaDesde || ''} max={filtros.fechaHasta || undefined} onChange={(v) => set('fechaDesde', v)} />
        </label>
        <label className="flex min-w-[8.75rem] flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium opacity-70">Hasta</span>
          <CampoFecha aria-label="Fecha hasta" value={filtros.fechaHasta || ''} min={filtros.fechaDesde || undefined} onChange={(v) => set('fechaHasta', v)} />
        </label>
      </div>
    </GlassCard>
  );
}
