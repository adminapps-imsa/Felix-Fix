// REC-000042 de Prod (SUGAR LIPS, pedido del 2026-11-12): al crearlo, la hoja
// «Sobrante NO esperado» del Excel traía «ESTILO» en vez de «REFERENCIA» y el
// portal la ignoró (2b2f6bf ya la lee). Quedó con solo los 3 faltantes y se
// cerró automáticamente.
//
// Vuelve a leer el Excel guardado del reclamo con el lector actual y:
//   1. Valida que los productos que ya tiene (los faltantes) son los mismos
//      del Excel (código, cantidad y motivo). Si no cuadran, falla sin tocar
//      nada y el despliegue vuelve atrás.
//   2. Agrega los sobrantes no esperados como «por decidir» de la compradora,
//      con Referencia/Color/Talla y EsperaData (sin código o no creado en SAP,
//      igual que al crear un reclamo). Si SAP no responde, falla sin tocar nada.
//   3. Reabre el reclamo (pendiente, sin decisión del sistema): ahora tiene
//      productos que la compradora debe decidir.
// No manda correos (hay que avisarle a la compradora). Los faltantes y sus
// decisiones quedan igual.
//
// Solo en Prod: en QA el 42 es otro reclamo (solo se registra).
// Idempotente: si el reclamo ya tiene sobrantes no esperados, no hace nada.
import fs from 'node:fs';
import { parsearPlantilla } from '../../src/services/reclamos/excelParser.js';
import { diferenciasProductos } from './028_prod_reclamos_5_6_7_excel.js';

const NOMBRE = '034_prod_rec42_sobrante_no_esperado.js';
const RECLAMO_ID = 42;
const SNE = 'sobrante_no_esperado';

/**
 * Plan puro (sin BD): qué líneas agregar. `actuales`: filas de ReclamoLineas;
 * `excel`: resultado de parsearPlantilla; `sap`: { disponible, productos: Map }.
 * Devuelve { error } o { yaEstaba } o { agregar: [...] }.
 */
export function planRec42(actuales, excel, sap) {
  if (actuales.some((l) => l.Tipo === SNE)) return { yaEstaba: true };
  const sne = excel.lineas.filter((l) => l.tipo === SNE);
  if (!sne.length) return { error: 'el Excel no trae sobrantes no esperados.' };
  const dif = diferenciasProductos(
    actuales.map((l) => ({ codigo: l.CodigoBarra, cantidad: l.Cantidad, tipo: l.Tipo })),
    excel.lineas.filter((l) => l.tipo !== SNE).map((l) => ({ codigo: l.codigoBarra, cantidad: l.cantidad, tipo: l.tipo }))
  );
  if (dif.length) return { error: `los productos del Excel no cuadran con el reclamo:\n      - ${dif.join('\n      - ')}` };
  if (sne.some((l) => l.codigoBarra) && !sap.disponible) return { error: 'SAP no responde: no se puede saber qué sobrantes están creados.' };
  let pos = Math.max(0, ...actuales.map((l) => Number(l.Posicion)));
  return {
    agregar: sne.map((l) => ({
      posicion: (pos += 1),
      codigoBarra: l.codigoBarra || null,
      cantidad: l.cantidad,
      descripcion: l.descripcion,
      referencia: l.referencia,
      color: l.color,
      talla: l.talla,
      esperaData: !l.codigoBarra || !sap.productos.has(l.codigoBarra),
    })),
  };
}

export default async function migrar({ pool, schema }) {
  if (schema === 'Prod') await arreglar(pool, schema);
  await pool
    .request()
    .input('nombre', NOMBRE)
    .query(`IF NOT EXISTS (SELECT 1 FROM [${schema}].SchemaMigrations WHERE Nombre = @nombre)
              INSERT INTO [${schema}].SchemaMigrations (Nombre) VALUES (@nombre)`);
}

async function arreglar(pool, schema) {
  const { reclamoArchivoPath } = await import('../../src/config/almacenamiento.js');
  const { recordset: rs } = await pool
    .request()
    .input('id', RECLAMO_ID)
    .query(`SELECT Token, Status, ArchivoExcel, EnviadoContabilidadAt FROM [${schema}].Reclamos WHERE ReclamoId = @id`);
  if (!rs.length) throw new Error('034: REC-000042 no existe.');
  const r = rs[0];
  if (r.EnviadoContabilidadAt) throw new Error('034: REC-000042 ya se envió a contabilidad; no se toca.');
  if (!r.ArchivoExcel) throw new Error('034: REC-000042 no tiene Excel.');

  const excel = parsearPlantilla(fs.readFileSync(reclamoArchivoPath(r.ArchivoExcel)));
  const { recordset: actuales } = await pool
    .request()
    .input('token', r.Token)
    .query(`SELECT Posicion, CodigoBarra, Cantidad, Tipo FROM [${schema}].ReclamoLineas WHERE ReclamoToken = @token`);

  // SAP solo para los sobrantes con código.
  const codigos = excel.lineas.filter((l) => l.tipo === SNE && l.codigoBarra).map((l) => l.codigoBarra);
  let sap = { disponible: true, productos: new Map() };
  if (codigos.length && !actuales.some((l) => l.Tipo === SNE)) {
    const { consultarProductos } = await import('../../src/services/sapProductosService.js');
    sap = await consultarProductos(codigos);
    try {
      const { getSapOraclePool } = await import('../../src/config/oracle.js');
      await (await getSapOraclePool()).close(0);
    } catch {
      /* sin pool que cerrar */
    }
  }

  const plan = planRec42(actuales, excel, sap);
  if (plan.yaEstaba) {
    console.log('    REC-000042: ya tiene los sobrantes no esperados');
    return;
  }
  if (plan.error) throw new Error(`034: REC-000042 sin cambios: ${plan.error}`);

  const tx = pool.transaction();
  await tx.begin();
  try {
    for (const l of plan.agregar) {
      await tx
        .request()
        .input('token', r.Token)
        .input('pos', l.posicion)
        .input('cod', l.codigoBarra)
        .input('cant', l.cantidad)
        .input('desc', l.descripcion)
        .input('ref', l.referencia)
        .input('col', l.color)
        .input('tal', l.talla)
        .input('ed', l.esperaData ? 1 : 0)
        .query(`INSERT INTO [${schema}].ReclamoLineas
                  (ReclamoToken, Posicion, CodigoBarra, Cantidad, Tipo, DescripcionExcel, DecStatus, Referencia, Color, Talla, EsperaData)
                VALUES (@token, @pos, @cod, @cant, '${SNE}', @desc, 'pendiente', @ref, @col, @tal, @ed)`);
    }
    await tx
      .request()
      .input('token', r.Token)
      .query(`UPDATE [${schema}].Reclamos SET Status = 'pendiente', DecisionBy = NULL, DecisionAt = NULL WHERE Token = @token AND EnviadoContabilidadAt IS NULL`);
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
  const paraData = plan.agregar.filter((l) => l.esperaData).length;
  console.log(`    REC-000042: ${plan.agregar.length} sobrante(s) no esperado(s) agregados (${paraData} sin SAP → Data); reabierto (antes ${r.Status})`);
}
