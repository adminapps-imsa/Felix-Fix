// Reclamos que nacieron «Notificado» (solo informativo) aunque traen productos
// que no son de notificación (pedido del 2026-11-13, REC-000044 / 23294 - NOIR:
// 2 averías + 2 faltantes con su 911). El tipo del reclamo salió «Daños
// textil» y el reclamo entero quedó sin decisión ni envío a contabilidad.
// Desde este cambio solo es de notificación si TODOS sus productos lo son
// (esSoloNotificacion en src/domain/reclamo.js).
//
// Esta migración les pone el estado que tendrían hoy (estadoAlCrear):
//   - todos sus productos aprobados por el sistema → 'resuelto' (cierre
//     automático, DecisionBy 'sistema'): pasan a la cola de envío a contabilidad;
//   - si no → 'pendiente' (la compradora decide).
// En todos los esquemas. No manda correos. Idempotente: solo toca los que
// siguen 'notificado'.
import { TIPOS_SOLO_NOTIFICACION } from '../../src/services/reclamos/tipos.js';
import { esSoloNotificacion, estadoAlCrear } from '../../src/domain/reclamo.js';

const NOMBRE = '039_reclamos_notificados_con_faltantes.js';

/** Plan puro: [{ reclamoId, status }] de los notificados que no deberían serlo. */
export function planNotificados(reclamos, lineasPorToken) {
  const cambios = [];
  for (const r of reclamos) {
    const lineas = (lineasPorToken.get(r.Token) ?? []).map((l) => ({
      tipo: l.Tipo,
      decStatus: l.DecStatus === 'aprobado' && l.DecBy === 'sistema' ? 'aprobado' : 'pendiente',
    }));
    if (!lineas.length || esSoloNotificacion({ tipo: r.Tipo, lineas }, TIPOS_SOLO_NOTIFICACION)) continue;
    cambios.push({ reclamoId: r.ReclamoId, status: estadoAlCrear({ soloNotificacion: false, lineas }) });
  }
  return cambios;
}

export default async function migrar({ pool, schema }) {
  const tx = pool.transaction();
  await tx.begin();
  try {
    const { recordset: reclamos } = await tx.request().query(`SELECT ReclamoId, Token, Tipo FROM [${schema}].Reclamos WHERE Status = 'notificado'`);
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
