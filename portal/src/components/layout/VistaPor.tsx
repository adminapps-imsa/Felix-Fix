import { useEffect, useId, useState } from 'react';
import { Check, ChevronDown, Eye } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { listarVistas, type VistaRol } from '../../api/vistas';
import { cn } from '../../lib/cn';
import { useMenuDesplegable } from './useMenuDesplegable';
import { nombreRol } from '../../lib/roles';

const OPCION =
  'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none transition hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/10 dark:focus-visible:bg-white/10';

/**
 * "Vista por" (solo Administrador): usar el portal con los permisos de un rol
 * de Keycloak, para ver el flujo real de ese rol. Los roles y sus permisos se
 * piden al abrir, así un rol nuevo o un permiso cambiado aparece enseguida.
 */
export function VistaPor() {
  const { user, cambiarVista } = useAuth();
  const { abierto, setAbierto, raiz, boton } = useMenuDesplegable();
  const [roles, setRoles] = useState<VistaRol[] | null>(null);
  const [error, setError] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const menuId = useId();
  const puede = Boolean(user?.puedeVistaPor);
  const vista = user?.vista || null;

  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    listarVistas()
      .then((r) => vivo && (setRoles(r), setError(false)))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [puede, abierto]);

  if (!puede) return null;

  const elegir = async (rol: string | null) => {
    setAbierto(false);
    if (rol === vista) return;
    setCambiando(true);
    try {
      // Se queda en la misma página; si el rol nuevo no tiene acceso a ella, las rutas lo llevan a su inicio.
      await cambiarVista(rol);
    } finally {
      setCambiando(false);
    }
  };

  return (
    <div ref={raiz} className="relative">
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={menuId}
        disabled={cambiando}
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition',
          vista ? 'bg-warning/20 text-warning ring-1 ring-warning/40 hover:bg-warning/25' : 'glass-card hover:shadow-[var(--glass-shadow-hover)]',
          abierto && 'ring-2 ring-brand-500/40'
        )}
      >
        <Eye size={15} />
        <span className="hidden lg:inline">Vista por</span>
        {vista && <span className="max-w-[7rem] truncate font-semibold">{nombreRol(vista)}</span>}
        <ChevronDown size={14} className={cn('opacity-60 transition-transform duration-200 ease-[var(--ease-out)]', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div
          id={menuId}
          role="menu"
          aria-label="Vista por rol"
          className="anim-menu absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-black/10 bg-[var(--page-bg)] p-1.5 shadow-xl dark:border-white/10"
        >
          <div className="px-3 pb-2 pt-1.5 text-xs opacity-60">Ver el portal con los permisos de un rol. Lo que hagas es real y queda a tu nombre.</div>
          <button type="button" role="menuitemradio" aria-checked={!vista} className={OPCION} onClick={() => elegir(null)}>
            <Check size={15} className={cn('mt-0.5 shrink-0', vista && 'invisible')} />
            <span>
              <span className="block font-semibold">Mi vista</span>
              <span className="block text-xs opacity-60">Administrador · todos los permisos</span>
            </span>
          </button>
          <div className="my-1 border-t border-black/5 dark:border-white/5" />
          {error && <p className="px-3 py-2 text-xs text-danger">No se pudieron cargar los roles.</p>}
          {!roles && !error && <p className="px-3 py-2 text-xs opacity-60">Cargando roles…</p>}
          {roles?.length === 0 && <p className="px-3 py-2 text-xs opacity-60">No hay otros roles en Keycloak.</p>}
          {roles?.map((r) => (
            <button
              key={r.nombre}
              type="button"
              role="menuitemradio"
              aria-checked={vista === r.nombre}
              className={OPCION}
              onClick={() => elegir(r.nombre)}
            >
              <Check size={15} className={cn('mt-0.5 shrink-0', vista !== r.nombre && 'invisible')} />
              <span className="min-w-0">
                <span className="block font-semibold">{nombreRol(r.nombre)}</span>
                <span className="block truncate text-xs opacity-60">
                  {r.permisos.length ? `${r.permisos.length} permiso${r.permisos.length === 1 ? '' : 's'}` : 'Sin permisos'}
                  {r.descripcion && ` · ${r.descripcion}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
