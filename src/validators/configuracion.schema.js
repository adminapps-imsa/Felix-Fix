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

/** Bienvenida: hasta 50 usuarios de Keycloak por envío (ids UUID). */
export const bienvenidaSchema = z.object({
  userIds: z.array(z.string().uuid('Usuario inválido.')).min(1, 'Elige al menos una persona.').max(50, 'Máximo 50 personas por envío.'),
});

/** Tienda de un usuario: null = todas las tiendas. */
export const tiendaUsuarioSchema = z.object({
  tiendaId: z.number().int().positive().nullable(),
  soloPropios: z.boolean(),
});

// Bitácora: filtros del visor. Fechas 'AAAA-MM-DD' (día de Panamá); vacío = sin filtro.
const dia = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Fecha inválida (formato AAAA-MM-DD).')
  .optional();
export const bitacoraQuerySchema = z.object({
  clase: z.enum(['actividad', 'error']).optional(),
  nivel: z.enum(['', 'aviso', 'falla']).optional(),
  modulo: z.string().trim().max(30).optional(),
  usuario: z.string().trim().max(150).optional(),
  rol: z.string().trim().max(100).optional(),
  desde: dia,
  hasta: dia,
  q: z.string().max(200).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});
