import { useEffect, useState } from 'react';
import * as apiProductosDanados from '../../../api/productosDanados';
import type { Filtros, Kpis } from '../../../types/productoDanado';

export function useKpis(filtrosLista: Filtros, reloadToken: number) {
  // `undefined` mientras llega la primera respuesta (esqueleto); `null` si falló («—»).
  const [kpis, setKpis] = useState<Kpis | null | undefined>(undefined);
  // Cada tarjeta es un estado: el filtro de estado (y la página) no aplica a los conteos.
  const { estado: _e, page: _p, ...filtros } = filtrosLista;

  useEffect(() => {
    let cancelled = false;
    apiProductosDanados
      .obtenerKpis(filtros)
      .then((res) => {
        if (!cancelled) setKpis(res);
      })
      .catch(() => {
        if (!cancelled) setKpis(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros), reloadToken]);

  return kpis;
}
