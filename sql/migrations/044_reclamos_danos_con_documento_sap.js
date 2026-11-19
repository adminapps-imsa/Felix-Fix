// Daños con documento SAP van a contabilidad (pedido del 2026-11-18,
// REC-000058: daño textil de CEDI con su nota de débito 911 quedó
// «Notificado», sin envío a contabilidad). Desde este cambio un reclamo solo
// es de notificación si además NO trae documento SAP (esSoloNotificacion en
// src/domain/reclamo.js).
//
// A los «Notificado» que tienen documento SAP y no se enviaron a contabilidad
// les pone el estado que tendrían hoy al crearlos (estadoAlCrear): todo
// aprobado por el sistema → 'resuelto' (cierre automático, DecisionBy
// 'sistema'); si no → 'pendiente'. En todos los esquemas. No manda correos.
// Idempotente: solo toca los que siguen 'notificado'.
import { estadoAlCrear, tieneDocumentoSap } from '../../src/domain/reclamo.js';

const NOMBRE = '044_reclamos_danos_con_documento_sap.js';

/** Plan puro: [{ reclamoId, status }] de los notificados con documento SAP. */
export function planDanosConDocumento(reclamos, lineasPorToken) {
  const cambios = [];
  for (const r of reclamos) {
    if (!tieneDocumentoSap(r)) continue;
    const lineas = (lineasPorToken.get(r.Token) ?? []).map((l) => ({
      tipo: l.Tipo,
      decStatus: l.DecStatus === 'aprobado' && l.DecBy === 'sistema' ? 'aprobado' : 'pendiente',
    }));
    if (!lineas.length) continue;
    cambios.push({ reclamoId: r.ReclamoId, status: estadoAlCrear({ soloNotificacion: false, lineas }) });
  }
  return cambios;
}

export default async function migrar({ pool, schema }) {
  const tx = pool.transaction();
  await tx.begin();
  try {
    const { recordset: reclamos } = await tx.request().query(`
      SELECT ReclamoId, Token, Tipo, SapDoc1, SapDoc2, SapDoc3, SapDocsExtra
      FROM [${schema}].Reclamos WHERE Status = 'notificado' AND EnviadoContabilidadAt IS NULL`);
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
    const cambios = planDanosConDocumento(
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
    if (!cambios.length) console.log('    ningún reclamo notificado con documento SAP');
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
