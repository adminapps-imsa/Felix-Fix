import React from 'react';
import { useAuth } from './useAuth';

/**
 * Oculta contenido si el usuario no tiene ninguno de los permisos. Es solo
 * cosmético: el control real lo hace el backend (requirePermiso).
 */
export function RequirePermiso({ permiso, children }: { permiso: string | string[]; children: React.ReactNode }) {
  const { puede } = useAuth();
  if (!puede(...(Array.isArray(permiso) ? permiso : [permiso]))) return null;
  return <>{children}</>;
}
