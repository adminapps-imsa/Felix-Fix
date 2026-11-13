// Escribe la bitácora (tabla Bitacora, migración 040) en segundo plano: las
// filas se juntan y se guardan por lotes cada pocos segundos. Si la BD falla,
// la petición del usuario no se entera (solo se avisa en el log, sin volver a
// la bitácora para no entrar en un bucle). Reglas: src/domain/bitacora.js.
import { getPool, sql, S } from '../../config/db.js';
import { isDbConfigured } from '../../config/env.js';
import { logger, alRegistrarProblema } from '../../utils/logger.js';

const CADA_MS = 3000;
const MAX_COLA = 2000; // tope en memoria si la BD no responde: se descarta lo más viejo
const LOTE = 200;
const RETENCION_DIAS = 180;

let cola = [];
let timer = null;
let guardando = false;
let ultimaLimpieza = 0;

const corto = (v, n) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));

/** Anota un evento. Nunca lanza. `e`: { clase, nivel, modulo, accion, mensaje?, codigo?, usuario?, ... }. */
export function registrar(e) {
  if (!isDbConfigured() || process.env.NODE_ENV === 'test') return;
  cola.push({ ...e, fecha: new Date() });
  if (cola.length > MAX_COLA) cola = cola.slice(-MAX_COLA);
  if (!timer) {
    timer = setTimeout(guardar, CADA_MS);
    timer.unref?.();
  }
}

async function guardar() {
  timer = null;
  if (guardando || !cola.length) return;
  guardando = true;
  const lote = cola.splice(0, LOTE);
  try {
    const pool = await getPool();
    const tabla = new sql.Table(`${S}.Bitacora`);
    tabla.create = false;
    tabla.columns.add('Fecha', sql.DateTime2, { nullable: false });
    tabla.columns.add('Clase', sql.VarChar(10), { nullable: false });
    tabla.columns.add('Nivel', sql.VarChar(10), { nullable: false });
    tabla.columns.add('Modulo', sql.VarChar(30), { nullable: false });
    tabla.columns.add('Accion', sql.NVarChar(200), { nullable: false });
    tabla.columns.add('Mensaje', sql.NVarChar(2000), { nullable: true });
    tabla.columns.add('Codigo', sql.VarChar(60), { nullable: true });
    tabla.columns.add('Usuario', sql.VarChar(150), { nullable: true });
    tabla.columns.add('UsuarioNombre', sql.NVarChar(200), { nullable: true });
    tabla.columns.add('Roles', sql.NVarChar(500), { nullable: true });
    tabla.columns.add('Metodo', sql.VarChar(10), { nullable: true });
    tabla.columns.add('Ruta', sql.NVarChar(400), { nullable: true });
    tabla.columns.add('Estado', sql.Int, { nullable: true });
    tabla.columns.add('DuracionMs', sql.Int, { nullable: true });
    tabla.columns.add('RecursoTipo', sql.VarChar(20), { nullable: true });
    tabla.columns.add('RecursoId', sql.VarChar(64), { nullable: true });
    for (const e of lote) {
      tabla.rows.add(
        e.fecha,
        corto(e.clase, 10),
        corto(e.nivel, 10),
        corto(e.modulo, 30) ?? 'sistema',
        corto(e.accion, 200) ?? '—',
        corto(e.mensaje, 2000),
        corto(e.codigo, 60),
        corto(e.usuario, 150),
        corto(e.usuarioNombre, 200),
        e.roles?.length ? corto(`,${e.roles.join(',')},`, 500) : null,
        corto(e.metodo, 10),
        corto(e.ruta, 400),
        Number.isInteger(e.estado) ? e.estado : null,
        Number.isFinite(e.duracionMs) ? Math.round(e.duracionMs) : null,
        corto(e.recursoTipo, 20),
        corto(e.recursoId, 64)
      );
    }
    await pool.request().bulk(tabla);
    await limpiarViejos(pool);
  } catch (err) {
    // Sin bitácora (p. ej. sin la tabla todavía): se avisa solo en el log.
    logger.warn({ err: err.message, filas: lote.length, bitacora: false }, 'No se pudo guardar la bitácora');
  } finally {
    guardando = false;
    if (cola.length && !timer) {
      timer = setTimeout(guardar, CADA_MS);
      timer.unref?.();
    }
  }
}

/** Una vez al día: borra lo de más de RETENCION_DIAS. */
async function limpiarViejos(pool) {
  if (Date.now() - ultimaLimpieza < 24 * 3600 * 1000) return;
  ultimaLimpieza = Date.now();
  await pool.request().input('dias', sql.Int, RETENCION_DIAS).query(`DELETE FROM ${S}.Bitacora WHERE Fecha < DATEADD(DAY, -@dias, SYSUTCDATETIME())`);
}

/** Al cerrar el servidor: guarda lo pendiente. */
export async function vaciarBitacora() {
  if (timer) clearTimeout(timer);
  timer = null;
  while (cola.length && !guardando) await guardar();
}

// Problemas internos (avisos y errores del log que no vienen de una petición:
// SAP, correo, Keycloak, Paperless…) también van a «Errores», módulo Sistema.
alRegistrarProblema((nivel, mensaje, datos) => {
  registrar({
    clase: 'error',
    nivel: nivel >= 50 ? 'falla' : 'aviso',
    modulo: 'sistema',
    accion: mensaje,
    mensaje: datos?.err?.message ?? (typeof datos?.err === 'string' ? datos.err : null),
  });
});
