// Fotos de evidencia en Paperless-ngx (EVIDENCE_STORAGE_PROVIDER=paperless).
//
// El reporte se guarda con la foto en disco y después, en segundo plano
// (index.js → moverAPaperless), se sube aquí con su título, tipo de documento
// y etiquetas. Paperless la procesa en segundo plano, así que se espera a que
// la tarea termine para tener el id del documento. La key que se guarda en la
// BD es «<id>.<ext>» (la extensión da el Content-Type al leerla).
//
// Si algo falla, lanza: la foto se queda en disco (provider 'local').
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const cfg = () => env.evidence.paperless;

/** Tipos de documento de las copias de PDF (copiasPdf.js). */
export const TIPO_RECLAMO = 'Documento Reclamo';
export const TIPO_PRODUCTO_DANADO = 'Documento Producto Dañado';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(ruta, { method = 'GET', body, json } = {}) {
  const { url, token } = cfg();
  if (!url || !token) throw new Error('Faltan PAPERLESS_URL o PAPERLESS_TOKEN.');
  const res = await fetch(`${url}/api${ruta}`, {
    method,
    headers: { Authorization: `Token ${token}`, Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Paperless respondió ${res.status} en ${method} ${ruta}`);
  return res;
}

/**
 * Id de una etiqueta o tipo de documento por su nombre (se recuerda). Si no
 * existe se crea, sin asignación automática (matching_algorithm 0 = ninguno:
 * Paperless no debe ponérselo a otros documentos). Si no se puede, null.
 */
const ids = new Map();
async function idPorNombre(coleccion, nombre) {
  const clave = `${coleccion}:${nombre.toLowerCase()}`;
  if (ids.has(clave)) return ids.get(clave);
  const res = await pedir(`/${coleccion}/?name__iexact=${encodeURIComponent(nombre)}`);
  let id = res.ok ? ((await res.json()).results?.[0]?.id ?? null) : null;
  if (id === null) {
    id = await pedir(`/${coleccion}/`, { method: 'POST', json: { name: nombre, matching_algorithm: 0 } })
      .then((r) => r.json())
      .then((creado) => {
        logger.info({ coleccion, nombre, id: creado.id }, 'Paperless: creado');
        return creado.id ?? null;
      })
      .catch((err) => {
        logger.warn({ err: err.message, coleccion, nombre }, 'Paperless: no existe y no se pudo crear; la foto se sube sin él');
        return null;
      });
  }
  if (id !== null) ids.set(clave, id);
  return id;
}

/**
 * Al arrancar: comprueba la conexión y el token, y deja creados el tipo de
 * documento y las etiquetas. Devuelve lo que encontró, para el log.
 */
export async function prepararPaperless() {
  const res = await pedir('/documents/?page_size=1');
  if (!res.ok) throw new Error(`Paperless respondió ${res.status}`);
  const tipos = {};
  for (const nombre of [cfg().tipoDocumento, TIPO_RECLAMO, TIPO_PRODUCTO_DANADO]) tipos[nombre] = await idPorNombre('document_types', nombre);
  const etiquetas = {};
  for (const nombre of cfg().etiquetas) etiquetas[nombre] = await idPorNombre('tags', nombre);
  return { url: cfg().url, tiposDocumento: tipos, etiquetas };
}

/** Espera a que Paperless termine de procesar la subida y devuelve el id del documento. */
async function esperarDocumento(tarea) {
  const limite = Date.now() + cfg().esperaMs;
  while (Date.now() < limite) {
    const res = await pedir(`/tasks/?task_id=${encodeURIComponent(tarea)}`);
    const t = res.ok ? (await res.json())[0] : null;
    if (t?.status === 'SUCCESS' && t.related_document) return Number(t.related_document);
    if (t?.status === 'FAILURE' || t?.status === 'REVOKED') throw new Error(`Paperless no procesó la foto: ${t.result || t.status}`);
    await espera(1000);
  }
  throw new Error(`Paperless no terminó de procesar la foto en ${cfg().esperaMs / 1000} s`);
}

/** Id del documento a partir de la key «<id>.<ext>». */
function idDeKey(key) {
  const id = Number.parseInt(String(key), 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Key de Paperless inválida: ${key}`);
  return id;
}

/**
 * Sube el archivo y devuelve { provider, key }. No borra la copia en disco.
 * `tipoDocumento`: por defecto el de las fotos (PAPERLESS_TIPO_DOCUMENTO).
 */
export async function saveEvidence({ path: ruta, filename, mimetype }, { titulo, tipoDocumento = cfg().tipoDocumento } = {}) {
  const form = new FormData();
  form.append('document', new Blob([await fs.readFile(ruta)], { type: mimetype }), filename);
  if (titulo) form.append('title', titulo.slice(0, 128));
  const tipo = await idPorNombre('document_types', tipoDocumento);
  if (tipo) form.append('document_type', String(tipo));
  for (const nombre of cfg().etiquetas) {
    const id = await idPorNombre('tags', nombre);
    if (id) form.append('tags', String(id));
  }

  const res = await pedir('/documents/post_document/', { method: 'POST', body: form });
  const id = await esperarDocumento(await res.json());
  return { provider: 'paperless', key: `${id}${path.extname(filename).toLowerCase()}` };
}

export async function getEvidenceStream(key) {
  const res = await pedir(`/documents/${idDeKey(key)}/download/?original=true`);
  if (res.status === 404) return null;
  return Readable.fromWeb(res.body);
}

export async function deleteEvidence(key) {
  await pedir(`/documents/${idDeKey(key)}/`, { method: 'DELETE' });
}

/**
 * Borra los documentos subidos con ese nombre de archivo (el nombre opaco con
 * que se guardó en disco, único). Se revisa cada resultado: si Paperless
 * ignorara el filtro devolvería todos los documentos, y no se debe borrar
 * ninguno que no sea ese archivo.
 */
export async function deleteByFilename(filename) {
  const res = await pedir(`/documents/?original_filename__iexact=${encodeURIComponent(filename)}&fields=id,original_filename&page_size=10`);
  const docs = res.ok ? (await res.json()).results || [] : [];
  const suyos = docs.filter((d) => d.original_filename === filename);
  for (const d of suyos) await pedir(`/documents/${d.id}/`, { method: 'DELETE' });
  return suyos.length;
}
