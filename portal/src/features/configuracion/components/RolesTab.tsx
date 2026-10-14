import { useEffect, useMemo, useState } from 'react';
import { Save, ShieldCheck, Undo2, Users } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { PermisoDef, RolConfig } from '../../../api/configuracion';
import { nombreRol } from '../../../lib/roles';

/** Por cada rol de Keycloak, las casillas de lo que puede hacer en el portal. */
export function RolesTab() {
  const [permisos, setPermisos] = useState<PermisoDef[]>([]);
  const [roles, setRoles] = useState<RolConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiConfig
      .obtenerRoles()
      .then((r) => {
        setPermisos(r.permisos);
        setRoles(r.roles);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los roles.'));
  }, []);

  const modulos = useMemo(() => {
    const m = new Map<string, PermisoDef[]>();
    for (const p of permisos) m.set(p.modulo, [...(m.get(p.modulo) || []), p]);
    return [...m.entries()];
  }, [permisos]);

  if (error) return <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>;
  if (!roles) return <p className="text-sm opacity-60">Cargando roles…</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-70">
        Los roles se crean en Keycloak (cliente <span className="font-mono">fix-descarte</span>) y aparecen aquí solos. Cualquier permiso
        de un módulo incluye poder verlo.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <RolCard key={r.nombre} rol={r} modulos={modulos} onGuardado={setRoles} />
        ))}
      </div>
    </div>
  );
}

function RolCard({
  rol,
  modulos,
  onGuardado,
}: {
  rol: RolConfig;
  modulos: [string, PermisoDef[]][];
  onGuardado: (roles: RolConfig[]) => void;
}) {
  const [seleccion, setSeleccion] = useState(() => new Set(rol.permisos));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => setSeleccion(new Set(rol.permisos)), [rol.permisos]);

  const cambiado = seleccion.size !== rol.permisos.length || rol.permisos.some((p) => !seleccion.has(p));

  const alternar = (codigo: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(codigo)) n.delete(codigo);
      else n.add(codigo);
      return n;
    });

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await apiConfig.guardarPermisosRol(rol.nombre, [...seleccion]);
      onGuardado(r.roles);
      setMensaje({ tipo: 'ok', texto: 'Guardado. Aplica a sus usuarios en menos de un minuto.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-bold">
            {rol.superAdmin && <ShieldCheck size={16} className="text-brand-500" />}
            {nombreRol(rol.nombre)}
          </h2>
          {rol.descripcion && <p className="text-xs opacity-60">{rol.descripcion}</p>}
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold dark:bg-white/10">
          <Users size={12} /> {rol.usuarios}
        </span>
      </div>

      {rol.superAdmin ? (
        <p className="rounded-xl bg-brand-500/10 px-3 py-2 text-sm">
          Super administrador: tiene <strong>todos los permisos</strong>, incluidos los que se agreguen en el futuro. No se puede limitar.
          <br />
          <span className="opacity-80">Es el único rol que ve y usa Configuración.</span>
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {modulos.map(([modulo, lista]) => (
            <fieldset key={modulo} className="flex flex-col gap-1.5">
              <legend className="mb-1 etiqueta">{modulo}</legend>
              {lista.map((p) => (
                <label key={p.codigo} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                    checked={seleccion.has(p.codigo)}
                    onChange={() => alternar(p.codigo)}
                  />
                  <span>
                    <span className="font-medium">{p.nombre}</span>
                    <span className="block text-xs opacity-60">{p.descripcion}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
          {seleccion.size === 0 && <p className="text-xs opacity-60">Sin permisos: quien tenga solo este rol no verá nada en el portal.</p>}
        </div>
      )}

      {!rol.superAdmin && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
          {mensaje && (
            <span className={`mr-auto text-xs ${mensaje.tipo === 'ok' ? 'text-success' : 'text-danger'}`}>{mensaje.texto}</span>
          )}
          <Button variant="ghost" disabled={!cambiado || guardando} onClick={() => setSeleccion(new Set(rol.permisos))}>
            <Undo2 size={15} /> Deshacer
          </Button>
          <Button disabled={!cambiado || guardando} onClick={guardar}>
            <Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      )}
    </GlassCard>
  );
}
