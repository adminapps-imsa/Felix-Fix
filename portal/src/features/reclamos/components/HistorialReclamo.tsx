import { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  FileSpreadsheet,
  History,
  Landmark,
  ListChecks,
  Paperclip,
  Send,
  Truck,
  Undo2,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { EsqueletoFilas } from '../../../components/ui/Esqueleto';
import { BotonReintentar } from '../../../components/ui/EstadoVacio';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { cn } from '../../../lib/cn';
import type { EventoHistorial, HistorialReclamo as Historial } from '../../../types/reclamo';

const TZ = 'America/Panama';
const FECHA = new Intl.DateTimeFormat('es-PA', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const HORA = new Intl.DateTimeFormat('es-PA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

const ICONO: Record<EventoHistorial['tipo'], { icono: LucideIcon; tono: string }> = {
  creado: { icono: FilePlus2, tono: 'bg-brand-500/15 text-brand-600 dark:text-brand-400' },
  devuelto: { icono: Undo2, tono: 'bg-warning/15 text-warning' },
  reenviado: { icono: Send, tono: 'bg-brand-500/15 text-brand-600 dark:text-brand-400' },
  decision: { icono: CheckCircle2, tono: 'bg-success/15 text-success' },
  productos: { icono: ListChecks, tono: 'bg-success/15 text-success' },
  excel: { icono: FileSpreadsheet, tono: 'bg-brand-500/15 text-brand-600 dark:text-brand-400' },
  contabilidad: { icono: Landmark, tono: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  retiro: { icono: Truck, tono: 'bg-success/15 text-success' },
  adjunto: { icono: Paperclip, tono: 'bg-black/[0.06] dark:bg-white/10' },
  otro: { icono: Activity, tono: 'bg-black/[0.06] dark:bg-white/10' },
  error: { icono: AlertTriangle, tono: 'bg-danger/15 text-danger' },
};

/** «45 s», «12 min», «3 h 20 min», «2 d 5 h». */
export function duracion(ms: number | null | undefined) {
  if (ms == null || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/**
 * Historial del reclamo (administrador y supervisor GOF): qué pasó, quién,
 * cuándo y cuánto tardó cada paso. Cerrado de inicio; cada paso se abre
 * para ver el detalle (motivo, mensaje del error).
 */
export function HistorialReclamo({ token }: { token: string }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Historial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [paso, setPaso] = useState<number | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setError(null);
    apiReclamos
      .obtenerHistorial(token)
      .then((h) => vivo && setDatos(h))
      .catch((e) => vivo && setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial.'));
    return () => {
      vivo = false;
    };
  }, [abierto, token, intento]);

  const r = datos?.resumen;
  return (
    <GlassCard className="flex flex-col gap-0 p-0">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <History size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">Historial</span>
          <span className="block text-xs opacity-60">
            {r
              ? [
                  `${r.total} paso(s) en ${duracion(r.duracionMs)}`,
                  r.vecesDevuelto ? `devuelto ${r.vecesDevuelto} vez/veces · ${duracion(r.esperaArregloMs)} en espera de arreglo` : null,
                  r.errores ? `${r.errores} error(es)` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Qué pasó, quién, cuándo y cuánto tardó cada paso · solo administrador y supervisor GOF'}
          </span>
        </span>
        <ChevronDown size={18} className={cn('shrink-0 opacity-50 transition-transform', abierto && 'rotate-180')} aria-hidden />
      </button>

      {abierto && (
        <div className="anim-aparecer border-t border-black/5 px-5 pb-5 pt-3 dark:border-white/5">
          {error ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
              <BotonReintentar onClick={() => setIntento((n) => n + 1)} />
            </div>
          ) : !datos ? (
            <EsqueletoFilas filas={4} />
          ) : (
            <>
              {r?.enArregloDesde && (
                <p className="mb-3 rounded-xl bg-warning/10 px-3 py-2 text-sm">
                  <strong className="font-semibold">En espera de arreglo</strong> desde hace {duracion(Date.now() - new Date(r.enArregloDesde).getTime())}.
                </p>
              )}
              <ol className="relative flex flex-col">
                {datos.eventos.map((e, i) => {
                  const { icono: I, tono } = e.error === 'aviso' ? { icono: AlertTriangle, tono: 'bg-warning/15 text-warning' } : e.error ? { icono: AlertOctagon, tono: ICONO.error.tono } : ICONO[e.tipo] ?? ICONO.otro;
                  const ultimo = i === datos.eventos.length - 1;
                  const conDetalle = Boolean(e.detalle);
                  const abiertoPaso = paso === i;
                  return (
                    <li key={i} className="relative flex gap-3 pb-1">
                      {/* Línea que une los pasos */}
                      {!ultimo && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-black/10 dark:bg-white/10" />}
                      <span className={cn('z-[1] mt-1 grid size-8 shrink-0 place-items-center rounded-full', tono)}>
                        <I size={15} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 pb-3">
                        <button
                          type="button"
                          disabled={!conDetalle}
                          onClick={() => setPaso((p) => (p === i ? null : i))}
                          aria-expanded={conDetalle ? abiertoPaso : undefined}
                          className={cn('flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left', conDetalle && 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]')}
                        >
                          <span className="min-w-0 flex-1">
                            <span className={cn('block text-sm font-semibold', e.error === 'falla' && 'text-danger')}>
                              {e.error && <span className="mr-1.5 text-[11px] font-bold uppercase">{e.error === 'falla' ? 'Falla' : 'Aviso'}</span>}
                              {e.titulo}
                            </span>
                            <span className="block text-xs opacity-65">
                              {FECHA.format(new Date(e.fecha))} · {HORA.format(new Date(e.fecha))}
                              {e.usuarioNombre && ` · ${e.usuarioNombre}`}
                            </span>
                          </span>
                          {e.desdeAnterior != null && (
                            <span className="shrink-0 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] tabular-nums dark:bg-white/[0.08]" title="Tiempo desde el paso anterior">
                              +{duracion(e.desdeAnterior)}
                            </span>
                          )}
                          {conDetalle && <ChevronDown size={14} className={cn('mt-1 shrink-0 opacity-40 transition-transform', abiertoPaso && 'rotate-180')} aria-hidden />}
                        </button>
                        {abiertoPaso && e.detalle && (
                          <p className="anim-aparecer mx-1 mt-1 whitespace-pre-line rounded-lg bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.05]">{e.detalle}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-1 text-xs opacity-50">Lo de antes del 13 de noviembre de 2026 sale de los datos del reclamo; desde esa fecha, también de la Bitácora.</p>
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}
