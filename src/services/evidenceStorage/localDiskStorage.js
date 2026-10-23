import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { evidenciaAbsolutePath } from '../../config/almacenamiento.js';

/**
 * El archivo ya fue guardado en disco por multer (ver middleware/upload.js),
 * que generó el nombre opaco. Aquí solo registramos la "key" que se persiste
 * en la base de datos.
 */
export async function saveEvidence(multerFile) {
  return { provider: 'local', key: multerFile.filename };
}

export async function getEvidenceStream(key) {
  const filePath = evidenciaAbsolutePath(key);
  if (!fs.existsSync(filePath)) return null;
  return fs.createReadStream(filePath);
}

export async function deleteEvidence(key) {
  await fsp.unlink(evidenciaAbsolutePath(key)).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
}
