// Reduce fotos antes de subirlas: lado mayor a MAX_LADO px y JPEG. Una foto de
// celular (3-8 MB) queda en ~300-800 KB, así cabe en el correo al proveedor.
// Si algo falla o el resultado no es más liviano, se usa el archivo original.
const MAX_LADO = 1920;
const CALIDAD = 0.82;
// Fotos ya livianas y pequeñas no se tocan.
const SIN_TOCAR_BYTES = 600 * 1024;

export async function comprimirImagen(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && file.size <= SIN_TOCAR_BYTES) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Fondo blanco: un PNG con transparencia no queda negro al pasar a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', CALIDAD));
    if (!blob || blob.size >= file.size) return file;
    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
