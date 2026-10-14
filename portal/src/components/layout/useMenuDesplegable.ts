import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Comportamiento común de los menús del encabezado: se cierran al tocar
 * fuera, con Escape (devolviendo el foco al botón) o al cambiar de página;
 * al abrir, el foco va a la primera opción y las flechas recorren las
 * opciones (role="menuitem" / "menuitemradio").
 */
export function useMenuDesplegable() {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setAbierto(false), [pathname]);

  useEffect(() => {
    if (!abierto) return;
    const opciones = () => [...(raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') || [])];
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = opciones();
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        items[e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length].focus();
      }
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    // La opción marcada (si hay) o la primera.
    (raiz.current?.querySelector<HTMLElement>('[aria-checked="true"]') || opciones()[0])?.focus();
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return { abierto, setAbierto, raiz, boton };
}
