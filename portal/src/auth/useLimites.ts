import type { Limites } from './session';
import { useAuth } from './useAuth';

// Valores por defecto del backend, por si /auth/me todavía no respondió.
const POR_DEFECTO: Limites = { evidenciaMb: 5, adjuntoMb: 15, correoMb: 2.8 };

/** Límites de archivos (MB) configurados en el servidor. */
export function useLimites(): Limites {
  return useAuth().user?.limites ?? POR_DEFECTO;
}
