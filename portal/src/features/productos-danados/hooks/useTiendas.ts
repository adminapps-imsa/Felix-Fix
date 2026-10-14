import { useEffect, useState } from 'react';
import { listarTiendas } from '../../../api/tiendas';
import type { Tienda } from '../../../types/productoDanado';

export function useTiendas() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  useEffect(() => {
    listarTiendas()
      .then(setTiendas)
      .catch(() => setTiendas([]));
  }, []);
  return tiendas;
}
