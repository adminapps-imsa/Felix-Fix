// REC-000028 de Prod, segundo intento (2026-11-12): la 036 se saltó el arreglo
// porque el Excel que ya tenía el reclamo también se llamaba «PRESTIGE (2).xlsx»
// y decidía por el nombre. Ahora decide por el código del faltante (ver
// `yaCorregido` en la 036): cambia 9246752766 → 9246752773 en el faltante de la
// talla S y deja como Excel del reclamo el archivo correcto. Mismas
// validaciones: si algo más no cuadra, falla sin cambiar nada.
//
// Solo en Prod (en QA el 28 es otro reclamo: solo se registra). Idempotente.
import { arreglar } from './036_prod_rec28_excel.js';

const NOMBRE = '037_prod_rec28_excel_reintento.js';

export default async function migrar({ pool, schema }) {
  if (schema === 'Prod') await arreglar(pool, schema);
  await pool
    .request()
    .input('nombre', NOMBRE)
    .query(`IF NOT EXISTS (SELECT 1 FROM [${schema}].SchemaMigrations WHERE Nombre = @nombre)
              INSERT INTO [${schema}].SchemaMigrations (Nombre) VALUES (@nombre)`);
}
