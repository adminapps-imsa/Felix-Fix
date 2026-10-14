import { api } from './client';

export interface VistaRol {
  nombre: string;
  descripcion: string;
  permisos: string[];
}

/** Roles de Keycloak para "Vista por" (solo Administrador). */
export const listarVistas = () => api.get<VistaRol[]>('/auth/vistas');
