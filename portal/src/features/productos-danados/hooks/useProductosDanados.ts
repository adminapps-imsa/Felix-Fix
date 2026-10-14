import { useCallback, useEffect, useState } from 'react';
import * as apiProductosDanados from '../../../api/productosDanados';
import type { Filtros, PaginationMeta, ReporteProductoDanado } from '../../../types/productoDanado';

export function useProductosDanados(filtros: Filtros) {
  const [data, setData] = useState<ReporteProductoDanado[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiProductosDanados
      .listarReportes(filtros)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setPagination(res.pagination);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar los reportes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros), reloadToken]);

  return { data, pagination, loading, error, reload, reloadToken };
}
