// Sobrante no esperado que no estaba en SAP y la compradora aprobó: Data crea
// el artículo en SAP y carga aquí su código de barras. Se valida que ya
// exista en SAP. Cuando no queda ninguno esperando, se avisa a Torre de
// Control / Gof para que haga el 912 y lo envíe a contabilidad.
import * as repo from '../../repositories/reclamosRepository.js';
import { consultarProductos } from '../sapProductosService.js';
import { avisarReclamo } from '../correo/avisosReclamos.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { obtenerOFallar, nombreUsuario, detalle, numeroReclamo } from './comun.js';
import { lineas as lineasDelReclamo } from './decisiones.js';

export async function cargarCodigo(token, posicion, { codigoBarra }, usuario) {
  const r = await obtenerOFallar(token);
  const pos = Number(posicion);
  const linea = Number.isInteger(pos) ? await repo.obtenerLinea(token, pos) : null;
  if (!linea) throw notFound('Producto no encontrado en este reclamo.');
  if (linea.Tipo !== 'sobrante_no_esperado' || !linea.EsperaData) {
    throw conflict('Este producto no está esperando que Data lo cree en SAP.', { code: 'NO_ESPERA_DATA' });
  }
  if (linea.DecStatus !== 'aprobado') {
    throw conflict('Primero la compradora debe aprobar este producto; después Data carga su código.', { code: 'SIN_APROBAR' });
  }

  const codigo = String(codigoBarra ?? '').trim();
  const sap = await consultarProductos([codigo]);
  if (!sap.disponible) throw badRequest('SAP no responde en este momento: no se pudo comprobar el código. Intenta de nuevo en unos minutos.', { code: 'SAP_NO_DISPONIBLE' });
  const prod = sap.productos.get(codigo);
  if (!prod) throw badRequest(`El código ${codigo} todavía no está creado en SAP. Créalo primero y vuelve a cargarlo.`, { code: 'NO_EN_SAP' });

  const { ok, quedan } = await repo.asignarCodigoData(token, pos, { codigo, descripcion: prod.descripcion, usuario: nombreUsuario(usuario) });
  if (!ok) throw conflict('El producto ya tiene código o el reclamo ya se envió a contabilidad. Recarga el detalle.', { code: 'NO_ESPERA_DATA' });
  logger.info({ reclamo: numeroReclamo(r.ReclamoId), posicion: pos, codigo, usuario: nombreUsuario(usuario), quedan }, 'Data cargó el código de un sobrante no esperado');

  // Ya no queda ninguno esperando: Torre de Control / Gof puede hacer el 912 y enviarlo.
  if (quedan === 0) {
    const dto = await detalle(token);
    if (!dto.EnviadoContabilidadAt && (dto.Status === 'resuelto' || dto.Status === 'rechazado')) avisarReclamo('listo_data', dto, { de: usuario.name || nombreUsuario(usuario) });
  }
  const todas = await lineasDelReclamo(token);
  return todas.find((l) => l.Posicion === pos);
}
