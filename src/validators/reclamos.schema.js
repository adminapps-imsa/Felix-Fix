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
    // Fecha de llegada de la mercancía: obligatoria (Tienda y CEDI). Que no sea futura
    // lo revisa el dominio (motivoFechaLlegadaInvalida).
    fechaLlegadaMercancia: z
      .string({ required_error: 'Indica la fecha de llegada de la mercancía.' })
      .trim()
      .min(1, 'Indica la fecha de llegada de la mercancía.')
      .max(10),
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
    // «¿El proveedor va a retirar el producto?»: obligatoria. En devoluciones
    // el servicio la deja en sí aunque llegue otra cosa.
    retiroProveedor: z.enum(['si', 'no'], {
      errorMap: () => ({ message: 'Indica si el proveedor va a retirar el producto (Sí o No).' }),
    }),
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
  });

/** Devolver a quien lo creó: el comentario dice qué corregir (el mínimo lo revisa el dominio). */
export const devolverSchema = z.object({ comentario: texto(1000) });

/** Reenviar a la compradora: respuesta opcional de quien lo corrigió. */
/** Productos corregidos de un reclamo devuelto: `lineaId` de los que ya estaban, sin él los nuevos. */
// El código es obligatorio salvo en «Sobrante no esperado» (puede venir sin código: lo crea Data).
const lineaCorregidaSchema = z
  .object({
    lineaId: z.number().int().positive().nullable().optional(),
    codigoBarra: z.string().trim().max(50, 'El código de barra admite hasta 50 caracteres.').nullable().optional().transform((v) => v || ''),
    descripcion: texto(300).optional().default(''),
    cantidad: z.number({ invalid_type_error: 'La cantidad debe ser un número.' }).finite().min(0, 'La cantidad no puede ser negativa.').max(1e12).nullable().optional().default(null),
    tipo: z.enum(TIPOS, { errorMap: () => ({ message: 'Motivo de producto inválido.' }) }),
  })
  .superRefine((l, ctx) => {
    if (!l.codigoBarra && l.tipo !== 'sobrante_no_esperado') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['codigoBarra'], message: 'Cada producto necesita su código de barra.' });
    }
  });

export const corregirLineasSchema = z.object({
  lineas: z.array(lineaCorregidaSchema).min(1, 'El reclamo debe tener al menos un producto.').max(2000, 'Máximo 2000 productos.'),
});

export const reenviarSchema = z.object({ comentario: texto(1000).optional().default('') });

/**
 * Corregir los datos de un reclamo devuelto (JSON). Mismos campos que el alta,
 * sin tipo, origen ni productos: el origen no cambia y el Excel se queda.
 */
export const corregirDatosSchema = z.object({
  sucursal: texto(150).optional().default(''),
  numeroEmbarqueFactura: texto(100).optional().default(''),
  fechaRegistro: z.string({ required_error: 'La fecha es obligatoria.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha es obligatoria (AAAA-MM-DD).'),
  fechaLlegadaMercancia: z
    .string({ required_error: 'Indica la fecha de llegada de la mercancía.' })
    .trim()
    .min(1, 'Indica la fecha de llegada de la mercancía.')
    .max(10),
  mundo: requerido('Mundo', 100),
  departamento: requerido('Departamento', 100),
  marca: requerido('Marca', 100),
  proveedor: requerido('Proveedor', 200),
  compradora: requerido('Compradora', 150),
  division: texto(100).optional().default(''),
  sapDocs: z.array(docSap).max(50, 'Máximo 50 documentos SAP.').default([]),
});

export const decisionReclamoSchema = z.object({
  status: z.enum(['resuelto', 'rechazado']),
  comentario: texto(1000).optional().default(''),
});

/** Data carga el código de barras de un sobrante no esperado que ya creó en SAP. */
export const codigoDataSchema = z.object({
  codigoBarra: z
    .string({ required_error: 'Escribe el código de barras.' })
    .trim()
    .min(1, 'Escribe el código de barras.')
    .max(50, 'El código de barras admite hasta 50 caracteres.')
    .regex(/^\d+$/, 'El código de barras solo lleva números.'),
});

/** Datos del artículo para Data: los llena la compradora al aprobar un sobrante no esperado sin SAP. */
const dinero = (campo) =>
  z.number({ required_error: `Indica el ${campo}.`, invalid_type_error: `El ${campo} debe ser un número.` }).finite().min(0, `El ${campo} no puede ser negativo.`).max(1e12);
const textoArticulo = (mensaje, max) => z.string({ required_error: mensaje }).trim().min(1, mensaje).max(max);
export const articuloDataSchema = z.object({
  costo: dinero('costo'),
  precioVenta: dinero('precio de venta'),
  categoria: textoArticulo('Indica la categoría.', 100),
  tipoProducto: textoArticulo('Indica el tipo de producto.', 100),
  // Opcional (pedido del 2026-11-12).
  cicloVida: z.string().trim().max(100).nullable().optional().transform((v) => v || null),
  descripcion: textoArticulo('Escribe la descripción.', 300),
  marca: textoArticulo('Indica la marca.', 100),
});

export const decisionLineaSchema = z.object({
  decision: z.enum(['aprobado', 'rechazado']),
  comentario: texto(500).optional().default(''),
  articulo: articuloDataSchema.optional(),
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

/** Retiro del proveedor: el día (la regla del dominio revisa que sea real y no futuro). La foto va aparte (multipart). */
export const retiroSchema = z.object({ fecha: z.string({ required_error: 'Indica el día del retiro.' }).trim().max(10) });

/** Cambiar la respuesta de «¿lo retira el proveedor?» (quien lo creó o el super administrador). */
export const cambiarRetiroSchema = z.object({ requerido: z.boolean({ required_error: 'Indica si el proveedor lo va a retirar.' }) });
