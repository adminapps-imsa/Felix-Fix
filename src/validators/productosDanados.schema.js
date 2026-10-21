import { z } from 'zod';

// Todos los estados de la ruta del dominio (TRANSICIONES); test/validators lo comprueba.
export const ESTADOS = ['Pendiente', 'Devuelto', 'Aprobado', 'Rechazado', 'NFValidacion', 'EnContabilidad', 'Cerrado', 'EnProceso', 'Procesado'];

export const crearReporteSchema = z.object({
  tiendaId: z.coerce.number().int().positive(),
  empleadoReportaNombre: z.string().trim().min(2).max(150),
  // Sin SKU: el producto se identifica por el código de barras.
  codigoBarras: z.string().trim().min(1, 'El código de barras es obligatorio.').max(50),
  nombreProducto: z.string().trim().min(1).max(200),
  marca: z.string().trim().max(100).optional().or(z.literal('')),
  // Motivo: texto libre que alimenta su catálogo (ReclamoCatalogos). División: solo
  // las activas del catálogo (Perfumería o Cosméticos); el servicio la valida.
  division: z.string().trim().min(1, 'La división es obligatoria.').max(100),
  motivo: z.string().trim().min(1, 'El motivo es obligatorio.').max(100),
  cantidad: z.coerce.number().positive().max(100000),
  descripcion: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Tienda: el mismo formulario del alta, más una respuesta opcional para la compradora. La foto nueva va aparte (multipart). */
export const corregirReporteSchema = crearReporteSchema.extend({
  respuesta: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Compradora: lo que tiene que corregir la tienda (el mínimo lo revisa el dominio). */
export const devolverATiendaSchema = z.object({
  comentario: z.string().trim().max(1000, 'El comentario es demasiado largo (máx. 1000).').optional().default(''),
});

export const rechazarReporteSchema = z.object({
  motivoRechazo: z.string().trim().min(5).max(500),
});

// Día 'YYYY-MM-DD' (hora de Panamá); vacío = sin filtro. Una fecha imposible (2026-02-30) es 400.
const fechaDia = z
  .string()
  .trim()
  .refine((v) => {
    if (v === '') return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number);
    const f = new Date(Date.UTC(y, m - 1, d));
    return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
  }, 'Fecha inválida (formato AAAA-MM-DD).')
  .optional();

// Id de tienda (INT): entero positivo; vacío = sin filtro. Otra cosa es 400 sin llegar a SQL.
const tiendaId = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d{1,10}$/.test(v) && Number(v) > 0 && Number(v) <= 2147483647), 'Tienda inválida.')
  .optional();

export const listarQuerySchema = z.object({
  tienda: tiendaId,
  motivo: z.string().trim().max(100).optional(),
  estado: z.enum(ESTADOS).optional(),
  fechaDesde: fechaDia,
  fechaHasta: fechaDia,
  q: z.string().max(200).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export const correosSchema = z.object({
  correos: z
    .array(z.string().trim().toLowerCase().email('Correo inválido.').max(254))
    .max(20, 'Máximo 20 correos por reporte.')
    .transform((c) => [...new Set(c)]),
});

export const documento1700Schema = z.object({
  confirmado: z.boolean({ required_error: 'Marca el check «Documento 1700».' }),
});

// Supervisor GOF: «Documento salida de NF» obligatorio (lo revisa el dominio) + comentario opcional.
export const cerrarNfSchema = z.object({
  numero: z.string().trim().max(50, 'El documento salida de NF es demasiado largo (máx. 50).').optional().default(''),
  comentario: z.string().trim().max(500).optional().or(z.literal('')),
});

export const pagoRecibidoSchema = z.object({
  referencia: z.string().trim().min(1, 'Escribe la referencia del pago.').max(200),
  comentario: z.string().trim().max(500).optional().or(z.literal('')),
});

// `?f=<filename>` de GET/DELETE de un adjunto: su nombre en disco (UUID + extensión), opcional.
export const adjuntoQuerySchema = z.object({
  f: z
    .string()
    .trim()
    .max(100)
    .regex(/^[^/\\]+$/, 'Nombre de archivo inválido.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
