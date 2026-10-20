import { useEffect, useState } from 'react';
import type React from 'react';
import { fetchEvidenciaBlobUrl } from '../../../api/client';
import { Esqueleto } from '../../../components/ui/Esqueleto';
import { cn } from '../../../lib/cn';

/** Las fotos requieren Bearer token: se bajan como blob (igual que EvidenciaImage). */
export function AuthImage({ path, alt, ...rest }: { path: string; alt: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelado = false;
    fetchEvidenciaBlobUrl(path)
      .then((u) => {
        if (cancelado) URL.revokeObjectURL(u);
        else setSrc((url = u));
      })
      .catch(() => !cancelado && setError(true));
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (error) return <div className="grid h-full min-h-24 place-items-center text-xs opacity-60">No se pudo cargar</div>;
  // Mientras baja, un bloque con brillo del tamaño que tendrá la foto.
  if (!src) return <Esqueleto className={cn('h-full min-h-24 w-full min-w-24 rounded-none', rest.className)} />;
  return <img src={src} alt={alt} {...rest} />;
}
