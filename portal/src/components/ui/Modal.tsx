import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

type Size = 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<Size, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-6xl',
};

/**
 * Se renderiza en document.body (portal): `.glass-card` usa backdrop-filter,
 * que convierte a la tarjeta en el contenedor de sus hijos `position: fixed`
 * — un modal abierto desde dentro de una tarjeta u otro modal quedaba
 * encerrado en ella en vez de cubrir la pantalla.
 *
 * `layer` permite apilar modales: uno abierto DESDE otro (ej. vista previa de
 * Excel dentro del formulario) necesita un z-index mayor, si no queda tapado.
 *
 * Escape cierra solo el modal de más arriba. `dismissible={false}` (formularios
 * largos o con texto escrito): ni el clic en el fondo ni Escape lo cierran, solo
 * sus botones. Al abrir, el foco entra al diálogo y al cerrar vuelve a donde estaba.
 */
// Pila de modales abiertos: Escape solo debe cerrar el de encima.
const pila: symbol[] = [];

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  size,
  layer = 'z-50',
  actions,
  dismissible = true,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  size?: Size;
  layer?: string;
  actions?: React.ReactNode;
  /** false: no se cierra con clic en el fondo ni con Escape (formularios largos). */
  dismissible?: boolean;
}) {
  const sizeClass = SIZE_CLASS[size ?? (wide ? 'lg' : 'md')];
  const dialogo = useRef<HTMLDivElement>(null);
  const tituloId = React.useId();
  // Refs: el listener de Escape no se vuelve a registrar en cada render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;

  useEffect(() => {
    const id = Symbol('modal');
    pila.push(id);
    const previo = document.activeElement as HTMLElement | null;
    // Foco inicial dentro del diálogo, salvo que un hijo ya lo tomara (autoFocus).
    if (!dialogo.current?.contains(document.activeElement)) dialogo.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || pila[pila.length - 1] !== id) return;
      if (!dismissibleRef.current) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      const i = pila.indexOf(id);
      if (i >= 0) pila.splice(i, 1);
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  return createPortal(
    <div className={cn('modal-fondo fixed inset-0 grid place-items-center bg-slate-950/45 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-[2px]', layer)} onClick={dismissible ? onClose : undefined}>
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={`modal-dialogo glass-card w-full ${sizeClass} max-h-[90vh] overflow-y-auto p-6 outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={tituloId} className="min-w-0 truncate text-lg font-bold">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 transition-[background-color,transform] duration-150 hover:bg-black/5 active:scale-90 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
