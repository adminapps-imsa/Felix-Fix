import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  FilterX,
  LogIn,
  PackageX,
  Search,
  Server,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Input, Select } from '../../../components/ui/Input';
import { CampoFecha } from '../../../components/ui/CampoFecha';
import { Pagination } from '../../../components/ui/Pagination';
import { EsqueletoFilas } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { ClaseBitacora, EventoBitacora, FiltrosBitacora, RespuestaBitacora } from '../../../api/configuracion';
import { cn } from '../../../lib/cn';

const ICONO_MODULO: Record<string, LucideIcon> = {
  reclamos: ClipboardList,
  productos_danados: PackageX,
  configuracion: Settings,
  sesion: LogIn,
  sistema: Server,
};

const TZ = 'America/Panama';
const diaIso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hoyIso = () => diaIso(new Date());
const haceDias = (n: number) => diaIso(new Date(Date.now() - n * 86400000));
const HORA = new Intl.DateTimeFormat('es-PA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const DIA_LARGO = new Intl.DateTimeFormat('es-PA', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });

function tituloDia(iso: string) {
  const d = diaIso(new Date(iso));
  if (d === hoyIso()) return 'Hoy';
  if (d === haceDias(1)) return 'Ayer';
  const t = DIA_LARGO.format(new Date(iso));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const RANGOS = [
  { id: 'hoy', texto: 'Hoy', desde: () => hoyIso() },
  { id: '7', texto: '7 días', desde: () => haceDias(6) },
  { id: '30', texto: '30 días', desde: () => haceDias(29) },
] as const;

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

/**
 * Bitácora del portal: lo que hace la gente («Actividad») separado de lo que
 * sale mal («Errores»: avisos al usuario y fallas del sistema). Se filtra por
 * fechas, persona, rol, módulo y texto.
 */
export function BitacoraTab() {
  const [clase, setClase] = useState<ClaseBitacora>('actividad');
  const [desde, setDesde] = useState(haceDias(6));
  const [hasta, setHasta] = useState(hoyIso());
  const [usuario, setUsuario] = useState('');
  const [rol, setRol] = useState('');
  const [modulo, setModulo] = useState('');
  const [nivel, setNivel] = useState<'' | 'aviso' | 'falla'>('');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [datos, setDatos] = useState<RespuestaBitacora | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const filtros: FiltrosBitacora = useMemo(
    () => ({ clase, desde, hasta, usuario, rol, modulo, nivel: clase === 'error' ? nivel : '', q: qDebounced.trim(), page }),
    [clase, desde, hasta, usuario, rol, modulo, nivel, qDebounced, page]
  );

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    apiConfig
      .obtenerBitacora(filtros)
      .then((r) => vivo && setDatos(r))
      .catch((e) => vivo && setError(e instanceof ApiError ? e.message : 'No se pudo cargar la bitácora.'))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [filtros, intento]);

  // Cualquier cambio de filtro vuelve a la página 1.
  const cambiar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    setAbierto(null);
  };
  const rangoActivo = RANGOS.find((r) => r.desde() === desde && hasta === hoyIso())?.id;
  const conFiltros = Boolean(usuario || rol || modulo || nivel || q);
  const limpiar = () => {
    setUsuario('');
    setRol('');
    setModulo('');
    setNivel('');
    setQ('');
    setPage(1);
  };

  // Eventos agrupados por día (Hoy, Ayer, «Jueves 12 de noviembre»).
  const grupos = useMemo(() => {
    const g: { dia: string; eventos: EventoBitacora[] }[] = [];
    for (const e of datos?.data ?? []) {
      const dia = tituloDia(e.fecha);
      if (g.at(-1)?.dia !== dia) g.push({ dia, eventos: [] });
      g.at(-1)!.eventos.push(e);
    }
    return g;
  }, [datos]);

  const r = datos?.resumen;

  return (
    <div className="flex flex-col gap-4">
      {/* Actividad | Errores */}
      <div role="tablist" aria-label="Qué ver" className="grid grid-cols-2 gap-2 sm:flex">
        {(
          [
            { id: 'actividad', texto: 'Actividad', sub: 'Lo que hace la gente', icono: Activity, n: r?.actividad },
            { id: 'error', texto: 'Errores', sub: 'Lo que salió mal', icono: AlertOctagon, n: r?.errores },
          ] as const
        ).map((t) => {
          const activo = clase === t.id;
          const I = t.icono;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => cambiar(setClase)(t.id)}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors sm:min-w-[14rem]',
                activo ? 'glass-card ring-2 ring-brand-500/50' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-xl',
                  t.id === 'error' ? 'bg-danger/10 text-danger' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                )}
              >
                <I size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.texto}</span>
                <span className="block truncate text-xs opacity-60">{t.sub}</span>
              </span>
              <span className={cn('font-display text-2xl font-bold tabular-nums', t.id === 'error' && (t.n ?? 0) > 0 && 'text-danger')}>{t.n ?? '—'}</span>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <GlassCard className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium opacity-70">Periodo</span>
            <div className="flex gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
              {RANGOS.map((rg) => (
                <button
                  key={rg.id}
                  type="button"
                  onClick={() => {
                    setDesde(rg.desde());
                    setHasta(hoyIso());
                    setPage(1);
                  }}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', rangoActivo === rg.id ? 'bg-white shadow-sm dark:bg-white/15' : 'opacity-70 hover:opacity-100')}
                >
                  {rg.texto}
                </button>
              ))}
            </div>
          </div>
          <label className="flex min-w-[8.75rem] flex-col gap-1">
            <span className="text-xs font-medium opacity-70">Desde</span>
            <CampoFecha aria-label="Desde" value={desde} max={hasta || undefined} onChange={cambiar(setDesde)} />
          </label>
          <label className="flex min-w-[8.75rem] flex-col gap-1">
            <span className="text-xs font-medium opacity-70">Hasta</span>
            <CampoFecha aria-label="Hasta" value={hasta} min={desde || undefined} onChange={cambiar(setHasta)} />
          </label>
          <div className="relative min-w-[14rem] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <Input className="pl-9" placeholder="Buscar acción, mensaje, REC-000044, persona…" value={q} onChange={(e) => cambiar(setQ)(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select aria-label="Persona" value={usuario} onChange={(e) => cambiar(setUsuario)(e.target.value)}>
            <option value="">Todas las personas</option>
            {datos?.filtros.usuarios.map((u) => (
              <option key={u.usuario} value={u.usuario}>
                {u.nombre}
              </option>
            ))}
          </Select>
          <Select aria-label="Rol" value={rol} onChange={(e) => cambiar(setRol)(e.target.value)}>
            <option value="">Todos los roles</option>
            {datos?.filtros.roles.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
          <Select aria-label="Módulo" value={modulo} onChange={(e) => cambiar(setModulo)(e.target.value)}>
            <option value="">Todos los módulos</option>
            {datos?.filtros.modulos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </Select>
          {clase === 'error' ? (
            <Select aria-label="Tipo de error" value={nivel} onChange={(e) => cambiar(setNivel)(e.target.value as typeof nivel)}>
              <option value="">Todos los errores ({r?.errores ?? 0})</option>
              <option value="aviso">Avisos al usuario ({r?.avisos ?? 0})</option>
              <option value="falla">Fallas del sistema ({r?.fallas ?? 0})</option>
            </Select>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>

        {/* Por módulo: cuánto hay en cada uno; tocar uno filtra. */}
        {r && (
          <div className="flex flex-wrap items-center gap-2">
            {datos!.filtros.modulos
              .filter((m) => (r.porModulo[m.id] ?? 0) > 0 || modulo === m.id)
              .map((m) => {
                const I = ICONO_MODULO[m.id] ?? Activity;
                const activo = modulo === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => cambiar(setModulo)(activo ? '' : m.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                      activo ? 'bg-brand-500 text-white' : 'bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.12]'
                    )}
                  >
                    <I size={13} aria-hidden /> {m.nombre}
                    <span className="tabular-nums opacity-70">{r.porModulo[m.id] ?? 0}</span>
                  </button>
                );
              })}
            {conFiltros && (
              <button type="button" onClick={limpiar} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                <FilterX size={13} /> Quitar filtros
              </button>
            )}
          </div>
        )}
      </GlassCard>

      {/* Lista */}
      {error ? (
        <GlassCard className="p-0">
          <EstadoVacio icono={AlertOctagon} tono="error" titulo="No se pudo cargar la bitácora" texto={error} accion={<BotonReintentar onClick={() => setIntento((n) => n + 1)} />} />
        </GlassCard>
      ) : !datos ? (
        <GlassCard className="p-0">
          <EsqueletoFilas filas={8} />
        </GlassCard>
      ) : datos.data.length === 0 ? (
        <GlassCard className="p-0">
          <EstadoVacio
            icono={clase === 'error' ? AlertOctagon : Activity}
            titulo={clase === 'error' ? 'Sin errores en este periodo.' : 'Sin actividad en este periodo.'}
            texto={conFiltros ? 'Prueba quitando algún filtro.' : 'La bitácora empezó a registrar el 13 de noviembre de 2026.'}
          />
        </GlassCard>
      ) : (
        <div className={cn('flex flex-col gap-4 transition-opacity', cargando && 'opacity-60')} aria-busy={cargando || undefined}>
          {grupos.map((g) => (
            <section key={g.dia} className="flex flex-col gap-2">
              <h3 className="sticky top-0 z-[1] px-1 text-xs font-semibold uppercase tracking-wider opacity-55">{g.dia}</h3>
              <GlassCard className="divide-y divide-black/5 p-0 dark:divide-white/5">
                {g.eventos.map((e) => (
                  <Fila key={e.id} e={e} clase={clase} abierto={abierto === e.id} onToggle={() => setAbierto((a) => (a === e.id ? null : e.id))} />
                ))}
              </GlassCard>
            </section>
          ))}
          <Pagination meta={datos.pagination} onPageChange={(p) => (setPage(p), setAbierto(null))} />
        </div>
      )}
    </div>
  );
}

function Fila({ e, clase, abierto, onToggle }: { e: EventoBitacora; clase: ClaseBitacora; abierto: boolean; onToggle: () => void }) {
  const I = ICONO_MODULO[e.modulo] ?? Activity;
  const nombre = e.usuarioNombre || e.usuario || (e.modulo === 'sistema' ? 'Sistema' : 'Sin sesión');
  const falla = e.nivel === 'falla';
  return (
    <div className={cn('transition-colors', abierto && 'bg-brand-500/[0.04]')}>
      <button type="button" onClick={onToggle} aria-expanded={abierto} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-brand-500/[0.05]">
        <span className="w-[4.5rem] shrink-0 pt-0.5 text-xs tabular-nums opacity-55">{HORA.format(new Date(e.fecha))}</span>
        <span
          aria-hidden
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold',
            e.usuario ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300' : 'bg-black/[0.06] dark:bg-white/10'
          )}
        >
          {e.usuario ? iniciales(nombre) : <Server size={14} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {clase === 'error' && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                  falla ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'
                )}
              >
                {falla ? <AlertOctagon size={11} /> : <AlertTriangle size={11} />}
                {falla ? 'Falla' : 'Aviso'}
              </span>
            )}
            <span className="font-semibold">{e.accion}</span>
            {e.caso &&
              (e.casoRuta ? (
                <Link
                  to={e.casoRuta}
                  onClick={(ev) => ev.stopPropagation()}
                  className="numero-caso rounded-md bg-black/[0.05] px-1.5 py-0.5 text-xs hover:bg-brand-500/15 dark:bg-white/[0.08]"
                >
                  {e.caso}
                </Link>
              ) : (
                <span className="numero-caso rounded-md bg-black/[0.05] px-1.5 py-0.5 text-xs dark:bg-white/[0.08]">{e.caso}</span>
              ))}
          </span>
          {clase === 'error' && e.mensaje && <span className={cn('mt-0.5 block text-sm', !abierto && 'line-clamp-2', falla ? 'text-danger' : 'opacity-80')}>{e.mensaje}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-65">
            <span className="font-medium">{nombre}</span>
            {e.roles.map((r) => (
              <span key={r} className="rounded-full bg-black/[0.05] px-1.5 py-px text-[11px] dark:bg-white/[0.08]">
                {r}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              · <I size={12} aria-hidden /> {e.moduloNombre}
            </span>
          </span>
        </span>
        <ChevronDown size={16} className={cn('mt-1 shrink-0 opacity-40 transition-transform', abierto && 'rotate-180')} aria-hidden />
      </button>
      {abierto && (
        <dl className="anim-aparecer grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 pb-3 pl-[7.75rem] text-xs">
          {e.usuario && (
            <>
              <dt className="opacity-55">Usuario</dt>
              <dd className="font-mono">{e.usuario}</dd>
            </>
          )}
          {e.mensaje && (
            <>
              <dt className="opacity-55">Mensaje</dt>
              <dd className="whitespace-pre-line">{e.mensaje}</dd>
            </>
          )}
          {e.codigo && (
            <>
              <dt className="opacity-55">Código</dt>
              <dd className="font-mono">{e.codigo}</dd>
            </>
          )}
          {e.ruta && (
            <>
              <dt className="opacity-55">Petición</dt>
              <dd className="break-all font-mono">
                {e.metodo} /api{e.ruta}
                {e.estado != null && <span className={cn('ml-2 font-semibold', e.estado >= 500 ? 'text-danger' : e.estado >= 400 ? 'text-warning' : 'text-success')}>{e.estado}</span>}
                {e.duracionMs != null && <span className="ml-2 opacity-60">{e.duracionMs < 1000 ? `${e.duracionMs} ms` : `${(e.duracionMs / 1000).toFixed(1)} s`}</span>}
              </dd>
            </>
          )}
          <dt className="opacity-55">Fecha</dt>
          <dd>{new Intl.DateTimeFormat('es-PA', { timeZone: TZ, dateStyle: 'full', timeStyle: 'medium' }).format(new Date(e.fecha))}</dd>
        </dl>
      )}
    </div>
  );
}
