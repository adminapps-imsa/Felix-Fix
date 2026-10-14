import { lazy, type ComponentType } from 'react';

const CLAVE = 'felix-portal-recarga-chunk';

/**
 * React.lazy que se recupera de un deploy nuevo: si alguien tenía el portal
 * abierto, sus archivos JS viejos ya no existen y el import falla. En ese caso
 * se recarga la página una sola vez (index.html no se cachea, así que trae la
 * versión nueva). Si vuelve a fallar, el error sigue su curso.
 */
export function lazyConRecarga<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await cargar();
      try {
        sessionStorage.removeItem(CLAVE);
      } catch {
        /* sessionStorage bloqueado: no importa */
      }
      return mod;
    } catch (err) {
      let yaRecargo = false;
      try {
        yaRecargo = sessionStorage.getItem(CLAVE) === '1';
        if (!yaRecargo) sessionStorage.setItem(CLAVE, '1');
      } catch {
        yaRecargo = true; // sin sessionStorage no hay forma de evitar un bucle de recargas
      }
      if (!yaRecargo) {
        window.location.reload();
        return new Promise<never>(() => {}); // la página se está recargando
      }
      throw err;
    }
  });
}
