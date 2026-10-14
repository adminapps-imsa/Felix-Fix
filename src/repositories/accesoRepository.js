import { getPool, sql, S } from '../config/db.js';

/** Map<rol, Set<permiso>> con todo lo guardado. */
export async function permisosPorRol() {
  const pool = await getPool();
  const { recordset } = await pool.request().query(`SELECT Rol, Permiso FROM ${S}.RolPermisos`);
  const mapa = new Map();
  for (const r of recordset) {
    if (!mapa.has(r.Rol)) mapa.set(r.Rol, new Set());
    mapa.get(r.Rol).add(r.Permiso);
  }
  return mapa;
}

/** Reemplaza los permisos de un rol, en una transacción. */
export async function guardarPermisosRol(rol, permisos, usuario) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('rol', sql.NVarChar(100), rol).query(`DELETE FROM ${S}.RolPermisos WHERE Rol = @rol`);
    for (const p of permisos) {
      await new sql.Request(tx)
        .input('rol', sql.NVarChar(100), rol)
        .input('permiso', sql.VarChar(50), p)
        .input('usuario', sql.VarChar(150), usuario)
        .query(`INSERT INTO ${S}.RolPermisos (Rol, Permiso, CreatedBy) VALUES (@rol, @permiso, @usuario)`);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function registrarAuditoria(accion, detalle, usuario) {
  const pool = await getPool();
  await pool
    .request()
    .input('accion', sql.VarChar(30), accion)
    .input('detalle', sql.NVarChar(1000), detalle.slice(0, 1000))
    .input('usuario', sql.VarChar(150), usuario)
    .query(`INSERT INTO ${S}.ConfigAuditoria (Accion, Detalle, Usuario) VALUES (@accion, @detalle, @usuario)`);
}

export async function listarAuditoria(limite = 100) {
  const pool = await getPool();
  const { recordset } = await pool
    .request()
    .input('limite', sql.Int, limite)
    .query(`SELECT TOP (@limite) Accion, Detalle, Usuario, Fecha FROM ${S}.ConfigAuditoria ORDER BY Fecha DESC, ConfigAuditoriaId DESC`);
  return recordset;
}
