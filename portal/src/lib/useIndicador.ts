import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Posición de la pestaña o enlace activo dentro de un contenedor, para dibujar
 * un indicador que se desliza hasta él (en vez de aparecer de golpe).
 * `selector`: cómo reconocer el activo, p. ej. '[aria-current="page"]'.
 * `clave`: cambia cuando cambia el activo (la ruta, la pestaña elegida).
 */
export function useIndicador<T extends HTMLElement>(selector: string, clave: unknown) {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // La primera vez se coloca sin deslizarse (no debe entrar volando desde la izquierda).
  const [listo, setListo] = useState(false);

  useLayoutEffect(() => {
    const cont = ref.current;
    if (!cont) return;
    const medir = () => {
      const activo = cont.querySelector<HTMLElement>(selector);
      if (!activo) return setPos(null);
      setPos({ left: activo.offsetLeft, top: activo.offsetTop, width: activo.offsetWidth, height: activo.offsetHeight });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(cont);
    const t = setTimeout(() => setListo(true), 50);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [selector, clave]);

  return { ref, pos, listo };
}
