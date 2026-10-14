import { api } from './client';
import type { PaginationMeta } from '../types/productoDanado';

export interface PermisoDef {
  codigo: string;
  modulo: string;
  nombre: string;
  descripcion: string;
}

export interface RolConfig {
  nombre: string;
  descripcion: string;
  superAdmin: boolean;
  usuarios: number;
  permisos: string[];
}

export interface UsuarioConfig {
  id: string;
  username: string;
  nombre: string;
  email: string | null;
  activo: boolean;
  roles: string[];
}

export interface EventoAuditoria {
  Accion: 'asignar_rol' | 'quitar_rol' | 'permisos_rol';
  Detalle: string;
  Usuario: string;
  Fecha: string;
}

const BASE = '/configuracion';

export const obtenerRoles = () => api.get<{ permisos: PermisoDef[]; roles: RolConfig[] }>(`${BASE}/roles`);

export const guardarPermisosRol = (rol: string, permisos: string[]) =>
  api.put<{ permisos: PermisoDef[]; roles: RolConfig[] }>(`${BASE}/roles/${encodeURIComponent(rol)}/permisos`, { permisos });

export function listarUsuarios(f: { q?: string; page?: number; pageSize?: number; conRol?: boolean }) {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.page) params.set('page', String(f.page));
  if (f.pageSize) params.set('pageSize', String(f.pageSize));
  if (f.conRol) params.set('conRol', '1');
  return api.get<{ data: UsuarioConfig[]; pagination: PaginationMeta }>(`${BASE}/usuarios?${params}`);
}

export const asignarRol = (userId: string, rol: string) => api.post<void>(`${BASE}/usuarios/${encodeURIComponent(userId)}/roles`, { rol });
export const quitarRol = (userId: string, rol: string) =>
  api.del<void>(`${BASE}/usuarios/${encodeURIComponent(userId)}/roles/${encodeURIComponent(rol)}`);

export const obtenerAuditoria = () => api.get<EventoAuditoria[]>(`${BASE}/auditoria`);
