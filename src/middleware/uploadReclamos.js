import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import { reclamosDir, adjuntosReporteDir } from '../config/almacenamiento.js';
import { badRequest } from '../utils/httpError.js';

// Mismo criterio que middleware/upload.js: whitelist de MIME + nombre opaco
// en disco. Algunos navegadores mandan los .xlsx como octet-stream, así que
// en ese caso se acepta por extensión — el contenido real se verifica
// después por magic bytes (reclamosService.verificarTipoReal).
const EXCEL_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const PDF_MIME = new Set(['application/pdf']);
const EXCEL_EXT = new Set(['.xlsx', '.xls']);
const PDF_EXT = new Set(['.pdf']);

function extDe(file) {
  return path.extname(file.originalname || '').toLowerCase();
}

function esExcel(file) {
  const ext = extDe(file);
  return EXCEL_MIME.has(file.mimetype) || (file.mimetype === 'application/octet-stream' && EXCEL_EXT.has(ext));
}

function esPdf(file) {
  const ext = extDe(file);
  return PDF_MIME.has(file.mimetype) || (file.mimetype === 'application/octet-stream' && PDF_EXT.has(ext));
}

function extSegura(file) {
  const ext = extDe(file);
  if (EXCEL_EXT.has(ext) || PDF_EXT.has(ext)) return ext;
  if (PDF_MIME.has(file.mimetype)) return '.pdf';
  if (file.mimetype === 'application/vnd.ms-excel') return '.xls';
  return '.xlsx';
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, reclamosDir),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${extSegura(file)}`),
});

const limits = { fileSize: env.reclamos.maxSizeMb * 1024 * 1024, files: 1 };

function soloExcel(req, file, cb) {
  if (!esExcel(file)) return cb(badRequest('El archivo del reclamo debe ser un Excel (.xlsx o .xls).'));
  cb(null, true);
}

function excelOPdf(req, file, cb) {
  if (!esExcel(file) && !esPdf(file)) return cb(badRequest('Solo se permiten archivos Excel (.xlsx/.xls) o PDF.'));
  cb(null, true);
}

/** Máximo de PDF de documentos SAP que se suben junto con el reclamo. */
export const MAX_PDFS_SAP = 30;

function excelYPdfs(req, file, cb) {
  if (file.fieldname === 'pdfs') {
    if (!esPdf(file)) return cb(badRequest('Los documentos SAP deben subirse en PDF.'));
    return cb(null, true);
  }
  soloExcel(req, file, cb);
}

/** Al crear el reclamo: el Excel principal + los PDF de los documentos SAP (se guardan en disco). */
// fieldSize: el campo 'lineas' (JSON de hasta 2000 productos) puede pasar el 1 MB por defecto.
export const uploadExcelReclamo = multer({
  storage: diskStorage,
  fileFilter: excelYPdfs,
  limits: { ...limits, files: 1 + MAX_PDFS_SAP, fieldSize: 4 * 1024 * 1024 },
}).fields([
  { name: 'excel', maxCount: 1 },
  { name: 'pdfs', maxCount: MAX_PDFS_SAP },
]);

/** Vista previa de un PDF de documento SAP: se lee en memoria y NO se guarda. */
export const uploadPdfPreview = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => (esPdf(file) ? cb(null, true) : cb(badRequest('El documento SAP debe ser un PDF.'))),
  limits,
}).single('pdf');

/** Vista previa: el Excel se parsea en memoria y NO se guarda. */
export const uploadExcelPreview = multer({ storage: multer.memoryStorage(), fileFilter: soloExcel, limits }).single(
  'excel'
);

/** Adjunto de soporte adicional (Excel o PDF), uno por petición. */
export const uploadAdjuntoReclamo = multer({ storage: diskStorage, fileFilter: excelOPdf, limits }).single('archivo');

// ------------------------------------------------------------------
// Adjuntos de Productos Dañados (PDF/Excel para el correo al proveedor).
// Mismo filtro y límite que los adjuntos de reclamos, en la carpeta del
// módulo (uploads/<esquema>/productos-danados/adjuntos).
// ------------------------------------------------------------------

const diskStorageReporte = multer.diskStorage({
  destination: (req, file, cb) => cb(null, adjuntosReporteDir),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${extSegura(file)}`),
});

export const uploadAdjuntoReporte = multer({ storage: diskStorageReporte, fileFilter: excelOPdf, limits }).single('archivo');
