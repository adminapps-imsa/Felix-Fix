import { useEffect, useState } from 'react';
import { fetchEvidenciaBlobUrl } from '../../../api/client';
import { evidenciaPath } from '../../../api/productosDanados';

/**
 * La ruta de evidencia requiere Bearer token (igual que el resto de la API),
 * así que no se puede usar un <img src="/api/..."> directo: se descarga
 * autenticada como blob y se renderiza desde una object URL.
 */
export function EvidenciaImage({ reporteId }: { reporteId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    // Si el componente se desmonta (o cambia el reporte) antes de que llegue la
    // foto, la URL que llegue tarde se libera enseguida en vez de quedar viva.
    let cancelado = false;
    setSrc(null);
    setError(false);
    fetchEvidenciaBlobUrl(evidenciaPath(reporteId))
      .then((url) => {
        if (cancelado) return URL.revokeObjectURL(url);
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => !cancelado && setError(true));
    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reporteId]);

  if (error) return <p className="text-sm opacity-60">No se pudo cargar la evidencia.</p>;
  if (!src) return <p className="text-sm opacity-60">Cargando evidencia…</p>;
  return (
    <img
      src={src}
      alt="Evidencia del producto dañado"
      className="max-h-64 rounded-xl border border-black/10 object-cover dark:border-white/10"
    />
  );
}
