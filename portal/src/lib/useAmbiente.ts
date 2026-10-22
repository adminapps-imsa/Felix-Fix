import { useEffect, useState } from 'react';

/**
 * Ambiente de la API (el esquema de SQL Server: QA | Prod). Viene de la API y no
 * del build, porque el mismo build se sirve en QA y en Prod.
 */
export function useAmbiente(): string | null {
  const [ambiente, setAmbiente] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: { ambiente?: string }) => vivo && setAmbiente(data.ambiente || null))
      .catch(() => {
        /* sin respuesta no se marca nada */
      });
    return () => {
      vivo = false;
    };
  }, []);
  return ambiente;
}
