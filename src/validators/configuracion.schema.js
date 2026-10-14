import { z } from 'zod';

export const usuariosQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
  // '1' = solo usuarios con al menos un rol del portal.
  conRol: z.enum(['0', '1']).optional().default('0'),
});

export const permisosRolSchema = z.object({
  permisos: z.array(z.string().max(50)).max(100),
});

export const asignarRolSchema = z.object({
  rol: z.string().trim().min(1).max(100),
});
