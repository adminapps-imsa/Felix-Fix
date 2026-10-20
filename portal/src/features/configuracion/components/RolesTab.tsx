import { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Save, ShieldCheck, Undo2, Users } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { Esqueleto } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { PermisoDef, RolConfig } from '../../../api/configuracion';
import { nombreRol } from '../../../lib/roles';
import { cn } from '../../../lib/cn';

const iguales = (a: Set<string>, b: string[]) => a.size === b.length && b.every((p) => a.has(p));

/**
 * Roles y permisos en dos partes: a la izquierda la lista de roles (corta,
 * con cuántas personas y permisos tiene cada uno) y a la derecha el rol
 * elegido con sus permisos por módulo. Los cambios de cada rol se guardan
 * por separado; si se cambia de rol sin guardar, quedan pendientes (punto).
 */
export function RolesTab() {
  const [permisos, setPermisos] = useState<PermisoDef[]>([]);
  const [roles, setRoles] = useState<RolConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  // Selección en edición de cada rol (solo de los que se tocaron).
  const [borradores, setBorradores] = useState<Map<string, Set<string>>>(new Map());
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    setError(null);
    apiConfig
      .obtenerRoles()
      .then((r) => {
        setPermisos(r.permisos);
        setRoles(r.roles);
        // Primero el primer rol que se puede editar (el Administrador no).
        setElegido((e) => e ?? (r.roles.find((x) => !x.superAdmin) ?? r.roles[0])?.nombre ?? null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los roles.'));
  }, [intento]);

  const modulos = useMemo(() => {
    const m = new Map<string, PermisoDef[]>();
    for (const p of permisos) m.set(p.modulo, [...(m.get(p.modulo) || []), p]);
    return [...m.entries()];
  }, [permisos]);

  if (error)
    return (
      <GlassCard className="p-0">
        <EstadoVacio icono={KeyRound} tono="error" titulo="No se pudieron cargar los roles" texto={error} accion={<BotonReintentar onClick={() => setIntento((n) => n + 1)} />} />
      </GlassCard>
    );
  if (!roles) return <EsqueletoRoles />;

  const rol = roles.find((r) => r.nombre === elegido) ?? roles[0];
  const pendiente = (r: RolConfig) => {
    const b = borradores.get(r.nombre);
    return Boolean(b && !iguales(b, r.permisos));
  };
  const seleccion = borradores.get(rol.nombre) ?? new Set(rol.permisos);
  const setSeleccion = (s: Set<string>) => setBorradores((m) => new Map(m).set(rol.nombre, s));
  const descartar = (nombre: string) =>
    setBorradores((m) => {
      const n = new Map(m);
      n.delete(nombre);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-70">
        Los roles se crean en Keycloak (cliente <span className="font-mono">fix-descarte</span>) y aparecen aquí solos. Elige un rol para ver y
        cambiar lo que puede hacer. Cualquier permiso de un módulo incluye poder verlo.
      </p>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Lista de roles: columna en escritorio, fila deslizable en celular. */}
        <nav aria-label="Roles" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {roles.map((r) => {
              const activo = r.nombre === rol.nombre;
              const n = r.superAdmin ? null : (borradores.get(r.nombre) ?? new Set(r.permisos)).size;
              return (
                <li key={r.nombre} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setElegido(r.nombre)}
                    aria-current={activo ? 'true' : undefined}
                    className={cn(
                      'glass-card flex w-full min-w-44 items-center gap-3 px-3.5 py-3 text-left transition-[box-shadow,background-color]',
                      activo ? 'ring-2 ring-brand-500/60' : 'hover:shadow-[var(--glass-shadow-hover)]'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        {r.superAdmin && <ShieldCheck size={15} className="shrink-0 text-brand-500" aria-hidden />}
                        <span className="truncate">{nombreRol(r.nombre)}</span>
                        {pendiente(r) && <span className="size-2 shrink-0 rounded-full bg-brand-500" title="Cambios sin guardar" aria-label="Cambios sin guardar" />}
                      </span>
                      <span className="block truncate text-xs opacity-60">
                        {r.superAdmin ? 'Todos los permisos' : `${n} ${n === 1 ? 'permiso' : 'permisos'}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold dark:bg-white/10" title="Personas con este rol">
                      <Users size={12} aria-hidden /> {r.usuarios}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <EditorRol
          key={rol.nombre}
          rol={rol}
          modulos={modulos}
          seleccion={seleccion}
          onCambiar={setSeleccion}
          onDescartar={() => descartar(rol.nombre)}
          onGuardado={(r) => {
            setRoles(r);
            descartar(rol.nombre);
          }}
        />
      </div>
    </div>
  );
}

function EditorRol({
  rol,
  modulos,
  seleccion,
  onCambiar,
  onDescartar,
  onGuardado,
}: {
  rol: RolConfig;
  modulos: [string, PermisoDef[]][];
  seleccion: Set<string>;
  onCambiar: (s: Set<string>) => void;
  onDescartar: () => void;
  onGuardado: (roles: RolConfig[]) => void;
}) {
  const [guardando, setGuardando] = useState(false);
  // Solo los errores quedan escritos en la barra; el «Guardado» va en un aviso flotante.
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  // Palomita breve en «Guardar» al terminar (la barra se queda ese rato y luego se va).
  const [listo, setListo] = useState(false);
  const avisos = useAvisos();
  const cambiado = !iguales(seleccion, rol.permisos);

  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => setListo(false), 1500);
    return () => clearTimeout(t);
  }, [listo]);

  const alternar = (codigo: string) => {
    const n = new Set(seleccion);
    if (n.has(codigo)) n.delete(codigo);
    else n.add(codigo);
    onCambiar(n);
    setMensaje(null);
  };
  const todos = (lista: PermisoDef[], marcar: boolean) => {
    const n = new Set(seleccion);
    for (const p of lista) {
      if (marcar) n.add(p.codigo);
      else n.delete(p.codigo);
    }
    onCambiar(n);
    setMensaje(null);
  };

  const guardar = async () => {
    // Durante la palomita el botón no se ve apagado, pero sin cambios no guarda nada.
    if (!cambiado) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await apiConfig.guardarPermisosRol(rol.nombre, [...seleccion]);
      onGuardado(r.roles);
      setListo(true);
      avisos.ok(`Permisos de ${nombreRol(rol.nombre)} guardados. Aplican a sus usuarios en menos de un minuto.`);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <GlassCard className="flex min-w-0 flex-col gap-5 !p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            {rol.superAdmin && <ShieldCheck size={18} className="text-brand-500" aria-hidden />}
            {nombreRol(rol.nombre)}
          </h2>
          {rol.descripcion && <p className="text-sm opacity-60">{rol.descripcion}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/5 px-3 py-1 text-sm font-semibold dark:bg-white/10">
          <Users size={14} aria-hidden /> {rol.usuarios} {rol.usuarios === 1 ? 'persona' : 'personas'}
        </span>
      </div>

      {rol.superAdmin ? (
        <p className="mx-5 mb-5 rounded-xl bg-brand-500/10 px-4 py-3 text-sm sm:mx-6">
          Super administrador: tiene <strong>todos los permisos</strong>, incluidos los que se agreguen en el futuro. No se puede limitar.
          <br />
          <span className="opacity-80">Es el único rol que ve y usa Configuración.</span>
        </p>
      ) : (
        <div className="flex flex-col gap-6 px-5 pb-5 sm:px-6">
          {modulos.map(([modulo, lista]) => {
            const marcados = lista.filter((p) => seleccion.has(p.codigo)).length;
            return (
              <fieldset key={modulo} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="flex items-center gap-2 font-semibold">
                    {modulo}
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold opacity-70 dark:bg-white/10">
                      {marcados} de {lista.length}
                    </span>
                  </legend>
                  <span className="flex gap-1 text-xs font-semibold">
                    <button type="button" onClick={() => todos(lista, true)} disabled={marcados === lista.length} className="rounded-full px-2.5 py-1 text-brand-600 hover:bg-brand-500/10 disabled:opacity-35 dark:text-brand-400">
                      Marcar todo
                    </button>
                    <button type="button" onClick={() => todos(lista, false)} disabled={marcados === 0} className="rounded-full px-2.5 py-1 opacity-70 hover:bg-black/5 hover:opacity-100 disabled:opacity-35 dark:hover:bg-white/10">
                      Quitar todo
                    </button>
                  </span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {lista.map((p) => (
                    <Permiso key={p.codigo} permiso={p} activo={seleccion.has(p.codigo)} onAlternar={() => alternar(p.codigo)} />
                  ))}
                </div>
              </fieldset>
            );
          })}
          {seleccion.size === 0 && <p className="text-sm opacity-60">Sin permisos: quien tenga solo este rol no verá nada en el portal.</p>}
        </div>
      )}

      {/* Barra de guardado: fija abajo mientras hay cambios, para no tener que bajar a buscarla. */}
      {!rol.superAdmin && (cambiado || mensaje || listo) && (
        <div className="anim-aparecer sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-[var(--radius-card)] border-t border-black/10 bg-[var(--glass-bg)] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 dark:border-white/10">
          {mensaje ? (
            <span className={cn('mr-auto text-sm', mensaje.tipo === 'ok' ? 'text-success' : 'text-danger')}>{mensaje.texto}</span>
          ) : listo && !cambiado ? (
            <span className="mr-auto text-sm text-success">Guardado.</span>
          ) : (
            <span className="mr-auto text-sm opacity-70">Tienes cambios sin guardar en {nombreRol(rol.nombre)}.</span>
          )}
          {(cambiado || listo) && (
            <>
              {cambiado && (
                <Button variant="ghost" disabled={guardando} onClick={onDescartar}>
                  <Undo2 size={15} /> Deshacer
                </Button>
              )}
              <Button estado={guardando ? 'cargando' : listo && !cambiado ? 'listo' : null} disabled={!cambiado && !listo} onClick={guardar}>
                <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}

/** Un permiso como interruptor: nombre arriba y para qué sirve debajo, en gris. */
function Permiso({ permiso, activo, onAlternar }: { permiso: PermisoDef; activo: boolean; onAlternar: () => void }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors',
        activo ? 'border-brand-500/40 bg-brand-500/[0.06]' : 'border-black/10 hover:bg-black/[0.02] dark:border-white/10 dark:hover:bg-white/[0.03]'
      )}
    >
      <input type="checkbox" role="switch" className="peer sr-only" checked={activo} onChange={onAlternar} />
      {/* Interruptor dibujado (el input real está oculto pero es el que recibe teclado y lector de pantalla). */}
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2',
          activo ? 'bg-brand-500 dark:bg-brand-400' : 'bg-black/15 dark:bg-white/20'
        )}
      >
        <span className={cn('grid size-4 place-items-center rounded-full bg-white shadow transition-transform duration-150', activo ? 'translate-x-[18px]' : 'translate-x-0.5')}>
          {activo && <Check size={10} strokeWidth={3} className="text-brand-600" />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block font-semibold leading-snug">{permiso.nombre}</span>
        <span className="mt-0.5 block text-xs leading-snug opacity-60">{permiso.descripcion}</span>
      </span>
    </label>
  );
}

/** Roles mientras cargan: la lista a la izquierda y el editor con sus interruptores. */
function EsqueletoRoles() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-4">
      <Esqueleto className="h-3.5 w-full max-w-2xl" />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex gap-2 overflow-hidden lg:flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <Esqueleto key={i} className="h-[60px] w-44 shrink-0 rounded-[var(--radius-card)] lg:w-full" />
          ))}
        </div>
        <GlassCard className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Esqueleto className="h-5 w-40" />
              <Esqueleto className="h-3.5 w-56" />
            </div>
            <Esqueleto className="h-7 w-24 rounded-full" />
          </div>
          {[0, 1].map((m) => (
            <div key={m} className="flex flex-col gap-3">
              <Esqueleto className="h-4 w-36" />
              <div className="grid gap-2 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <Esqueleto key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </GlassCard>
      </div>
    </div>
  );
}
