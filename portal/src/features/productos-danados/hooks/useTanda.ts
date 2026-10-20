import { useRef } from 'react';

/**
 * «Tanda» de una lista: sube cuando llegan datos de otra búsqueda (filtro,
 * pestaña o página) y no en una recarga con los mismos filtros. Se usa como
 * key del contenedor para que las filas se monten de nuevo y entren en cascada
 * solo cuando cambia lo que se está viendo.
 */
export function useTanda(datos: unknown, clave: string) {
  const ref = useRef({ datos, clave, n: 0 });
  if (ref.current.datos !== datos) {
    ref.current = { datos, clave, n: ref.current.clave !== clave ? ref.current.n + 1 : ref.current.n };
  }
  return ref.current.n;
}
