import { useEffect, useState } from 'react';
import { listarCatalogos } from '../../../api/productosDanados';
import type { CatalogosReporte } from '../../../types/productoDanado';

// Caché de la sesión: los catálogos cambian poco. Al crear un reporte con una
// división o motivo nuevos se invalida para que aparezcan la próxima vez.
const TTL_MS = 5 * 60 * 1000;
let cache: { datos: CatalogosReporte; at: number } | null = null;
const VACIOS: CatalogosReporte = { divisiones: [], motivos: [] };

export function invalidarCatalogos() {
  cache = null;
}

/** División y motivo para los dropdowns del formulario y los filtros. */
export function useCatalogos() {
  const [cat, setCat] = useState<CatalogosReporte>(cache?.datos || VACIOS);
  useEffect(() => {
    if (cache && Date.now() - cache.at < TTL_MS) return setCat(cache.datos);
    let vivo = true;
    listarCatalogos()
      .then((datos) => {
        cache = { datos, at: Date.now() };
        if (vivo) setCat(datos);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  return cat;
}
