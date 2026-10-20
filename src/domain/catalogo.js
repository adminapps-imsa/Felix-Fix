// Valores de catálogo que no se escriben a mano (p. ej. la división: hoy
// solo Perfumería y Cosméticos, los activos en ReclamoCatalogos).

/** Para comparar sin importar mayúsculas, tildes ni espacios. */
export const normalizarValor = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

/** El valor tal como está en el catálogo, o null si no es uno de los permitidos. */
export function valorDelCatalogo(valor, permitidos) {
  const n = normalizarValor(valor);
  if (!n) return null;
  return permitidos.find((p) => normalizarValor(p) === n) ?? null;
}

export function motivoDivisionInvalida(valor, permitidas) {
  if (valorDelCatalogo(valor, permitidas)) return null;
  if (!permitidas.length) return 'No hay divisiones configuradas. Avísale al administrador.';
  return `La división debe ser ${permitidas.join(' o ')}.`;
}
