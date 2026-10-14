import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { logger } from '../../utils/logger.js';

// Formatos que un navegador puede mostrar; EMF/WMF (comunes en Excel) se omiten.
const EXT_PERMITIDAS = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp', bmp: 'bmp' };
export const CONTENT_TYPE_IMAGEN = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};
const MAX_IMAGENES_POR_ARCHIVO = 300;

/**
 * Extrae las fotos embebidas (objetos "drawing") de un .xlsx y las guarda en
 * disco. Cada foto queda con:
 *   - sheet / sheetName: hoja de origen (mismo orden que SheetNames de SheetJS
 *     en el visor del frontend) para mostrarla en la pestaña correcta.
 *   - origen: de QUÉ archivo vino ('principal' o el filename del adjunto
 *     extra). Sin esto, las fotos de distintos Excel de un mismo reclamo se
 *     mezclan en la vista previa.
 *
 * Solo .xlsx (OOXML); los .xls binarios no se soportan y devuelven [].
 */
export async function extraerImagenesExcel(rutaArchivo, origen) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(rutaArchivo);

  const guardadas = [];
  try {
    for (const [sheet, ws] of wb.worksheets.entries()) {
      const vistas = new Set();
      const imagenes = [...ws.getImages()].sort(
        (a, b) =>
          (a.range?.tl?.nativeRow ?? 0) - (b.range?.tl?.nativeRow ?? 0) ||
          (a.range?.tl?.nativeCol ?? 0) - (b.range?.tl?.nativeCol ?? 0)
      );
      for (const img of imagenes) {
        if (guardadas.length >= MAX_IMAGENES_POR_ARCHIVO) break;
        if (vistas.has(img.imageId)) continue; // la misma imagen anclada dos veces en la hoja
        vistas.add(img.imageId);

        const media = wb.getImage(Number(img.imageId));
        const ext = EXT_PERMITIDAS[String(media?.extension || '').toLowerCase()];
        if (!ext || !media.buffer?.length) continue;

        const filename = `${crypto.randomUUID()}.${ext}`;
        await fs.writeFile(reclamoArchivoPath(filename), media.buffer);
        guardadas.push({ filename, sheet, sheetName: ws.name, origen });
      }
    }
  } catch (err) {
    // No dejar en disco fotos que nunca se van a registrar en la BD.
    await borrarArchivos(guardadas.map((g) => g.filename));
    throw err;
  }
  return guardadas;
}

/** Borrado best-effort: un archivo que ya no existe no es un error. */
export async function borrarArchivos(filenames) {
  await Promise.all(
    filenames.filter(Boolean).map(async (f) => {
      try {
        await fs.unlink(reclamoArchivoPath(f));
      } catch (err) {
        if (err.code !== 'ENOENT') logger.error({ err, archivo: f }, 'No se pudo borrar un archivo de reclamo');
      }
    })
  );
}
