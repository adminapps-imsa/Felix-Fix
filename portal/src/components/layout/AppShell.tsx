import React, { useEffect, useState } from 'react';
import { PackageX, Moon, Sun, Eye, Landmark, PackageSearch, ClipboardList, House, LayoutDashboard } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { ACCESO_CONTABILIDAD, ACCESO_PRODUCTOS, ACCESO_RECLAMOS } from '../../auth/permisos';
import { cn } from '../../lib/cn';
import { UserMenu } from './UserMenu';
import { VistaPor } from './VistaPor';
import { nombreRol } from '../../lib/roles';
import { useIndicador } from '../../lib/useIndicador';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    // El fondo del activo lo dibuja el indicador que se desliza (MenuDeslizante); aquí solo el color.
    'relative z-[1] inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-[color,opacity] duration-200',
    isActive ? 'text-brand-600 dark:text-brand-400' : 'opacity-70 hover:opacity-100'
  );

/** Menú con un fondo que se desliza hasta la página activa al cambiar de página. */
function MenuDeslizante({ className, children }: { className: string; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { ref, pos, listo } = useIndicador<HTMLElement>('[aria-current="page"]', pathname);
  return (
    <nav ref={ref} className={cn('relative', className)}>
      {pos && (
        <span
          aria-hidden
          className={cn('absolute rounded-full bg-brand-500/15', listo && 'transition-[left,width,top] duration-300 ease-[var(--ease-out)]')}
          style={{ left: pos.left, top: pos.top, width: pos.width, height: pos.height }}
        />
      )}
      {children}
    </nav>
  );
}

function useDarkMode() {
  // Se lee la preferencia guardada al iniciar; si se leyera en un efecto, el
  // efecto que guarda correría antes y la pisaría con "light".
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('felix-portal-theme');
    return stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    // El tema lo elige el usuario (no solo el sistema): la barra del navegador debe seguirlo.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0b0b13' : '#f4f5fb'));
    localStorage.setItem('felix-portal-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { dark, toggle } = useDarkMode();
  const { puede, user, cambiarVista } = useAuth();
  const enlaces = (
    <>
      {puede(...ACCESO_PRODUCTOS, ...ACCESO_RECLAMOS, ...ACCESO_CONTABILIDAD) && (
        <NavLink to="/inicio" className={navClass}>
          <House size={15} aria-hidden /> Inicio
        </NavLink>
      )}
      {puede(...ACCESO_PRODUCTOS, ...ACCESO_RECLAMOS, ...ACCESO_CONTABILIDAD) && (
        <NavLink to="/tablero" className={navClass}>
          <LayoutDashboard size={15} aria-hidden /> Tablero
        </NavLink>
      )}
      {puede(...ACCESO_PRODUCTOS) && (
        <NavLink to="/productos-danados" className={navClass}>
          <PackageSearch size={15} aria-hidden />
          <span>
            Productos<span className="hidden sm:inline"> Dañados</span>
          </span>
        </NavLink>
      )}
      {puede(...ACCESO_RECLAMOS) && (
        <NavLink to="/reclamos" className={navClass}>
          <ClipboardList size={15} aria-hidden /> Reclamos
        </NavLink>
      )}
      {puede(...ACCESO_CONTABILIDAD) && (
        <NavLink to="/contabilidad" className={navClass}>
          <Landmark size={15} aria-hidden /> Contabilidad
        </NavLink>
      )}
    </>
  );

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-20 border-b border-brand-500/10 bg-[var(--page-bg)]/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500 text-white" aria-label="Felix Fix">
              <PackageX size={20} />
            </span>
            {/* En celulares angostos solo el logo: con "Vista por" y el nombre no cabe en una línea. */}
            <span className="numero-caso hidden whitespace-nowrap text-xl sm:inline">Felix Fix</span>
            <MenuDeslizante className="ml-4 hidden items-center gap-1 font-normal md:flex">{enlaces}</MenuDeslizante>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              aria-label="Cambiar modo de color"
              className="grid h-9 w-9 place-items-center rounded-full glass-card hover:opacity-80"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <VistaPor />
            {/* Configuración (solo Administrador) y Cerrar sesión van dentro del menú del nombre. */}
            <UserMenu />
          </div>
        </div>
        <MenuDeslizante className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden">{enlaces}</MenuDeslizante>
        {user?.vista && (
          <div role="status" className="border-t border-warning/30 bg-warning/15">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-6">
              <Eye size={15} className="shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                Estás viendo el portal como <strong>{nombreRol(user.vista)}</strong>. Lo que hagas es real y queda a tu nombre.
              </span>
              <button type="button" onClick={() => void cambiarVista(null)} className="shrink-0 rounded-full bg-warning/25 px-3 py-1 text-xs font-semibold hover:bg-warning/35">
                Volver a mi vista
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6">{children}</main>
    </div>
  );
}
