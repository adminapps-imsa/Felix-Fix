import { env } from '../../config/env.js';
import * as localDiskStorage from './localDiskStorage.js';
import * as paperlessStorage from './paperlessStorage.js';

const PROVIDERS = { local: localDiskStorage, paperless: paperlessStorage };

function currentProvider() {
  const impl = PROVIDERS[env.evidence.provider];
  if (!impl) {
    throw new Error(`EVIDENCE_STORAGE_PROVIDER="${env.evidence.provider}" desconocido.`);
  }
  return impl;
}

export const saveEvidence = (multerFile) => currentProvider().saveEvidence(multerFile);
export const getEvidenceStream = (provider, key) => PROVIDERS[provider].getEvidenceStream(key);
