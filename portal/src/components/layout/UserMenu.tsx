import { useId } from 'react';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { P } from '../../auth/permisos';
import { cn } from '../../lib/cn';
import { useMenuDesplegable } from './useMenuDesplegable';

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

const ITEM =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition hover:bg-black/5 focus-visible:bg-black/5 dark:hover:bg-white/10 dark:focus-visible:bg-white/10';

/**
 * Menú del usuario en el encabezado: al tocar el nombre se despliega con
 * Configuración (solo el Administrador) y Cerrar sesión. Se cierra al elegir,
 * al tocar fuera, con Escape o al cambiar de página.
 */
export function UserMenu() {
  const { user, logout, puede } = useAuth();
  const { abierto, setAbierto, raiz, boton } = useMenuDesplegable();
  const menuId = useId();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const esAdmin = puede(P.config);

  if (!user) return null;

  return (
    <div ref={raiz} className="relative">
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={menuId}
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium glass-card transition-[box-shadow,transform] duration-150 hover:shadow-[var(--glass-shadow-hover)] active:scale-[0.97] lg:pr-3',
          abierto && 'ring-2 ring-brand-500/40'
        )}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white dark:bg-brand-400 dark:text-slate-950">
          {iniciales(user.name || user.username)}
        </span>
        <span className="hidden max-w-[12rem] truncate lg:inline">{user.name || user.username}</span>
        <ChevronDown size={14} className={cn('opacity-60 transition-transform duration-200 ease-[var(--ease-out)]', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div
          id={menuId}
          role="menu"
          aria-label="Menú de usuario"
          className="anim-menu absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-black/10 bg-[var(--page-bg)] p-1.5 shadow-xl dark:border-white/10"
        >
          <div className="border-b border-black/5 px-3 pb-2 pt-1.5 dark:border-white/5">
            <div className="truncate text-sm font-semibold">{user.name || user.username}</div>
            {user.name && user.username && user.name !== user.username && <div className="truncate text-xs opacity-60">{user.username}</div>}
          </div>
          <div className="flex flex-col gap-0.5 pt-1.5">
            {esAdmin && (
              <button
                type="button"
                role="menuitem"
                className={cn(ITEM, pathname.startsWith('/configuracion') && 'text-brand-600 dark:text-brand-400')}
                onClick={() => {
                  setAbierto(false);
                  navigate('/configuracion');
                }}
              >
                <Settings size={15} className="opacity-70" /> Configuración
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={cn(ITEM, 'text-danger')}
              onClick={() => {
                setAbierto(false);
                logout();
              }}
            >
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
