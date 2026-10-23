import path from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { evidenciaAbsolutePath } from '../../config/almacenamiento.js';
import * as localDiskStorage from './localDiskStorage.js';
import * as paperlessStorage from './paperlessStorage.js';

const PROVIDERS = { local: localDiskStorage, paperless: paperlessStorage };
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function currentProvider() {
  const impl = PROVIDERS[env.evidence.provider];
  if (!impl) {
    throw new Error(`EVIDENCE_STORAGE_PROVIDER="${env.evidence.provider}" desconocido.`);
  }
  return impl;
}

/**
 * La foto siempre se guarda primero en disco: crear o corregir el reporte
 * responde al instante. Con Paperless, después se mueve con moverAPaperless.
 */
export async function saveEvidence(multerFile) {
  currentProvider();
  return localDiskStorage.saveEvidence(multerFile);
}

/**
 * Con Paperless: sube en segundo plano la foto que quedó en disco y, si el
 * reporte la sigue usando, `guardar(nueva)` lo actualiza y se borra la copia
 * en disco. Si Paperless falla, la foto se queda en disco. No se espera ni
 * lanza (devuelve la promesa solo para las pruebas).
 * @param key     la foto en disco (EvidenciaKey)
 * @param titulo  título en Paperless («PD-000053 — producto»)
 * @param guardar async (nueva) => true si el reporte quedó apuntando a Paperless
 */
export function moverAPaperless(key, titulo, guardar) {
  if (env.evidence.provider !== 'paperless' || !key) return Promise.resolve();
  return (async () => {
    const ext = path.extname(key).slice(1).toLowerCase();
    const nueva = await paperlessStorage.saveEvidence({ path: evidenciaAbsolutePath(key), filename: key, mimetype: MIME[ext] || 'image/jpeg' }, { titulo });
    if (await guardar(nueva)) {
      await localDiskStorage.deleteEvidence(key);
      logger.info({ titulo, key: nueva.key }, 'Foto subida a Paperless');
    } else {
      // Mientras subía, cambiaron la foto o borraron el reporte: la de Paperless sobra.
      await deleteEvidence(nueva.provider, nueva.key);
    }
  })().catch((err) => logger.warn({ err: err.message, titulo, key }, 'No se pudo subir la foto a Paperless: queda en disco'));
}

/** Al arrancar con Paperless: revisa la conexión y crea lo que falte. Nunca lanza. */
export async function prepararEvidencia() {
  if (env.evidence.provider !== 'paperless') return;
  await paperlessStorage
    .prepararPaperless()
    .then((info) => logger.info(info, 'Paperless conectado: las fotos nuevas y una copia de los PDF van ahí'))
    .catch((err) => logger.error({ err: err.message }, 'Paperless no responde: las fotos se guardarán en disco hasta que vuelva'));
}

export const getEvidenceStream = (provider, key) => PROVIDERS[provider].getEvidenceStream(key);

/** Borra una foto que ya nadie usa. Nunca lanza: si falla, solo se registra. */
export async function deleteEvidence(provider, key) {
  if (!key || !PROVIDERS[provider]) return;
  await PROVIDERS[provider].deleteEvidence(key).catch((err) => logger.error({ err: err.message, provider, key }, 'No se pudo borrar una foto de evidencia'));
}
