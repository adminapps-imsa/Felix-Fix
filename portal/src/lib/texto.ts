/** Texto para comparar sin importar tildes, mayúsculas ni espacios a los lados: « Perfumería » → «PERFUMERIA». */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}
