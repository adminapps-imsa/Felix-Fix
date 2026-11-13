// Llenado en cadena de Marca / Mundo / Departamento / Compradora (2026-11-13).
//
// Un proveedor como NINGBO TOPWIN tiene varias marcas, mundos y departamentos
// en el catálogo, así que al elegirlo no se llena nada. Pero cada fila del
// catálogo es una combinación real: elegida la marca, si para ese proveedor y
// esa marca hay un solo mundo, departamento o compradora, se completan solos.

export interface Combinacion {
  mundo: string | null;
  departamento: string | null;
  marca: string | null;
  compradora: string | null;
}

export const CAMPOS_CADENA = ['marca', 'mundo', 'departamento', 'compradora'] as const;
export type CampoCadena = (typeof CAMPOS_CADENA)[number];

const clave = (s: string) => s.trim().toUpperCase();

/**
 * Para cada campo vacío, el único valor que tienen las combinaciones del
 * proveedor compatibles con lo ya elegido. Nada si no hay nada elegido, si lo
 * elegido no está en ninguna combinación o si quedan varias opciones.
 */
export function completarEnCadena(valores: Record<CampoCadena, string>, combinaciones: Combinacion[]): Partial<Record<CampoCadena, string>> {
  const elegidos = CAMPOS_CADENA.filter((k) => valores[k].trim());
  if (!elegidos.length || !combinaciones.length) return {};
  const compatibles = combinaciones.filter((c) => elegidos.every((k) => c[k] != null && clave(c[k] as string) === clave(valores[k])));
  const res: Partial<Record<CampoCadena, string>> = {};
  for (const k of CAMPOS_CADENA) {
    if (valores[k].trim()) continue;
    const distintos = new Map<string, string>();
    for (const c of compatibles) {
      const v = c[k];
      if (v) distintos.set(clave(v), v);
    }
    if (distintos.size === 1) res[k] = [...distintos.values()][0];
  }
  return res;
}
