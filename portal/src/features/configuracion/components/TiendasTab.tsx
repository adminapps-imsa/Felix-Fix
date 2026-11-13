import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Store, UserRound, Users } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Esqueleto } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { useAvisos } from '../../../components/ui/Avisos';
import { Input, Select } from '../../../components/ui/Input';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { TiendaConfig, UsuarioTienda } from '../../../api/configuracion';
import { nombreRol } from '../../../lib/roles';
import { cn } from '../../../lib/cn';
import { useAuth } from '../../../auth/useAuth';
import { P } from '../../../auth/permisos';

/** Qué grupo de la fila de arriba se está viendo. */
type Filtro = 'todos' | 'sin' | 'propios' | number;

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Tiendas: en qué tienda está cada persona. Quien está en una tienda ve solo
 * lo de esa tienda (Productos dañados y Reclamos) y solo crea casos de ella.
 * «Solo lo que crea»: además ve solo los casos que registró él mismo.
 * Cada cambio se guarda al momento, como los roles en Usuarios.
 */
export function TiendasTab() {
  const [tiendas, setTiendas] = useState<TiendaConfig[] | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioTienda[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [recien, setRecien] = useState<string | null>(null);
  const avisos = useAvisos();
  const esAdmin = useAuth().puede(P.config);

  useEffect(() => {
    setError(null);
    apiConfig
      .obtenerTiendas()
      .then((r) => {
        setTiendas(r.tiendas);
        setUsuarios(r.usuarios);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar las tiendas.'));
  }, [intento]);

  // Palomita breve en la fila recién guardada.
  useEffect(() => {
    if (!recien) return;
    const t = setTimeout(() => setRecien(null), 1500);
    return () => clearTimeout(t);
  }, [recien]);

  const conteo = useMemo(() => {
    const porTienda = new Map<number, number>();
    for (const u of usuarios) if (u.tiendaId != null) porTienda.set(u.tiendaId, (porTienda.get(u.tiendaId) || 0) + 1);
    return { porTienda, sin: usuarios.filter((u) => u.tiendaId == null).length, propios: usuarios.filter((u) => u.soloPropios).length };
  }, [usuarios]);

  const visibles = useMemo(() => {
    const texto = sinAcentos(q.trim());
    return usuarios.filter((u) => {
      if (filtro === 'sin' && u.tiendaId != null) return false;
      if (filtro === 'propios' && !u.soloPropios) return false;
      if (typeof filtro === 'number' && u.tiendaId !== filtro) return false;
      return !texto || [u.nombre, u.username, u.email ?? ''].some((v) => sinAcentos(v).includes(texto));
    });
  }, [usuarios, filtro, q]);

  if (error)
    return (
      <GlassCard className="p-0">
        <EstadoVacio icono={Store} tono="error" titulo="No se pudieron cargar las tiendas" texto={error} accion={<BotonReintentar onClick={() => setIntento((n) => n + 1)} />} />
      </GlassCard>
    );
  if (!tiendas) return <EsqueletoTiendas />;

  const nombreTienda = (id: number | null) => (id == null ? 'Todas las tiendas' : tiendas.find((t) => t.TiendaId === id)?.Nombre ?? 'Tienda');

  const guardar = async (u: UsuarioTienda, cambios: Partial<Pick<UsuarioTienda, 'tiendaId' | 'soloPropios'>>) => {
    const nuevo = { tiendaId: u.tiendaId, soloPropios: u.soloPropios, ...cambios };
    setGuardando(u.id);
    try {
      await apiConfig.guardarTiendaUsuario(u.id, nuevo);
      setUsuarios((lista) => lista.map((x) => (x.id === u.id ? { ...x, ...nuevo } : x)));
      setRecien(u.id);
      avisos.ok(
        'tiendaId' in cambios
          ? `${u.nombre}: ${nombreTienda(nuevo.tiendaId)}.`
          : nuevo.soloPropios
            ? `${u.nombre} ahora ve solo lo que crea.`
            : `${u.nombre} ya no está limitado a lo que crea.`
      );
    } catch (e) {
      avisos.error(e instanceof ApiError ? e.message : 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(null);
    }
  };

  const chips: { id: Filtro; titulo: string; detalle?: string; n: number; icono?: typeof Store }[] = [
    { id: 'todos', titulo: 'Todos', n: usuarios.length, icono: Users },
    ...tiendas.map((t) => ({ id: t.TiendaId as Filtro, titulo: t.Nombre, detalle: t.Codigo, n: conteo.porTienda.get(t.TiendaId) || 0, icono: Store })),
    { id: 'sin', titulo: 'Sin tienda', detalle: 'ven todas', n: conteo.sin },
    { id: 'propios', titulo: 'Solo lo que crea', n: conteo.propios, icono: UserRound },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Cómo funciona, en dos reglas. */}
      <div className="grid gap-3 md:grid-cols-2">
        <Regla icono={Store} titulo="Tienda">
          Quien está en una tienda ve <strong>solo lo de esa tienda</strong> en Productos dañados y Reclamos (los de MP no ven los de VE), y solo
          crea casos de ella. Los reclamos de CEDI no los ve. Sin tienda, ve todas.
        </Regla>
        <Regla icono={UserRound} titulo="Solo lo que crea">
          Además, ve <strong>solo los casos que registró él mismo</strong>: lista, detalle, tarjetas y Tablero. Sirve con o sin tienda.
        </Regla>
      </div>

      {/* Tiendas como filtro: cuántas personas tiene cada una. */}
      <div role="radiogroup" aria-label="Ver personas de" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => {
          const activo = filtro === c.id;
          const Icono = c.icono;
          return (
            <button
              key={String(c.id)}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setFiltro(c.id)}
              className={cn(
                'glass-card flex shrink-0 items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-[box-shadow,background-color]',
                activo ? 'ring-2 ring-brand-500/60' : 'hover:shadow-[var(--glass-shadow-hover)]'
              )}
            >
              {Icono && <Icono size={15} className={cn('shrink-0', activo ? 'text-brand-500' : 'opacity-50')} aria-hidden />}
              <span className="min-w-0">
                <span className="block whitespace-nowrap font-semibold leading-tight">{c.titulo}</span>
                {c.detalle && <span className="block whitespace-nowrap text-[11px] leading-tight opacity-55">{c.detalle}</span>}
              </span>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold tabular-nums dark:bg-white/10">{c.n}</span>
            </button>
          );
        })}
      </div>

      <GlassCard className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <Input className="pl-9" placeholder="Buscar por nombre, usuario o correo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-xs opacity-60">{esAdmin ? 'Solo personas con algún rol del portal.' : 'Solo personas con rol Gof.'}</span>
      </GlassCard>

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs opacity-60 dark:border-white/10">
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="w-64 px-3 py-3 font-semibold">Tienda</th>
              <th className="w-40 px-3 py-3 text-center font-semibold">Solo lo que crea</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <EstadoVacio
                    icono={Search}
                    titulo={q.trim() ? 'Nadie coincide con la búsqueda.' : 'No hay personas en este grupo.'}
                    texto={typeof filtro === 'number' ? 'Elige «Todos» y asigna la tienda desde la columna Tienda.' : undefined}
                  />
                </td>
              </tr>
            ) : (
              visibles.map((u, i) => {
                const ocupado = guardando === u.id;
                return (
                  <tr
                    key={u.id}
                    className="anim-fila border-b border-black/5 transition-colors last:border-0 hover:bg-brand-500/5 dark:border-white/5"
                    style={{ ['--i' as string]: Math.min(i, 20) }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-semibold">
                        {u.nombre}
                        {!u.activo && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold opacity-70 dark:bg-white/10">Inactivo</span>}
                        {ocupado && <Loader2 size={14} className="animate-spin opacity-60" aria-label="Guardando" />}
                        {recien === u.id && !ocupado && <Check size={15} className="text-success" aria-label="Guardado" />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="opacity-60">{u.username}</span>
                        {u.roles.map((r) => (
                          <span key={r} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium opacity-80 dark:bg-white/10">
                            {nombreRol(r)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        aria-label={`Tienda de ${u.nombre}`}
                        value={u.tiendaId ?? ''}
                        disabled={ocupado}
                        onChange={(e) => guardar(u, { tiendaId: e.target.value ? Number(e.target.value) : null })}
                        className={cn(u.tiendaId != null && 'border-brand-500/40 bg-brand-500/[0.06] font-semibold')}
                      >
                        <option value="">Todas las tiendas</option>
                        {tiendas.map((t) => (
                          <option key={t.TiendaId} value={t.TiendaId}>
                            {t.Nombre} ({t.Codigo})
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Interruptor
                        etiqueta={`Solo lo que crea: ${u.nombre}`}
                        activo={u.soloPropios}
                        disabled={ocupado}
                        onCambiar={() => guardar(u, { soloPropios: !u.soloPropios })}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </GlassCard>

      <p className="text-xs opacity-60">
        Los cambios se guardan al momento y aplican en menos de un minuto, sin volver a iniciar sesión. El Administrador siempre ve todo.
      </p>
    </div>
  );
}

function Regla({ icono: Icono, titulo, children }: { icono: typeof Store; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-black/10 bg-white/40 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
        <Icono size={16} aria-hidden />
      </span>
      <div>
        <div className="font-semibold">{titulo}</div>
        <p className="mt-0.5 leading-snug opacity-75">{children}</p>
      </div>
    </div>
  );
}

/** Interruptor accesible (checkbox con role="switch"), igual al de Roles y permisos. */
function Interruptor({ etiqueta, activo, disabled, onCambiar }: { etiqueta: string; activo: boolean; disabled?: boolean; onCambiar: () => void }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center', disabled && 'cursor-wait opacity-60')}>
      <input type="checkbox" role="switch" aria-label={etiqueta} className="peer sr-only" checked={activo} disabled={disabled} onChange={onCambiar} />
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2',
          activo ? 'bg-brand-500 dark:bg-brand-400' : 'bg-black/15 dark:bg-white/20'
        )}
      >
        <span className={cn('grid size-4 place-items-center rounded-full bg-white shadow transition-transform duration-150', activo ? 'translate-x-[18px]' : 'translate-x-0.5')}>
          {activo && <Check size={10} strokeWidth={3} className="text-brand-600" />}
        </span>
      </span>
    </label>
  );
}

function EsqueletoTiendas() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Esqueleto className="h-20 rounded-[var(--radius-card)]" />
        <Esqueleto className="h-20 rounded-[var(--radius-card)]" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Esqueleto key={i} className="h-12 w-32 shrink-0 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <GlassCard className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="flex-1">
              <Esqueleto className="h-3.5 w-44" />
              <Esqueleto className="mt-2 h-3 w-28" />
            </div>
            <Esqueleto className="h-9 w-56 rounded-xl" />
            <Esqueleto className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </GlassCard>
    </div>
  );
}
