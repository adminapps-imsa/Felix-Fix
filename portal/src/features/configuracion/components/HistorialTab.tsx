import { formatFecha } from '../../../lib/formatters';
import { useEffect, useState } from 'react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { EventoAuditoria } from '../../../api/configuracion';

const ACCION: Record<EventoAuditoria['Accion'], string> = {
  asignar_rol: 'Asignó rol',
  quitar_rol: 'Quitó rol',
  permisos_rol: 'Cambió permisos',
};

/** Últimos 100 cambios de accesos: quién, qué y cuándo. */
export function HistorialTab() {
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiConfig
      .obtenerAuditoria()
      .then(setEventos)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial.'));
  }, []);

  if (error) return <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>;
  if (!eventos) return <p className="text-sm opacity-60">Cargando historial…</p>;
  if (eventos.length === 0) return <p className="text-sm opacity-60">Todavía no hay cambios registrados.</p>;

  return (
    <GlassCard className="overflow-x-auto p-0">
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
          {eventos.map((e, i) => (
            <tr key={i} className="border-b border-black/5 last:border-0 dark:border-white/5">
              <td className="whitespace-nowrap px-4 py-2.5 opacity-70">{formatFecha(e.Fecha)}</td>
              <td className="px-4 py-2.5 font-medium">{e.Usuario}</td>
              <td className="whitespace-nowrap px-4 py-2.5">{ACCION[e.Accion] || e.Accion}</td>
              <td className="px-4 py-2.5">{e.Detalle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
