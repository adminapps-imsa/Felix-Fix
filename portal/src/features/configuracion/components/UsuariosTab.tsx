import { useEffect, useState } from 'react';
import { Loader2, Search, ShieldCheck } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { RolConfig, UsuarioConfig } from '../../../api/configuracion';
import type { PaginationMeta } from '../../../types/productoDanado';
import { cn } from '../../../lib/cn';
import { nombreRol } from '../../../lib/roles';

const PAGE_SIZE = 20;

/**
 * Lista de usuarios de Keycloak con una casilla por rol del portal. Marcar o
 * desmarcar asigna o quita el rol en Keycloak al instante.
 */
export function UsuariosTab() {
  const [roles, setRoles] = useState<RolConfig[]>([]);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [soloConRol, setSoloConRol] = useState(false);
  const [page, setPage] = useState(1);
  const [usuarios, setUsuarios] = useState<UsuarioConfig[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null); // `${userId}|${rol}`

  useEffect(() => {
    apiConfig
      .obtenerRoles()
      .then((r) => setRoles(r.roles))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los roles.'));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    apiConfig
      .listarUsuarios({ q: qDebounced, page, pageSize: PAGE_SIZE, conRol: soloConRol })
      .then((r) => {
        if (!vivo) return;
        setUsuarios(r.data);
        setMeta(r.pagination);
        setError(null);
      })
      .catch((e) => vivo && setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los usuarios.'))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [qDebounced, page, soloConRol]);

  const cambiarRol = async (u: UsuarioConfig, rol: string, asignar: boolean) => {
    const clave = `${u.id}|${rol}`;
    setGuardando(clave);
    setError(null);
    try {
      if (asignar) await apiConfig.asignarRol(u.id, rol);
      else await apiConfig.quitarRol(u.id, rol);
      setUsuarios((lista) =>
        lista.map((x) =>
          x.id === u.id ? { ...x, roles: asignar ? [...x.roles, rol].sort() : x.roles.filter((r) => r !== rol) } : x
        )
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <Input
            className="pl-9"
            placeholder="Buscar por usuario, nombre o correo"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-500"
            checked={soloConRol}
            onChange={(e) => {
              setSoloConRol(e.target.checked);
              setPage(1);
            }}
          />
          Solo usuarios con rol
        </label>
      </GlassCard>

      {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs opacity-60 dark:border-white/10">
              <th className="px-4 py-3 font-semibold">Usuario</th>
              {roles.map((r) => (
                <th key={r.nombre} className="px-3 py-3 text-center font-semibold" title={r.descripcion}>
                  <span className="inline-flex items-center gap-1">
                    {r.superAdmin && <ShieldCheck size={13} className="text-brand-500" />}
                    {nombreRol(r.nombre)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && usuarios.length === 0 ? (
              <tr>
                <td colSpan={roles.length + 1} className="px-4 py-8 text-center opacity-60">
                  Cargando usuarios…
                </td>
              </tr>
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={roles.length + 1} className="px-4 py-8 text-center opacity-60">
                  {soloConRol ? 'Nadie tiene roles del portal todavía.' : 'No se encontraron usuarios.'}
                </td>
              </tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.id} className={cn('border-b border-black/5 last:border-0 dark:border-white/5', cargando && 'opacity-60')}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold">
                      {u.nombre}
                      {!u.activo && (
                        <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold opacity-70 dark:bg-white/10">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="text-xs opacity-60">
                      {u.username}
                      {u.email && u.email !== u.username && ` · ${u.email}`}
                    </div>
                  </td>
                  {roles.map((r) => {
                    const tiene = u.roles.includes(r.nombre);
                    const ocupado = guardando === `${u.id}|${r.nombre}`;
                    return (
                      <td key={r.nombre} className="px-3 py-2.5 text-center">
                        {ocupado ? (
                          <Loader2 size={16} className="mx-auto animate-spin opacity-60" />
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`${nombreRol(r.nombre)} para ${u.username}`}
                            className="h-4 w-4 cursor-pointer accent-brand-500 disabled:cursor-not-allowed"
                            checked={tiene}
                            disabled={Boolean(guardando)}
                            onChange={(e) => cambiarRol(u, r.nombre, e.target.checked)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassCard>

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} />}
      <p className="text-xs opacity-60">
        Los cambios se guardan en Keycloak al marcar la casilla y aplican en menos de un minuto, sin que el usuario tenga que volver a
        iniciar sesión.
      </p>
    </div>
  );
}
