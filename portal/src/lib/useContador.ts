import { useEffect, useRef, useState } from 'react';

const reducirMovimiento = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * El número sube (o baja) hasta `valor` en `duracion` ms, frenando al final.
 * La primera vez cuenta desde 0; después, desde el valor anterior. Con
 * «reducir movimiento» (o un valor no numérico) devuelve el valor tal cual.
 */
export function useContador(valor: number, duracion = 550) {
  const [mostrado, setMostrado] = useState(() => (reducirMovimiento() ? valor : 0));
  const desde = useRef(reducirMovimiento() ? valor : 0);

  useEffect(() => {
    if (!Number.isFinite(valor) || reducirMovimiento()) {
      setMostrado(valor);
      desde.current = valor;
      return;
    }
    const inicio = performance.now();
    const origen = desde.current;
    let cuadro = 0;
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const curva = 1 - (1 - t) ** 3; // sale rápido y frena al final
      const v = origen + (valor - origen) * curva;
      setMostrado(t < 1 ? v : valor);
      if (t < 1) cuadro = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    cuadro = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(cuadro);
      desde.current = valor;
    };
  }, [valor, duracion]);

  return mostrado;
}
