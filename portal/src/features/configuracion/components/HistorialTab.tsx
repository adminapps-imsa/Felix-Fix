import { formatFecha } from '../../../lib/formatters';
import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { EsqueletoFilas } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { EventoAuditoria } from '../../../api/configuracion';

const ACCION: Record<EventoAuditoria['Accion'], string> = {
  asignar_rol: 'Asignó rol',
  quitar_rol: 'Quitó rol',
  permisos_rol: 'Cambió permisos',
  bienvenida: 'Envió bienvenida',
};

/** Últimos 100 cambios de accesos: quién, qué y cuándo. */
export function HistorialTab() {
  const [eventos, setEventos] = useState<EventoAuditoria[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

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
            <tr key={i} className="anim-fila border-b border-black/5 transition-colors last:border-0 hover:bg-brand-500/5 dark:border-white/5" style={{ ['--i' as string]: i }}>
              <td className="whitespace-nowrap px-4 py-2.5 text-xs opacity-60">{formatFecha(e.Fecha)}</td>
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
