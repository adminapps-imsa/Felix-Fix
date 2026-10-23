// Copia en Paperless de los PDF del portal (documentos SAP de los reclamos y
// adjuntos de Productos Dañados). Solo con EVIDENCE_STORAGE_PROVIDER=paperless.
//
// El original se queda en disco: el portal lo sigue leyendo de ahí (validar
// contra SAP, enviar a contabilidad, correos, descargas). En Paperless queda
// una copia para buscar y archivar. Todo va en segundo plano: subir o borrar
// un PDF no espera a Paperless, y si falla solo queda en el log.
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import * as paperless from './paperlessStorage.js';

export { TIPO_RECLAMO, TIPO_PRODUCTO_DANADO } from './paperlessStorage.js';

const activo = () => env.evidence.provider === 'paperless';

/**
 * Sube una copia del PDF. No se espera ni lanza (devuelve la promesa solo para las pruebas).
 * @param ruta      el PDF en disco
 * @param filename  su nombre en disco (único; con él se encuentra para borrarlo)
 * @param titulo    «REC-000024 — nota.pdf», «PD-000053 — factura.pdf»
 * @param tipoDocumento TIPO_RECLAMO | TIPO_PRODUCTO_DANADO
 */
export function copiarPdf(ruta, { filename, titulo, tipoDocumento }) {
  if (!activo()) return Promise.resolve();
  return paperless
    .saveEvidence({ path: ruta, filename, mimetype: 'application/pdf' }, { titulo, tipoDocumento })
    .then((copia) => logger.info({ titulo, key: copia.key }, 'PDF copiado a Paperless'))
    .catch((err) => logger.warn({ err: err.message, titulo, filename }, 'No se pudo copiar el PDF a Paperless (el original sigue en el portal)'));
}

/** Borra en Paperless las copias de esos PDF (se quitaron del portal). En segundo plano. */
export function borrarCopiasPdf(filenames) {
  const lista = filenames.filter(Boolean);
  if (!activo() || !lista.length) return Promise.resolve();
  return Promise.all(
    lista.map((f) =>
      paperless.deleteByFilename(f).catch((err) => logger.warn({ err: err.message, filename: f }, 'No se pudo borrar la copia del PDF en Paperless'))
    )
  );
}
