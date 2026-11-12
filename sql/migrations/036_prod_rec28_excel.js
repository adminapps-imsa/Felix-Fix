// REC-000028 de Prod (PRESTIGE, Multiplaza; pedido del 2026-11-12): el Excel
// correcto es «PRESTIGE (2).xlsx» (sql/migrations/archivos/036/). En el que
// se subió, el faltante de «T-SHIRT P/H M/, ULTRAMARINE, S» traía el código
// de la talla M (9246752766, material …308022); el correcto es 9246752773,
// la talla S que está en la nota de débito 4904525827 (material …308021).
//
// Antes de tocar nada valida que el Excel nuevo trae los mismos productos que
// el reclamo salvo ese código (misma cantidad y motivo). Si hay cualquier otra
// diferencia, falla sin cambiar nada y el despliegue vuelve atrás. Cambia:
//   - el código de barras (y la descripción del Excel) de ese faltante;
//   - el Excel principal del reclamo (ArchivoExcel/ArchivoExcelNombre).
// Las decisiones, los PDF y el estado quedan igual. El Excel anterior queda
// en disco, sin referencia. No manda correos.
//
// Solo en Prod: en QA el 28 es otro reclamo (solo se registra).
// Idempotente: si el faltante ya tiene el código correcto, no hace nada.
// (Hasta el 2026-11-12 lo decidía por el nombre del Excel, pero el que se
// subió también se llamaba «PRESTIGE (2).xlsx» y en Prod no cambió nada:
// por eso existe la 037, que vuelve a correr este arreglo.)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parsearPlantilla } from '../../src/services/reclamos/excelParser.js';
import { diferenciasProductos } from './028_prod_reclamos_5_6_7_excel.js';

const NOMBRE = '036_prod_rec28_excel.js';
const RECLAMO_ID = 28;
const ARCHIVO = 'PRESTIGE (2).xlsx';
const ORIGEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'archivos', '036');
export const CAMBIO = { tipo: 'faltante_real', cantidad: 1, antes: '9246752766', ahora: '9246752773' };

/**
 * Plan puro (sin BD). `actuales`: filas de ReclamoLineas; `excel`: resultado
 * de parsearPlantilla. Devuelve { error } o { posicion, descripcion }.
 */
export function planRec28(actuales, excel) {
  const corregidas = actuales.map((l) => ({ ...l }));
  const candidatas = corregidas.filter((l) => l.CodigoBarra === CAMBIO.antes && l.Tipo === CAMBIO.tipo);
  if (candidatas.length !== 1) return { error: `se esperaba 1 faltante con el código ${CAMBIO.antes} y hay ${candidatas.length}.` };
  candidatas[0].CodigoBarra = CAMBIO.ahora;
  const dif = diferenciasProductos(
    corregidas.map((l) => ({ codigo: l.CodigoBarra, cantidad: l.Cantidad, tipo: l.Tipo })),
    excel.lineas.map((l) => ({ codigo: l.codigoBarra, cantidad: l.cantidad, tipo: l.tipo }))
  );
  if (dif.length) return { error: `aun con el código corregido, los productos no cuadran:\n      - ${dif.join('\n      - ')}` };
  const nueva = excel.lineas.find((l) => l.codigoBarra === CAMBIO.ahora && l.tipo === CAMBIO.tipo);
  return { posicion: candidatas[0].Posicion, descripcion: nueva?.descripcion ?? null };
}

export default async function migrar({ pool, schema }) {
  if (schema === 'Prod') await arreglar(pool, schema);
  await pool
    .request()
    .input('nombre', NOMBRE)
    .query(`IF NOT EXISTS (SELECT 1 FROM [${schema}].SchemaMigrations WHERE Nombre = @nombre)
              INSERT INTO [${schema}].SchemaMigrations (Nombre) VALUES (@nombre)`);
}

/** true si el reclamo ya tiene el código corregido y no el equivocado. */
export const yaCorregido = (actuales) =>
  !actuales.some((l) => l.Tipo === CAMBIO.tipo && l.CodigoBarra === CAMBIO.antes) &&
  actuales.filter((l) => l.Tipo === CAMBIO.tipo && l.CodigoBarra === CAMBIO.ahora).length === 1;

export async function arreglar(pool, schema) {
  // Solo aquí: importarlo crea las carpetas de uploads del esquema.
  const { reclamoArchivoPath } = await import('../../src/config/almacenamiento.js');
  const { recordset: rs } = await pool
    .request()
    .input('id', RECLAMO_ID)
    .query(`SELECT Token, ArchivoExcelNombre, EnviadoContabilidadAt FROM [${schema}].Reclamos WHERE ReclamoId = @id`);
  if (!rs.length) throw new Error('036: REC-000028 no existe.');
  const r = rs[0];
  const { recordset: actuales } = await pool
    .request()
    .input('token', r.Token)
    .query(`SELECT Posicion, CodigoBarra, Cantidad, Tipo FROM [${schema}].ReclamoLineas WHERE ReclamoToken = @token`);
  if (yaCorregido(actuales)) {
    console.log(`    REC-000028: el faltante ya tiene ${CAMBIO.ahora}`);
    return;
  }
  if (r.EnviadoContabilidadAt) throw new Error('036: REC-000028 ya se envió a contabilidad; no se toca.');

  const buffer = fs.readFileSync(path.join(ORIGEN, ARCHIVO));
  const excel = parsearPlantilla(buffer);
  const plan = planRec28(actuales, excel);
  if (plan.error) throw new Error(`036: REC-000028 sin cambios: ${plan.error}`);

  const guardado = `${crypto.randomUUID()}.xlsx`;
  const destino = reclamoArchivoPath(guardado);
  fs.writeFileSync(destino, buffer, { flag: 'wx' });
  const tx = pool.transaction();
  try {
    await tx.begin();
    await tx
      .request()
      .input('token', r.Token)
      .input('pos', plan.posicion)
      .input('antes', CAMBIO.antes)
      .input('ahora', CAMBIO.ahora)
      .input('desc', plan.descripcion)
      .query(`UPDATE [${schema}].ReclamoLineas SET CodigoBarra = @ahora, DescripcionExcel = COALESCE(@desc, DescripcionExcel)
              WHERE ReclamoToken = @token AND Posicion = @pos AND CodigoBarra = @antes`)
      .then((res) => {
        if (res.rowsAffected[0] !== 1) throw new Error('036: el producto cambió mientras se corregía; sin cambios.');
      });
    await tx
      .request()
      .input('token', r.Token)
      .input('guardado', guardado)
      .input('nombre', ARCHIVO)
      .query(`UPDATE [${schema}].Reclamos SET ArchivoExcel = @guardado, ArchivoExcelNombre = @nombre WHERE Token = @token`);
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    fs.rmSync(destino, { force: true });
    throw e;
  }
  console.log(`    REC-000028: producto ${plan.posicion} ${CAMBIO.antes} → ${CAMBIO.ahora}; Excel «${r.ArchivoExcelNombre ?? 'sin nombre'}» → «${ARCHIVO}»`);
}
