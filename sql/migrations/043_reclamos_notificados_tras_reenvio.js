// Reclamos que quedaron «Notificado» al reenviarlos después de corregirlos
// (pedido del 2026-11-16, REC-000050: daño textil devuelto, con «Reemplazar»
// el Excel pasó a una devolución aprobada sola y al reenviarlo volvió a
// notificado, sin envío a contabilidad). Desde este cambio, al reenviarlo se
// recalcula (estadoAlReenviar en src/domain/reclamo.js).
//
// Igual que la 039: a los notificados que ya no son solo de notificación les
// pone el estado que tendrían al crearlos ('resuelto' por el sistema si todo
// se aprobó solo; si no, 'pendiente'). En todos los esquemas. No manda
// correos. Idempotente: solo toca los que siguen 'notificado'.
import { planNotificados } from './039_reclamos_notificados_con_faltantes.js';

const NOMBRE = '043_reclamos_notificados_tras_reenvio.js';

export default async function migrar({ pool, schema }) {
  const tx = pool.transaction();
  await tx.begin();
  try {
    const { recordset: reclamos } = await tx.request().query(`SELECT ReclamoId, Token, Tipo FROM [${schema}].Reclamos WHERE Status = 'notificado' AND EnviadoContabilidadAt IS NULL`);
    const { recordset: lineas } = await tx.request().query(`
      SELECT l.ReclamoToken, l.Tipo, l.DecStatus, l.DecBy
      FROM [${schema}].ReclamoLineas l
      JOIN [${schema}].Reclamos r ON r.Token = l.ReclamoToken
      WHERE r.Status = 'notificado'`);
    const porToken = new Map();
    for (const l of lineas) {
      const k = String(l.ReclamoToken).toLowerCase();
      if (!porToken.has(k)) porToken.set(k, []);
      porToken.get(k).push(l);
    }
    const cambios = planNotificados(
      reclamos.map((r) => ({ ...r, Token: String(r.Token).toLowerCase() })),
      porToken
    );
    for (const c of cambios) {
      await tx
        .request()
        .input('id', c.reclamoId)
        .input('status', c.status)
        .query(`UPDATE [${schema}].Reclamos
                SET Status = @status,
                    DecisionBy = CASE WHEN @status = 'resuelto' THEN 'sistema' ELSE DecisionBy END,
                    DecisionAt = CASE WHEN @status = 'resuelto' THEN SYSUTCDATETIME() ELSE DecisionAt END
                WHERE ReclamoId = @id AND Status = 'notificado'`);
      console.log(`    REC-${String(c.reclamoId).padStart(6, '0')}: notificado → ${c.status}`);
    }
    if (!cambios.length) console.log('    ningún reclamo notificado por corregir');
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
