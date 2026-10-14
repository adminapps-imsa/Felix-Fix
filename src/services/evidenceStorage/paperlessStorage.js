/**
 * STUB — integración con Paperless-ngx aún no implementada.
 *
 * El usuario mencionó que Paperless-ngx ya está integrado en su infraestructura
 * para PDFs/documentos, pero todavía no decidió si las fotos de evidencia de
 * este módulo deben subirse ahí en vez de a disco local. Falta confirmar:
 *   - URL base de la instancia Paperless-ngx y token/credenciales de API.
 *   - Endpoint exacto para subir un documento (`/api/documents/post_document/`
 *     es el estándar de Paperless-ngx, pero hay que confirmar la versión).
 *   - Qué "correspondent"/"document_type"/tags debe llevar cada evidencia.
 *   - Cómo se recupera después el archivo (id de documento vs URL directa) para
 *     implementar getEvidenceStream de forma consistente con localDiskStorage.
 *
 * Mientras tanto EVIDENCE_STORAGE_PROVIDER debe quedar en "local".
 */

export async function saveEvidence() {
  throw new Error(
    'Almacenamiento de evidencia en Paperless-ngx no implementado todavía. ' +
      'Usa EVIDENCE_STORAGE_PROVIDER=local o completa src/services/evidenceStorage/paperlessStorage.js.'
  );
}

export async function getEvidenceStream() {
  throw new Error('Almacenamiento de evidencia en Paperless-ngx no implementado todavía.');
}
