import { formatFecha } from '../../../lib/formatters';
import { useEffect, useMemo, useState } from 'react';
import { History, KeyRound, Mail, Search, Store, UserMinus, UserPlus } from 'lucide-react';
import { Input, Select } from '../../../components/ui/Input';
import { cn } from '../../../lib/cn';
import { GlassCard } from '../../../components/ui/GlassCard';
import { EsqueletoFilas } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { EventoAuditoria } from '../../../api/configuracion';

const ACCION: Record<EventoAuditoria['Accion'], { texto: string; icono: typeof History; tono: string }> = {
  asignar_rol: { texto: 'Asignó rol', icono: UserPlus, tono: 'bg-success/15 text-success' },
  quitar_rol: { texto: 'Quitó rol', icono: UserMinus, tono: 'bg-danger/10 text-danger' },
  permisos_rol: { texto: 'Cambió permisos', icono: KeyRound, tono: 'bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  tienda_usuario: { texto: 'Cambió tienda', icono: Store, tono: 'bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  bienvenida: { texto: 'Envió bienvenida', icono: Mail, tono: 'bg-black/5 dark:bg-white/10' },
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Últimos 100 cambios de accesos: quién, qué y cuándo. */
export function HistorialTab() {
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [accion, setAccion] = useState<'' | EventoAuditoria['Accion']>('');
  const [q, setQ] = useState('');
  const filtrados = useMemo(() => {
    const t = sinAcentos(q.trim());
    return (eventos ?? []).filter((e) => (!accion || e.Accion === accion) && (!t || sinAcentos(`${e.Usuario} ${e.Detalle}`).includes(t)));
  }, [eventos, accion, q]);

  useEffect(() => {
    setError(null);
    apiConfig
      .obtenerAuditoria()
      .then(setEventos)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial.'));
  }, [intento]);

  if (error)
    return (
      <GlassCard className="p-0">
        <EstadoVacio icono={History} tono="error" titulo="No se pudo cargar el historial" texto={error} accion={<BotonReintentar onClick={() => setIntento((n) => n + 1)} />} />
      </GlassCard>
    );
  if (!eventos)
    return (
      <GlassCard className="p-0">
        <EsqueletoFilas filas={8} />
      </GlassCard>
    );
  if (eventos.length === 0)
    return (
      <GlassCard className="p-0">
        <EstadoVacio icono={History} titulo="Todavía no hay cambios registrados." texto="Aquí aparecerán los roles asignados o quitados y los permisos cambiados." />
      </GlassCard>
    );

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[14rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <Input className="pl-9" placeholder="Buscar por persona o detalle" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-auto min-w-[12rem]" aria-label="Tipo de cambio" value={accion} onChange={(e) => setAccion(e.target.value as typeof accion)}>
          <option value="">Todos los cambios</option>
          {Object.entries(ACCION).map(([id, a]) => (
            <option key={id} value={id}>
              {a.texto}
            </option>
          ))}
        </Select>
      </GlassCard>
      <GlassCard className="overflow-x-auto p-0">
        {filtrados.length === 0 ? (
          <EstadoVacio icono={Search} titulo="Ningún cambio coincide con el filtro." />
        ) : (
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs opacity-60 dark:border-white/10">
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Quién</th>
                <th className="px-4 py-3 font-semibold">Acción</th>
                <th className="px-4 py-3 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e, i) => {
                const a = ACCION[e.Accion];
                const Icono = a?.icono ?? History;
                return (
                  <tr key={i} className="anim-fila border-b border-black/5 transition-colors last:border-0 hover:bg-brand-500/5 dark:border-white/5" style={{ ['--i' as string]: Math.min(i, 20) }}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs opacity-60">{formatFecha(e.Fecha)}</td>
                    <td className="px-4 py-2.5 font-medium">{e.Usuario}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', a?.tono ?? 'bg-black/5 dark:bg-white/10')}>
                        <Icono size={12} aria-hidden /> {a?.texto ?? e.Accion}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{e.Detalle}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </GlassCard>
    </div>
  );
}
