import { useCallback, useEffect, useState } from 'react';
import { listarCatalogos } from '../../../api/productosDanados';
import type { CatalogosReporte } from '../../../types/productoDanado';

// Caché de la sesión: los catálogos cambian poco. Las divisiones son fijas
// (no se crean al escribir); un motivo nuevo sí: al crear un reporte con uno
// se invalida para que aparezca la próxima vez.
const TTL_MS = 5 * 60 * 1000;
let cache: { datos: CatalogosReporte; at: number } | null = null;
const VACIOS: CatalogosReporte = { divisiones: [], motivos: [] };

export function invalidarCatalogos() {
  cache = null;
}

/**
 * División y motivo para los dropdowns del formulario y los filtros. `error`:
 * no se pudieron cargar (las listas quedan vacías); `reintentar` los vuelve a pedir.
 */
export function useCatalogos() {
  const [cat, setCat] = useState<CatalogosReporte>(cache?.datos || VACIOS);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (cache && Date.now() - cache.at < TTL_MS) return setCat(cache.datos);
    let vivo = true;
    setError(false);
    listarCatalogos()
      .then((datos) => {
        cache = { datos, at: Date.now() };
        if (vivo) setCat(datos);
      })
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [intento]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...cat, error, reintentar };
}
