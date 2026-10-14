import { z } from 'zod';

export const keycloakCodeSchema = z.object({
  code: z.string().trim().min(1),
  redirectUri: z.string().trim().url(),
  // PKCE (RFC 7636): opcional para no cortar a quien tenga abierta una pestaña de antes del cambio.
  codeVerifier: z
    .string()
    .regex(/^[A-Za-z0-9._~-]{43,128}$/)
    .optional(),
});
