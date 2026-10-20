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
  Accion: 'asignar_rol' | 'quitar_rol' | 'permisos_rol' | 'bienvenida';
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

// ---------- Correos ----------

export interface CorreoInfo {
  id: string;
  grupo: string;
  nombre: string;
  /** Cuándo sale, en palabras. */
  cuando: string;
  /** Quién lo recibe, en palabras. */
  quien: string;
  asunto: string;
}

export interface CorreoVista {
  id: string;
  asunto: string;
  html: string;
  texto: string;
}

export interface ResultadoBienvenida {
  id: string;
  username?: string;
  nombre?: string;
  enviado: boolean;
  motivo?: string;
}

export const listarCorreos = () => api.get<CorreoInfo[]>(`${BASE}/correos`);
export const verCorreo = (id: string) => api.get<CorreoVista>(`${BASE}/correos/${encodeURIComponent(id)}`);
export const enviarPruebaCorreo = (id: string) => api.post<{ para: string[] }>(`${BASE}/correos/${encodeURIComponent(id)}/prueba`, {});
export const enviarBienvenida = (userIds: string[]) => api.post<{ resultados: ResultadoBienvenida[] }>(`${BASE}/correos/bienvenida/enviar`, { userIds });
