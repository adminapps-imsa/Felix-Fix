// REC-000005, REC-000006 y REC-000007 de Prod: se cambia el Excel principal
// por el correcto (pedido del 2026-11-06; los archivos están en
// sql/migrations/archivos/028/). Va después de la 026, que los pasó a
// «Devolución al proveedor».
//
// Antes de tocar nada valida los tres: cada Excel debe leerse con la
// plantilla y traer los mismos productos que el reclamo, con el mismo código,
// la misma cantidad y el mismo motivo. Si alguno no cuadra, falla sin cambiar
// nada y el despliegue vuelve atrás. Solo cambia el archivo
// (ArchivoExcel/ArchivoExcelNombre); los productos, las decisiones y las fotos
// ya extraídas quedan igual. El Excel anterior queda en disco, sin referencia.
//
// Solo en Prod: en QA esos números son otros reclamos (solo se registra).
// Idempotente: si el reclamo ya tiene el archivo nuevo, no lo vuelve a copiar.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parsearPlantilla } from '../../src/services/reclamos/excelParser.js';

const NOMBRE = '028_prod_reclamos_5_6_7_excel.js';
const ORIGEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'archivos', '028');

export const ARCHIVOS = [
  { reclamoId: 5, archivo: 'Formato de Reclamo en Tienda (GOF) reclamo 05.xlsx' },
  { reclamoId: 6, archivo: 'Formato de Reclamo en Tienda (GOF) reclamo 06.xlsx' },
  { reclamoId: 7, archivo: 'Formato de Reclamo en Tienda reclamo 07.xlsx' },
];

const codigo = (c) => String(c ?? '').trim().replace(/^0+(?=\d)/, '');
const cantidad = (c) => (c === null || c === undefined || c === '' ? '' : String(Number(c)));
const clave = (l) => `${codigo(l.codigo)} × ${cantidad(l.cantidad)} (${l.tipo})`;

/**
 * Compara los productos del reclamo con los del Excel (sin importar el orden).
 * Devuelve la lista de diferencias; vacía si cuadran.
 */
export function diferenciasProductos(delReclamo, delExcel) {
  const cuenta = new Map();
  for (const l of delReclamo) cuenta.set(clave(l), (cuenta.get(clave(l)) || 0) + 1);
  for (const l of delExcel) cuenta.set(clave(l), (cuenta.get(clave(l)) || 0) - 1);
  const dif = [];
  for (const [k, n] of cuenta) {
    if (n > 0) dif.push(`en el reclamo y no en el Excel: ${k}${n > 1 ? ` (${n})` : ''}`);
    if (n < 0) dif.push(`en el Excel y no en el reclamo: ${k}${n < -1 ? ` (${-n})` : ''}`);
  }
  return dif;
}

const numero = (id) => `REC-${String(id).padStart(6, '0')}`;

export default async function migrar({ pool, schema }) {
  if (schema === 'Prod') await reemplazar(pool, schema);
  await pool
    .request()
    .input('nombre', NOMBRE)
    .query(`IF NOT EXISTS (SELECT 1 FROM [${schema}].SchemaMigrations WHERE Nombre = @nombre)
              INSERT INTO [${schema}].SchemaMigrations (Nombre) VALUES (@nombre)`);
}

async function reemplazar(pool, schema) {
  // Solo aquí: importarlo crea las carpetas de uploads del esquema.
  const { reclamoArchivoPath } = await import('../../src/config/almacenamiento.js');

  // 1. Validar los tres antes de cambiar nada.
  const planes = [];
  const errores = [];
  for (const { reclamoId, archivo } of ARCHIVOS) {
    const n = numero(reclamoId);
    const { recordset: rs } = await pool
      .request()
      .input('id', reclamoId)
      .query(`SELECT Token, Tipo, ArchivoExcel, ArchivoExcelNombre, EnviadoContabilidadAt FROM [${schema}].Reclamos WHERE ReclamoId = @id`);
    if (!rs.length) {
      errores.push(`${n}: no existe.`);
      continue;
    }
    const r = rs[0];
    if (r.ArchivoExcelNombre === archivo) {
      console.log(`    ${n}: ya tiene ${archivo}`);
      continue;
    }
    let excel;
    try {
      excel = parsearPlantilla(fs.readFileSync(path.join(ORIGEN, archivo)));
    } catch (e) {
      errores.push(`${n}: el Excel «${archivo}» no se pudo leer: ${e.message}`);
      continue;
    }
    const { recordset: lineas } = await pool
      .request()
      .input('token', r.Token)
      .query(`SELECT CodigoBarra, Cantidad, Tipo FROM [${schema}].ReclamoLineas WHERE ReclamoToken = @token`);
    const dif = diferenciasProductos(
      lineas.map((l) => ({ codigo: l.CodigoBarra, cantidad: l.Cantidad, tipo: l.Tipo })),
      excel.lineas.map((l) => ({ codigo: l.codigoBarra, cantidad: l.cantidad, tipo: l.tipo }))
    );
    if (dif.length) {
      errores.push(`${n}: los productos del Excel no cuadran con el reclamo:\n      - ${dif.join('\n      - ')}`);
      continue;
    }
    if (r.EnviadoContabilidadAt) console.log(`    AVISO ${n}: ya se envió a contabilidad con el Excel anterior.`);
    planes.push({ n, token: r.Token, archivo, guardado: `${crypto.randomUUID()}.xlsx`, antes: r.ArchivoExcelNombre, lineas: lineas.length });
  }
  if (errores.length) throw new Error(`028: no se cambió ningún Excel.\n  ${errores.join('\n  ')}`);
  if (!planes.length) return;

  // 2. Copiar los archivos y cambiar la referencia en una sola transacción.
  const copiados = [];
  const tx = pool.transaction();
  try {
    for (const p of planes) {
      fs.copyFileSync(path.join(ORIGEN, p.archivo), reclamoArchivoPath(p.guardado), fs.constants.COPYFILE_EXCL);
      copiados.push(reclamoArchivoPath(p.guardado));
    }
    await tx.begin();
    for (const p of planes) {
      await tx
        .request()
        .input('token', p.token)
        .input('guardado', p.guardado)
        .input('nombre', p.archivo)
        .query(`UPDATE [${schema}].Reclamos SET ArchivoExcel = @guardado, ArchivoExcelNombre = @nombre WHERE Token = @token`);
    }
    await tx.commit();
  } catch (e) {
    try {
      await tx.rollback();
    } catch {
      /* no había empezado */
    }
    for (const f of copiados) fs.rmSync(f, { force: true });
    throw e;
  }
  for (const p of planes) console.log(`    ${p.n}: Excel «${p.antes ?? 'sin nombre'}» → «${p.archivo}» (${p.lineas} producto(s) validados)`);
}
