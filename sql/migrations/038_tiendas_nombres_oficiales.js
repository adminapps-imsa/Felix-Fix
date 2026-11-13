// Tiendas bien escritas (pedido del 2026-11-13). Dixa (Costa del Este) no
// veía sus reclamos: la tienda TD28 se llamaba «Town Center» y en los
// reclamos se escribía «COSTA DEL ESTE»; Alta Plaza estaba como «ALTAPLAZA».
//
//   1. La tienda TD28 pasa a llamarse «Costa del Este» («Town Center» queda
//      como alias en src/domain/tienda.js).
//   2. La sucursal de cada reclamo de Tienda queda con el nombre del catálogo
//      si corresponde a una tienda (por nombre, código o alias, sin acentos
//      ni espacios: tiendaDeSucursal). Solo cambia el texto de Sucursal; los
//      que no corresponden a ninguna tienda se dejan igual y se listan.
//
// En todos los esquemas (en QA también hay reclamos de prueba). Idempotente:
// una segunda vez no encuentra nada que cambiar. No manda correos.
import { tiendaDeSucursal } from '../../src/domain/tienda.js';

const NOMBRE = '038_tiendas_nombres_oficiales.js';

/** Plan puro: { reclamoId, antes, ahora } de las sucursales que cambian y las que no son de ninguna tienda. */
export function planSucursales(reclamos, tiendas) {
  const cambios = [];
  const sinTienda = [];
  for (const r of reclamos) {
    const t = tiendaDeSucursal(r.Sucursal, tiendas);
    if (!t) sinTienda.push(r);
    else if (r.Sucursal !== t.Nombre) cambios.push({ reclamoId: r.ReclamoId, antes: r.Sucursal, ahora: t.Nombre });
  }
  return { cambios, sinTienda };
}

export default async function migrar({ pool, schema }) {
  const tx = pool.transaction();
  await tx.begin();
  try {
    const renombrada = await tx
      .request()
      .query(`UPDATE [${schema}].Tiendas SET Nombre = N'Costa del Este' WHERE Codigo = 'TD28' AND Nombre <> N'Costa del Este'`);
    if (renombrada.rowsAffected[0]) console.log('    Tienda TD28: «Town Center» → «Costa del Este»');

    const { recordset: tiendas } = await tx.request().query(`SELECT Codigo, Nombre FROM [${schema}].Tiendas`);
    const { recordset: reclamos } = await tx
      .request()
      .query(`SELECT ReclamoId, Sucursal FROM [${schema}].Reclamos WHERE Origen = 'tienda' AND Sucursal IS NOT NULL AND LTRIM(RTRIM(Sucursal)) <> ''`);
    const { cambios, sinTienda } = planSucursales(reclamos, tiendas);

    for (const c of cambios) {
      await tx
        .request()
        .input('id', c.reclamoId)
        .input('antes', c.antes)
        .input('ahora', c.ahora)
        .query(`UPDATE [${schema}].Reclamos SET Sucursal = @ahora WHERE ReclamoId = @id AND Sucursal = @antes`);
    }
    const resumen = new Map();
    for (const c of cambios) {
      const k = `«${c.antes}» → «${c.ahora}»`;
      resumen.set(k, (resumen.get(k) || 0) + 1);
    }
    for (const [k, n] of resumen) console.log(`    Sucursal ${k}: ${n} reclamo(s)`);
    for (const r of sinTienda) console.log(`    REC-${String(r.ReclamoId).padStart(6, '0')}: «${r.Sucursal}» no es una tienda del catálogo; se deja igual`);

    await tx
      .request()
      .input('nombre', NOMBRE)
      .query(`IF NOT EXISTS (SELECT 1 FROM [${schema}].SchemaMigrations WHERE Nombre = @nombre)
                INSERT INTO [${schema}].SchemaMigrations (Nombre) VALUES (@nombre)`);
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}
