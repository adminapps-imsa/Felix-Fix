// División de reportes y reclamos: solo las activas del catálogo (no se agregan nuevas desde los formularios).
import { listarCatalogo } from '../repositories/reclamosRepository.js';
import { motivoDivisionInvalida, valorDelCatalogo } from '../domain/catalogo.js';
import { badRequest } from '../utils/httpError.js';

/** Devuelve la división como está escrita en el catálogo, o 400 si no es una de las permitidas. */
export async function exigirDivision(valor) {
  const permitidas = await listarCatalogo('division');
  const motivo = motivoDivisionInvalida(valor, permitidas);
  if (motivo) throw badRequest(motivo, { code: 'DIVISION_INVALIDA' });
  return valorDelCatalogo(valor, permitidas);
}
