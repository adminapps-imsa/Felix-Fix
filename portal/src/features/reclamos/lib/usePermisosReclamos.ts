import { useEffect, useState } from 'react';
import { obtenerPermisos } from '../../../api/reclamos';
import { useAuth } from '../../../auth/useAuth';
import type { PermisosReclamos } from '../../../types/reclamo';

/** Lo que el usuario puede hacer en Reclamos (según sus roles); la UI solo oculta botones, el backend decide. */
export function usePermisosReclamos() {
  const [permisos, setPermisos] = useState<PermisosReclamos | null>(null);
  // Se vuelve a pedir si cambian los permisos (otra "Vista por" o el Administrador editó el rol).
  const { user } = useAuth();
  const firma = `${user?.vista || ''}|${[...(user?.permisos || [])].sort().join(',')}`;
  useEffect(() => {
    obtenerPermisos()
      .then(setPermisos)
      .catch(() => setPermisos({ puedeCrear: false, puedeDecidir: false, puedeEliminar: false, puedeAdjuntar: false, puedeAdjuntarCerrado: false, puedeEnviarContabilidad: false, puedeDevolver: false, puedeCorregirCualquiera: false, puedeEliminarCualquiera: false, puedeRegistrarRetiro: false, esAdmin: false, username: '' }));
  }, [firma]);
  return permisos;
}
