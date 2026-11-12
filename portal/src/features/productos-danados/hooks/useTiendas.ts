import { useEffect, useMemo, useState } from 'react';
import { listarTiendas } from '../../../api/tiendas';
import { useAuth } from '../../../auth/useAuth';
import type { Tienda } from '../../../types/productoDanado';

/**
 * Tiendas activas. Quien está en una tienda (Configuración → Tiendas) solo
 * recibe la suya: los filtros y formularios no ofrecen otras (el backend
 * también lo exige).
 */
export function useTiendas() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const { user } = useAuth();
  const propia = user?.tienda?.tiendaId ?? null;
  useEffect(() => {
    listarTiendas()
      .then(setTiendas)
      .catch(() => setTiendas([]));
  }, []);
  return useMemo(() => (propia == null ? tiendas : tiendas.filter((t) => t.TiendaId === propia)), [tiendas, propia]);
}
