import { z } from 'zod';
import { TIPOS, ORIGENES, STATUS } from '../services/reclamos/tipos.js';

const texto = (max) => z.string().trim().max(max);
const requerido = (campo, max) => z.string({ required_error: `${campo} es obligatorio.` }).trim().min(1, `${campo} es obligatorio.`).max(max);
const docSap = z.string().trim().max(50);

const numero = z.number().finite().nullable().optional().default(null);
const textoNulo = (max) => z.string().trim().max(max).nullable().optional().transform((v) => v || null);

/** Un producto del formulario: las columnas de la plantilla (FECHA … MOTIVO). */
const lineaFormularioSchema = z.object({
  fecha: z.preprocess((v) => v || null, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de producto inválida.').nullable()),
  producto: textoNulo(50),
  codigoBarra: z
    .string()
    .trim()
    .min(1, 'Hay productos sin código de barra.')
    .max(50, 'Código de barra demasiado largo (máx. 50).')
    .regex(/\d/, 'Hay productos con un código de barra inválido.'),
  descripcion: textoNulo(300),
  esperada: numero,
  recibida: numero,
  diferencia: numero,
  averiadas: numero,
  documento: textoNulo(50),
  motivo: textoNulo(100),
});

/**
 * Campos del multipart de creación (el Excel viene aparte en req.file).
 * sapDocsExtra llega como JSON (array de strings) porque es una lista dinámica.
 */
export const crearReclamoSchema = z
  .object({
    tipo: z.enum(TIPOS, { errorMap: () => ({ message: 'Tipo de reclamo inválido.' }) }),
    origen: z.enum(ORIGENES, { errorMap: () => ({ message: 'Origen inválido (tienda o cedi).' }) }),
    sucursal: texto(150).optional().default(''),
    numeroEmbarqueFactura: texto(100).optional().default(''),
    fechaRegistro: z
      .string({ required_error: 'La fecha es obligatoria.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es obligatoria (AAAA-MM-DD).'),
    mundo: requerido('Mundo', 100),
    departamento: requerido('Departamento', 100),
    marca: requerido('Marca', 100),
    proveedor: requerido('Proveedor', 200),
    compradora: requerido('Compradora', 150),
    // División (obligatoria en CEDI) y motivo: texto libre que alimenta su catálogo.
    division: texto(100).optional().default(''),
    motivo: texto(100).optional().default(''),
    sapDoc1: docSap.optional().default(''),
    sapDoc2: docSap.optional().default(''),
    sapDoc3: docSap.optional().default(''),
    sapDocsExtra: z
      .string()
      .optional()
      .default('[]')
      .transform((v, ctx) => {
        try {
          const arr = JSON.parse(v || '[]');
          if (!Array.isArray(arr) || arr.some((x) => typeof x !== 'string' || x.trim().length > 50)) throw new Error();
          return arr.map((x) => x.trim()).filter(Boolean);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sapDocsExtra debe ser un JSON array de textos (máx. 50 c/u).' });
          return z.NEVER;
        }
      }),
    comentario: texto(1000).optional().default(''),
    // Productos editados en el formulario (JSON). Sin él se leen del Excel.
    lineas: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v) return null;
        let arr;
        try {
          arr = JSON.parse(v);
        } catch {
          arr = null;
        }
        if (!Array.isArray(arr)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'lineas debe ser un JSON array.' });
          return z.NEVER;
        }
        const r = z.array(lineaFormularioSchema).min(1, 'Agrega al menos un producto.').max(2000, 'Máximo 2000 productos.').safeParse(arr);
        if (!r.success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error.issues[0]?.message || 'Productos inválidos.' });
          return z.NEVER;
        }
        return r.data;
      }),
  })
  .superRefine((data, ctx) => {
    if (data.origen === 'tienda' && !data.sucursal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sucursal'], message: 'La sucursal es obligatoria para reclamos de tienda.' });
    }
    if (data.origen === 'cedi' && !data.division) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['division'], message: 'La división es obligatoria para reclamos de CEDI.' });
    }
  });

export const decisionReclamoSchema = z.object({
  status: z.enum(['resuelto', 'rechazado']),
  comentario: texto(1000).optional().default(''),
});

export const decisionLineaSchema = z.object({
  decision: z.enum(['aprobado', 'rechazado']),
  comentario: texto(500).optional().default(''),
});

export const decisionLineasSchema = z.object({
  posiciones: z.array(z.number().int().min(1)).min(1).max(2000),
  decision: z.enum(['aprobado', 'rechazado']),
  comentario: texto(500).optional().default(''),
});

export const proveedorQuerySchema = z.object({
  nombre: z.string().trim().min(1).max(200),
});

/** ?docs=4904151684,4904151698 — hasta 50 documentos separados por coma. */
export const documentosSapQuerySchema = z.object({
  docs: z
    .string()
    .trim()
    .max(2600)
    .transform((v) => v.split(',').map((d) => d.trim()).filter((d) => d && d.length <= 50).slice(0, 50)),
});

export const listarQuerySchema = z.object({
  status: z.enum(STATUS).optional().or(z.literal('')),
  porEnviar: z.enum(['1']).optional(),
  q: z.string().max(200).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});
