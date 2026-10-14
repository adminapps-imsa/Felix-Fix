import fs from 'node:fs/promises';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';

// Firmas (primeros bytes) de lo único que el portal acepta subir. Se revisan
// ANTES de pasar el archivo a file-type: así un archivo de otro formato nunca
// llega a sus parsers (GHSA-5v7r-6r5c-r473: un ASF mal formado lo deja en un
// bucle infinito; file-type 22 lo corrige pero exige Node 22).
const FIRMAS = [
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x50, 0x4b, 0x03, 0x04], // ZIP (xlsx)
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // CFB (xls)
  [0xff, 0xd8, 0xff], // JPEG
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
];
const LEER = 16; // basta para comparar firmas

const empiezaCon = (buf, firma) => firma.every((b, i) => buf[i] === b);
const esWebp = (buf) => buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
const firmaPermitida = (cabecera) => FIRMAS.some((f) => empiezaCon(cabecera, f)) || esWebp(cabecera);

// Si la firma pasa, file-type recibe el archivo COMPLETO: para distinguir un
// xlsx de un zip cualquiera necesita leer sus entradas internas.

/** Igual que fileTypeFromBuffer, pero devuelve undefined para cualquier formato no permitido. */
export async function detectarTipo(buffer) {
  if (!firmaPermitida(buffer.subarray(0, LEER))) return undefined;
  return fileTypeFromBuffer(buffer);
}

/** Igual que fileTypeFromFile, con el mismo filtro de firmas. */
export async function detectarTipoArchivo(ruta) {
  const fh = await fs.open(ruta, 'r');
  let cabecera;
  try {
    const buf = Buffer.alloc(LEER);
    const { bytesRead } = await fh.read(buf, 0, LEER, 0);
    cabecera = buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
  if (!firmaPermitida(cabecera)) return undefined;
  return fileTypeFromFile(ruta);
}
