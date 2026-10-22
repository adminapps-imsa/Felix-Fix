// Eliminar un reclamo completo con sus archivos.
import * as repo from '../../repositories/reclamosRepository.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import { borrarArchivos } from './excelImages.js';
import * as dominio from '../../domain/reclamo.js';
import { notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { validarToken, exigir, numeroReclamo, nombreUsuario } from './comun.js';

export async function eliminar(token, usuario) {
  // El super administrador (sin «Vista por») elimina en cualquier estado (cerrado o ya en contabilidad).
  const forzado = Boolean(usuario?.esSuperAdmin && !usuario.vista);
  // La regla se revisa dentro de la transacción del DELETE, con la fila bloqueada (UPDLOCK).
  const res = await repo.eliminar(validarToken(token), (estado) => (forzado ? null : dominio.motivoNoModificable(estado, 'eliminar')));
  if (!res) throw notFound('Reclamo no encontrado.');
  exigir(res.bloqueado);
  const borrado = res.fila;
  // Solo después del commit: si la BD falla, los archivos siguen referenciados.
  await borrarArchivos([
    borrado.ArchivoExcel,
    ...parseJsonArray(borrado.ImagenesExcel).map((i) => i.filename),
    ...parseJsonArray(borrado.AdjuntosExtra).map((a) => a.filename),
    borrado.RetiroProveedorFoto,
  ]);
  logger.info(
    { reclamo: numeroReclamo(borrado.ReclamoId), usuario: nombreUsuario(usuario), status: borrado.Status, enContabilidad: Boolean(borrado.EnviadoContabilidadAt), forzado },
    'Reclamo eliminado'
  );
}
